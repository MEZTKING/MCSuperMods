package dev.mcsupermods.runtime.registry;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectionContext;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.biome.Biome;

/**
 * The biome selector shared by natural spawns of project mobs (ADR 0028 D5) and biome additions (ADR 0060 D2):
 * {@code #ns:tag} entries are biome tags, other entries biome ids, and the selector is their union. Biomes and tags exist
 * only once a server runs, so {@link #known} is a late check.
 */
public final class BiomeSelection {
    private BiomeSelection() {}

    /** The union of the entries; entries are already checked to be valid ids or {@code #}-prefixed tag ids. */
    public static Predicate<BiomeSelectionContext> of(List<String> entries) {
        Predicate<BiomeSelectionContext> selector = ctx -> false;
        List<ResourceKey<Biome>> keys = new ArrayList<>();
        for (String entry : entries) {
            if (entry.startsWith("#")) {
                selector = selector.or(BiomeSelectors.tag(TagKey.create(Registries.BIOME, Identifier.parse(entry.substring(1)))));
            } else {
                keys.add(ResourceKey.create(Registries.BIOME, Identifier.parse(entry)));
            }
        }
        if (!keys.isEmpty()) {
            selector = selector.or(BiomeSelectors.includeByKey(keys));
        }
        return selector;
    }

    /** Whether a biome id or {@code #}-prefixed biome tag exists on the running server. */
    public static boolean known(MinecraftServer server, String entry) {
        HolderLookup.RegistryLookup<Biome> biomes = server.registryAccess().lookupOrThrow(Registries.BIOME);
        return entry.startsWith("#")
                ? biomes.get(TagKey.create(Registries.BIOME, Identifier.parse(entry.substring(1)))).isPresent()
                : biomes.get(ResourceKey.create(Registries.BIOME, Identifier.parse(entry))).isPresent();
    }
}
