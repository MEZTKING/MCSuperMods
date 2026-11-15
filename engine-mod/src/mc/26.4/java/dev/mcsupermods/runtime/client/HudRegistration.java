package dev.mcsupermods.runtime.client;

import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.GuiPipeline;
import net.minecraft.resources.Identifier;

/**
 * The HUD seam, 26.4 (ADR 0089 D4, plan V10): Fabric's {@code HudElement} extends {@code Updatable} here, with
 * {@code update(DeltaTracker)} and {@code extractRenderState(GuiGraphicsExtractor)}, and sprites take a
 * {@code GuiPipeline}.
 */
public final class HudRegistration {
    private HudRegistration() {}

    /** Adds the HUD layer {@code id} before vanilla's chat; {@code draw} runs every frame the HUD is drawn. */
    public static void register(Identifier id, Consumer<GuiGraphicsExtractor> draw) {
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, id, new HudElement() {
            @Override
            public void extractRenderState(GuiGraphicsExtractor graphics) {
                draw.accept(graphics);
            }
        });
    }

    /** Draws the GUI sprite {@code sprite} stretched to {@code width} by {@code height} at {@code x}, {@code y}. */
    public static void sprite(GuiGraphicsExtractor graphics, Identifier sprite, int x, int y, int width, int height) {
        graphics.blitSprite(GuiPipeline.TEXTURED, sprite, x, y, width, height);
    }

    /**
     * Draws the left {@code width} pixels of the GUI sprite {@code sprite} laid out at {@code fullWidth} by
     * {@code height} (a bar's filled part) at {@code x}, {@code y}.
     */
    public static void spriteLeft(GuiGraphicsExtractor graphics, Identifier sprite, int fullWidth, int height, int x, int y, int width) {
        graphics.blitSprite(GuiPipeline.TEXTURED, sprite, fullWidth, height, 0, 0, x, y, width, height);
    }
}
