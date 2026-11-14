package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.events.AnimationTarget;
import dev.mcsupermods.runtime.events.Motion;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.Set;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;

/**
 * {@code Entity} (ADR 0032 D2) over any {@link Entity}; health, healing and effects apply to living entities and do
 * nothing (health 0) on others. {@code playAnimation} reaches MSM entities through {@link AnimationTarget} and does
 * nothing on others. {@code runCommand} and {@code runFunction} run as and at the entity (ADR 0058 D2) and do nothing
 * (0 or false) when it is not in a server level. Script API 1.1 (ADR 0065 D2, D5 to D7): equipment of living
 * entities (nothing on others), typed damage with an attacker, raycasts from the eyes, teleport to another dimension.
 */
final class ScriptEntity {
    private ScriptEntity() {}

    static final ScriptType TYPE = ScriptType.of("Entity")
            .constant("type", Entity.class, (api, e) -> BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString())
            .constant("uuid", Entity.class, (api, e) -> e.getStringUUID())
            .live("pos", Entity.class, (api, e) -> api.pos(ScriptPos.of(e.position())))
            .live("world", Entity.class, (api, e) -> e.level() instanceof ServerLevel l ? api.world(l) : null)
            .live("health", Entity.class, (api, e) -> e instanceof LivingEntity l ? (double) l.getHealth() : 0.0)
            .live("maxHealth", Entity.class, (api, e) -> e instanceof LivingEntity l ? (double) l.getMaxHealth() : 0.0)
            .live("isAlive", Entity.class, (api, e) -> e.isAlive())
            .constant("isPlayer", Entity.class, (api, e) -> e instanceof Player)
            .live("name", Entity.class, (api, e) -> e.getName().getString())
            .live("velocity", Entity.class, (api, e) -> api.pos(ScriptPos.of(e.getDeltaMovement())))
            .live("look", Entity.class, (api, e) -> api.pos(ScriptPos.of(e.getLookAngle())))
            .live("data", Entity.class, (api, e) -> api.entityData(e))
            .method("setVelocity", 3, 3, Entity.class, (api, e, args) -> {
                Motion.set(e, ScriptValues.number(args, 0, "x"), ScriptValues.number(args, 1, "y"), ScriptValues.number(args, 2, "z"));
                return null;
            })
            .method("addVelocity", 3, 3, Entity.class, (api, e, args) -> {
                Motion.add(e, ScriptValues.number(args, 0, "x"), ScriptValues.number(args, 1, "y"), ScriptValues.number(args, 2, "z"));
                return null;
            })
            .method("damage", 1, 2, Entity.class, (api, e, args) -> {
                float amount = (float) ScriptValues.number(args, 0, "amount");
                Scriptable options = ScriptValues.options(args, 1, "options");
                if (!(e.level() instanceof ServerLevel l)) {
                    return null;
                }
                DamageSource source = options == null ? l.damageSources().generic() : damageSource(l, options);
                if (amount > 0) {
                    e.hurtServer(l, source, amount);
                }
                return null;
            })
            .method("heal", 1, 1, Entity.class, (api, e, args) -> {
                float amount = (float) ScriptValues.number(args, 0, "amount");
                if (e instanceof LivingEntity l && amount > 0) {
                    l.heal(amount);
                }
                return null;
            })
            .method("kill", 0, 0, Entity.class, (api, e, args) -> {
                if (e.level() instanceof ServerLevel l) {
                    e.kill(l);
                }
                return null;
            })
            .method("teleport", 1, 2, Entity.class, (api, e, args) -> {
                ScriptPos pos = ScriptPos.arg(args, 0, "pos");
                Scriptable options = ScriptValues.options(args, 1, "options");
                if (!(e.level() instanceof ServerLevel l)) {
                    return null;
                }
                ServerLevel target = l;
                String dimension = ScriptValues.stringMember(options, "dimension", null);
                if (dimension != null) {
                    target = world(l.getServer(), dimension);
                    if (target == null) {
                        throw ScriptRuntime.typeError("unknown dimension '" + dimension + "'");
                    }
                }
                float yaw = (float) ScriptValues.numberMember(options, "yaw", e.getYRot());
                float pitch = (float) Math.clamp(ScriptValues.numberMember(options, "pitch", e.getXRot()), -90.0, 90.0);
                e.teleportTo(target, pos.x(), pos.y(), pos.z(), Set.of(), yaw, pitch, true);
                return null;
            })
            .method("addEffect", 2, 3, Entity.class, (api, e, args) -> {
                Holder<MobEffect> effect = effect(ScriptValues.string(args, 0, "id"));
                int ticks = (int) Math.max(1, ScriptValues.number(args, 1, "ticks"));
                int amplifier = (int) Math.max(0, ScriptValues.number(args, 2, "amplifier", 0));
                if (e instanceof LivingEntity l) {
                    l.addEffect(new MobEffectInstance(effect, ticks, amplifier));
                }
                return null;
            })
            .method("hasEffect", 1, 1, Entity.class, (api, e, args) -> {
                Holder<MobEffect> effect = effect(ScriptValues.string(args, 0, "id"));
                return e instanceof LivingEntity l && l.hasEffect(effect);
            })
            .method("effectLevel", 1, 1, Entity.class, (api, e, args) -> {
                Holder<MobEffect> effect = effect(ScriptValues.string(args, 0, "id"));
                MobEffectInstance instance = e instanceof LivingEntity l ? l.getEffect(effect) : null;
                return instance == null ? 0.0 : (double) (instance.getAmplifier() + 1);
            })
            .method("removeEffect", 1, 1, Entity.class, (api, e, args) -> {
                Holder<MobEffect> effect = effect(ScriptValues.string(args, 0, "id"));
                return e instanceof LivingEntity l && l.removeEffect(effect);
            })
            .method("playAnimation", 1, 2, Entity.class, (api, e, args) -> {
                String name = ScriptValues.string(args, 0, "name");
                String controller = ScriptValues.present(args, 1) ? ScriptValues.string(args, 1, "controller")
                        : EntityDefinition.TRIGGERED_CONTROLLER;
                if (e instanceof AnimationTarget target) {
                    target.playAnimation(controller, name);
                }
                return null;
            })
            .method("asPlayer", 0, 0, Entity.class, (api, e, args) -> e instanceof ServerPlayer p ? api.player(p) : null)
            .method("runCommand", 1, 1, Entity.class, (api, e, args) -> {
                String command = ScriptValues.string(args, 0, "command");
                CommandSourceStack source = source(e);
                return source == null ? 0 : ScriptWorld.runCommand(source, command);
            })
            .method("runFunction", 1, 1, Entity.class, (api, e, args) -> {
                String id = ScriptValues.string(args, 0, "id");
                CommandSourceStack source = source(e);
                return source != null && ScriptWorld.runFunction(source, id);
            })
            .method("equipment", 1, 1, Entity.class, (api, e, args) -> {
                EquipmentSlot slot = ScriptItems.equipmentSlot(args, 0);
                return e instanceof LivingEntity l ? api.itemOrUndefined(l.getItemBySlot(slot)) : null;
            })
            .method("setEquipment", 1, 2, Entity.class, (api, e, args) -> {
                EquipmentSlot slot = ScriptItems.equipmentSlot(args, 0);
                ItemStack stack = ScriptValues.present(args, 1) ? ScriptInventory.capped(ScriptItems.spec(api, args, 1)) : ItemStack.EMPTY;
                if (e instanceof LivingEntity l) {
                    l.setItemSlot(slot, stack);
                }
                return null;
            })
            .method("raycast", 1, 2, Entity.class, (api, e, args) -> e.level() instanceof ServerLevel l
                    ? ScriptRaycast.cast(api, l, e.getEyePosition(), e.getLookAngle(), args, 0, e)
                    : null);

    /** A loaded dimension by id, or null; an invalid id is a script type error. */
    static ServerLevel world(MinecraftServer server, String dimension) {
        return server.getLevel(ResourceKey.create(Registries.DIMENSION, ScriptValues.id(dimension, "dimension")));
    }

    /**
     * The damage source of {@code damage(amount, options)} (ADR 0065 D5): {@code type} (default
     * {@code minecraft:generic}; an unknown type is a script type error), {@code attacker} the causing entity and
     * {@code direct} the entity that hit ({@code attacker} when not given), so a player attacker gives kill credit.
     */
    private static DamageSource damageSource(ServerLevel level, Scriptable options) {
        String typeId = ScriptValues.stringMember(options, "type", "minecraft:generic");
        Holder<DamageType> type = level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE)
                .get(ResourceKey.create(Registries.DAMAGE_TYPE, ScriptValues.id(typeId, "damage type")))
                .<Holder<DamageType>>map(h -> h)
                .orElseThrow(() -> ScriptRuntime.typeError("unknown damage type '" + typeId + "'"));
        Object attackerValue = ScriptValues.member(options, "attacker");
        Object directValue = ScriptValues.member(options, "direct");
        Entity attacker = attackerValue == null ? null : ScriptValues.entity(attackerValue, "options.attacker");
        Entity direct = directValue == null ? attacker : ScriptValues.entity(directValue, "options.direct");
        return new DamageSource(type, direct, attacker);
    }

    /**
     * The source of {@code Entity.runCommand} and {@code Entity.runFunction} (ADR 0058 D2): the server's source as and
     * at the entity (its level, position and rotation; {@code @s} is the entity), permission level 2, output
     * suppressed; null when the entity is not in a server level.
     */
    private static CommandSourceStack source(Entity e) {
        if (!(e.level() instanceof ServerLevel l)) {
            return null;
        }
        return l.getServer().createCommandSourceStack()
                .withLevel(l)
                .withEntity(e)
                .withPosition(e.position())
                .withRotation(e.getRotationVector())
                .withPermission(LevelBasedPermissionSet.GAMEMASTER) // permission level 2
                .withSuppressedOutput();
    }

    /** A mob effect by id (vanilla or registered from {@code msm/<ns>/effect/}); an unknown id is a script type error. */
    static Holder<MobEffect> effect(String id) {
        return BuiltInRegistries.MOB_EFFECT.get(ScriptValues.id(id, "effect id"))
                .<Holder<MobEffect>>map(h -> h)
                .orElseThrow(() -> ScriptRuntime.typeError("unknown effect '" + id + "'"));
    }
}
