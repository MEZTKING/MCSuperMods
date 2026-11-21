package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.loader.StorageParser;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.ContainerUser;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Mount storage (ADR 0098 D3, {@code msm:storage}): a store of {@code rows} rows in vanilla's chest menu, saved with the
 * mob ({@code StorageItems}, {@code StorageChest}) and dropped when it dies (with the chest when {@code needs_chest}).
 *
 * <p>Who opens it: the owner of a tamed mob with {@code msm:tameable} (nobody while it is wild), anyone otherwise; a
 * dead mob never. How: a sneaking use ({@link #mobInteract}, first in {@code MobDriver.mobInteract}, so sneaking beats
 * trading, the sit toggle and feeding, as a donkey's inventory beats its food), or the inventory key while riding it
 * (vanilla's {@code HasCustomInventoryScreen}, which only the storage bodies implement: the client sends the key to
 * the server for any ridden {@code HasCustomInventoryScreen}, so a mob without storage must not be one, or its rider's
 * inventory key would open nothing; B469 S13). With {@code needs_chest}, a chest used on the mob (sneaking or not) adds
 * the store first with vanilla's chest-equip sound; without the chest the mob has no store and every use passes on.
 * A plain use passes on, so traders still trade.
 */
public final class MobStorage {
    /** How far a player may keep the menu open, beyond half the mob's width, in blocks (as a vehicle's store). */
    static final double REACH = 5;

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null without {@code msm:storage}. */
    private final StorageParser.Storage storage;
    /** Null without {@code msm:storage}. */
    private final SimpleContainer container;
    private boolean hasChest;

    MobStorage(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        this.storage = definition == null ? null : definition.components().storage().orElse(null);
        this.container = storage == null ? null : new SimpleContainer(storage.slots()) {
            @Override
            public boolean stillValid(Player player) {
                return MobStorage.this.stillValid(player);
            }

            @Override
            public void stopOpen(ContainerUser user) {
                super.stopOpen(user);
                MobStorage.this.playSound(MobStorage.this.storage.closeSound(), SoundEvents.CHEST_CLOSE);
            }
        };
    }

    /** Whether the mob has {@code msm:storage}. */
    public boolean enabled() {
        return storage != null;
    }

    /** Whether the store exists now: always with {@code msm:storage}, after a chest with {@code needs_chest}. */
    public boolean hasStore() {
        return storage != null && (!storage.needsChest() || hasChest);
    }

    /** Whether a chest was added ({@code needs_chest}). */
    public boolean hasChest() {
        return hasChest;
    }

    /** The store's items; null without {@code msm:storage}. */
    public SimpleContainer container() {
        return container;
    }

    /** The number of rows, or 0 without {@code msm:storage}. */
    public int rows() {
        return storage == null ? 0 : storage.rows();
    }

    private PathfinderMob body() {
        return mob.asMob();
    }

    /** Owner of a tamed {@code msm:tameable} mob; anyone when the mob is not tameable; never a dead mob. */
    public boolean allowed(Player player) {
        PathfinderMob body = body();
        if (!body.isAlive() || player.isSpectator()) {
            return false;
        }
        if (definition.components().tameable().isPresent() && body instanceof TamableAnimal pet) {
            return pet.isTame() && pet.isOwnedBy(player);
        }
        return true;
    }

    boolean stillValid(Player player) {
        PathfinderMob body = body();
        if (body.isRemoved() || !body.isAlive() || !hasStore()) {
            return false;
        }
        if (player.getVehicle() == body) {
            return true;
        }
        double reach = body.getBbWidth() / 2 + REACH;
        return player.distanceToSqr(body) <= reach * reach;
    }

    /**
     * The first step of {@code MobDriver.mobInteract}: a chest adds the store ({@code needs_chest}), a sneaking use
     * opens it; {@code null} passes on (breeding, taming, riding, trading, {@code msm:on_interact}, vanilla).
     */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (storage == null || !allowed(player)) {
            return null;
        }
        PathfinderMob body = body();
        ItemStack stack = player.getItemInHand(hand);
        if (storage.needsChest() && !hasChest && stack.is(Items.CHEST)) {
            if (body.isBaby()) {
                return null;
            }
            if (body.level() instanceof ServerLevel) {
                stack.consume(1, player);
                hasChest = true;
                body.playSound(SoundEvents.DONKEY_CHEST, 1.0f, (body.getRandom().nextFloat() - body.getRandom().nextFloat()) * 0.2f + 1.0f);
            }
            return InteractionResult.SUCCESS;
        }
        if (!player.isSecondaryUseActive() || !hasStore()) {
            return null;
        }
        open(player);
        return InteractionResult.SUCCESS;
    }

    /**
     * {@code HasCustomInventoryScreen.openCustomInventoryScreen}, called by the server when the rider presses the
     * inventory key; also the sneaking use's way in. Opens nothing for a player who may not, or before the chest.
     */
    public void openCustomInventoryScreen(Player player) {
        if (storage != null && hasStore() && allowed(player)) {
            open(player);
        }
    }

    private void open(Player player) {
        PathfinderMob body = body();
        if (body.level().isClientSide()) {
            return;
        }
        int rows = storage.rows();
        player.openMenu(new SimpleMenuProvider((id, inventory, p) -> new ChestMenu(menuType(rows), id, inventory, container, rows),
                body.getDisplayName()));
        if (player.containerMenu instanceof ChestMenu menu && menu.getContainer() == container) {
            playSound(storage.openSound(), SoundEvents.CHEST_OPEN);
        }
    }

    private void playSound(Optional<Identifier> configured, SoundEvent fallback) {
        PathfinderMob body = body();
        if (body.level().isClientSide()) {
            return;
        }
        SoundEvent sound = configured.flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).orElse(fallback);
        body.playSound(sound, 0.5f, body.getRandom().nextFloat() * 0.1f + 0.9f);
    }

    static MenuType<ChestMenu> menuType(int rows) {
        return switch (rows) {
            case 1 -> MenuType.GENERIC_9x1;
            case 2 -> MenuType.GENERIC_9x2;
            case 3 -> MenuType.GENERIC_9x3;
            case 4 -> MenuType.GENERIC_9x4;
            case 5 -> MenuType.GENERIC_9x5;
            default -> MenuType.GENERIC_9x6;
        };
    }

    /** Empties the store and returns what it held (non-empty stacks), the chest last when one was added. */
    public List<ItemStack> takeAll() {
        List<ItemStack> out = new ArrayList<>();
        if (container != null) {
            for (ItemStack stack : container.removeAllItems()) {
                if (!stack.isEmpty()) {
                    out.add(stack);
                }
            }
        }
        if (hasChest) {
            hasChest = false;
            out.add(new ItemStack(Items.CHEST));
        }
        return out;
    }

    /** After vanilla's {@code die} on the server: the contents (and the chest) drop where the mob died. */
    void die() {
        if (storage != null && body().level() instanceof ServerLevel level) {
            for (ItemStack stack : takeAll()) {
                body().spawnAtLocation(level, stack);
            }
        }
    }

    void addAdditionalSaveData(ValueOutput output) {
        if (storage == null) {
            return;
        }
        container.storeAsItemList(output.list("StorageItems", ItemStack.CODEC));
        if (storage.needsChest()) {
            output.putBoolean("StorageChest", hasChest);
        }
    }

    void readAdditionalSaveData(ValueInput input) {
        if (storage == null) {
            return;
        }
        container.clearContent();
        container.fromItemList(input.listOrEmpty("StorageItems", ItemStack.CODEC));
        hasChest = storage.needsChest() && input.getBooleanOr("StorageChest", false);
    }
}
