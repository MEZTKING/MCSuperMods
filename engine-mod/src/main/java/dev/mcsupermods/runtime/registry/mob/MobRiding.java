package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.Optional;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.PlayerRideableJumping;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * Riding (ADR 0071 D3, {@code msm:rideable}): saddle slot, who controls the mob, ridden input and speed per movement
 * mode, the jump bar, seats and {@code on_mount}. Without {@code msm:rideable} every hook keeps vanilla's behaviour.
 *
 * <p>The saddle is vanilla's: the saddle item equips the {@link EquipmentSlot#SADDLE} slot of entities in
 * {@code #minecraft:can_equip_saddle} (lowering adds the mob there, plan limit M13) when {@link #canUseSlot} allows it;
 * {@code Equippable.equipOnTarget} marks it a guaranteed drop, so it drops on death, and shears take it off
 * ({@code Entity.interact} calls {@code Mob.attemptToShearEquipment} for any mob that carries no rider), as for pigs.
 * Never implements {@code ItemSteerable} and never constructs {@code Equippable} (plan limit M9).
 *
 * <p>A player-controlled mob is moved by the rider's client (plan limit M1): {@link #getRiddenInput},
 * {@link #getRiddenSpeed} and the jump in {@link #tickRidden} run there; the server only rotates the mob and receives its
 * position. The server's vehicle check ({@code ServerGamePacketListenerImpl.handleMoveVehicle}) resets a vehicle whose
 * squared move in one packet, less its squared delta movement, is above 100 (10 blocks a tick, not for the singleplayer
 * owner), and one that ends more than 0.25 blocks (squared 0.0625) from where the server's own move put it; the same on
 * 26.3 and 26.4-snapshot-7.
 *
 * <p>Renderers: {@link #saddleBone()} names the bone drawn only while {@link #saddleBoneVisible()} (the saddle slot is
 * vanilla synched equipment, so both sides agree).
 */
public final class MobRiding {
    /** Distance between seats, front to back, in blocks at scale 1 (a little more than a player's width). */
    static final double SEAT_SPACING = 0.7;
    /** The happy ghast's rise while jump is held, and its backwards factor. */
    private static final float RISE = 0.5f;
    private static final float BACKWARDS_FLYING = -0.5f;

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null without {@code msm:rideable}. */
    private final EntityComponents.Rideable rideable;
    private final EntityComponents.MovementMode mode;
    /** The jump bar's scale, from {@link #onPlayerJump} on the rider's client, used by {@link #tickRidden} on the ground. */
    private float pendingJump;

    MobRiding(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        this.rideable = definition == null ? null : definition.components().rideable().orElse(null);
        this.mode = definition == null ? EntityComponents.MovementMode.WALK
                : definition.components().movement().map(EntityComponents.Movement::mode).orElse(EntityComponents.MovementMode.WALK);
    }

    private PathfinderMob body() {
        return mob.asMob();
    }

    /** The {@code msm:rideable} component, when the definition has one. */
    public Optional<EntityComponents.Rideable> rideable() {
        return Optional.ofNullable(rideable);
    }

    /** Saddled, or no saddle needed. */
    private boolean steerable() {
        return !rideable.saddle() || body().isSaddled();
    }

    /** {@code controlled_by}: anyone, or the owner of a tamed mob (no owner, nobody). */
    private boolean allowed(Player player) {
        if (rideable.controlledBy() == EntityComponents.RideControl.ANYONE) {
            return true;
        }
        return body() instanceof TamableAnimal tamable && tamable.isTame() && tamable.isOwnedBy(player);
    }

    private boolean swimming() {
        return mode == EntityComponents.MovementMode.SWIM
                || mode == EntityComponents.MovementMode.AMPHIBIOUS && body().isInWater();
    }

    // Mounting

    /**
     * Third step of {@code mobInteract}: an empty hand mounts (sneaking passes, as vanilla dismounts); a saddle the mob
     * can take answers {@code PASS}, so {@code msm:on_interact} does not swallow it and vanilla's item use equips it;
     * {@code controlled_by: owner} keeps the first seat for the owner; a full mob or a baby passes on. {@code null}
     * passes on. {@code on_mount} fires here, once per mount by right click ({@code /ride} does not fire it).
     */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (rideable == null || player.isSecondaryUseActive()) {
            return null;
        }
        PathfinderMob body = body();
        ItemStack stack = player.getItemInHand(hand);
        if (!stack.isEmpty()) {
            boolean saddle = rideable.saddle() && !body.isSaddled() && body.isEquippableInSlot(stack, EquipmentSlot.SADDLE);
            return saddle ? InteractionResult.PASS : null;
        }
        if (body.isBaby() || body.hasPassenger(player) || body.getPassengers().size() >= rideable.passengers()) {
            return null;
        }
        if (body.getPassengers().isEmpty() && !allowed(player)) {
            return null;
        }
        if (body.level() instanceof ServerLevel level) {
            if (!player.startRiding(body)) {
                return null;
            }
            rideable.onMount().ifPresent(event -> EventRunner.fire(mob.definitionId(), definition.events(), event,
                    EventContext.forEntity(level, body, player)));
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * The first passenger steers when it is a player, the mob is saddled (or needs no saddle) and {@code controlled_by}
     * allows it; any other player passenger only sits. Other passengers keep vanilla's rule.
     */
    public LivingEntity getControllingPassenger(LivingEntity vanilla) {
        if (rideable == null) {
            return vanilla;
        }
        if (body().getFirstPassenger() instanceof Player player) {
            return steerable() && allowed(player) ? player : null;
        }
        return vanilla;
    }

    /** {@code passengers} seats; vanilla's single seat without {@code msm:rideable}. */
    public boolean canAddPassenger(Entity passenger, boolean vanilla) {
        return rideable == null ? vanilla : body().getPassengers().size() < rideable.passengers();
    }

    /**
     * The saddle slot exists only on a mount with {@code saddle} (alive and grown up, as the pig's); vanilla's
     * {@code LivingEntity.canUseSlot} is true for every slot. Other slots keep vanilla's answer.
     */
    public boolean canUseSlot(EquipmentSlot slot, boolean vanilla) {
        if (slot != EquipmentSlot.SADDLE) {
            return vanilla;
        }
        return rideable != null && rideable.saddle() && body().isAlive() && !body().isBaby();
    }

    /**
     * Seat {@code i} (the passenger's index) at {@code rider_offset} (blocks from the feet, times the mob's scale) or on
     * top of the hitbox, each further seat {@link #SEAT_SPACING} behind the one before; turned with the mob.
     */
    public Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dimensions, float scale, Vec3 vanilla) {
        if (rideable == null) {
            return vanilla;
        }
        int index = Math.max(0, body().getPassengers().indexOf(passenger));
        Vec3 seat = rideable.riderOffset()
                .map(o -> new Vec3(o.get(0) * scale, o.get(1) * scale, o.get(2) * scale))
                .orElseGet(() -> new Vec3(0, dimensions.height(), 0));
        if (index > 0) {
            seat = seat.add(0, 0, -SEAT_SPACING * index * scale);
        }
        return seat.yRot(-body().getYRot() * Mth.DEG_TO_RAD);
    }

    // Steering (on the rider's client; the rotation also on the server)

    /** After vanilla's: the mob faces the rider's view (half the pitch, as horses), then a pending jump on the ground. */
    public void tickRidden(Player rider, Vec3 input, Runnable vanilla) {
        vanilla.run();
        if (rideable == null) {
            return;
        }
        PathfinderMob body = body();
        body.setYRot(rider.getYRot() % 360.0f);
        body.setXRot((rider.getXRot() * 0.5f) % 360.0f);
        body.yRotO = body.getYRot();
        body.yBodyRot = body.getYRot();
        body.yHeadRot = body.getYRot();
        if (body.isLocalInstanceAuthoritative() && body.onGround()) {
            if (pendingJump > 0) {
                jump(pendingJump, input);
            }
            pendingJump = 0;
        }
    }

    /** The horse's jump: {@code jump_strength} times the bar's scale and the block's jump factor, plus jump boost. */
    private void jump(float scale, Vec3 input) {
        PathfinderMob body = body();
        double power = body.getAttributeValue(Attributes.JUMP_STRENGTH) * scale * blockJumpFactor(body) + body.getJumpBoostPower();
        Vec3 motion = body.getDeltaMovement();
        body.setDeltaMovement(motion.x, power, motion.z);
        body.needsSync = true;
        if (input.z > 0) {
            float sin = Mth.sin(body.getYRot() * Mth.DEG_TO_RAD);
            float cos = Mth.cos(body.getYRot() * Mth.DEG_TO_RAD);
            body.setDeltaMovement(body.getDeltaMovement().add(-0.4f * sin * scale, 0, 0.4f * cos * scale));
        }
    }

    /** {@code Entity.getBlockJumpFactor} (protected there): the block's factor, else the one below's. */
    private static float blockJumpFactor(PathfinderMob body) {
        float here = body.level().getBlockState(body.blockPosition()).getBlock().getJumpFactor();
        float below = body.level().getBlockState(body.getBlockPosBelowThatAffectsMyMovement()).getBlock().getJumpFactor();
        return here == 1.0f ? below : here;
    }

    /**
     * {@code walk} and {@code amphibious} on land: the horse's input (strafe at half, backwards at a quarter). {@code fly}:
     * the happy ghast's, along the rider's view (backwards at half), rising while jump is held. {@code swim}, and
     * {@code amphibious} in water: along the rider's view. The vertical part moves the mob through
     * {@code moveRelative}, which vanilla's travel and the movement module's both use.
     */
    public Vec3 getRiddenInput(Player rider, Vec3 input, Vec3 vanilla) {
        if (rideable == null) {
            return vanilla;
        }
        if (mode == EntityComponents.MovementMode.FLY || swimming()) {
            float forward = 0;
            float up = 0;
            if (rider.zza != 0) {
                float factor = rider.zza < 0 ? BACKWARDS_FLYING : 1.0f;
                forward = Mth.cos(rider.getXRot() * Mth.DEG_TO_RAD) * factor;
                up = -Mth.sin(rider.getXRot() * Mth.DEG_TO_RAD) * factor;
            }
            if (mode == EntityComponents.MovementMode.FLY && rider.isJumping()) {
                up += RISE;
            }
            return new Vec3(rider.xxa, up, forward);
        }
        float strafe = rider.xxa * 0.5f;
        float forward = rider.zza <= 0 ? rider.zza * 0.25f : rider.zza;
        return new Vec3(strafe, 0, forward);
    }

    /** The {@code movement_speed} attribute times {@code speed} (the horse's rule with a factor). */
    public float getRiddenSpeed(Player rider, float vanilla) {
        if (rideable == null) {
            return vanilla;
        }
        return (float) (body().getAttributeValue(Attributes.MOVEMENT_SPEED) * rideable.speed());
    }

    // Jump bar (PlayerRideableJumping)

    /** On the rider's client: the bar's charge (0 to 90 and over) to a scale through vanilla's default curve. */
    public void onPlayerJump(int strength) {
        if (!canJump()) {
            return;
        }
        pendingJump = ((PlayerRideableJumping) mob).getPlayerJumpPendingScale(Math.max(0, strength));
    }

    /**
     * A jump bar for {@code walk} and {@code amphibious} mounts with {@code jump} above 0 while steerable; {@code fly} and
     * {@code swim} mounts rise with the jump key instead, so they show no bar.
     */
    public boolean canJump() {
        return rideable != null && rideable.jump() > 0
                && (mode == EntityComponents.MovementMode.WALK || mode == EntityComponents.MovementMode.AMPHIBIOUS)
                && steerable();
    }

    /** On the server when the rider releases the bar; the jump itself comes with the rider's movement. Nothing more. */
    public void handleStartJump(int strength) {}

    /** {@code PlayerRideableJumping.handleStopJump}. */
    public void handleStopJump() {}

    /** The jump bar's pending scale, until the next ridden tick on the ground (read by the GameTests). */
    public float pendingJump() {
        return pendingJump;
    }

    // Renderers

    /** {@code saddle_bone}: the model bone drawn only while {@link #saddleBoneVisible()}. */
    public Optional<String> saddleBone() {
        return rideable == null ? Optional.empty() : rideable.saddleBone();
    }

    /** True while the saddle slot holds an item (vanilla synched equipment, so it reads the same on the client). */
    public boolean saddleBoneVisible() {
        return body().isSaddled();
    }
}
