package dev.mcsupermods.runtime.client.fluid;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.color.block.BlockTintSource;
import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;
import net.minecraft.resources.Identifier;

/**
 * Client side of project fluids (ADR 0099 D2 and its amendment): one {@code FluidModel.Unbaked} per fluid through
 * Fabric's {@code FluidRenderingRegistry} (the still and the flowing fluid on 26.3, the one fluid on 26.4), with the
 * still and flowing pictures, the optional overlay (drawn on glass and leaves beside the fluid) and the definition's
 * {@code tint} as a plain RGB {@code BlockTintSource} (no tint without it). A dedicated server never loads this class.
 *
 * <p>The pictures are editor-only fields that lower to assets (ADR 0099 D1): the liquid block's model
 * {@code assets/<ns>/models/block/<path>.json} carries them as the texture variables {@code still}, {@code flowing} and
 * {@code overlay}, read here from the mod that shipped the definition. A model without them (or none) falls back to
 * vanilla's water pictures, lava's for a lava-like fluid, from the player's own game, and no overlay; vanilla's water
 * pictures are grey, so such a fluid without a tint draws grey.
 */
public final class FluidClient {
    private FluidClient() {}

    /** The sprite ids a fluid is drawn with. {@code overlay} is null for none. */
    public record Pictures(Identifier still, Identifier flowing, Identifier overlay) {}

    private static final Map<Identifier, Pictures> PICTURES = new LinkedHashMap<>();

    /** The pictures each project fluid was registered with (client GameTests, diagnostics). */
    public static Map<Identifier, Pictures> pictures() {
        return Map.copyOf(PICTURES);
    }

    /** Registers the renderers of the project fluids; called from the client entrypoint after the registrar ran. */
    public static void init() {
        for (MsmFluids.Entry entry : MsmFluids.registered()) {
            try {
                Pictures pictures = pictures(entry);
                BlockTintSource tint = entry.definition().tint().map(FluidClient::tint).orElse(null);
                FluidModel.Unbaked model = new FluidModel.Unbaked(new Material(pictures.still()), new Material(pictures.flowing()),
                        pictures.overlay() == null ? null : new Material(pictures.overlay()), tint);
                if (entry.fluids().still() == entry.fluids().flowing()) {
                    FluidRenderingRegistry.register(entry.fluids().still(), model);
                } else {
                    FluidRenderingRegistry.register(entry.fluids().still(), entry.fluids().flowing(), model);
                }
                PICTURES.put(entry.id(), pictures);
            } catch (RuntimeException e) {
                MsmRuntime.LOGGER.error("[{}] fluid {}: could not register its renderer", MsmRuntime.MOD_ID, entry.id(), e);
            }
        }
    }

    /** A tint that multiplies the pictures by the RGB colour {@code rgb} wherever the fluid is. */
    static BlockTintSource tint(int rgb) {
        int colour = rgb & 0xFFFFFF;
        return state -> colour;
    }

    /** The pictures of a fluid: from its liquid block's model, else vanilla's (see the class comment). */
    static Pictures pictures(MsmFluids.Entry entry) {
        boolean lava = entry.definition().behavesLike() == FluidDefinition.Behaviour.LAVA;
        Identifier still = Identifier.withDefaultNamespace(lava ? "block/lava_still" : "block/water_still");
        Identifier flowing = Identifier.withDefaultNamespace(lava ? "block/lava_flow" : "block/water_flow");
        Identifier overlay = null;
        Optional<JsonObject> textures = modelTextures(entry.modId(), entry.id());
        if (textures.isPresent()) {
            still = texture(textures.get(), "still").orElse(still);
            flowing = texture(textures.get(), "flowing").orElse(flowing);
            overlay = texture(textures.get(), "overlay").orElse(null);
        } else {
            MsmRuntime.LOGGER.warn("[{}] fluid {}: no textures in assets/{}/models/block/{}.json; vanilla's {} pictures are used",
                    MsmRuntime.MOD_ID, entry.id(), entry.id().getNamespace(), entry.id().getPath(), lava ? "lava" : "water");
        }
        return new Pictures(still, flowing, overlay);
    }

    /** A texture variable that names a picture (not a {@code #reference}), as a sprite id. */
    private static Optional<Identifier> texture(JsonObject textures, String name) {
        JsonElement value = textures.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            return Optional.empty();
        }
        String text = value.getAsString();
        return text.startsWith("#") ? Optional.empty() : Optional.ofNullable(Identifier.tryParse(text));
    }

    /** The {@code textures} object of the liquid block's model in mod {@code modId}, if it has one. */
    private static Optional<JsonObject> modelTextures(String modId, Identifier id) {
        Optional<ModContainer> mod = FabricLoader.getInstance().getModContainer(modId);
        if (mod.isEmpty()) {
            return Optional.empty();
        }
        Optional<Path> file = mod.get().findPath("assets/" + id.getNamespace() + "/models/block/" + id.getPath() + ".json");
        if (file.isEmpty() || !Files.isRegularFile(file.get())) {
            return Optional.empty();
        }
        try (Reader reader = Files.newBufferedReader(file.get(), StandardCharsets.UTF_8)) {
            JsonElement json = JsonParser.parseReader(reader);
            if (json.isJsonObject() && json.getAsJsonObject().get("textures") instanceof JsonObject textures) {
                return Optional.of(textures);
            }
        } catch (IOException | RuntimeException e) {
            MsmRuntime.LOGGER.warn("[{}] fluid {}: could not read its block model: {}", MsmRuntime.MOD_ID, id, e.getMessage());
        }
        return Optional.empty();
    }
}
