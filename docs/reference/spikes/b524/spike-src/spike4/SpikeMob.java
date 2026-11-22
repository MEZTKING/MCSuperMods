package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.mob.MobTrader;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;

/**
 * B524 spike (throwaway): the runtime's plain body ({@link MsmEntity}) with one extra behaviour per {@link Mode}, written
 * from ADR 0109's descriptions over vanilla's public entity calls (X17, X22, X23). Fields are public for the GameTests.
 */
public class SpikeMob extends MsmEntity {
    public enum Mode { HOVER, PHASE, ROOST, COLLECT, DIG, PLAY_DEAD, BARTER, WORK_SITE, DASH }

    /** One synched flag (roosting, playing dead, dashing) for the renderer (ADR 0109 D5). */
    public static final EntityDataAccessor<Boolean> FLAG = SynchedEntityData.defineId(SpikeMob.class, EntityDataSerializers.BOOLEAN);
    public static final double HOVER_HEIGHT = 4.0;

    public final Mode mode;
    public final List<String> events = new CopyOnWriteArrayList<>();
    // HOVER
    private Vec3 hoverAim;
    // PHASE
    public Vec3 chargeTo;
    public boolean charging;
    /** False for the control mob: it charges with collision on. */
    public boolean phaseThrough = true;
    // COLLECT
    public Player owner;
    public Item liked;
    public final List<ItemStack> carried = new ArrayList<>();
    public int delivered;
    // DIG
    public int digTicks;
    public int digCooldown;
    public int digs;
    // PLAY_DEAD
    public int deadTicks;
    // BARTER
    public int barterTicks;
    public int barters;
    // WORK_SITE
    public boolean wantsRestock;
    public int restockedAtTick = -1;
    public BlockPos restockedAt;
    // DASH
    private float pendingDash;
    public int dashes;
    public final List<Integer> startJumps = new CopyOnWriteArrayList<>();

    public SpikeMob(EntityType<? extends PathfinderMob> type, Level level, Mode mode) {
        super(type, level);
        this.mode = mode;
        switch (mode) {
            case COLLECT -> {
                setCanPickUpLoot(true);
                goalSelector.addGoal(1, new CollectGoal());
            }
            case BARTER -> setCanPickUpLoot(true);
            case PLAY_DEAD -> goalSelector.addGoal(0, new StillGoal());
            case WORK_SITE -> goalSelector.addGoal(1, new WorkSiteGoal());
            default -> {}
        }
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(FLAG, false);
    }

    public boolean flag() {
        return entityData.get(FLAG);
    }

    public void setFlag(boolean on) {
        entityData.set(FLAG, on);
    }

    // PHASE: vex-like, no collision while charging (set around the whole tick, as the ADR's "while its attack charges").

    @Override
    public void tick() {
        if (mode == Mode.PHASE && charging && phaseThrough) {
            noPhysics = true;
        }
        super.tick();
        if (mode == Mode.PHASE) {
            noPhysics = false;
            setNoGravity(true);
        }
        if (mode == Mode.HOVER || mode == Mode.ROOST) {
            setNoGravity(true);
        }
    }

    @Override
    protected void customServerAiStep(ServerLevel level) {
        super.customServerAiStep(level);
        switch (mode) {
            case HOVER -> hover(level);
            case PHASE -> {
                if (charging && chargeTo != null) {
                    getMoveControl().setWantedPosition(chargeTo.x, chargeTo.y, chargeTo.z, 1.0);
                    if (position().distanceTo(chargeTo) < 0.8) {
                        charging = false;
                        events.add("charge ended at tick " + tickCount + " " + position());
                    }
                }
            }
            case ROOST -> {
                if (flag()) {
                    setDeltaMovement(Vec3.ZERO);
                }
            }
            case DIG -> dig(level);
            case PLAY_DEAD -> {
                if (deadTicks > 0 && --deadTicks == 0) {
                    setFlag(false);
                    events.add("stopped playing dead at tick " + tickCount + " health " + getHealth());
                }
            }
            case BARTER -> {
                if (barterTicks > 0 && --barterTicks == 0) {
                    List<ItemStack> loot = roll(level, Identifier.withDefaultNamespace("gameplay/piglin_bartering"), true);
                    setItemSlot(EquipmentSlot.OFFHAND, ItemStack.EMPTY);
                    for (ItemStack s : loot) {
                        spawnAtLocation(level, s);
                    }
                    barters++;
                    events.add("bartered at tick " + tickCount + ": " + loot);
                }
            }
            default -> {}
        }
    }

    /** Ghast-like: a fixed height over the ground below, drifting to a new point now and then. */
    private void hover(ServerLevel level) {
        if (hoverAim == null || tickCount % 60 == 0) {
            hoverAim = new Vec3(getX() + random.nextInt(7) - 3, 0, getZ() + random.nextInt(7) - 3);
        }
        getMoveControl().setWantedPosition(hoverAim.x, groundBelow(level, blockPosition()) + HOVER_HEIGHT, hoverAim.z, 1.0);
    }

    /** The top of the first block with a collision shape below {@code from} (scanning down 32 blocks), as a y. */
    public static double groundBelow(Level level, BlockPos from) {
        BlockPos.MutableBlockPos p = from.mutable();
        for (int i = 0; i < 32; i++) {
            if (!level.getBlockState(p).getCollisionShape(level, p).isEmpty()) {
                return p.getY() + level.getBlockState(p).getCollisionShape(level, p).max(net.minecraft.core.Direction.Axis.Y);
            }
            p.move(0, -1, 0);
        }
        return from.getY() - 32;
    }

    /** Roosts under the block above, within four blocks; returns whether it found one. */
    public boolean roost() {
        BlockPos at = blockPosition();
        for (int dy = 1; dy <= 4; dy++) {
            BlockPos up = at.above(dy);
            if (!level().getBlockState(up).isAir()) {
                setPos(getX(), up.getY() - getBbHeight(), getZ());
                setDeltaMovement(Vec3.ZERO);
                getNavigation().stop();
                setFlag(true);
                return true;
            }
        }
        return false;
    }

    // DIG: sniffer-like

    private void dig(ServerLevel level) {
        if (digCooldown > 0) {
            digCooldown--;
            return;
        }
        boolean onDigBlock = onGround() && level.getBlockState(blockPosition().below()).is(Blocks.MOSS_BLOCK);
        if (!onDigBlock) {
            digTicks = 0;
            return;
        }
        getNavigation().stop();
        if (++digTicks >= 40) {
            List<ItemStack> loot = roll(level, Identifier.withDefaultNamespace("gameplay/sniffer_digging"), false);
            for (ItemStack s : loot) {
                spawnAtLocation(level, s);
            }
            digs++;
            events.add("dug at tick " + tickCount + ": " + loot);
            digTicks = 0;
            digCooldown = 200;
        }
    }

    List<ItemStack> roll(ServerLevel level, Identifier table, boolean barter) {
        LootTable loot = level.getServer().reloadableRegistries().getLootTable(ResourceKey.create(Registries.LOOT_TABLE, table));
        LootParams.Builder builder = new LootParams.Builder(level).withParameter(LootContextParams.THIS_ENTITY, this);
        if (!barter) {
            builder = builder.withParameter(LootContextParams.ORIGIN, position());
        }
        LootParams params = builder.create(barter ? LootContextParamSets.PIGLIN_BARTER : LootContextParamSets.GIFT);
        return new ArrayList<>(loot.getRandomItems(params));
    }

    // PLAY_DEAD: axolotl-like

    @Override
    public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
        boolean hurt = super.hurtServer(level, source, amount);
        if (mode == Mode.PLAY_DEAD && hurt && isAlive() && !flag() && getHealth() < getMaxHealth() * 0.5f) {
            setFlag(true);
            deadTicks = 200;
            addEffect(new MobEffectInstance(MobEffects.REGENERATION, 100, 0));
            getNavigation().stop();
            events.add("playing dead at tick " + tickCount + " health " + getHealth());
        }
        return hurt;
    }

    @Override
    public boolean canBeSeenAsEnemy() {
        return !(mode == Mode.PLAY_DEAD && flag()) && super.canBeSeenAsEnemy();
    }

    /** Takes every control while playing dead, so no other goal moves or turns the mob. */
    private final class StillGoal extends Goal {
        StillGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP, Flag.TARGET));
        }

        @Override
        public boolean canUse() {
            return flag();
        }

        @Override
        public void tick() {
            getNavigation().stop();
            setDeltaMovement(getDeltaMovement().multiply(0, 1, 0));
        }
    }

    // COLLECT (allay-like) and BARTER (piglin-like): items

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack held = player.getItemInHand(hand);
        if (mode == Mode.COLLECT && !held.isEmpty() && liked == null) {
            liked = held.getItem();
            owner = player;
            events.add("given " + held.getItem());
            return InteractionResult.SUCCESS;
        }
        if (mode == Mode.BARTER && held.is(Items.GOLD_INGOT) && getOffhandItem().isEmpty() && level() instanceof ServerLevel) {
            setItemSlot(EquipmentSlot.OFFHAND, held.split(1));
            barterTicks = 120;
            events.add("took gold from a player at tick " + tickCount);
            return InteractionResult.SUCCESS;
        }
        return super.mobInteract(player, hand);
    }

    @Override
    public boolean wantsToPickUp(ServerLevel level, ItemStack stack) {
        return switch (mode) {
            case COLLECT -> liked != null && stack.is(liked);
            case BARTER -> stack.is(Items.GOLD_INGOT) && getOffhandItem().isEmpty() && barterTicks == 0;
            default -> super.wantsToPickUp(level, stack);
        };
    }

    public int vanillaPickups;

    @Override
    protected void pickUpItem(ServerLevel level, ItemEntity entity) {
        ItemStack stack = entity.getItem();
        if (mode == Mode.COLLECT && entity.getOwner() == this) {
            return; // what it brought its owner stays there
        }
        if (mode == Mode.COLLECT && wantsToPickUp(level, stack)) {
            vanillaPickups++;
            onItemPickup(entity);
            take(entity, stack.getCount());
            carried.add(stack.copy());
            entity.discard();
            events.add("picked up " + stack + " at tick " + tickCount);
            return;
        }
        if (mode == Mode.BARTER && wantsToPickUp(level, stack)) {
            vanillaPickups++;
            onItemPickup(entity);
            setItemSlot(EquipmentSlot.OFFHAND, stack.split(1));
            take(entity, 1);
            if (stack.isEmpty()) {
                entity.discard();
            }
            barterTicks = 120;
            events.add("picked up gold at tick " + tickCount);
            return;
        }
        super.pickUpItem(level, entity);
    }

    private final class CollectGoal extends Goal {
        private ItemEntity aim;

        CollectGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            return liked != null;
        }

        @Override
        public void tick() {
            if (!(level() instanceof ServerLevel level)) {
                return;
            }
            if (!carried.isEmpty() && owner != null) {
                if (distanceTo(owner) > 2.5) {
                    getNavigation().moveTo(owner, 1.2);
                } else {
                    for (ItemStack s : carried) {
                        ItemEntity thrown = new ItemEntity(level, getX(), getEyeY(), getZ(), s);
                        thrown.setDeltaMovement(owner.position().subtract(position()).normalize().scale(0.2));
                        thrown.setPickUpDelay(10);
                        thrown.setThrower(SpikeMob.this);
                        thrown.setTarget(owner.getUUID()); // only the owner picks it up first, as a player's drop for another
                        level.addFreshEntity(thrown);
                        delivered += s.getCount();
                    }
                    events.add("delivered " + carried + " at tick " + tickCount);
                    carried.clear();
                }
                return;
            }
            if (aim == null || !aim.isAlive()) {
                List<ItemEntity> near = level.getEntitiesOfClass(ItemEntity.class, getBoundingBox().inflate(16),
                        e -> wantsToPickUp(level, e.getItem()) && e.getOwner() != SpikeMob.this);
                aim = near.isEmpty() ? null : near.getFirst();
            }
            if (aim != null) {
                getNavigation().moveTo(aim, 1.2);
                if (distanceTo(aim) < 1.2 && aim.isAlive()) {
                    pickUpItem(level, aim); // our own call: no game rule in the way
                }
            }
        }
    }

    // WORK_SITE: walk to the nearest barrel within 16 blocks and restock there (ADR 0107 D3)

    private final class WorkSiteGoal extends Goal {
        private BlockPos site;

        WorkSiteGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            return wantsRestock;
        }

        @Override
        public void tick() {
            if (site == null) {
                BlockPos best = null;
                for (BlockPos p : BlockPos.betweenClosed(blockPosition().offset(-16, -4, -16), blockPosition().offset(16, 4, 16))) {
                    if (level().getBlockState(p).is(Blocks.BARREL) && (best == null || p.distSqr(blockPosition()) < best.distSqr(blockPosition()))) {
                        best = p.immutable();
                    }
                }
                site = best;
                events.add("work site " + site + " at tick " + tickCount);
                if (site == null) {
                    return;
                }
            }
            getNavigation().moveTo(site.getX() + 0.5, site.getY() + 1, site.getZ() + 0.5, 1.0);
            if (position().distanceTo(Vec3.atBottomCenterOf(site)) <= 2.0) {
                MobTrader trader = driver().trader();
                for (MerchantOffer offer : trader.getOffers()) {
                    offer.updateDemand();
                    offer.resetUses();
                }
                restockedAtTick = tickCount;
                restockedAt = blockPosition();
                wantsRestock = false;
                getNavigation().stop();
                events.add("restocked at " + restockedAt + " tick " + tickCount);
            }
        }
    }

    // DASH: camel-like, from vanilla's ridden jump bar

    @Override
    public void onPlayerJump(int strength) {
        if (mode != Mode.DASH) {
            super.onPlayerJump(strength);
            return;
        }
        if (canJump()) {
            pendingDash = getPlayerJumpPendingScale(Math.max(0, strength));
        }
    }

    @Override
    public void handleStartJump(int strength) {
        startJumps.add(strength);
        if (mode == Mode.DASH) {
            setFlag(true);
        }
        super.handleStartJump(strength);
    }

    @Override
    protected void tickRidden(Player rider, Vec3 input) {
        super.tickRidden(rider, input);
        if (mode == Mode.DASH && pendingDash > 0) {
            if (onGround()) {
                Vec3 look = Vec3.directionFromRotation(0, getYRot());
                double power = 1.6 * pendingDash;
                setDeltaMovement(getDeltaMovement().add(look.x * power, 0.3 * pendingDash, look.z * power));
                dashes++;
            }
            pendingDash = 0;
        }
    }
}
