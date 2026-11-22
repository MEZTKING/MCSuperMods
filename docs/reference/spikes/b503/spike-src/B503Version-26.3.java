package dev.mcsupermods.runtime.gametest.spike3;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.fabricmc.fabric.api.registry.OxidizableBlocksRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.BlockSetType;

/** B503 spike (throwaway) version seam, 26.3: {@code SoundType}, named {@code BlockSetType}, Fabric content registries. */
public final class B503Version {
    private B503Version() {}

    public static String route() {
        return "26.3: SoundType object, BlockSetType(name, ...), Fabric FlammableBlockRegistry and OxidizableBlocksRegistry";
    }

    /** Properties with the five own sound events (break, step, place, hit, fall). */
    public static BlockBehaviour.Properties ownSounds(BlockBehaviour.Properties p, SoundEvent[] five, String setName) {
        return p.sound(new SoundType(1.0f, 1.0f, five[0], five[1], five[2], five[3], five[4]));
    }

    /** A block naming a sound set that does not exist (26.4 only; on 26.3 the plain stone sound). */
    public static BlockBehaviour.Properties missingSounds(BlockBehaviour.Properties p) {
        return p.sound(SoundType.STONE);
    }

    /** An own set type with the eight given events in the record's order. */
    public static BlockSetType setType(String name, boolean byHand, SoundEvent[] eight, String setName) {
        return new BlockSetType(name, byHand, true, true, BlockSetType.PressurePlateSensitivity.EVERYTHING, SoundType.WOOD,
                eight[0], eight[1], eight[2], eight[3], eight[4], eight[5], eight[6], eight[7]);
    }

    /** What the set type codec does with an unregistered and then a registered own set type. */
    public static Map<String, Object> setTypeFacts(BlockSetType own) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", own.name());
        m.put("inValuesBefore", BlockSetType.values().anyMatch(t -> t == own));
        m.put("encodeBefore", String.valueOf(BlockSetType.CODEC.encodeStart(com.mojang.serialization.JsonOps.INSTANCE, own)));
        try {
            Method register = BlockSetType.class.getDeclaredMethod("register", BlockSetType.class);
            register.setAccessible(true);
            register.invoke(null, own);
            m.put("registerByReflection", "ok");
        } catch (Throwable t) {
            m.put("registerByReflection", t.toString());
        }
        m.put("inValuesAfter", BlockSetType.values().anyMatch(t -> t == own));
        m.put("encodeAfter", String.valueOf(BlockSetType.CODEC.encodeStart(com.mojang.serialization.JsonOps.INSTANCE, own)));
        return m;
    }

    /** The sounds a block's state resolves to in a level, as ids. */
    public static Map<String, Object> soundsOf(net.minecraft.world.level.Level level, BlockPos pos, Block block) {
        Map<String, Object> m = new LinkedHashMap<>();
        SoundType t = block.defaultBlockState().getSoundType();
        m.put("break", BuiltInRegistries.SOUND_EVENT.getKey(t.getBreakSound()) + "");
        m.put("step", BuiltInRegistries.SOUND_EVENT.getKey(t.getStepSound()) + "");
        m.put("place", BuiltInRegistries.SOUND_EVENT.getKey(t.getPlaceSound()) + "");
        m.put("hit", BuiltInRegistries.SOUND_EVENT.getKey(t.getHitSound()) + "");
        m.put("fall", BuiltInRegistries.SOUND_EVENT.getKey(t.getFallSound()) + "");
        return m;
    }

    public static Map<String, Object> soundRegistryFacts(ServerLevel level) {
        return Map.of("model", "SoundType objects (no block_sound_set registry on 26.3)");
    }

    /** Fabric's flammable registry on a vanilla block. */
    public static String flammable(Block block, int burn, int spread) {
        FlammableBlockRegistry.getDefaultInstance().add(block, burn, spread);
        return "FlammableBlockRegistry.add";
    }

    /** Fabric's oxidizable registry: a next stage and a waxed copy for vanilla blocks. */
    public static String oxidise(Block from, Block to) {
        OxidizableBlocksRegistry.registerNextStage(from, to);
        return "OxidizableBlocksRegistry.registerNextStage";
    }

    public static String waxable(Block from, Block to) {
        OxidizableBlocksRegistry.registerWaxable(from, to);
        return "OxidizableBlocksRegistry.registerWaxable";
    }
}
