package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.gametest.SpikeFluid;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.client.color.block.BlockTintSource;
import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;

/** B470 spike (throwaway) client entrypoint: one FluidModel.Unbaked per test fluid through Fabric's registry. */
public final class Spike4Client implements ClientModInitializer {
    public static final Map<String, Object> CLIENT = new TreeMap<>();

    @Override
    public void onInitializeClient() {
        for (Spike4Spec spec : Spike4Mod.SPECS) {
            String path = spec.path();
            try {
                SpikeFluid.Made made = Spike4Mod.FLUIDS.get(path);
                Material still = new Material(Spike4Mod.id("block/" + path + "_still"));
                Material flowing = new Material(Spike4Mod.id("block/" + path + "_flow"));
                Material overlay = "spike_water".equals(path) ? new Material(Spike4Mod.id("block/" + path + "_overlay")) : null;
                Integer tint = spec.tint();
                BlockTintSource tintSource = tint == null ? null : state -> tint;
                FluidModel.Unbaked model = new FluidModel.Unbaked(still, flowing, overlay, tintSource);
                if (made.still() == made.flowing()) {
                    FluidRenderingRegistry.register(made.still(), model);
                } else {
                    FluidRenderingRegistry.register(made.still(), made.flowing(), model);
                }
                CLIENT.put("render." + path, "registered " + (made.still() == made.flowing() ? "one fluid" : "two fluids"));
            } catch (Throwable t) {
                CLIENT.put("render." + path + ".error", t.toString());
                t.printStackTrace(System.out);
            }
        }
        System.out.println("[spike4] client " + CLIENT);
    }
}
