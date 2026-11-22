package dev.mcsupermods.runtime.gametest.spike3;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.item.HoneycombItem;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FireBlock;
import net.minecraft.world.level.block.WeatheringCopper;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.sounds.BlockSoundSets;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.BlockSetType;

/** B503 spike (throwaway) version seam, 26.4: {@code block_sound_set} keys, unnamed {@code BlockSetType}, no content registries. */
public final class B503Version {
    private B503Version() {}

    public static String route() {
        return "26.4: block_sound_set data keys, BlockSetType(bool, bool, bool, sensitivity, key, 8 events), FireBlock.setFlammable by reflection";
    }

    static ResourceKey<BlockSoundSet> set(String path) {
        return ResourceKey.create(Registries.BLOCK_SOUND_SET, Identifier.fromNamespaceAndPath(B503Mod.NS, path));
    }

    public static BlockBehaviour.Properties ownSounds(BlockBehaviour.Properties p, SoundEvent[] five, String setName) {
        return p.sound(set(setName));
    }

    public static BlockBehaviour.Properties missingSounds(BlockBehaviour.Properties p) {
        return p.sound(set("missing"));
    }

    public static BlockSetType setType(String name, boolean byHand, SoundEvent[] eight, String setName) {
        return new BlockSetType(byHand, true, true, BlockSetType.PressurePlateSensitivity.EVERYTHING,
                setName == null ? BlockSoundSets.WOOD : set(setName),
                eight[0], eight[1], eight[2], eight[3], eight[4], eight[5], eight[6], eight[7]);
    }

    public static Map<String, Object> setTypeFacts(BlockSetType own) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("record", own.toString());
        m.put("note", "26.4 BlockSetType has no name, no TYPES map and no CODEC (javap)");
        return m;
    }

    private static String id(Optional<Holder<SoundEvent>> h) {
        return h.map(x -> x.unwrapKey().map(k -> k.identifier().toString()).orElse("direct " + x.value().location())).orElse("none");
    }

    public static Map<String, Object> soundsOf(net.minecraft.world.level.Level level, BlockPos pos, Block block) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", String.valueOf(block.defaultBlockState().getSounds()));
        try {
            m.put("holder", String.valueOf(block.defaultBlockState().getSoundsAsHolder(level).map(h -> h.unwrapKey().orElse(null))));
            BlockSoundSet s = block.defaultBlockState().getSounds(level);
            m.put("isEmpty", s == BlockSoundSet.EMPTY);
            m.put("break", id(s.breakSound()));
            m.put("step", id(s.stepSound()));
            m.put("place", id(s.placeSound()));
            m.put("hit", id(s.hitSound()));
            m.put("fall", id(s.fallSound()));
            m.put("volume", s.volume());
            m.put("pitch", s.pitch());
        } catch (Throwable t) {
            m.put("error", t.toString());
        }
        return m;
    }

    private static boolean in(List<RegistryDataLoader.RegistryData<?>> list) {
        return list.stream().anyMatch(d -> d.key().equals(Registries.BLOCK_SOUND_SET));
    }

    public static Map<String, Object> soundRegistryFacts(ServerLevel level) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("inWorldRegistries", in(RegistryDataLoader.WORLD_REGISTRIES));
        m.put("inDimensionRegistries", in(RegistryDataLoader.DIMENSION_REGISTRIES));
        m.put("inReloadableRegistries", in(RegistryDataLoader.RELOADABLE_REGISTRIES));
        m.put("inSynchronizedRegistries", in(RegistryDataLoader.SYNCHRONIZED_REGISTRIES));
        var reg = level.registryAccess().lookupOrThrow(Registries.BLOCK_SOUND_SET);
        m.put("entries", reg.listElementIds().count());
        m.put("ownPresent", reg.get(set("own")).isPresent());
        m.put("missingPresent", reg.get(set("missing")).isPresent());
        m.put("ownNamespaceKeys", reg.listElementIds().filter(k -> k.identifier().getNamespace().equals(B503Mod.NS)).map(k -> k.identifier().toString()).toList());
        return m;
    }

    public static String flammable(Block block, int burn, int spread) {
        try {
            Method m = FireBlock.class.getDeclaredMethod("setFlammable", Block.class, int.class, int.class);
            m.setAccessible(true);
            m.invoke(Blocks.FIRE, block, burn, spread);
            return "FireBlock.setFlammable by reflection";
        } catch (Throwable t) {
            return "failed: " + t;
        }
    }

    public static String oxidise(Block from, Block to) {
        try {
            var map = WeatheringCopper.NEXT_BY_BLOCK.get();
            String cls = map.getClass().getName();
            map.put(from, to);
            return "NEXT_BY_BLOCK (" + cls + ") put ok";
        } catch (Throwable t) {
            return "NEXT_BY_BLOCK put failed: " + t;
        }
    }

    public static String waxable(Block from, Block to) {
        try {
            var map = HoneycombItem.WAXABLES.get();
            String cls = map.getClass().getName();
            map.put(from, to);
            return "WAXABLES (" + cls + ") put ok";
        } catch (Throwable t) {
            return "WAXABLES put failed: " + t;
        }
    }
}
