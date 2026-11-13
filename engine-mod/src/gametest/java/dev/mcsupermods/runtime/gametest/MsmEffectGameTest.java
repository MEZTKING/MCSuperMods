package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmMobEffect;
import dev.mcsupermods.runtime.registry.MsmRegistrar;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;

/**
 * Custom status effects (ADR 0055, B203) on {@code msm/msm_test/effect/}: registration, attribute modifiers per level,
 * {@code msm:on_start}, {@code msm:on_tick} (interval and {@code faster_per_level}), {@code msm:on_end} on removal and
 * on expiry, the {@code damage} and {@code heal} actions, a consumable and {@code apply_effect} giving a custom effect,
 * and the script API ({@code hasEffect}, {@code effectLevel}, {@code removeEffect}, {@code ActionEvent.other}).
 *
 * <p>{@code msm:on_tick} and {@code msm:on_end} run at the end of the server tick ({@link MsmMobEffect}), so checks
 * after them wait a tick or more.
 */
public class MsmEffectGameTest {
    private static final BlockPos AT = new BlockPos(2, 1, 2);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Holder<MobEffect> effect(GameTestHelper helper, String path) {
        Holder<MobEffect> holder = BuiltInRegistries.MOB_EFFECT.get(id(path)).<Holder<MobEffect>>map(h -> h).orElse(null);
        helper.assertTrue(holder != null, "effect msm_test:" + path + " not registered");
        return holder;
    }

    /** Records the events whose holder (the event's entity) is {@code holder}; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> events = Collections.synchronizedList(new ArrayList<>());
        private final LivingEntity holder;

        Recorder(LivingEntity holder) {
            this.holder = holder;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (ctx.entity() == holder) {
                events.add(owner.getPath() + ":" + event.getPath());
                if (ctx.other() != holder) {
                    events.add("other is not the holder");
                }
            }
        }

        long count(String entry) {
            synchronized (events) {
                return events.stream().filter(entry::equals).count();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    private static Mob cow(GameTestHelper helper) {
        return helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
    }

    @GameTest
    public void effectIsRegisteredWithCategoryAndColour(GameTestHelper helper) {
        MobEffect frostbite = effect(helper, "frostbite").value();
        helper.assertTrue(frostbite instanceof MsmMobEffect, "frostbite is not an MsmMobEffect: " + frostbite);
        helper.assertValueEqual(frostbite.getCategory(), MobEffectCategory.HARMFUL, "category");
        helper.assertValueEqual(frostbite.getColor(), 11393254, "colour");
        helper.assertValueEqual(effect(helper, "pulse").value().getCategory(), MobEffectCategory.BENEFICIAL, "pulse category");
        helper.assertValueEqual(effect(helper, "quickening").value().getCategory(), MobEffectCategory.NEUTRAL, "quickening category");
        helper.assertValueEqual(frostbite.getDescriptionId(), "effect.msm_test.frostbite", "name key");
        helper.assertTrue(MsmRuntime.report().effects().containsAll(List.of(id("frostbite"), id("pulse"), id("quickening"), id("scripted"))),
                "effects in the report: " + MsmRuntime.report().effects());
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/effect/")),
                "effect errors: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    @GameTest
    public void attributeModifierScalesWithLevelAndIsRemoved(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<MobEffect> frostbite = effect(helper, "frostbite");
        AttributeInstance armor = cow.getAttribute(Attributes.ARMOR);
        double base = cow.getAttributeValue(Attributes.ARMOR);
        cow.addEffect(new MobEffectInstance(frostbite, 200, 0));
        helper.assertTrue(armor.getModifier(MsmRegistrar.modifierId(id("frostbite"), 0)) != null, "modifier msm_test:effect.frostbite.0");
        helper.assertTrue(Math.abs(cow.getAttributeValue(Attributes.ARMOR) - (base + 2)) < 1.0e-6,
                "level I: armour " + cow.getAttributeValue(Attributes.ARMOR) + ", expected " + (base + 2));
        double speed = cow.getAttributeBaseValue(Attributes.MOVEMENT_SPEED);
        helper.assertTrue(Math.abs(cow.getAttributeValue(Attributes.MOVEMENT_SPEED) - speed * 0.9) < 1.0e-6, "level I: speed times 0.9");
        cow.removeEffect(frostbite);
        cow.addEffect(new MobEffectInstance(frostbite, 200, 1));
        helper.assertTrue(Math.abs(cow.getAttributeValue(Attributes.ARMOR) - (base + 4)) < 1.0e-6,
                "level II: armour " + cow.getAttributeValue(Attributes.ARMOR) + ", expected " + (base + 4));
        cow.removeEffect(frostbite);
        helper.assertTrue(Math.abs(cow.getAttributeValue(Attributes.ARMOR) - base) < 1.0e-6, "the modifier stays after removal");
        helper.assertTrue(armor.getModifier(MsmRegistrar.modifierId(id("frostbite"), 0)) == null, "the modifier is still there");
        cow.discard();
        helper.succeed();
    }

    /** {@code on_start} once (also when the effect is refreshed), {@code damage} 4 on the holder, then {@code on_end} heals 2. */
    @GameTest(maxTicks = 40)
    public void startOnceDamageThenEndHeals(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<MobEffect> frostbite = effect(helper, "frostbite");
        Recorder r = new Recorder(cow);
        float full = cow.getHealth();
        cow.addEffect(new MobEffectInstance(frostbite, 200, 0));
        cow.addEffect(new MobEffectInstance(frostbite, 200, 0)); // refresh: no second on_start
        cow.addEffect(new MobEffectInstance(frostbite, 300, 0)); // longer: updated, still no on_start
        helper.assertValueEqual(r.count("frostbite:bite"), 1L, "on_start firings: " + r.events);
        helper.assertTrue(Math.abs(cow.getHealth() - (full - 4)) < 1.0e-3, "damage 4: health " + cow.getHealth() + " of " + full);
        cow.removeEffect(frostbite);
        helper.runAfterDelay(2, () -> {
            r.close();
            helper.assertValueEqual(r.count("frostbite:thaw"), 1L, "on_end firings after removeEffect: " + r.events);
            helper.assertFalse(r.events.contains("other is not the holder"), "self and other are the holder: " + r.events);
            helper.assertTrue(Math.abs(cow.getHealth() - (full - 2)) < 1.0e-3, "heal 2 on other: health " + cow.getHealth());
            cow.discard();
            helper.succeed();
        });
    }

    /** Natural expiry: Fabric's {@code AFTER_REMOVE} fires from {@code onEffectsRemoved}, which {@code tickEffects} calls. */
    @GameTest(maxTicks = 60)
    public void onEndFiresOnExpiry(GameTestHelper helper) {
        Mob cow = cow(helper);
        Recorder r = new Recorder(cow);
        cow.addEffect(new MobEffectInstance(effect(helper, "frostbite"), 5, 0));
        helper.runAfterDelay(20, () -> {
            r.close();
            helper.assertFalse(cow.hasEffect(effect(helper, "frostbite")), "the effect did not run out");
            helper.assertValueEqual(r.count("frostbite:thaw"), 1L, "on_end firings on expiry: " + r.events);
            cow.discard();
            helper.succeed();
        });
    }

    /** {@code interval_ticks} 10 over 40 ticks: about 4 firings, at any level; with {@code faster_per_level} level II fires every 5. */
    @GameTest(maxTicks = 100)
    public void tickIntervalAndFasterPerLevel(GameTestHelper helper) {
        Mob plainI = cow(helper);
        Mob plainII = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east());
        Mob fastII = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.west());
        Recorder a = new Recorder(plainI);
        Recorder b = new Recorder(plainII);
        Recorder c = new Recorder(fastII);
        plainI.addEffect(new MobEffectInstance(effect(helper, "pulse"), 400, 0));
        plainII.addEffect(new MobEffectInstance(effect(helper, "pulse"), 400, 1));
        fastII.addEffect(new MobEffectInstance(effect(helper, "quickening"), 400, 1));
        helper.runAfterDelay(40, () -> {
            a.close();
            b.close();
            c.close();
            long ia = a.count("pulse:beat");
            long ib = b.count("pulse:beat");
            long ic = c.count("quickening:beat");
            helper.assertTrue(ia >= 3 && ia <= 5, "interval 10 at level I over 40 ticks: " + ia);
            helper.assertTrue(ib >= 3 && ib <= 5, "interval 10 at level II without faster_per_level: " + ib);
            helper.assertTrue(ic >= 7 && ic <= 9, "interval 10 / 2 at level II with faster_per_level: " + ic);
            plainI.discard();
            plainII.discard();
            fastII.discard();
            helper.succeed();
        });
    }

    /** The {@code heal} action of {@code pulse}'s tick event restores health. */
    @GameTest(maxTicks = 60)
    public void tickHealsTheHolder(GameTestHelper helper) {
        Mob cow = cow(helper);
        cow.setHealth(2);
        cow.addEffect(new MobEffectInstance(effect(helper, "pulse"), 400, 0));
        helper.runAfterDelay(25, () -> {
            helper.assertTrue(cow.getHealth() >= 3.5f, "pulse did not heal: health " + cow.getHealth());
            cow.discard();
            helper.succeed();
        });
    }

    @GameTest
    public void drinkAndApplyEffectGiveCustomEffects(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        ItemStack tonic = new ItemStack(BuiltInRegistries.ITEM.getValue(id("frost_tonic")));
        player.setItemInHand(InteractionHand.MAIN_HAND, tonic);
        tonic.finishUsingItem(helper.getLevel(), player);
        MobEffectInstance frost = player.getEffect(effect(helper, "frostbite"));
        helper.assertTrue(frost != null, "the drink did not give msm_test:frostbite");
        helper.assertValueEqual(frost.getAmplifier(), 1, "amplifier");
        helper.assertTrue(Math.abs(frost.getDuration() - 200) <= 2, "duration " + frost.getDuration());

        ItemStack wand = new ItemStack(BuiltInRegistries.ITEM.getValue(id("frost_wand")));
        player.setItemInHand(InteractionHand.MAIN_HAND, wand);
        wand.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.hasEffect(effect(helper, "pulse")), "apply_effect did not give msm_test:pulse");
        player.removeAllEffects();
        helper.succeed();
    }

    /** {@code msm:on_tick} with {@code run_script}: the handler reads and removes the effect through {@code e.other}. */
    @GameTest(maxTicks = 60)
    public void scriptReadsAndRemovesTheEffect(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost");
        Mob cow = cow(helper);
        Holder<MobEffect> scripted = effect(helper, "scripted");
        cow.addEffect(new MobEffectInstance(scripted, 400, 1));
        String line = "msm_test:effects: probe minecraft:cow same=true has=true level=2 speed=0 removed=true again=false after=false";
        helper.runAfterDelay(15, () -> {
            helper.assertTrue(host.recentLogs().contains(line), "not logged: '" + line + "'; recent: " + host.recentLogs()
                    + "; errors: " + host.handlerErrors());
            helper.assertFalse(cow.hasEffect(scripted), "removeEffect left the effect");
            cow.discard();
            helper.succeed();
        });
    }

    /** ADR 0052 / audit S3: {@code launch} moves a mob by velocity (an item's {@code other} target is the player; a mob through a direct call). */
    @GameTest(maxTicks = 40)
    public void launchMovesAMob(GameTestHelper helper) {
        Mob cow = helper.spawn(EntityTypes.COW, AT); // with AI: a mob without AI does not move
        double y = cow.getY();
        dev.mcsupermods.runtime.events.Motion.set(cow, 0, 0, 0);
        EventRunner.fire(id("launch_pad"), launchEvents(), id("go"), EventContext.forEffect(helper.getLevel(), cow));
        helper.assertTrue(cow.getDeltaMovement().y > 0.5, "launch did not set the velocity: " + cow.getDeltaMovement());
        helper.runAfterDelay(3, () -> {
            helper.assertTrue(cow.getY() > y + 0.5, "the mob did not move up: " + y + " -> " + cow.getY());
            cow.discard();
            helper.succeed();
        });
    }

    private static dev.mcsupermods.runtime.events.Events launchEvents() {
        com.google.gson.JsonElement json = com.google.gson.JsonParser.parseString(
                "{\"msm_test:go\": {\"actions\": [{\"type\": \"launch\", \"strength\": 0, \"direction\": \"up\", \"up\": 1.0}]}}");
        return dev.mcsupermods.runtime.events.Events.CODEC.parse(com.mojang.serialization.JsonOps.INSTANCE, json).getOrThrow();
    }
}
