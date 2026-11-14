package dev.mcsupermods.runtime.client;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.vanilla.MsmVanillaRenderer;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import dev.mcsupermods.runtime.registry.types.BlockTypes;
import java.util.List;
import java.util.Map;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.BlockColorRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.color.block.BlockTintSource;
import net.minecraft.client.color.block.BlockTintSources;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;

/**
 * Client entrypoint: renderers for runtime entities and block tints. The thrown item ({@code msm_runtime:thrown_item},
 * ADR 0056 D4) always gets vanilla's {@link ThrownItemRenderer}, which draws its item as a camera-facing sprite;
 * definition entities of geo bodies get a GeckoLib renderer (only when GeckoLib is loaded, {@link GeckolibRenderers}), every
 * other definition entity (plain bodies: {@code renderer: vanilla}, or {@code auto} without GeckoLib) the vanilla
 * renderer {@link MsmVanillaRenderer} (ADR 0072 D1, D4). Tinted leaves
 * (ADR 0068 D6) register their tint with Fabric's {@link BlockColorRegistry}: vanilla's foliage, grass or dry foliage
 * colour of the biome, or a constant colour. This is the runtime's first client block hook; it is an in-game check (CI
 * runs no client).
 */
public final class MsmRuntimeClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        EntityRendererRegistration.register(MsmThrownItem.type(), ThrownItemRenderer<MsmThrownItem>::new);
        if (FabricLoader.getInstance().isModLoaded(MsmEntityRegistrar.GECKOLIB)) {
            GeckolibRenderers.registerAll();
        }
        registerVanillaRenderers();
        BlockTypes.tintedLeaves().forEach((block, tint) -> BlockColorRegistry.register(List.of(tintSource(tint)), block));
    }

    /** Registers the vanilla renderer for every definition entity type that is not a geo body (ADR 0072 D4). */
    private static void registerVanillaRenderers() {
        List<EntityType<? extends Mob>> geo = MsmEntityRegistrar.geoTypes();
        int count = 0;
        for (Map.Entry<Identifier, EntityType<? extends Mob>> entry : MsmEntityRegistrar.types().entrySet()) {
            EntityType<? extends Mob> type = entry.getValue();
            if (geo.contains(type)) {
                continue;
            }
            var definition = MsmEntityRegistrar.definition(type);
            if (definition.isEmpty()) {
                continue;
            }
            EntityRendererRegistration.register(type, MsmVanillaRenderer.provider(entry.getKey(), definition.get()));
            count++;
        }
        MsmRuntime.LOGGER.info("[{}] registered {} vanilla entity renderer(s)", MsmRuntime.MOD_ID, count);
    }

    /** The vanilla tint source of a leaf tint; a constant colour gets full alpha, as vanilla's spruce and birch leaves. */
    static BlockTintSource tintSource(BlockType.Tint tint) {
        return switch (tint) {
            case BlockType.SourceTint s -> switch (s.source()) {
                case FOLIAGE -> BlockTintSources.foliage();
                case GRASS -> BlockTintSources.grass();
                case DRY_FOLIAGE -> BlockTintSources.dryFoliage();
            };
            case BlockType.ColourTint c -> BlockTintSources.constant(0xFF000000 | c.rgb());
        };
    }
}
