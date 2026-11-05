package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.events.AnimationTarget;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.Set;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.mozilla.javascript.ScriptRuntime;

/**
 * {@code Entity} (ADR 0032 D2) over any {@link Entity}; health, healing and effects apply to living entities and do
 * nothing (health 0) on others. {@code playAnimation} reaches MSM entities through {@link AnimationTarget} and does
 * nothing on others.
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
            .method("damage", 1, 1, Entity.class, (api, e, args) -> {
                float amount = (float) ScriptValues.number(args, 0, "amount");
                if (e.level() instanceof ServerLevel l && amount > 0) {
                    e.hurtServer(l, l.damageSources().generic(), amount);
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
            .method("teleport", 1, 1, Entity.class, (api, e, args) -> {
                ScriptPos pos = ScriptPos.arg(args, 0, "pos");
                if (e.level() instanceof ServerLevel l) {
                    e.teleportTo(l, pos.x(), pos.y(), pos.z(), Set.of(), e.getYRot(), e.getXRot(), true);
                }
                return null;
            })
            .method("addEffect", 2, 3, Entity.class, (api, e, args) -> {
                String id = ScriptValues.string(args, 0, "id");
                Holder<MobEffect> effect = BuiltInRegistries.MOB_EFFECT.get(ScriptValues.id(id, "effect id"))
                        .<Holder<MobEffect>>map(h -> h)
                        .orElseThrow(() -> ScriptRuntime.typeError("unknown effect '" + id + "'"));
                int ticks = (int) Math.max(1, ScriptValues.number(args, 1, "ticks"));
                int amplifier = (int) Math.max(0, ScriptValues.number(args, 2, "amplifier", 0));
                if (e instanceof LivingEntity l) {
                    l.addEffect(new MobEffectInstance(effect, ticks, amplifier));
                }
                return null;
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
            .method("asPlayer", 0, 0, Entity.class, (api, e, args) -> e instanceof ServerPlayer p ? api.player(p) : null);
}
