package dev.mcsupermods.runtime.client.hud;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.HudDefinition;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.Font;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;

/**
 * A vehicle's built-in dashboard (ADR 0089 D5), drawn by the HUD layer for its riders while the definition's
 * {@code hud} is on, from the vehicle's synched data alone (no payload): a health bar, a fuel bar when the vehicle needs
 * fuel, and one row per weapon with its ammunition (when it uses any) and a reload bar that fills as the weapon gets
 * ready. Each row is a label and a {@link #BAR_WIDTH} by {@link #BAR_HEIGHT} bar; the rows sit in the
 * {@code bottom_right} anchor before any project element there (their {@code order} is below every other), read from
 * the top: health, fuel, then the weapons in their order. Labels are translation keys with English fallbacks
 * ({@code hud.msm_runtime.health}, {@code hud.msm_runtime.fuel}); a weapon's label is its {@code id} with {@code _} as
 * spaces and a capital first letter.
 */
public final class VehicleDashboard {
    public static final int BAR_WIDTH = 50;
    public static final int BAR_HEIGHT = 5;
    /** Space between a row's label and its bar. */
    public static final int LABEL_GAP = 4;
    public static final int HEALTH_COLOR = 0xffd83030;
    public static final int FUEL_COLOR = 0xffe0a020;
    public static final int RELOADING_COLOR = 0xff60a0ff;
    public static final int READY_COLOR = 0xff60c060;
    public static final int BACK_COLOR = 0xff202020;
    /** The first row's {@code order}; the rows count up from it. */
    public static final int ORDER = Integer.MIN_VALUE;

    private VehicleDashboard() {}

    /** One row before layout: its label, how full its bar is (0 to 1) and the bar's colour. */
    record Row(String label, double fraction, int color) {}

    /** The rows for {@code player}'s vehicle, top first; empty on foot or with {@code hud: false}. */
    static List<Row> rowsOf(LocalPlayer player) {
        if (!(player.getVehicle() instanceof MsmVehicle vehicle) || !vehicle.definition().hud()) {
            return List.of();
        }
        VehicleDefinition def = vehicle.definition();
        List<Row> rows = new ArrayList<>();
        float max = vehicle.health().max();
        rows.add(new Row(label("health", "Health"), max <= 0 ? 0 : Math.max(0, max - vehicle.getDamage()) / max, HEALTH_COLOR));
        int capacity = vehicle.fuel().capacity();
        if (def.fuel().isPresent()) {
            rows.add(new Row(label("fuel", "Fuel"), capacity <= 0 ? 0 : (double) vehicle.fuel().fuel() / capacity, FUEL_COLOR));
        }
        long now = vehicle.level().getGameTime();
        for (int i = 0; i < def.weapons().size(); i++) {
            VehicleDefinition.Weapon weapon = def.weapons().get(i);
            String label = name(weapon.id());
            if (weapon.ammo().isPresent()) {
                label += " " + vehicle.ammo(i) + "/" + weapon.ammo().get().capacity();
            }
            long remaining = Math.max(0, vehicle.readyAt(i) - now);
            double ready = weapon.cooldownTicks() <= 0 ? 1 : 1 - Math.min(1, (double) remaining / weapon.cooldownTicks());
            rows.add(new Row(label, ready, remaining > 0 ? RELOADING_COLOR : READY_COLOR));
        }
        return rows;
    }

    /** The dashboard's items for the layer: one box per row in the {@code bottom_right} stack. */
    static List<MsmHudLayer.Item> rows(LocalPlayer player, Font font) {
        List<Row> rows = rowsOf(player);
        if (rows.isEmpty()) {
            return List.of();
        }
        int labelWidth = 0;
        for (Row row : rows) {
            labelWidth = Math.max(labelWidth, font.width(row.label()));
        }
        int width = labelWidth + LABEL_GAP + BAR_WIDTH;
        int barX = labelWidth + LABEL_GAP;
        List<MsmHudLayer.Item> items = new ArrayList<>(rows.size());
        // The stack grows upwards from the bottom edge, so the last row goes first.
        for (int k = 0; k < rows.size(); k++) {
            Row row = rows.get(rows.size() - 1 - k);
            int filled = (int) Math.round(BAR_WIDTH * Math.max(0, Math.min(1, row.fraction())));
            HudLayout.Box box = new HudLayout.Box(MsmRuntime.MOD_ID + ":dashboard/" + k, HudDefinition.Anchor.BOTTOM_RIGHT, 0, 0, ORDER + k, width,
                    HudLayout.TEXT_HEIGHT);
            items.add(new MsmHudLayer.Item(box, (g, x, y) -> {
                g.text(font, row.label(), x, y, 0xffffffff, true);
                int bx = x + barX;
                int by = y + (HudLayout.TEXT_HEIGHT - BAR_HEIGHT) / 2;
                g.fill(bx, by, bx + BAR_WIDTH, by + BAR_HEIGHT, BACK_COLOR);
                if (filled > 0) {
                    g.fill(bx, by, bx + filled, by + BAR_HEIGHT, row.color());
                }
            }));
        }
        return items;
    }

    private static String label(String key, String fallback) {
        return Component.translatableWithFallback("hud." + MsmRuntime.MOD_ID + "." + key, fallback).getString();
    }

    /** A weapon id as a label: {@code machine_gun} is "Machine gun". */
    static String name(String id) {
        String spaced = id.replace('_', ' ');
        return spaced.isEmpty() ? spaced : spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
    }
}
