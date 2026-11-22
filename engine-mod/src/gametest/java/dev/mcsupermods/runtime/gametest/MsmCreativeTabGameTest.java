package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmCreativeTabs;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;

/**
 * GameTests for project creative tabs (ADR 0096 D2; B454). Definitions in {@code msm/msm_test/creative_tab/}:
 * {@code tab_listed} ({@code as_listed}, icon {@code msm_test:tab_zebra}; members the block {@code tab_block}'s item, the
 * items {@code tab_apple} "Apple" and {@code tab_zebra} "Zebra", and the spawn egg of {@code monster_spawn}),
 * {@code tab_named} ({@code by_name}, a set title; items {@code tab_n1} "Cherry", {@code tab_n2} "Apricot", {@code tab_n3}
 * "Banana"), {@code tab_bad_icon} (an icon that is no item) and {@code tab_broken} (an empty {@code items} list: refused; B527 made {@code items} a field). The
 * item names are {@code minecraft:custom_name} components, so sorting needs no language on the server. Contents are built on
 * the server with {@code CreativeModeTab.buildContents}, which runs Fabric's output events as the client does.
 */
public class MsmCreativeTabGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static CreativeModeTab tab(GameTestHelper helper, String path) {
        CreativeModeTab tab = BuiltInRegistries.CREATIVE_MODE_TAB.getValue(id(path));
        helper.assertTrue(tab != null, "tab " + path + " not registered");
        return tab;
    }

    private static List<Identifier> contents(GameTestHelper helper, CreativeModeTab tab) {
        MinecraftServer server = helper.getLevel().getServer();
        tab.buildContents(new CreativeModeTab.ItemDisplayParameters(server.getWorldData().enabledFeatures(), true, server.registryAccess()));
        return tab.getDisplayItems().stream().map(ItemStack::getItem).map(BuiltInRegistries.ITEM::getKey).toList();
    }

    private static String titleKey(CreativeModeTab tab) {
        return tab.getDisplayName().getContents() instanceof TranslatableContents t ? t.getKey() : "<literal>";
    }

    @GameTest
    public void tabsRegisterWithTheirTitles(GameTestHelper helper) {
        helper.assertValueEqual(titleKey(tab(helper, "tab_listed")), "itemGroup.msm_test.tab_listed", "default title key");
        helper.assertValueEqual(titleKey(tab(helper, "tab_named")), "itemGroup.msm_test.custom_named", "title");
        helper.assertValueEqual(MsmRuntime.report().creativeTabs(), List.of(id("tab_bad_icon"), id("tab_hand"), id("tab_listed"), id("tab_named")),
                "registered tabs (logged as 'registered 4 creative tab(s)')");
        helper.assertFalse(BuiltInRegistries.CREATIVE_MODE_TAB.containsKey(id("tab_broken")), "a refused tab");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("creative_tab/tab_broken.json") && e.contains("items")
                && e.contains("msm_runtime_gametest")), "no error for tab_broken: " + errors);
        helper.assertTrue(MsmCreativeTabs.resolve(id("tab_listed")).isPresent(), "a project tab resolves");
        helper.assertTrue(MsmCreativeTabs.resolve(Identifier.withDefaultNamespace("combat")).isEmpty(), "a vanilla tab is used as written");
        helper.succeed();
    }

    /** {@code as_listed}: block items, then items, then spawn eggs, each in scan (file path) order. */
    @GameTest
    public void asListedKeepsTheRegistrationOrder(GameTestHelper helper) {
        helper.assertValueEqual(contents(helper, tab(helper, "tab_listed")),
                List.of(id("tab_block"), id("tab_apple"), id("tab_zebra"), id("monster_spawn_spawn_egg")), "tab_listed contents");
        helper.succeed();
    }

    @GameTest
    public void byNameSortsByDisplayName(GameTestHelper helper) {
        helper.assertValueEqual(contents(helper, tab(helper, "tab_named")), List.of(id("tab_n2"), id("tab_n3"), id("tab_n1")),
                "Apricot, Banana, Cherry: " + tab(helper, "tab_named").getDisplayItems().stream().map(st -> st.getHoverName().getString()).toList());
        helper.succeed();
    }

    @GameTest
    public void iconsAreLookedUpAndAnUnknownOneWarns(GameTestHelper helper) {
        helper.assertValueEqual(BuiltInRegistries.ITEM.getKey(tab(helper, "tab_listed").getIconItem().getItem()), id("tab_zebra"),
                "a project item registered after the tab");
        helper.assertTrue(tab(helper, "tab_bad_icon").getIconItem().isEmpty(), "an unknown icon shows nothing");
        helper.assertTrue(MsmCreativeTabs.lastWarnings().stream().anyMatch(w -> w.contains("msm_test:tab_bad_icon") && w.contains("msm_test:no_such_icon")),
                "no warning for the icon: " + MsmCreativeTabs.lastWarnings());
        helper.succeed();
    }

    /** An id in a project's namespace that no tab has still warns after start-up, as before ADR 0096. */
    @GameTest
    public void anUnknownTabStillWarns(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("gadget.json") && w.contains("unknown creative_tab msm_test:no_such_tab")),
                "no warning for the unknown tab: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("unknown creative_tab msm_test:tab_")), "a project tab is known: " + warnings);
        helper.succeed();
    }
}
