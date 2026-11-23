package dev.mcsupermods.parity;

import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;

/**
 * Version seam for {@link StructuresParityTest} (ADR 0038 D2): one structure start made the way a chunk's structure
 * step makes it, for a world seed and a chunk of the caller's choosing, over the level's own generator, random state
 * and template manager. Every biome is accepted (the fixture's structures name an empty biome tag so that they never
 * start in a world by themselves). Only vanilla's own methods are called. 26.3: `Structure.generate` takes the start's reference count (0, as a fresh start has) before the height accessor.
 */
final class StructureStarts {
    private StructureStarts() {}

    /** The start, or {@code null} when the structure made none at this chunk. */
    static StructureStart generate(Holder<Structure> structure, ServerLevel level, long seed, ChunkPos chunk) {
        ChunkGenerator generator = level.getChunkSource().getGenerator();
        RandomState random = level.getChunkSource().randomState();
        StructureStart start = structure.value().generate(structure, level.dimension(), level.registryAccess(),
                generator, generator.getBiomeSource(), random.createClimateSampler(SamplerContext.EMPTY_UNCACHED), random,
                level.getStructureTemplateManager(),
                seed, chunk, 0, level, biome -> true);
        return start == null || start.getPieces().isEmpty() ? null : start;
    }
}
