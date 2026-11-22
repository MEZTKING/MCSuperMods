package dev.mcsupermods.runtime.gametest.spike600;

import static dev.mcsupermods.runtime.gametest.spike600.B600Help.NS;
import static dev.mcsupermods.runtime.gametest.spike600.B600Help.R;

import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.advancements.AdvancementNode;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.ChatType;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.minecraft.world.level.block.Blocks;

/**
 * B600 spike (throwaway): predicates by {@code execute if predicate} under set-up situations, item modifiers by
 * {@code item modify}, tags as the registry resolved them, the advancement tree's node positions, death lines, chat
 * decorations, enchantment names and the enchanting table's choices, and the registries of trial spawners, block
 * transformers and dialogs. All on MSM's own fixture files (namespace {@code msm_b600}).
 */
public class B600DataGameTest {
    static int test(MinecraftServer server, CommandSourceStack source, String predicate) {
        B600Help.run(server, B600Help.op(server.createCommandSourceStack()), "data remove storage msm_b600:out v");
        B600Help.run(server, source, "execute store success storage msm_b600:out v int 1 if predicate " + predicate);
        return server.getCommandStorage().get(B600Help.id("out")).getIntOr("v", -1);
    }

    static double rate(MinecraftServer server, CommandSourceStack source, String predicate, int n) {
        int yes = 0;
        for (int i = 0; i < n; i++) {
            yes += test(server, source, predicate) == 1 ? 1 : 0;
        }
        return yes / (double) n;
    }

    @GameTest(maxTicks = 800)
    public void predicates(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack console = B600Help.op(server.createCommandSourceStack().withLevel(level)
                .withPosition(net.minecraft.world.phys.Vec3.atCenterOf(helper.absolutePos(new BlockPos(1, 1, 1)))));
        CommandSourceStack asPlayer = B600Help.op(player.createCommandSourceStack());
        Map<String, Object> m = new TreeMap<>();
        R.section("pred", () -> {
            long t0 = System.nanoTime();
            m.put("chance30.rate", rate(server, console, NS + ":chance30", 10_000));
            m.put("chance30.ms", (System.nanoTime() - t0) / 1_000_000);
            m.put("all_any.rate", rate(server, console, NS + ":all_any", 10_000));
            m.put("list_form.rate", rate(server, console, NS + ":list_form", 10_000));
            m.put("ref.rate", rate(server, console, NS + ":ref", 10_000));
            m.put("inverted_zero", test(server, console, NS + ":inverted_zero"));
            m.put("int_check", test(server, console, NS + ":int_check"));
            B600Help.run(server, console, "weather rain");
            m.put("raining.rightAfterCommand", test(server, console, NS + ":raining"));
            B600Help.run(server, console, "time set 1000");
            m.put("day.at1000", test(server, console, NS + ":day"));
            B600Help.run(server, console, "time set 13000");
            m.put("day.at13000", test(server, console, NS + ":day"));
            B600Help.run(server, console, "time set 25000");
            m.put("day.at25000", test(server, console, NS + ":day"));
            player.setShiftKeyDown(true);
            m.put("sneaking.shiftKeyOnly", test(server, asPlayer, NS + ":sneaking"));
            player.setPose(net.minecraft.world.entity.Pose.CROUCHING);
            m.put("sneaking.playerCrouching", test(server, asPlayer, NS + ":sneaking"));
            player.setPose(net.minecraft.world.entity.Pose.STANDING);
            player.setShiftKeyDown(false);
            m.put("sneaking.playerStanding", test(server, asPlayer, NS + ":sneaking"));
            m.put("sneaking.console", test(server, console, NS + ":sneaking"));
            m.put("is_player.player", test(server, asPlayer, NS + ":is_player"));
            m.put("is_player.console", test(server, console, NS + ":is_player"));
            for (String p : List.of("tool_any", "killed_by_player", "survives_explosion", "table_bonus", "damage_fire", "enchant_active",
                    "plains")) {
                m.put(p + ".player", test(server, asPlayer, NS + ":" + p));
                m.put(p + ".console", test(server, console, NS + ":" + p));
            }
            m.put("high.y" + (int) console.getPosition().y, test(server, console, NS + ":high"));
            m.put("high.y150", test(server, console.withPosition(console.getPosition().with(net.minecraft.core.Direction.Axis.Y, 150)),
                    NS + ":high"));
            B600Help.run(server, console, "scoreboard objectives add b600 dummy");
            B600Help.run(server, console, "scoreboard players set " + player.getScoreboardName() + " b600 3");
            m.put("score5.at3", test(server, asPlayer, NS + ":score5"));
            B600Help.run(server, console, "scoreboard players set " + player.getScoreboardName() + " b600 6");
            m.put("score5.at6", test(server, asPlayer, NS + ":score5"));
            m.put("score5.console", test(server, console, NS + ":score5"));
            m.put("missing", test(server, console, NS + ":does_not_exist"));
        });
        m.put("biomeHere", level.getBiome(helper.absolutePos(new BlockPos(1, 1, 1))).unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
        helper.runAfterDelay(150, () -> {
            m.put("raining.after150ticks", test(server, console, NS + ":raining"));
            m.put("isRaining.after150ticks", level.isRaining());
            B600Help.run(server, console, "weather clear");
            helper.runAfterDelay(150, () -> {
                m.put("raining.clearAfter150ticks", test(server, console, NS + ":raining"));
                R.put("pred", m);
                helper.succeed();
            });
        });
    }

    static Object encode(MinecraftServer server, ItemStack stack) {
        return ItemStack.CODEC.encodeStart(server.registryAccess().createSerializationContext(JsonOps.INSTANCE), stack)
                .result().map(Object::toString).orElse("?");
    }

    static List<Object> tooltip(ServerLevel level, ServerPlayer player, ItemStack stack) {
        List<Object> out = new ArrayList<>();
        for (Component c : stack.getTooltipLines(Item.TooltipContext.of(level), player, TooltipFlag.NORMAL)) {
            out.add(B600Help.describe(c));
        }
        return out;
    }

    @GameTest(maxTicks = 200)
    public void modifiers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        level.setBlockAndUpdate(chestPos, Blocks.CHEST.defaultBlockState());
        Container chest = B600Help.chest(level, chestPos);
        CommandSourceStack console = B600Help.op(server.createCommandSourceStack().withLevel(level));
        Map<String, Object> m = new TreeMap<>();
        Map<String, ItemStack> start = new LinkedHashMap<>();
        for (String mod : List.of("set_name", "set_lore", "set_damage", "set_enchantments", "set_count", "smelt", "rarity", "list",
                "conditional", "ref")) {
            R.section("mod." + mod, () -> {
                ItemStack s = new ItemStack(mod.equals("smelt") ? Items.RAW_IRON : mod.equals("list") || mod.equals("conditional")
                        || mod.equals("ref") ? Items.DIAMOND : Items.DIAMOND_SWORD);
                chest.clearContent();
                chest.setItem(0, s);
                B600Help.run(server, console, "item modify block " + chestPos.getX() + " " + chestPos.getY() + " " + chestPos.getZ()
                        + " container.0 " + NS + ":" + mod);
                ItemStack after = chest.getItem(0);
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("before", encode(server, s));
                r.put("after", encode(server, after));
                r.put("tooltip", tooltip(level, player, after));
                m.put(mod, r);
            });
        }
        R.put("mod", m);
        // Tooltips of enchanted items and enchantment names.
        R.section("ench.names", () -> {
            Map<String, Object> n = new TreeMap<>();
            for (String e : List.of(NS + ":spike", NS + ":spike_curse", NS + ":spike_ten", "minecraft:sharpness", "minecraft:mending",
                    "minecraft:binding_curse")) {
                Holder<Enchantment> h = B600Help.enchantment(server, e);
                List<Object> levels = new ArrayList<>();
                for (int l = 1; l <= 12; l++) {
                    levels.add(B600Help.describe(Enchantment.getFullname(h, l)));
                }
                n.put(e, levels);
                Map<String, Object> costs = new TreeMap<>();
                for (int l = 1; l <= h.value().getMaxLevel(); l++) {
                    costs.put(String.format("%02d", l), h.value().getMinCost(l) + ".." + h.value().getMaxCost(l));
                }
                n.put(e + ".costs", costs);
                n.put(e + ".weight", h.value().getWeight());
            }
            ItemStack book = new ItemStack(Items.ENCHANTED_BOOK);
            ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
            sword.enchant(B600Help.enchantment(server, NS + ":spike"), 3);
            sword.enchant(B600Help.enchantment(server, "minecraft:sharpness"), 2);
            sword.enchant(B600Help.enchantment(server, NS + ":spike_curse"), 1);
            n.put("tooltip.sword", tooltip(level, player, sword));
            n.put("tooltip.book", tooltip(level, player, book));
            R.put("ench.names", n);
        });
        helper.succeed();
    }

    @GameTest(maxTicks = 1200)
    public void enchanting(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        RandomSource random = RandomSource.create(600L);
        Holder<Enchantment> spike = B600Help.enchantment(server, NS + ":spike");
        Map<String, Object> m = new TreeMap<>();
        R.section("enchanting", () -> {
            ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
            for (int level = 1; level <= 40; level++) {
                Map<String, Integer> hist = new TreeMap<>();
                for (int i = 0; i < 10_000; i++) {
                    List<EnchantmentInstance> got = EnchantmentHelper.selectEnchantment(random, sword, level, Stream.of(spike));
                    String k = got.isEmpty() ? "none" : got.stream().map(x -> String.valueOf(x.level())).reduce((a, b) -> a + "+" + b).orElse("");
                    hist.merge(k, 1, Integer::sum);
                }
                m.put(String.format("select.L%02d", level), hist);
            }
            for (int shelves : new int[] {0, 4, 8, 15, 30}) {
                for (int slot = 0; slot < 3; slot++) {
                    Map<Integer, Integer> hist = new TreeMap<>();
                    for (int i = 0; i < 10_000; i++) {
                        hist.merge(EnchantmentHelper.getEnchantmentCost(random, slot, shelves, sword), 1, Integer::sum);
                    }
                    m.put("cost.shelves" + shelves + ".slot" + slot, hist);
                }
            }
            // Which levels the table could offer at a cost, without randomness.
            for (int level : new int[] {1, 5, 10, 13, 21, 29, 30, 37, 45, 53, 61}) {
                m.put(String.format("available.L%02d", level), EnchantmentHelper.getAvailableEnchantmentResults(level, sword, Stream.of(spike))
                        .stream().map(x -> x.level()).toList());
            }
        });
        R.put("enchanting", m);
        helper.succeed();
    }

    @GameTest(maxTicks = 200)
    public void tagsAndRegistries(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        Map<String, Object> m = new TreeMap<>();
        R.section("tags", () -> {
            var items = server.registryAccess().lookupOrThrow(Registries.ITEM);
            for (String t : List.of("three", "plain", "nested", "with_optional", "with_missing", "names_missing", "missing_tag", "cycle_a",
                    "cycle_b", "dupes", "spiky")) {
                var set = items.get(TagKey.create(Registries.ITEM, B600Help.id(t)));
                m.put("item." + NS + ":" + t, set.map(s -> s.stream().map(h -> h.unwrapKey().map(k -> k.identifier().toString()).orElse("?"))
                        .toList()).map(Object.class::cast).orElse("absent"));
            }
            var logs = items.get(TagKey.create(Registries.ITEM, Identifier.withDefaultNamespace("logs"))).orElseThrow();
            m.put("item.minecraft:logs.size", logs.size());
            m.put("item.minecraft:logs.hasStone", logs.stream().anyMatch(h -> h.is(Identifier.withDefaultNamespace("stone"))));
            m.put("item.minecraft:logs.hasOakLog", logs.stream().anyMatch(h -> h.is(Identifier.withDefaultNamespace("oak_log"))));
            m.put("item.minecraft:wool", items.get(TagKey.create(Registries.ITEM, Identifier.withDefaultNamespace("wool")))
                    .map(s -> s.stream().map(h -> h.unwrapKey().orElseThrow().identifier().toString()).toList()).orElse(List.of()));
            var curse = server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT)
                    .get(TagKey.create(Registries.ENCHANTMENT, Identifier.withDefaultNamespace("curse"))).orElseThrow();
            m.put("enchantment.minecraft:curse", curse.stream().map(h -> h.unwrapKey().orElseThrow().identifier().toString()).toList());
        });
        R.put("tags", m);
        Map<String, Object> r = new TreeMap<>();
        R.section("registries", () -> {
            r.put("trial_spawner", server.registryAccess().lookupOrThrow(Registries.TRIAL_SPAWNER_CONFIG).listElementIds()
                    .map(k -> k.identifier().toString()).filter(s -> s.startsWith(NS)).toList());
            r.put("block_transformer", server.registryAccess().lookupOrThrow(Registries.BLOCK_TRANSFORMER).listElementIds()
                    .map(k -> k.identifier().toString()).toList());
            r.put("dialog", server.registryAccess().lookupOrThrow(Registries.DIALOG).listElementIds()
                    .map(k -> k.identifier().toString()).filter(s -> s.startsWith(NS)).toList());
            r.put("chat_type", server.registryAccess().lookupOrThrow(Registries.CHAT_TYPE).listElementIds()
                    .map(k -> k.identifier().toString()).filter(s -> s.startsWith(NS)).toList());
            r.put("damage_type", server.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).listElementIds()
                    .map(k -> k.identifier().toString()).filter(s -> s.startsWith(NS)).toList());
            r.put("enchantment", server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT).listElementIds()
                    .map(k -> k.identifier().toString()).filter(s -> s.startsWith(NS)).toList());
            r.put("loot_tables", server.reloadableRegistries().lookup().lookupOrThrow(Registries.LOOT_TABLE).listElementIds().map(k -> k.identifier().toString())
                    .filter(s -> s.startsWith(NS)).sorted().toList());
            r.put("predicates", server.reloadableRegistries().lookup().lookupOrThrow(Registries.PREDICATE).listElementIds().map(k -> k.identifier().toString())
                    .filter(s -> s.startsWith(NS)).sorted().toList());
            r.put("item_modifiers", server.reloadableRegistries().lookup().lookupOrThrow(Registries.ITEM_MODIFIER).listElementIds().map(k -> k.identifier().toString())
                    .filter(s -> s.startsWith(NS)).sorted().toList());
            List<String> fns = new ArrayList<>();
            server.getFunctions().getFunctionNames().forEach(f -> { if (f.getNamespace().equals(NS)) fns.add(f.toString()); });
            r.put("functions", fns);
        });
        R.put("registries", r);
        helper.succeed();
    }

    @GameTest(maxTicks = 200)
    public void advancements(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        R.section("adv", () -> {
            var tree = server.getAdvancements().tree();
            Map<String, Object> before = new TreeMap<>();
            for (AdvancementNode n : tree.nodes()) {
                before.put(n.holder().id().toString(), n.x() + "," + n.y());
            }
            List<String> roots = new ArrayList<>();
            tree.roots().forEach(r -> roots.add(r.holder().id().toString()));
            tree.repositionNodes();
            Map<String, Object> ours = new TreeMap<>();
            Map<String, Object> vanilla = new TreeMap<>();
            for (AdvancementNode n : tree.nodes()) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("parent", n.parent() == null ? null : n.parent().holder().id().toString());
                e.put("root", n.root().holder().id().toString());
                e.put("x", n.x());
                e.put("y", n.y());
                e.put("before", before.get(n.holder().id().toString()));
                n.advancement().display().ifPresentOrElse(d -> {
                    e.put("frame", d.type().getSerializedName());
                    e.put("hidden", d.hidden());
                }, () -> e.put("display", false));
                e.put("children", n.children().iterator().hasNext());
                (n.holder().id().getNamespace().equals(NS) ? ours : vanilla).put(n.holder().id().toString(), e);
            }
            R.put("adv.roots", roots);
            R.put("adv.ours", ours);
            R.put("adv.vanilla", vanilla);
        });
        helper.succeed();
    }

    @GameTest(maxTicks = 200)
    public void lines(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        Map<String, Object> m = new TreeMap<>();
        R.section("death", () -> {
            ServerPlayer victim = helper.makeMockServerPlayerInLevel();
            ServerPlayer killer = helper.makeMockServerPlayerInLevel();
            ItemStack named = new ItemStack(Items.DIAMOND_SWORD);
            named.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, Component.literal("Spiky"));
            killer.setItemSlot(EquipmentSlot.MAINHAND, named);
            Zombie zombie = net.minecraft.world.entity.EntityTypes.ZOMBIE.create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND);
            for (String t : List.of(NS + ":zap", NS + ":zap_fall", NS + ":zap_design", "minecraft:arrow", "minecraft:fall",
                    "minecraft:player_attack", "minecraft:bad_respawn_point")) {
                Holder<DamageType> h = server.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE)
                        .getOrThrow(ResourceKey.create(Registries.DAMAGE_TYPE, Identifier.parse(t)));
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("none", B600Help.describe(new DamageSource(h).getLocalizedDeathMessage(victim)));
                e.put("mob", B600Help.describe(new DamageSource(h, zombie).getLocalizedDeathMessage(victim)));
                e.put("playerWithNamedItem", B600Help.describe(new DamageSource(h, killer).getLocalizedDeathMessage(victim)));
                ServerPlayer v2 = helper.makeMockServerPlayerInLevel();
                v2.getCombatTracker().recordDamage(new DamageSource(h), 2f);
                e.put("tracker.none", B600Help.describe(v2.getCombatTracker().getDeathMessage()));
                ServerPlayer v3 = helper.makeMockServerPlayerInLevel();
                v3.getCombatTracker().recordDamage(new DamageSource(h, killer), 2f);
                e.put("tracker.player", B600Help.describe(v3.getCombatTracker().getDeathMessage()));
                m.put(t, e);
            }
        });
        R.put("death", m);
        Map<String, Object> c = new TreeMap<>();
        R.section("chat", () -> {
            for (String t : List.of(NS + ":shout", "minecraft:chat", "minecraft:msg_command_incoming", "minecraft:emote_command")) {
                ResourceKey<ChatType> key = ResourceKey.create(Registries.CHAT_TYPE, Identifier.parse(t));
                ChatType.Bound b = ChatType.bind(key, server.registryAccess(), Component.literal("Ann")).withTargetName(Component.literal("Bob"));
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("chat", B600Help.describe(b.decorate(Component.literal("Hello"))));
                e.put("narration", B600Help.describe(b.decorateNarration(Component.literal("Hello"))));
                c.put(t, e);
            }
        });
        R.put("chat", c);
        helper.succeed();
    }
}
