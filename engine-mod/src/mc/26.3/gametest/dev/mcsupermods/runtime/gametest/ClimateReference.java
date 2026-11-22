package dev.mcsupermods.runtime.gametest;

import net.minecraft.core.HolderGetter;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;
import net.minecraft.world.level.levelgen.synth.NormalNoise;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2): vanilla's climate sampler for a noise
 * settings entry and a seed, so {@code MsmDevBiomeListsGameTest} can write the biome cells the game
 * itself picks (B592's end-to-end check of the live preview). 26.3: {@code RandomState.create(noises, seed, settings)}.
 */
final class ClimateReference {
    private ClimateReference() {}

    static Climate.Sampler sampler(HolderGetter<NormalNoise> noises, long seed, NoiseGeneratorSettings settings) {
        return RandomState.create(noises, seed, settings).createClimateSampler(SamplerContext.EMPTY_UNCACHED);
    }
}
