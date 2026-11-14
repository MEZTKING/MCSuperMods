package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.registry.mob.MobDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PlayerRideableJumping;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.control.LookControl;
import net.minecraft.world.entity.ai.control.MoveControl;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * The {@code animal} body (ADR 0070 D2): a {@link TamableAnimal}, so taming, breeding and ages are vanilla's, with the
 * same delegating overrides as {@link MsmEntity} plus the animal callbacks ({@code isFood}, {@code getBreedOffspring},
 * {@code spawnChildFromBreeding}, {@code getAgeScale}, {@code canFlyToOwner}, {@code wantsToAttack}), filled by ADR
 * 0071 D1 and D2. {@code canBeABaby} and {@code setAgeLocked} are never overridden (their access differs between
 * 26.3 and 26.4). Registered from B286 on.
 */
public class MsmAnimal extends TamableAnimal implements MsmMob, RangedAttackMob, PlayerRideableJumping {
    public static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(MsmAnimal.class, EntityDataSerializers.INT);
    public static final EntityDataAccessor<Integer> DATA_ANIM = SynchedEntityData.defineId(MsmAnimal.class, EntityDataSerializers.INT);

    /** No initialiser: assigned during the super constructor by {@link #driver()}, and Java must not reset it. */
    private MobDriver driver;

    public MsmAnimal(EntityType<? extends TamableAnimal> type, Level level) {
        super(type, level);
        driver().movement().afterConstruct();
    }

    @Override
    public MobDriver driver() {
        if (driver == null) {
            driver = MobDriver.create(this);
        }
        return driver;
    }

    @Override
    public EntityDataAccessor<Integer> variantData() {
        return DATA_VARIANT;
    }

    @Override
    public EntityDataAccessor<Integer> animData() {
        return DATA_ANIM;
    }

    @Override
    public void setControls(MoveControl move, LookControl look) {
        if (move != null) {
            moveControl = move;
        }
        if (look != null) {
            lookControl = look;
        }
    }

    // Synched data, saving, spawning

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        MobDriver.defineSynchedData(builder, DATA_VARIANT, DATA_ANIM);
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
        super.onSyncedDataUpdated(accessor);
        driver().onSyncedDataUpdated(accessor);
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        super.addAdditionalSaveData(output);
        driver().addAdditionalSaveData(output);
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        super.readAdditionalSaveData(input);
        driver().readAdditionalSaveData(input);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor accessor, DifficultyInstance difficulty, EntitySpawnReason reason,
            SpawnGroupData data) {
        return driver().finalizeSpawn(accessor, difficulty, reason, super.finalizeSpawn(accessor, difficulty, reason, data));
    }

    @Override
    public boolean requiresCustomPersistence() {
        return driver().requiresCustomPersistence(super.requiresCustomPersistence());
    }

    @Override
    public void startSeenByPlayer(ServerPlayer player) {
        super.startSeenByPlayer(player);
        driver().startSeenByPlayer(player);
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        driver().stopSeenByPlayer(player);
    }

    // Goals and AI

    @Override
    protected void registerGoals() {
        driver().goals().registerGoals(goalSelector, targetSelector);
    }

    @Override
    protected void customServerAiStep(ServerLevel level) {
        super.customServerAiStep(level);
        driver().customServerAiStep(level);
    }

    @Override
    public void performRangedAttack(LivingEntity target, float power) {
        driver().ranged().performRangedAttack(target, power);
    }

    // Movement

    @Override
    protected PathNavigation createNavigation(Level level) {
        return driver().movement().createNavigation(level, () -> super.createNavigation(level));
    }

    @Override
    public void travel(Vec3 input) {
        driver().movement().travel(input, () -> super.travel(input));
    }

    @Override
    public boolean causeFallDamage(double fallDistance, float multiplier, DamageSource source) {
        return driver().movement().causeFallDamage(fallDistance, multiplier, source, () -> super.causeFallDamage(fallDistance, multiplier, source));
    }

    @Override
    public boolean canBreatheUnderwater() {
        return driver().movement().canBreatheUnderwater(super.canBreatheUnderwater());
    }

    @Override
    public void baseTick() {
        driver().movement().baseTick(super::baseTick);
    }

    @Override
    public boolean isPushedByFluid() {
        return driver().movement().isPushedByFluid(super.isPushedByFluid());
    }

    // Riding

    @Override
    public LivingEntity getControllingPassenger() {
        return driver().riding().getControllingPassenger(super.getControllingPassenger());
    }

    @Override
    protected void tickRidden(Player rider, Vec3 input) {
        driver().riding().tickRidden(rider, input, () -> super.tickRidden(rider, input));
    }

    @Override
    protected Vec3 getRiddenInput(Player rider, Vec3 input) {
        return driver().riding().getRiddenInput(rider, input, super.getRiddenInput(rider, input));
    }

    @Override
    protected float getRiddenSpeed(Player rider) {
        return driver().riding().getRiddenSpeed(rider, super.getRiddenSpeed(rider));
    }

    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dimensions, float scale) {
        return driver().riding().getPassengerAttachmentPoint(passenger, dimensions, scale,
                super.getPassengerAttachmentPoint(passenger, dimensions, scale));
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return driver().riding().canAddPassenger(passenger, super.canAddPassenger(passenger));
    }

    @Override
    public boolean canUseSlot(EquipmentSlot slot) {
        return driver().riding().canUseSlot(slot, super.canUseSlot(slot));
    }

    @Override
    public void onPlayerJump(int strength) {
        driver().riding().onPlayerJump(strength);
    }

    @Override
    public boolean canJump() {
        return driver().riding().canJump();
    }

    @Override
    public void handleStartJump(int strength) {
        driver().riding().handleStartJump(strength);
    }

    @Override
    public void handleStopJump() {
        driver().riding().handleStopJump();
    }

    // Events and triggers

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        return driver().mobInteract(player, hand, () -> super.mobInteract(player, hand));
    }

    @Override
    public boolean doHurtTarget(ServerLevel level, Entity target) {
        return driver().doHurtTarget(level, target, super.doHurtTarget(level, target));
    }

    @Override
    public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
        return driver().hurtServer(level, source, super.hurtServer(level, source, amount));
    }

    @Override
    public void die(DamageSource source) {
        boolean wasDead = dead;
        super.die(source);
        driver().die(source, wasDead, dead);
    }

    @Override
    public void remove(RemovalReason reason) {
        super.remove(reason);
        driver().remove(reason);
    }

    // Sounds and loot

    @Override
    protected SoundEvent getAmbientSound() {
        return driver().ambientSound(super::getAmbientSound);
    }

    @Override
    public int getAmbientSoundInterval() {
        return driver().ambientSoundInterval(super::getAmbientSoundInterval);
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return driver().hurtSound(() -> super.getHurtSound(source));
    }

    @Override
    protected SoundEvent getDeathSound() {
        return driver().deathSound(super::getDeathSound);
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        driver().playStepSound(() -> super.playStepSound(pos, state));
    }

    @Override
    protected void dropFromLootTable(ServerLevel level, DamageSource source, boolean playerKill) {
        driver().dropFromLootTable(level, source, playerKill, () -> super.dropFromLootTable(level, source, playerKill));
    }

    // Animal callbacks (ADR 0071 D1, D2)

    @Override
    public boolean isFood(ItemStack stack) {
        return driver().breeding().isFood(stack);
    }

    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
        return driver().breeding().getBreedOffspring(level, partner);
    }

    @Override
    public void spawnChildFromBreeding(ServerLevel level, Animal partner) {
        driver().breeding().spawnChildFromBreeding(level, partner, () -> super.spawnChildFromBreeding(level, partner));
    }

    @Override
    public float getAgeScale() {
        return driver().breeding().getAgeScale(super.getAgeScale());
    }

    @Override
    protected int getBabyStartAge() {
        return driver().breeding().getBabyStartAge(super.getBabyStartAge());
    }

    @Override
    protected boolean canFlyToOwner() {
        return driver().taming().canFlyToOwner(super.canFlyToOwner());
    }

    @Override
    public boolean wantsToAttack(LivingEntity target, LivingEntity owner) {
        return driver().taming().wantsToAttack(target, owner, super.wantsToAttack(target, owner));
    }
}
