package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.CreativeTabParser;
import dev.mcsupermods.runtime.loader.CreativeTabParser.Tab;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.creativetab.v1.FabricCreativeModeTab;
import net.fabricmc.fabric.api.creativetab.v1.FabricCreativeModeTabOutput;
import net.fabricmc.fabric.api.event.Event;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;

/**
 * Project creative tabs (ADR 0096 D2): one tab per {@code creative_tab} definition, built with Fabric's
 * {@link FabricCreativeModeTab#builder()} and registered into the vanilla registry before the blocks and items, so that
 * their {@code creative_tab} fields can name it (extra tabs go to Fabric's further pages, B440 S9).
 *
 * <ul>
 *   <li>The title is {@code title}, else {@code itemGroup.<ns>.<path>}; the icon is looked up whenever the tab draws it,
 *       so it may name a project item registered after the tab, or another mod's. An icon that is no item once the
 *       server has started is a warning ({@link #lastWarnings()}) and the tab shows no picture (vanilla's air), as the
 *       eject's {@code ModCreativeTabs}.</li>
 *   <li>The tab itself lists nothing: the registrar adds each block item, item and spawn egg naming it through
 *       {@code CreativeModeTabEvents.modifyOutputEvent} as it registers them, so {@code as_listed} is the registration
 *       order (block items, then items, then spawn eggs; within each, mods by id and files by path).</li>
 *   <li>{@code by_name} sorts the tab's stacks by display name in a listener of a later phase ({@link #SORT_PHASE}), after
 *       every member was added; the sort is stable, so equal names keep the registration order.</li>
 * </ul>
 */
public final class MsmCreativeTabs {
    /** The event phase that sorts {@code by_name} tabs, after the default phase in which members are added. */
    public static final Identifier SORT_PHASE = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "sort_creative_tab");

    private static volatile Map<Identifier, Tab> tabs = Map.of();
    private static volatile List<String> lastWarnings = List.of();
    private static boolean listening;

    private MsmCreativeTabs() {}

    /**
     * Parses the scanned {@code creative_tab} definitions, registers their tabs and returns {@code report} with the tabs
     * registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize}, before the registrar.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, Tab> parsed = CreativeTabParser.parseAll(report.definitions(), errors, warnings);
        Map<Identifier, Tab> registered = new LinkedHashMap<>();
        parsed.forEach((id, def) -> {
            if (BuiltInRegistries.CREATIVE_MODE_TAB.containsKey(id)) {
                errors.add("creative tab " + id + ": the id is already a creative tab; not registered");
                return;
            }
            try {
                ResourceKey<CreativeModeTab> key = ResourceKey.create(Registries.CREATIVE_MODE_TAB, id);
                CreativeModeTab tab = FabricCreativeModeTab.builder()
                        .title(Component.translatable(def.translationKey(id)))
                        .icon(() -> icon(def.icon()))
                        .displayItems((parameters, output) -> {})
                        .build();
                Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, key, tab);
                if (def.order() == CreativeTabParser.Order.BY_NAME) {
                    Event<CreativeModeTabEvents.ModifyOutput> event = CreativeModeTabEvents.modifyOutputEvent(key);
                    event.addPhaseOrdering(Event.DEFAULT_PHASE, SORT_PHASE);
                    event.register(SORT_PHASE, MsmCreativeTabs::sortByName);
                }
                registered.put(id, def);
            } catch (RuntimeException e) {
                errors.add("creative tab " + id + ": " + e.getMessage());
            }
        });
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        tabs = Map.copyOf(registered);
        if (!registered.isEmpty() && !listening) {
            listening = true;
            ServerLifecycleEvents.SERVER_STARTED.register(server -> checkIcons());
        }
        return report.withCreativeTabs(List.copyOf(registered.keySet()), errors, warnings);
    }

    /**
     * The registered tab a {@code creative_tab} field names when it names a project tab, else empty (the id is used as
     * written, as for a vanilla or another mod's tab); called from the registrar when it adds an item to a tab.
     */
    public static Optional<Identifier> resolve(Identifier tab) {
        return tabs.containsKey(tab) ? Optional.of(tab) : Optional.empty();
    }

    /** The project tab definitions, by id in registration order. */
    public static Map<Identifier, Tab> definitions() {
        return tabs;
    }

    /** The warnings of the last start-up check (icons that are no item), also logged. */
    public static List<String> lastWarnings() {
        return lastWarnings;
    }

    private static ItemStack icon(Identifier item) {
        return BuiltInRegistries.ITEM.getOptional(item).map(ItemStack::new).orElse(ItemStack.EMPTY);
    }

    /** Stable sort by display name, as the eject's {@code members(ids, true)}. */
    static void sortByName(FabricCreativeModeTabOutput output) {
        Comparator<ItemStack> byName = Comparator.comparing(stack -> stack.getHoverName().getString());
        output.getDisplayStacks().sort(byName);
        output.getSearchTabStacks().sort(byName);
    }

    private static void checkIcons() {
        List<String> warnings = new ArrayList<>();
        tabs.forEach((id, def) -> {
            if (!BuiltInRegistries.ITEM.containsKey(def.icon())) {
                warnings.add("creative tab " + id + ": unknown icon item " + def.icon() + "; the tab shows no picture");
            }
        });
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        lastWarnings = List.copyOf(warnings);
    }
}
