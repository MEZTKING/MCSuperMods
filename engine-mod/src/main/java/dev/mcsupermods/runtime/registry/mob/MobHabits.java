package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.DynamicGameEventListener;
import net.minecraft.world.level.gameevent.EntityPositionSource;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.gameevent.GameEventListener;
import net.minecraft.world.level.gameevent.PositionSource;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;

/**
 * The state of the habits of ADR 0109 D3 and D4 as amended after B524, which their goals in {@code goals/} act on:
 * roosting ({@code roost}: hanging upside down under a block, the synched {@code DATA_ROOSTING}), playing dead
 * ({@code play_dead}: the synched {@code DATA_PLAYING_DEAD}, the countdown and the regeneration), collecting items
 * ({@code collect_items}: the item it was given, what it carries, its owner and the note block it last heard), digging
 * ({@code dig_items}: the cooldown) and bartering ({@code barter}: the item it holds and the countdown to its roll).
 * Saved with the mob ({@code Roosting}, {@code PlayDeadTicks}, {@code CollectLiked}, {@code CollectCarried},
 * {@code CollectOwner}, {@code DigCooldown}, {@code BarterHeld}, {@code BarterTicks}); what it holds or carries drops when
 * it dies. Loot rolls use vanilla's contexts: {@code dig_items} the gift context ({@code origin} and {@code this_entity}),
 * {@code barter} the barter context ({@code this_entity} only, B524).
 */
public final class MobHabits {
    /** How long a collector goes to a note block after hearing it, in ticks (the allay's 30 seconds). */
    public static final int NOTE_BLOCK_TICKS = 600;
    /** How far a collector hears a note block, in blocks (the allay's 16). */
    public static final int NOTE_BLOCK_RADIUS = 16;
    /** Ticks after a roosting mob lets go before it may roost again. */
    public static final int ROOST_COOLDOWN = 100;
    /** Ticks a digger spends digging before the roll. */
    public static final int DIG_TICKS = 40;

    /** Loot tables already warned about as unknown. */
    private static final Set<Identifier> WARNED = ConcurrentHashMap.newKeySet();

    private final MsmMob mob;
    private final Goal.Roost roost;
    private final Goal.PlayDead playDead;
    private final Goal.CollectItems collect;
    private final Goal.DigItems dig;
    private final Goal.Barter barter;
    private final Predicate<ItemStack> barterItem;
    private final Predicate<BlockState> digBlock;
    /** {@code collect_items} with {@code note_blocks}: the listener vanilla's game events reach, made on first use. */
    private DynamicGameEventListener<NoteBlockListener> noteListener;

    private int roostCooldown;
    private int playDeadTicks;
    private ItemStack liked = ItemStack.EMPTY;
    private ItemStack carried = ItemStack.EMPTY;
    private UUID owner;
    private BlockPos noteBlock;
    private long noteHeardAt;
    private int digCooldown;
    private ItemStack barterHeld = ItemStack.EMPTY;
    private int barterTicks;

    MobHabits(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        List<Goal> goals = definition == null ? List.of() : definition.components().goals();
        this.roost = first(goals, Goal.Roost.class);
        this.playDead = first(goals, Goal.PlayDead.class);
        this.collect = first(goals, Goal.CollectItems.class);
        this.dig = first(goals, Goal.DigItems.class);
        this.barter = first(goals, Goal.Barter.class);
        this.barterItem = barter == null ? s -> false : MobGoals.ofItems(List.of(barter.item()));
        this.digBlock = dig == null ? s -> false : ofBlocks(dig.digBlocks());
    }

    private static <T extends Goal> T first(List<Goal> goals, Class<T> type) {
        for (Goal goal : goals) {
            if (type.isInstance(goal)) {
                return type.cast(goal);
            }
        }
        return null;
    }

    /** Registers the habits' shared listeners: none, since every habit hooks its own mob (a stub from B526 kept as the init point). */
    public static void init() {}

    /** Matches block states of the listed blocks; an entry starting with {@code #} is a block tag. */
    public static Predicate<BlockState> ofBlocks(List<String> blocks) {
        Set<Identifier> ids = new java.util.HashSet<>();
        List<TagKey<Block>> tags = new java.util.ArrayList<>();
        for (String entry : blocks) {
            if (entry.startsWith("#")) {
                tags.add(TagKey.create(Registries.BLOCK, Identifier.parse(entry.substring(1))));
            } else {
                ids.add(Identifier.parse(entry));
            }
        }
        return state -> ids.contains(BuiltInRegistries.BLOCK.getKey(state.getBlock())) || tags.stream().anyMatch(state::is);
    }

    private PathfinderMob body() {
        return mob.asMob();
    }

    // Roosting

    public Optional<Goal.Roost> roostGoal() {
        return Optional.ofNullable(roost);
    }

    public boolean roosting() {
        return body().getEntityData().get(mob.roostingData());
    }

    /**
     * Hangs the mob at {@code at} (its feet; the box's top at the ceiling) or lets it go (server). Hanging, it has no
     * gravity and no motion; letting go gives back the mode's gravity ({@code fly}, {@code hover} and {@code phase} none).
     */
    public void setRoosting(boolean on, Vec3 at) {
        PathfinderMob body = body();
        body.getEntityData().set(mob.roostingData(), on);
        if (on) {
            body.setNoGravity(true);
            body.setPos(at.x, at.y, at.z);
            body.setDeltaMovement(Vec3.ZERO);
            body.getNavigation().stop();
        } else {
            body.setNoGravity(mob.driver().movement().mode().flies());
            roostCooldown = ROOST_COOLDOWN;
        }
    }

    /** Ticks until the mob may roost again after letting go. */
    public int roostCooldown() {
        return roostCooldown;
    }

    // Playing dead

    public Optional<Goal.PlayDead> playDeadGoal() {
        return Optional.ofNullable(playDead);
    }

    public boolean playingDead() {
        return body().getEntityData().get(mob.playingDeadData());
    }

    /** Ticks of playing dead left. */
    public int playDeadTicks() {
        return playDeadTicks;
    }

    /** A mob playing dead is not seen as an enemy (vanilla's targeting skips it), as an axolotl's. */
    public boolean canBeSeenAsEnemy(boolean vanilla) {
        return vanilla && !(playDead != null && playingDead());
    }

    /**
     * After vanilla's {@code hurtServer}: a roosting mob lets go; a {@code play_dead} mob hurt below {@code below_health} of
     * its maximum health (and still alive) plays dead for {@code ticks}, regenerating (Regeneration I for as long) unless
     * {@code regenerates} is false, and drops its target.
     */
    void hurtServer(ServerLevel level, boolean hurt) {
        PathfinderMob body = body();
        if (!hurt || !body.isAlive()) {
            return;
        }
        if (roost != null && roosting()) {
            setRoosting(false, body.position());
        }
        if (playDead != null && !playingDead() && body.getHealth() < body.getMaxHealth() * playDead.belowHealth()) {
            body.getEntityData().set(mob.playingDeadData(), true);
            playDeadTicks = playDead.ticks();
            if (playDead.regenerates()) {
                body.addEffect(new MobEffectInstance(MobEffects.REGENERATION, playDead.ticks(), 0));
            }
            body.setTarget(null);
            body.getNavigation().stop();
        }
    }

    // Collecting

    public Optional<Goal.CollectItems> collectGoal() {
        return Optional.ofNullable(collect);
    }

    /** The item the collector was given (what it looks for); empty until a player gives it one. */
    public ItemStack liked() {
        return liked;
    }

    /** What the collector carries now. */
    public ItemStack carried() {
        return carried;
    }

    public void setCarried(ItemStack stack) {
        carried = stack;
    }

    /** The player who gave the item, when in the mob's level. */
    public Player owner() {
        return owner == null ? null : body().level().getPlayerByUUID(owner);
    }

    /** The note block heard within {@link #NOTE_BLOCK_TICKS} that is still one, or null. */
    public BlockPos noteBlock() {
        Level level = body().level();
        if (collect == null || !collect.noteBlocks() || noteBlock == null || level.getGameTime() - noteHeardAt > NOTE_BLOCK_TICKS
                || !level.getBlockState(noteBlock).is(net.minecraft.world.level.block.Blocks.NOTE_BLOCK)) {
            return null;
        }
        return noteBlock;
    }

    /** Whether {@code item} is one the collector looks for: like its item, lying free, not thrown by this mob. */
    public boolean wants(ItemEntity item) {
        return !liked.isEmpty() && item.isAlive() && !item.hasPickUpDelay() && item.getOwner() != body()
                && ItemStack.isSameItem(item.getItem(), liked)
                && (carried.isEmpty() || ItemStack.isSameItemSameComponents(carried, item.getItem()) && carried.getCount() < carried.getMaxStackSize());
    }

    /**
     * {@code updateDynamicGameEventListener}: a collector with {@code note_blocks} hears {@code note_block_play} within
     * {@link #NOTE_BLOCK_RADIUS} blocks (vanilla's game events, through the mob's own listener).
     */
    public void updateDynamicGameEventListener(BiConsumer<DynamicGameEventListener<?>, ServerLevel> consumer) {
        if (collect == null || !collect.noteBlocks() || !(body().level() instanceof ServerLevel level)) {
            return;
        }
        if (noteListener == null) {
            noteListener = new DynamicGameEventListener<>(new NoteBlockListener());
        }
        consumer.accept(noteListener, level);
    }

    private final class NoteBlockListener implements GameEventListener {
        private final PositionSource source = new EntityPositionSource(body(), body().getEyeHeight());

        @Override
        public PositionSource getListenerSource() {
            return source;
        }

        @Override
        public int getListenerRadius() {
            return NOTE_BLOCK_RADIUS;
        }

        @Override
        public boolean handleGameEvent(ServerLevel level, Holder<GameEvent> event, GameEvent.Context context, Vec3 pos) {
            if (!event.is(GameEvent.NOTE_BLOCK_PLAY) || liked.isEmpty()) {
                return false;
            }
            noteBlock = BlockPos.containing(pos);
            noteHeardAt = level.getGameTime();
            return true;
        }
    }

    // Digging

    public Optional<Goal.DigItems> digGoal() {
        return Optional.ofNullable(dig);
    }

    public boolean isDigBlock(BlockState state) {
        return digBlock.test(state);
    }

    public int digCooldown() {
        return digCooldown;
    }

    /** The digger's roll of {@code loot_table} in the gift context, dropped at its feet, then the cooldown. */
    public List<ItemStack> digUp(ServerLevel level) {
        PathfinderMob body = body();
        LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, body.position())
                .withParameter(LootContextParams.THIS_ENTITY, body).create(LootContextParamSets.GIFT);
        List<ItemStack> loot = roll(level, dig.lootTable(), params);
        for (ItemStack stack : loot) {
            body.spawnAtLocation(level, stack);
        }
        digCooldown = dig.intervalTicks();
        return loot;
    }

    // Bartering

    public Optional<Goal.Barter> barterGoal() {
        return Optional.ofNullable(barter);
    }

    public boolean isBarterItem(ItemStack stack) {
        return barterItem.test(stack);
    }

    /** What the barterer holds (one item), empty when it waits for one. */
    public ItemStack barterHeld() {
        return barterHeld;
    }

    /** Ticks until the barterer rolls its loot. */
    public int barterTicks() {
        return barterTicks;
    }

    /** Whether the barterer takes an item now: it holds none and has finished its last roll. */
    public boolean wantsBarterItem() {
        return barter != null && barterHeld.isEmpty() && barterTicks == 0 && !playingDead();
    }

    /** The barterer takes one of {@code stack} (shrinking it) and starts its countdown. */
    public void takeBarterItem(ItemStack stack) {
        barterHeld = stack.split(1);
        barterTicks = barter.ticks();
    }

    private void finishBarter(ServerLevel level) {
        PathfinderMob body = body();
        LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.THIS_ENTITY, body)
                .create(LootContextParamSets.PIGLIN_BARTER);
        barterHeld = ItemStack.EMPTY;
        for (ItemStack stack : roll(level, barter.lootTable(), params)) {
            body.spawnAtLocation(level, stack);
        }
    }

    private List<ItemStack> roll(ServerLevel level, Identifier table, LootParams params) {
        LootTable loot = level.getServer().reloadableRegistries().getLootTable(ResourceKey.create(Registries.LOOT_TABLE, table));
        if (loot == LootTable.EMPTY && WARNED.add(table)) {
            MsmRuntime.LOGGER.warn("[{}] {}: unknown loot table {}; the habit drops nothing", MsmRuntime.MOD_ID, mob.definitionId(), table);
        }
        return List.copyOf(loot.getRandomItems(params));
    }

    // Hooks

    /**
     * After the earlier steps of {@code mobInteract}: a collector takes one of a player's held item when it has none (that
     * player is its owner), and gives it back with what it carries when its owner uses an empty hand on it; a barterer
     * takes one of its item from the player's hand. {@code null} passes on.
     */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack held = player.getItemInHand(hand);
        PathfinderMob body = body();
        boolean server = body.level() instanceof ServerLevel;
        if (barter != null && !held.isEmpty() && isBarterItem(held) && wantsBarterItem()) {
            if (server) {
                ItemStack one = held.copyWithCount(1);
                held.consume(1, player);
                takeBarterItem(one);
            }
            return InteractionResult.SUCCESS;
        }
        if (collect != null) {
            if (liked.isEmpty() && !held.isEmpty()) {
                if (server) {
                    liked = held.copyWithCount(1);
                    held.consume(1, player);
                    owner = player.getUUID();
                }
                return InteractionResult.SUCCESS;
            }
            if (!liked.isEmpty() && held.isEmpty() && player.getUUID().equals(owner)) {
                if (server) {
                    player.setItemInHand(hand, liked);
                    if (!carried.isEmpty() && !player.getInventory().add(carried)) {
                        body.spawnAtLocation((ServerLevel) body.level(), carried);
                    }
                    liked = ItemStack.EMPTY;
                    carried = ItemStack.EMPTY;
                    owner = null;
                }
                return InteractionResult.SUCCESS;
            }
        }
        return null;
    }

    /** After vanilla's {@code customServerAiStep}: the countdowns of playing dead, digging and bartering. */
    void customServerAiStep(ServerLevel level) {
        if (roostCooldown > 0) {
            roostCooldown--;
        }
        if (playDeadTicks > 0 && --playDeadTicks == 0) {
            body().getEntityData().set(mob.playingDeadData(), false);
        }
        if (digCooldown > 0) {
            digCooldown--;
        }
        if (barterTicks > 0 && --barterTicks == 0 && barter != null) {
            finishBarter(level);
        }
    }

    /** After vanilla's {@code tick}, on both sides: a roosting mob stays where it hangs. */
    void tick() {
        if (roost != null && roosting()) {
            body().setDeltaMovement(Vec3.ZERO);
        }
    }

    /** The collector's item and load and the barterer's item drop where it died. */
    void die() {
        if (!(body().level() instanceof ServerLevel level)) {
            return;
        }
        for (ItemStack stack : new ItemStack[] {liked, carried, barterHeld}) {
            if (!stack.isEmpty()) {
                body().spawnAtLocation(level, stack);
            }
        }
        liked = ItemStack.EMPTY;
        carried = ItemStack.EMPTY;
        barterHeld = ItemStack.EMPTY;
    }

    void addAdditionalSaveData(ValueOutput output) {
        if (roost != null && roosting()) {
            output.putBoolean("Roosting", true);
        }
        if (playDeadTicks > 0) {
            output.putInt("PlayDeadTicks", playDeadTicks);
        }
        if (collect != null) {
            if (!liked.isEmpty()) {
                output.store("CollectLiked", ItemStack.CODEC, liked);
            }
            if (!carried.isEmpty()) {
                output.store("CollectCarried", ItemStack.CODEC, carried);
            }
            if (owner != null) {
                output.putString("CollectOwner", owner.toString());
            }
        }
        if (digCooldown > 0) {
            output.putInt("DigCooldown", digCooldown);
        }
        if (barter != null) {
            if (!barterHeld.isEmpty()) {
                output.store("BarterHeld", ItemStack.CODEC, barterHeld);
            }
            if (barterTicks > 0) {
                output.putInt("BarterTicks", barterTicks);
            }
        }
    }

    void readAdditionalSaveData(ValueInput input) {
        if (roost != null && input.getBooleanOr("Roosting", false)) {
            body().getEntityData().set(mob.roostingData(), true);
            body().setNoGravity(true);
        }
        playDeadTicks = playDead == null ? 0 : Math.max(0, input.getIntOr("PlayDeadTicks", 0));
        body().getEntityData().set(mob.playingDeadData(), playDeadTicks > 0);
        if (collect != null) {
            liked = input.read("CollectLiked", ItemStack.CODEC).orElse(ItemStack.EMPTY);
            carried = input.read("CollectCarried", ItemStack.CODEC).orElse(ItemStack.EMPTY);
            owner = input.getString("CollectOwner").flatMap(MobHabits::uuid).orElse(null);
        }
        digCooldown = Math.max(0, input.getIntOr("DigCooldown", 0));
        if (barter != null) {
            barterHeld = input.read("BarterHeld", ItemStack.CODEC).orElse(ItemStack.EMPTY);
            barterTicks = Math.max(0, input.getIntOr("BarterTicks", 0));
        }
    }

    private static Optional<UUID> uuid(String text) {
        try {
            return Optional.of(UUID.fromString(text));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
