package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.client.EntityRendererRegistration;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.ModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.object.boat.BoatModel;
import net.minecraft.client.renderer.entity.AbstractBoatRenderer;
import net.minecraft.client.renderer.entity.BoatRenderer;

/**
 * B524 spike (throwaway) client entrypoint, X24: one model layer per project boat type (Fabric's
 * {@code ModelLayerRegistry} with vanilla's boat and chest boat layer definitions) and vanilla's {@link BoatRenderer}
 * registered for each type through the runtime's {@code EntityRendererRegistration} seam. Nothing of our own draws.
 */
public final class B524Client implements ClientModInitializer {
    public static final ModelLayerLocation BOAT_LAYER = new ModelLayerLocation(B524Mod.id("boat/spike"), "main");
    public static final ModelLayerLocation CHEST_BOAT_LAYER = new ModelLayerLocation(B524Mod.id("chest_boat/spike"), "main");
    public static final List<String> INIT = new CopyOnWriteArrayList<>();

    @Override
    public void onInitializeClient() {
        INIT.add("vanilla oak layers: " + ModelLayers.OAK_BOAT + " / " + ModelLayers.OAK_CHEST_BOAT);
        ModelLayerRegistry.registerModelLayer(BOAT_LAYER, BoatModel::createBoatModel);
        ModelLayerRegistry.registerModelLayer(CHEST_BOAT_LAYER, BoatModel::createChestBoatModel);
        EntityRendererRegistration.<net.minecraft.world.entity.vehicle.boat.AbstractBoat>register(B524Mod.boat, context -> note(new BoatRenderer(context, BOAT_LAYER)));
        EntityRendererRegistration.<net.minecraft.world.entity.vehicle.boat.AbstractBoat>register(B524Mod.chestBoat, context -> note(new BoatRenderer(context, CHEST_BOAT_LAYER)));
        INIT.add("boat renderers registered through EntityRendererRegistration with layers " + BOAT_LAYER + " and " + CHEST_BOAT_LAYER);
    }

    /** Records the texture vanilla's renderer chose from the layer (the protected {@code texture} field). */
    private static BoatRenderer note(BoatRenderer renderer) {
        try {
            Field f = AbstractBoatRenderer.class.getDeclaredField("texture");
            f.setAccessible(true);
            INIT.add("renderer built, texture " + f.get(renderer));
        } catch (Throwable t) {
            INIT.add("renderer built, texture unknown: " + t);
        }
        return renderer;
    }
}
