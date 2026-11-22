package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.goals.PerchOnOwnerGoal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.loader.StorageParser;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BooleanSupplier;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * Shoulder pets (ADR 0098 D4 as amended after the B469 spike, {@code msm:shoulder_riding}; both shoulders since ADR 0109
 * D2 as amended after B524): a tamed {@code animal} pet with {@code msm:tameable} perches on one of its owner's
 * shoulders. It is not a passenger (a player cannot be a vehicle on the server): the perched flag
 * ({@link MsmAnimal#DATA_PERCHED}, synched and saved as {@code Perched}) and the side ({@link MsmAnimal#DATA_PERCH_LEFT},
 * synched and saved as {@code PerchSide}) make both sides put the pet at the owner's position plus
 * {@link #offset(Player, Side)} every tick, with no gravity ({@code NoGravity}, its earlier value kept in
 * {@code PerchNoGravity}), no physics and no pushing.
 *
 * <p>Sides are named by the player's own view: {@link Side#RIGHT} is the player's right (seen from behind, the side of
 * vanilla's right parrot; the only side before ADR 0109), {@link Side#LEFT} the mirror image. {@code sides} picks one,
 * or {@code either} (the default) takes the free one, the right first. A player carries at most two pets, one per side
 * (the server's {@link #PERCHED} index). Vanilla's parrots keep their own shoulders (they take the left first): a side
 * holding a parrot is not free, and every tick a perched pet moves to the side the parrots leave free (when its
 * {@code sides} allows), or gets off when there is none.
 *
 * <p>The pet gets on by its goal ({@link PerchOnOwnerGoal}: tamed, not ordered to sit, not riding or leashed, the
 * owner within {@link #START_RANGE} blocks, standing on the ground, not sneaking, sleeping, riding, swimming, flying,
 * gliding or a spectator, a free side it may take, and {@link #COOLDOWN} ticks after it last left). It leaves when
 * the owner takes damage that a shield does not block (Fabric's {@code AFTER_DAMAGE}), sneaks, sleeps, rides, swims or is in water, glides with an
 * elytra, becomes a spectator, changes dimension (the owner is no longer in the pet's level), leaves the game
 * ({@code DISCONNECT}, or no owner found) or dies, when no side is left for it, and when the pet itself rides, is
 * leashed or is no longer tamed.
 */
public final class MobShoulder {
    /**
     * The shoulder: this far to the side of the owner's body axis, in blocks: the right is {@code -x} turned by the body
     * yaw (the player's right as they see it), the left {@code +x}.
     */
    public static final double SIDE = 0.4;
    /** The shoulder: this far below the top of the owner's box (1.35 above the feet standing, lower while sneaking). */
    public static final double BELOW_TOP = 0.45;
    /** Ticks after leaving before the pet may perch again (ADR 0098 D4). */
    public static final int COOLDOWN = 100;
    /** The goal starts with the owner this near, in blocks. */
    public static final double START_RANGE = 8;
    /** The goal perches the pet this near, in blocks. */
    public static final double PERCH_REACH = 1.5;

    /** A shoulder, named by the player's own view. */
    public enum Side {
        LEFT, RIGHT;

        public Side other() {
            return this == LEFT ? RIGHT : LEFT;
        }

        public String serialName() {
            return this == LEFT ? "left" : "right";
        }
    }

    /** The two seats of one owner (server). */
    private static final class Seats {
        volatile MsmMob left;
        volatile MsmMob right;

        MsmMob get(Side side) {
            return side == Side.LEFT ? left : right;
        }

        void set(Side side, MsmMob pet) {
            if (side == Side.LEFT) {
                left = pet;
            } else {
                right = pet;
            }
        }

        void remove(MsmMob pet) {
            if (left == pet) {
                left = null;
            }
            if (right == pet) {
                right = null;
            }
        }
    }

    /** Server: owner UUID to the pets perched on that owner. */
    private static final Map<UUID, Seats> PERCHED = new ConcurrentHashMap<>();
    /** Entity types already warned about an unusable component. */
    private static final Set<Identifier> WARNED = ConcurrentHashMap.newKeySet();

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** The component on a tamed-capable {@code animal} body. */
    private final boolean enabled;
    /** The sides the pet may take, in the order it tries them. */
    private final List<Side> allowed;
    private int cooldown;
    private boolean noGravityBefore;

    MobShoulder(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        boolean present = definition != null && definition.components().shoulderRiding().isPresent();
        this.enabled = present && mob.asMob() instanceof MsmAnimal && definition.components().tameable().isPresent();
        StorageParser.ShoulderSide sides = present ? definition.components().shoulderRiding().get().sides() : StorageParser.ShoulderSide.EITHER;
        this.allowed = switch (sides) {
            case LEFT -> List.of(Side.LEFT);
            case RIGHT -> List.of(Side.RIGHT);
            case EITHER -> List.of(Side.RIGHT, Side.LEFT);
        };
        if (present && !enabled) {
            // Not mob.definitionId(): the driver building this module is not assigned to the body yet.
            Identifier id = BuiltInRegistries.ENTITY_TYPE.getKey(mob.asMob().getType());
            if (WARNED.add(id)) {
                MsmRuntime.LOGGER.warn("[{}] {}: msm:shoulder_riding needs base 'animal' and msm:tameable; the pet never perches",
                        MsmRuntime.MOD_ID, id);
            }
        }
        if (enabled) {
            Listeners.ensure();
        }
    }

    /** Whether the mob can perch at all. */
    public boolean enabled() {
        return enabled;
    }

    private MsmAnimal body() {
        return (MsmAnimal) mob.asMob();
    }

    /** Whether the pet sits on its owner's shoulder now (both sides). */
    public boolean perched() {
        return enabled && body().getEntityData().get(MsmAnimal.DATA_PERCHED);
    }

    /** The side the pet sits on (meaningful while {@link #perched()}; both sides read the synched flag). */
    public Side side() {
        return enabled && body().getEntityData().get(MsmAnimal.DATA_PERCH_LEFT) ? Side.LEFT : Side.RIGHT;
    }

    /** The sides {@code sides} allows, in the order the pet tries them. */
    public List<Side> allowedSides() {
        return allowed;
    }

    /** Ticks until the pet may perch again. */
    public int cooldown() {
        return cooldown;
    }

    /** The place on the owner's right shoulder ({@link #offset(Player, Side)}), the only side before ADR 0109. */
    public static Vec3 offset(Player owner) {
        return offset(owner, Side.RIGHT);
    }

    /** The pet's place relative to the owner's feet: {@link #SIDE} to that side, {@link #BELOW_TOP} under the box's top. */
    public static Vec3 offset(Player owner, Side side) {
        double x = side == Side.RIGHT ? -SIDE : SIDE;
        return new Vec3(x, owner.getBbHeight() - BELOW_TOP, 0).yRot(-owner.yBodyRot * Mth.DEG_TO_RAD);
    }

    /** The pet perched on {@code owner}'s {@code side}, or null (server). */
    public static MsmMob perchedOn(Player owner, Side side) {
        Seats seats = PERCHED.get(owner.getUUID());
        if (seats == null) {
            return null;
        }
        MsmMob pet = seats.get(side);
        if (pet == null) {
            return null;
        }
        Entity body = pet.asMob();
        if (body.isRemoved() || !pet.driver().shoulder().perched() || pet.driver().shoulder().side() != side) {
            seats.remove(pet);
            return null;
        }
        return pet;
    }

    /** A pet perched on {@code owner}, the right shoulder's first, or null (server). */
    public static MsmMob perchedOn(Player owner) {
        MsmMob right = perchedOn(owner, Side.RIGHT);
        return right != null ? right : perchedOn(owner, Side.LEFT);
    }

    /** Whether vanilla has a parrot on that shoulder of {@code owner}. */
    public static boolean parrotOn(Player owner, Side side) {
        return (side == Side.LEFT ? owner.getShoulderParrotLeft() : owner.getShoulderParrotRight()).isPresent();
    }

    /** Whether {@code side} holds neither a parrot nor another pet (server; on the client only the parrots are known). */
    private boolean free(Player owner, Side side) {
        if (parrotOn(owner, side)) {
            return false;
        }
        if (!(owner.level() instanceof ServerLevel)) {
            return true;
        }
        MsmMob other = perchedOn(owner, side);
        return other == null || other == mob;
    }

    /** The first side the pet may take on {@code owner} now, or null. */
    public Side freeSide(Player owner) {
        for (Side side : allowed) {
            if (free(owner, side)) {
                return side;
            }
        }
        return null;
    }

    /** Why no allowed side is free (assumes {@link #freeSide} is null). */
    private String takenReason(Player owner) {
        if (allowed.size() > 1) {
            return "both shoulders are taken";
        }
        return parrotOn(owner, allowed.getFirst()) ? "a parrot sits on that shoulder" : "another pet is on that shoulder";
    }

    /** Why the owner cannot carry a pet now, or null. */
    public static String ownerRefusal(Player owner) {
        if (!owner.isAlive()) {
            return "the owner is dead";
        }
        if (owner.isSpectator()) {
            return "the owner is a spectator";
        }
        if (owner.isShiftKeyDown()) {
            return "the owner sneaks";
        }
        if (owner.isSleeping()) {
            return "the owner sleeps";
        }
        if (owner.isPassenger()) {
            return "the owner rides";
        }
        if (owner.isInWater() || owner.isSwimming()) {
            return "the owner swims";
        }
        if (owner.isFallFlying()) {
            return "the owner glides";
        }
        return null;
    }

    /** Why the pet may not get on {@code owner} now, or null; the distance is the goal's business. */
    public String refusal(Player owner) {
        if (!enabled) {
            return "no msm:shoulder_riding on an animal with msm:tameable";
        }
        MsmAnimal pet = body();
        if (perched()) {
            return "already perched";
        }
        if (!pet.isAlive() || !pet.isTame() || !pet.isOwnedBy(owner)) {
            return "not tamed by this player";
        }
        if (pet.isOrderedToSit()) {
            return "ordered to sit";
        }
        if (pet.isPassenger() || pet.isVehicle() || pet.isLeashed()) {
            return "the pet rides, carries or is leashed";
        }
        if (cooldown > 0) {
            return "cooling down";
        }
        if (owner.level() != pet.level()) {
            return "the owner is in another dimension";
        }
        String ownerRefusal = ownerRefusal(owner);
        if (ownerRefusal != null) {
            return ownerRefusal;
        }
        if (!owner.onGround() || owner.getAbilities().flying) {
            return "the owner is not on the ground";
        }
        if (freeSide(owner) == null) {
            return takenReason(owner);
        }
        return null;
    }

    /** The goal's owner: a player that the pet may get on now and that stands within {@link #START_RANGE}, or null. */
    public Player ownerToPerchOn() {
        if (!enabled) {
            return null;
        }
        MsmAnimal pet = body();
        if (!(pet.getOwner() instanceof Player owner) || pet.distanceToSqr(owner) > START_RANGE * START_RANGE) {
            return null;
        }
        return refusal(owner) == null ? owner : null;
    }

    /** Perches the pet on {@code owner} (server); false, changing nothing, when {@link #refusal} says no. */
    public boolean perch(Player owner) {
        MsmAnimal pet = body();
        if (!(pet.level() instanceof ServerLevel) || refusal(owner) != null) {
            return false;
        }
        Side side = freeSide(owner);
        noGravityBefore = pet.isNoGravity();
        pet.getEntityData().set(MsmAnimal.DATA_PERCH_LEFT, side == Side.LEFT);
        pet.getEntityData().set(MsmAnimal.DATA_PERCHED, true);
        pet.setNoGravity(true);
        pet.noPhysics = true;
        pet.getNavigation().stop();
        pet.setTarget(null);
        PERCHED.computeIfAbsent(owner.getUUID(), u -> new Seats()).set(side, mob);
        place(pet, owner, side);
        return true;
    }

    /** Takes the pet off its owner's shoulder (server); it falls from where it sat and may not return for {@link #COOLDOWN} ticks. */
    public void unperch() {
        if (!perched()) {
            return;
        }
        MsmAnimal pet = body();
        if (!(pet.level() instanceof ServerLevel)) {
            return;
        }
        pet.getEntityData().set(MsmAnimal.DATA_PERCHED, false);
        pet.setNoGravity(noGravityBefore);
        pet.noPhysics = false;
        pet.setDeltaMovement(Vec3.ZERO);
        pet.resetFallDistance();
        cooldown = COOLDOWN;
        forget(mob);
    }

    private static void forget(MsmMob pet) {
        for (Seats seats : PERCHED.values()) {
            seats.remove(pet);
        }
    }

    private static void place(MsmAnimal pet, Player owner, Side side) {
        Vec3 at = owner.position().add(offset(owner, side));
        pet.setPos(at.x, at.y, at.z);
        pet.setDeltaMovement(Vec3.ZERO);
        pet.setYRot(owner.yBodyRot);
        pet.yBodyRot = owner.yBodyRot;
        pet.setYHeadRot(owner.getYHeadRot());
        pet.setXRot(0);
    }

    /** Why a perched pet must leave now, or null (server). */
    private String leaveReason(MsmAnimal pet) {
        if (!(pet.getOwner() instanceof Player owner)) {
            return "the owner left";
        }
        if (owner.level() != pet.level()) {
            return "the owner changed dimension";
        }
        if (!pet.isAlive() || !pet.isTame() || pet.isPassenger() || pet.isLeashed()) {
            return "the pet cannot stay";
        }
        String ownerRefusal = ownerRefusal(owner);
        if (ownerRefusal != null) {
            return ownerRefusal;
        }
        if (freeSide(owner) == null) {
            return takenReason(owner);
        }
        return null;
    }

    /** After vanilla's {@code tick}, on both sides: the server checks and places, the client places. */
    void tick() {
        if (!enabled) {
            return;
        }
        MsmAnimal pet = body();
        if (pet.level() instanceof ServerLevel) {
            if (cooldown > 0) {
                cooldown--;
            }
            if (!perched()) {
                return;
            }
            if (leaveReason(pet) != null) {
                unperch();
                return;
            }
            Player owner = (Player) pet.getOwner();
            Side side = side();
            if (!free(owner, side)) {
                // A parrot (or, after a load, another pet) took this side: move to the side left free.
                side = freeSide(owner);
                forget(mob);
                pet.getEntityData().set(MsmAnimal.DATA_PERCH_LEFT, side == Side.LEFT);
            }
            Seats seats = PERCHED.computeIfAbsent(owner.getUUID(), u -> new Seats());
            if (seats.get(side) == null) {
                seats.set(side, mob);
            }
            place(pet, owner, side);
        } else if (perched() && pet.getOwner() instanceof Player owner && owner.level() == pet.level()) {
            place(pet, owner, side());
        }
    }

    /** Adds {@link PerchOnOwnerGoal} after the fighting goals (where following the owner goes); called by {@link MobGoals}. */
    public void addGoals(GoalSelector goalSelector) {
        if (!enabled) {
            return;
        }
        double speed = definition.components().tameable().map(t -> (double) t.follow().speed()).orElse(1.0);
        goalSelector.addGoal(MobTaming.afterFighting(definition.components()), new PerchOnOwnerGoal(body(), this, speed));
    }

    /** No right-click of its own: a perched pet is reached through its owner's shoulder only by accident. */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }

    void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
        if (enabled && accessor == MsmAnimal.DATA_PERCHED) {
            body().noPhysics = perched();
        }
    }

    /** A perched pet is not pushed and pushes nothing. */
    public boolean isPushable(boolean vanilla) {
        return vanilla && !perched();
    }

    public void doPush(Entity entity, Runnable vanilla) {
        if (!perched()) {
            vanilla.run();
        }
    }

    /** A perched pet's head may reach into a low ceiling over its owner; it does not suffocate there. */
    public boolean isInWall(BooleanSupplier vanilla) {
        return !perched() && vanilla.getAsBoolean();
    }

    void die() {
        unperch();
    }

    void remove(Entity.RemovalReason reason) {
        forget(mob);
    }

    void addAdditionalSaveData(ValueOutput output) {
        if (!enabled) {
            return;
        }
        boolean perched = perched();
        output.putBoolean("Perched", perched);
        if (perched) {
            output.putBoolean("PerchNoGravity", noGravityBefore);
            output.putString("PerchSide", side().serialName());
        }
        if (cooldown > 0) {
            output.putInt("ShoulderCooldown", cooldown);
        }
    }

    /** A pet saved perched stays perched only if its owner is there on its first tick (the server checks). */
    void readAdditionalSaveData(ValueInput input) {
        if (!enabled) {
            return;
        }
        boolean perched = input.getBooleanOr("Perched", false);
        noGravityBefore = input.getBooleanOr("PerchNoGravity", false);
        cooldown = Math.max(0, input.getIntOr("ShoulderCooldown", 0));
        boolean left = input.getString("PerchSide").map("left"::equals).orElse(false);
        body().getEntityData().set(MsmAnimal.DATA_PERCH_LEFT, left && allowed.contains(Side.LEFT) || !allowed.contains(Side.RIGHT));
        body().getEntityData().set(MsmAnimal.DATA_PERCHED, perched);
        body().noPhysics = perched;
    }

    /** Owner events that end a perch at once; registered when the first pet with the component is built. */
    private static final class Listeners {
        static {
            ServerLivingEntityEvents.AFTER_DAMAGE.register((entity, source, baseDamage, damage, blocked) -> {
                if (!blocked && entity instanceof Player player) {
                    leave(player);
                }
            });
            ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> leave(handler.player));
        }

        static void ensure() {
            // Loading the class registers the listeners once.
        }

        private static void leave(Player owner) {
            for (Side side : Side.values()) {
                MsmMob pet = perchedOn(owner, side);
                if (pet != null) {
                    pet.driver().shoulder().unperch();
                }
            }
        }
    }
}
