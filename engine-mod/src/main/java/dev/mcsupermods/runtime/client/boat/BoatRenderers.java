package dev.mcsupermods.runtime.client.boat;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.EntityRendererRegistration;
import dev.mcsupermods.runtime.registry.boat.MsmBoats;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import net.fabricmc.fabric.api.client.rendering.v1.ModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.object.boat.BoatModel;
import net.minecraft.client.model.object.boat.RaftModel;
import net.minecraft.client.renderer.entity.BoatRenderer;
import net.minecraft.client.renderer.entity.RaftRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;

/**
 * Vanilla's boat renderer for each project boat type, with a model layer and texture of the project's own (ADR 0110 D2
 * and its amendment after B524). Client only.
 *
 * <p>Each boat gets the model layer {@code <wood ns>:boat/<wood path>#main} (a chest boat {@code chest_boat/<wood path>})
 * registered through Fabric's {@code ModelLayerRegistry} with vanilla's boat or raft layer definition, and vanilla's
 * {@link BoatRenderer} (a raft {@link RaftRenderer}) over it. Vanilla's renderer reads the picture named after the layer:
 * {@code <wood ns>:textures/entity/boat/<wood path>.png} (128 x 64) and {@code .../entity/chest_boat/<wood path>.png}
 * (128 x 128), the paths the plugin's {@code boatTextureId} names. A layer vanilla already knows (a {@code wood_texture}
 * naming a vanilla wood, such as {@code minecraft:oak}) is used as it is and not registered again; two project boats of
 * one wood share one layer.
 */
public final class BoatRenderers {
    private BoatRenderers() {}

    /** The layers registered or reused, with whether each is a raft's. */
    private static final Map<ModelLayerLocation, Boolean> LAYERS = new HashMap<>();

    /** Registers the model layers and renderers of every project boat registered by {@link MsmBoats}. */
    public static void init() {
        Set<ModelLayerLocation> vanilla = ModelLayers.getKnownLocations().collect(Collectors.toSet());
        for (MsmBoats.Registered boat : MsmBoats.boats()) {
            renderer(boat.boat(), layer(vanilla, boat.wood(), false, boat.raft()), boat.raft());
            boat.chest().ifPresent(chest -> renderer(chest, layer(vanilla, boat.wood(), true, boat.raft()), boat.raft()));
        }
        if (!MsmBoats.boats().isEmpty()) {
            MsmRuntime.LOGGER.info("[{}] boat renderers for {} boat type(s) over {} model layer(s)", MsmRuntime.MOD_ID,
                    MsmBoats.boats().stream().mapToInt(b -> b.chest().isPresent() ? 2 : 1).sum(), LAYERS.size());
        }
    }

    /** The model layer of a boat ({@code chest} false) or chest boat of {@code wood}. */
    public static ModelLayerLocation layerOf(Identifier wood, boolean chest) {
        return new ModelLayerLocation(Identifier.fromNamespaceAndPath(wood.getNamespace(), (chest ? "chest_boat/" : "boat/") + wood.getPath()), "main");
    }

    /** Whether vanilla's layer {@code layer} holds a raft's model: vanilla's only rafts are bamboo's. */
    private static boolean vanillaRaft(ModelLayerLocation layer) {
        return layer.model().getPath().endsWith("/bamboo");
    }

    private static ModelLayerLocation layer(Set<ModelLayerLocation> vanilla, Identifier wood, boolean chest, boolean raft) {
        ModelLayerLocation layer = layerOf(wood, chest);
        Boolean known = LAYERS.get(layer);
        if (known == null && vanilla.contains(layer)) {
            known = vanillaRaft(layer);
            LAYERS.put(layer, known);
        }
        if (known == null) {
            ModelLayerRegistry.registerModelLayer(layer, raft
                    ? (chest ? RaftModel::createChestRaftModel : RaftModel::createRaftModel)
                    : (chest ? BoatModel::createChestBoatModel : BoatModel::createBoatModel));
            LAYERS.put(layer, raft);
        } else if (known != raft) {
            MsmRuntime.LOGGER.warn("[{}] model layer {} holds a {} model but a {} uses it; it is drawn with that model", MsmRuntime.MOD_ID,
                    layer, known ? "raft" : "boat", raft ? "raft" : "boat");
        }
        return layer;
    }

    /** Vanilla's renderer for the layer's model: a raft's renderer for a raft layer, else the boat renderer. */
    private static void renderer(EntityType<? extends AbstractBoat> type, ModelLayerLocation layer, boolean raft) {
        boolean raftModel = LAYERS.getOrDefault(layer, raft);
        if (raftModel) {
            EntityRendererRegistration.<AbstractBoat>register(type, context -> new RaftRenderer(context, layer));
        } else {
            EntityRendererRegistration.<AbstractBoat>register(type, context -> new BoatRenderer(context, layer));
        }
    }
}
