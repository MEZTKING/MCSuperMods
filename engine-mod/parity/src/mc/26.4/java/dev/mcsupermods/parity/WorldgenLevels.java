package dev.mcsupermods.parity;

import java.util.List;
import net.minecraft.core.Holder;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Util;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.ProtoChunk;
import net.minecraft.world.level.chunk.UpgradeData;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.dimension.LevelStem;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.storage.LevelStorageSource;
import net.minecraft.world.level.storage.ServerLevelData;

/**
 * Version seam for {@link WorldgenParityTest} (ADR 0038 D2): a level of one fixture dimension with a seed of its own,
 * and the biome step of a single chunk. Only vanilla's own constructors and methods are called; the level reports the
 * test's seed through {@link ServerLevel#getSeed()}, which the level's chunk source reads while the level is built.
 * 26.4: the level constructor has no debug flag and no biome zoom seed (the level takes the zoom from its seed); the
 * biome step takes the biome source's caching resolver, and a chunk's {@code getBiome} reads a quart cell.
 */
final class WorldgenLevels {
    private WorldgenLevels() {}

    /** The seed the level being built reports; read during the constructor, before any field is set. */
    private static final ThreadLocal<Long> PENDING_SEED = new ThreadLocal<>();

    static ServerLevel create(
            MinecraftServer server,
            LevelStorageSource.LevelStorageAccess storage,
            ServerLevelData levelData,
            ResourceKey<Level> key,
            LevelStem stem,
            long seed) {
        PENDING_SEED.set(seed);
        try {
            return new Seeded(server, storage, levelData, key, stem, seed);
        } finally {
            PENDING_SEED.remove();
        }
    }

    /** The biome a chunk stored for a quart cell (absolute quart coordinates). */
    static Holder<Biome> stored(ChunkAccess chunk, int qx, int qy, int qz) {
        return chunk.getBiome(qx, qy, qz);
    }

    /**
     * A fresh chunk of {@code level} at {@code (chunkX, chunkZ)} after the generator's own biome step alone, without
     * the chunks around it that the level would make first. The test checks it against the level's own chunks.
     */
    static ChunkAccess biomeChunk(ServerLevel level, int chunkX, int chunkZ) {
        ChunkGenerator generator = level.getChunkSource().getGenerator();
        RandomState random = level.getChunkSource().randomState();
        ProtoChunk chunk = new ProtoChunk(new ChunkPos(chunkX, chunkZ), UpgradeData.EMPTY, level,
                level.palettedContainerFactory(), null);
        ChunkAccess filled = generator.createBiomes(generator.getBiomeSource().createCachingResolver(random), random, chunk).join();
        chunk.setPersistedStatus(ChunkStatus.BIOMES);
        return filled;
    }

    private static final class Seeded extends ServerLevel {
        private final long seed;

        Seeded(
                MinecraftServer server,
                LevelStorageSource.LevelStorageAccess storage,
                ServerLevelData levelData,
                ResourceKey<Level> key,
                LevelStem stem,
                long seed) {
            super(server, Util.backgroundExecutor(), storage, levelData, key, stem, List.of(), false);
            this.seed = seed;
        }

        @Override
        public long getSeed() {
            Long pending = PENDING_SEED.get();
            return pending != null ? pending : seed;
        }
    }
}
