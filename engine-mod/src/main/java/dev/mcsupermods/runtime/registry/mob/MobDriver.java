package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * The behaviour every {@code msm/<ns>/entity/*.json} mob shares, whatever body class carries it (ADR 0070 D2, the
 * pattern of {@code BlockBehaviourDriver}): events, triggers, sounds and the loot table here, each feature in one
 * module ({@link MobGoals}, {@link MobMovement}, {@link MobRanged}, {@link MobTaming}, {@link MobBreeding},
 * {@link MobRiding}, {@link MobVariants}, {@link MobBossBar}, {@link MobAnimations}). One driver per entity, built on
 * first use from the definition of the entity's type: {@code defineSynchedData}, {@code createNavigation} and
 * {@code registerGoals} run inside the vanilla constructors, before any field of the body is assigned, so the body
 * keeps the driver in a field without initialiser and builds it lazily. Building touches nothing but the type.
 *
 * <p>The body overrides each vanilla callback and only delegates here; where vanilla's own behaviour stays the
 * default, the body passes it in (a value for a pure getter, a {@link Supplier} or {@link Runnable} for anything
 * with side effects), and the driver decides whether to use it.
 */
public final class MobDriver {
    private final MsmMob mob;
    private final Identifier id;
    /** Null only for a type registered without a definition, which the registrar never does. */
    private final EntityDefinition definition;
    private final MobGoals goals;
    private final MobMovement movement;
    private final MobRanged ranged;
    private final MobTaming taming;
    private final MobBreeding breeding;
    private final MobRiding riding;
    private final MobVariants variants;
    private final MobBossBar bossBar;
    private final MobAnimations animations;

    private MobDriver(MsmMob mob) {
        this.mob = mob;
        PathfinderMob body = mob.asMob();
        this.id = BuiltInRegistries.ENTITY_TYPE.getKey(body.getType());
        this.definition = MsmEntityRegistrar.definition(body.getType()).orElse(null);
        this.goals = new MobGoals(mob, definition);
        this.movement = new MobMovement(mob, definition);
        this.ranged = new MobRanged(mob, definition);
        this.taming = new MobTaming(mob, definition);
        this.breeding = new MobBreeding(mob, definition);
        this.riding = new MobRiding(mob, definition);
        this.variants = new MobVariants(mob, definition);
        this.bossBar = new MobBossBar(mob, definition);
        this.animations = new MobAnimations(mob, definition);
    }

    /** Builds the driver of {@code mob} from the definition registered for its entity type. */
    public static MobDriver create(MsmMob mob) {
        return new MobDriver(mob);
    }

    /** The entity type id, the owner of the definition's events. */
    public Identifier id() {
        return id;
    }

    /** The definition; throws as {@code Optional.orElseThrow} did when the type has none. */
    public EntityDefinition definition() {
        if (definition == null) {
            throw new NoSuchElementException("no definition for " + id);
        }
        return definition;
    }

    public MobGoals goals() {
        return goals;
    }

    public MobMovement movement() {
        return movement;
    }

    public MobRanged ranged() {
        return ranged;
    }

    public MobTaming taming() {
        return taming;
    }

    public MobBreeding breeding() {
        return breeding;
    }

    public MobRiding riding() {
        return riding;
    }

    public MobVariants variants() {
        return variants;
    }

    public MobBossBar bossBar() {
        return bossBar;
    }

    public MobAnimations animations() {
        return animations;
    }

    // Synched data (ADR 0071 D4, ADR 0072 D2)

    /**
     * Defines the body class's two runtime accessors, both ints starting at 0. Static: the vanilla constructor calls
     * {@code defineSynchedData} before the body can look anything up.
     */
    public static void defineSynchedData(SynchedEntityData.Builder builder, EntityDataAccessor<Integer> variant,
            EntityDataAccessor<Integer> anim) {
        builder.define(variant, 0);
        builder.define(anim, 0);
    }

    /** After vanilla's {@code onSyncedDataUpdated}, on both sides. */
    public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
        variants.onSyncedDataUpdated(accessor);
        animations.onSyncedDataUpdated(accessor);
    }

    /** After vanilla's {@code addAdditionalSaveData}. */
    public void addAdditionalSaveData(ValueOutput output) {
        taming.addAdditionalSaveData(output);
        variants.addAdditionalSaveData(output);
        bossBar.addAdditionalSaveData(output);
    }

    /** After vanilla's {@code readAdditionalSaveData}. */
    public void readAdditionalSaveData(ValueInput input) {
        taming.readAdditionalSaveData(input);
        variants.readAdditionalSaveData(input);
        bossBar.readAdditionalSaveData(input);
    }

    /** Vanilla keeps the mob unless a module needs it kept (tamed mobs, bosses). */
    public boolean requiresCustomPersistence(boolean vanilla) {
        return bossBar.requiresCustomPersistence(taming.requiresCustomPersistence(vanilla));
    }

    // Events and triggers

    private void fire(ServerLevel level, Identifier event, Player player) {
        EventRunner.fire(id, definition().events(), event, EventContext.forEntity(level, mob.asMob(), player));
    }

    /** After vanilla's melee hit: plays the {@code attack} animation and fires {@code msm:attack.on_attack} on a hit. */
    public boolean doHurtTarget(ServerLevel level, Entity target, boolean hit) {
        if (hit) {
            EntityDefinition def = definition();
            def.components().animatedModel().attack().ifPresent(a -> mob.playAnimation(EntityDefinition.TRIGGERED_CONTROLLER, a));
            def.components().attack().flatMap(EntityComponents.Attack::onAttack)
                    .ifPresent(e -> EventRunner.fire(id, def.events(), e, EventContext.forEntity(level, mob.asMob(),
                            target instanceof Player p ? p : null, target instanceof LivingEntity living ? living : null)));
        }
        return hit;
    }

    /** After vanilla's {@code hurtServer}: {@code msm:on_hurt} when the entity survives (a lethal hit fires {@code msm:on_death}). */
    public boolean hurtServer(ServerLevel level, DamageSource source, boolean hurt) {
        if (hurt && mob.asMob().isAlive()) {
            definition().components().onHurt().ifPresent(c -> fire(level, c.event(), source.getEntity() instanceof Player p ? p : null));
        }
        return hurt;
    }

    /** After vanilla's {@code die}: {@code msm:on_death} once, on the logical server, then the modules. */
    public void die(DamageSource source, boolean wasDead, boolean dead) {
        if (!wasDead && dead && mob.asMob().level() instanceof ServerLevel level) {
            definition().components().onDeath().ifPresent(c -> fire(level, c.event(), source.getEntity() instanceof Player p ? p : null));
        }
        bossBar.die(source);
    }

    /** After vanilla's {@code remove}. */
    public void remove(Entity.RemovalReason reason) {
        bossBar.remove(reason);
    }

    /**
     * {@code mobInteract} in the order of ADR 0071 D1: breeding food, the owner's sit toggle, mounting, then
     * {@code msm:on_interact} (which, when present, answers every right click as before); otherwise vanilla's.
     */
    public InteractionResult mobInteract(Player player, InteractionHand hand, Supplier<InteractionResult> vanilla) {
        InteractionResult result = breeding.mobInteract(player, hand);
        if (result == null) {
            result = taming.mobInteract(player, hand);
        }
        if (result == null) {
            result = riding.mobInteract(player, hand);
        }
        if (result != null) {
            return result;
        }
        var onInteract = definition().components().onInteract();
        if (onInteract.isEmpty()) {
            return vanilla.get();
        }
        if (mob.asMob().level() instanceof ServerLevel level) {
            fire(level, onInteract.get().event(), player);
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * After vanilla's {@code customServerAiStep}: {@code msm:on_tick} (ADR 0061 D3, D4) every {@code interval_ticks}
     * while the AI runs, so never with {@code NoAI}; staggered by entity id and within the shared {@link TickLimiter};
     * then the modules.
     */
    public void customServerAiStep(ServerLevel level) {
        if (definition != null && definition.components().onTick().isPresent()) {
            EntityComponents.OnTick onTick = definition.components().onTick().get();
            if (due(level, mob.asMob(), onTick.intervalTicks()) && TickLimiter.tryFire(level)) {
                fire(level, onTick.event(), null);
            }
        }
        bossBar.customServerAiStep(level);
    }

    /** The same stagger as {@code MsmItem.due} (package-private there): due when game time plus entity id hits the interval. */
    private static boolean due(ServerLevel level, Entity owner, int interval) {
        return Math.floorMod(level.getGameTime() + owner.getId(), (long) interval) == 0;
    }

    /**
     * After vanilla's {@code finalizeSpawn}: the variant pick, then {@code msm:on_spawn} (ADR 0061 D3). Vanilla calls
     * it once for a natural, egg, spawner or command spawn, before the mob joins the level, and never when a saved mob
     * loads with its chunk.
     */
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor accessor, DifficultyInstance difficulty, EntitySpawnReason reason,
            SpawnGroupData data) {
        variants.finalizeSpawn(accessor, difficulty, reason);
        if (definition != null) {
            definition.components().onSpawn().ifPresent(onSpawn -> fire(accessor.getLevel(), onSpawn.event(), null));
        }
        return data;
    }

    /** After vanilla's {@code startSeenByPlayer}. */
    public void startSeenByPlayer(ServerPlayer player) {
        bossBar.startSeenByPlayer(player);
    }

    /** After vanilla's {@code stopSeenByPlayer}. */
    public void stopSeenByPlayer(ServerPlayer player) {
        bossBar.stopSeenByPlayer(player);
    }

    // Sounds (ADR 0057 D6): the definition's id when it names a registered sound event, else vanilla's.

    private SoundEvent configured(Function<EntityDefinition.Sounds, Optional<Identifier>> which) {
        if (definition == null || definition.sounds().isEmpty()) {
            return null;
        }
        return which.apply(definition.sounds().get()).flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).orElse(null);
    }

    public SoundEvent ambientSound(Supplier<SoundEvent> vanilla) {
        SoundEvent sound = configured(EntityDefinition.Sounds::ambient);
        return sound != null ? sound : vanilla.get();
    }

    public int ambientSoundInterval(Supplier<Integer> vanilla) {
        return definition == null ? vanilla.get()
                : definition.sounds().flatMap(EntityDefinition.Sounds::ambientIntervalTicks).orElseGet(vanilla);
    }

    public SoundEvent hurtSound(Supplier<SoundEvent> vanilla) {
        SoundEvent sound = configured(EntityDefinition.Sounds::hurt);
        return sound != null ? sound : vanilla.get();
    }

    public SoundEvent deathSound(Supplier<SoundEvent> vanilla) {
        SoundEvent sound = configured(EntityDefinition.Sounds::death);
        return sound != null ? sound : vanilla.get();
    }

    /** A configured step sound replaces the block's step sound, at the volume most vanilla mobs use (0.15). */
    public void playStepSound(Runnable vanilla) {
        SoundEvent sound = configured(EntityDefinition.Sounds::step);
        if (sound != null) {
            mob.asMob().playSound(sound, 0.15f, 1.0f);
        } else {
            vanilla.run();
        }
    }

    // Loot

    /** The definition's {@code loot_table}, or vanilla's default {@code <ns>:entities/<path>}. */
    public void dropFromLootTable(ServerLevel level, DamageSource source, boolean playerKill, Runnable vanilla) {
        var lootTable = definition().lootTable();
        if (lootTable.isPresent()) {
            mob.asMob().dropFromLootTable(level, source, playerKill, ResourceKey.create(Registries.LOOT_TABLE, lootTable.get()));
        } else {
            vanilla.run();
        }
    }
}
