package dev.mcsupermods.runtime.client.hud;

import dev.mcsupermods.runtime.client.HudRegistration;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.hud.HudState;
import dev.mcsupermods.runtime.loader.HudDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.locale.Language;
import net.minecraft.resources.Identifier;

/**
 * The runtime's HUD layer {@code msm_runtime:hud} (ADR 0089 D4): every visible HUD element and, for the riders of a
 * vehicle with {@code hud} on, the built-in dashboard ({@link VehicleDashboard}), placed by {@link HudLayout} on the
 * GUI's scaled size and drawn in index order. Vanilla skips every HUD layer while the GUI is hidden (F1), so this one
 * is too.
 *
 * <p>An element is drawn when it is shown (a {@code show_hud} or {@code hide_hud} decides, else not
 * {@code starts_hidden}) and its {@code show} holds: {@code always}; {@code when_set} once it has a value (a
 * {@code player} value always has one); {@code in_vehicle} while the viewer rides a project vehicle (of type
 * {@code vehicle} when given); {@code driving} while the viewer drives one. A bar or row of icons whose value is a text
 * draws nothing; one without a value draws empty. A {@code max} read from a value is {@link HudDefinition#DEFAULT_MAX}
 * until it has a number.
 */
public final class MsmHudLayer {
    /** How many frames drew at least one element (client GameTests). */
    private static int frames;
    /** The boxes of the last frame, with their places (client GameTests). */
    private static volatile List<HudLayout.Placed> last = List.of();

    private MsmHudLayer() {}

    /** Paints one placed element. */
    interface Painter {
        void paint(GuiGraphicsExtractor graphics, int x, int y);
    }

    /** One element of a frame: its box and how it is painted. */
    record Item(HudLayout.Box box, Painter painter) {}

    public static int frames() {
        return frames;
    }

    /** The boxes the last frame drew, by id (element ids, and {@code msm_runtime:dashboard/<n>} for the dashboard). */
    public static List<HudLayout.Placed> last() {
        return last;
    }

    /** Draws the frame's elements. */
    static void draw(GuiGraphicsExtractor graphics) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null) {
            return;
        }
        Font font = mc.font;
        HudState state = HudClient.state();
        List<Identifier> ids = HudServer.ids();
        List<HudDefinition> defs = HudServer.ordered();
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < defs.size(); i++) {
            HudDefinition def = defs.get(i);
            Object value = def.value() instanceof HudDefinition.Player p ? playerStat(player, p.stat()) : state.value(i);
            if (!visible(state, i, def, value, player)) {
                continue;
            }
            Object max = max(state, i, defs.size(), def, player);
            Item item = item(ids.get(i).toString(), def, value, max, font);
            if (item != null) {
                items.add(item);
            }
        }
        items.addAll(VehicleDashboard.rows(player, font));
        if (items.isEmpty()) {
            last = List.of();
            return;
        }
        List<HudLayout.Box> boxes = new ArrayList<>(items.size());
        items.forEach(item -> boxes.add(item.box()));
        List<HudLayout.Placed> placed = HudLayout.place(graphics.guiWidth(), graphics.guiHeight(), boxes);
        for (int k = 0; k < items.size(); k++) {
            items.get(k).painter().paint(graphics, placed.get(k).x(), placed.get(k).y());
        }
        last = List.copyOf(placed);
        frames++;
    }

    static boolean visible(HudState state, int index, HudDefinition def, Object value, LocalPlayer player) {
        Boolean shown = state.visible(index);
        if (shown != null ? !shown : def.startsHidden()) {
            return false;
        }
        return switch (def.show()) {
            case ALWAYS -> true;
            case WHEN_SET -> value != null;
            case IN_VEHICLE -> player.getVehicle() instanceof MsmVehicle v && vehicleMatches(def.vehicle(), v);
            case DRIVING -> player.getVehicle() instanceof MsmVehicle v && v.getControllingPassenger() == player
                    && vehicleMatches(def.vehicle(), v);
        };
    }

    private static boolean vehicleMatches(Optional<Identifier> type, MsmVehicle vehicle) {
        return type.isEmpty() || type.get().equals(BuiltInRegistries.ENTITY_TYPE.getKey(vehicle.getType()));
    }

    /** The element's {@code max}: a number, a text (for {@code {max}} only), or null when it has no value yet. */
    static Object max(HudState state, int index, int count, HudDefinition def, LocalPlayer player) {
        return switch (def.max()) {
            case HudDefinition.Fixed f -> (double) f.max();
            case HudDefinition.From from -> from.value() instanceof HudDefinition.Player p ? playerStat(player, p.stat())
                    : from.value().source().computedOnServer() ? state.value(count + index) : null;
        };
    }

    /**
     * A {@code player} stat on this client: health, food, armour and level as the game counts them; air from 0 (none
     * left) to 20 (full lungs), on the scale of health; x, y and z as block coordinates.
     */
    static Double playerStat(LocalPlayer player, HudDefinition.PlayerStat stat) {
        return switch (stat) {
            case HEALTH -> (double) player.getHealth();
            case FOOD -> (double) player.getFoodData().getFoodLevel();
            case AIR -> player.getMaxAirSupply() <= 0 ? 0.0
                    : (double) Math.round(Math.max(0, player.getAirSupply()) * 20.0 / player.getMaxAirSupply());
            case ARMOR -> (double) player.getArmorValue();
            case LEVEL -> (double) player.experienceLevel;
            case X -> (double) player.getBlockX();
            case Y -> (double) player.getBlockY();
            case Z -> (double) player.getBlockZ();
        };
    }

    /** {@code value} as text: a number by {@link HudLayout#formatNumber}, a text as is, nothing as empty. */
    static String show(Object value) {
        return value instanceof Double d ? HudLayout.formatNumber(d) : value instanceof String s ? s : "";
    }

    /** The text an element draws: its {@code text} (or the translation it names) with {@code {value}} and {@code {max}}. */
    static String text(String template, Object value, Object max) {
        String t = template;
        if (!t.contains(" ") && Language.getInstance().has(t)) {
            t = Language.getInstance().getOrDefault(t);
        }
        return t.replace("{value}", show(value)).replace("{max}", show(max));
    }

    private static Item item(String id, HudDefinition def, Object value, Object max, Font font) {
        double maxNumber = max instanceof Double d ? d : HudDefinition.DEFAULT_MAX;
        return switch (def.type()) {
            case TEXT -> {
                String text = text(def.text().text(), value, max);
                int color = 0xff000000 | def.text().color();
                boolean shadow = def.text().shadow();
                yield new Item(box(id, def, font.width(text), HudLayout.TEXT_HEIGHT),
                        (g, x, y) -> g.text(font, text, x, y, color, shadow));
            }
            case BAR -> {
                if (value instanceof String) {
                    yield null;
                }
                HudDefinition.BarStyle bar = def.bar();
                int filled = HudLayout.barFill(value instanceof Double d ? d : 0, maxNumber, bar.width());
                yield new Item(box(id, def, bar.width(), bar.height()), (g, x, y) -> paintBar(g, bar, x, y, filled));
            }
            case ICONS -> {
                HudDefinition.IconStyle icons = def.icons();
                if (value instanceof String || icons.icon().isEmpty()) {
                    yield null;
                }
                int count = HudLayout.iconCount(maxNumber, icons.perIcon());
                HudLayout.IconFill fill = HudLayout.icons(value instanceof Double d ? d : 0, icons.perIcon(), count,
                        icons.halfIcon().isPresent(), icons.emptyIcon().isPresent());
                yield new Item(box(id, def, HudLayout.iconsWidth(count), HudLayout.ICON_SIZE), (g, x, y) -> paintIcons(g, icons, fill, x, y));
            }
        };
    }

    private static HudLayout.Box box(String id, HudDefinition def, int width, int height) {
        return new HudLayout.Box(id, def.anchor(), def.offsetX(), def.offsetY(), def.order(), width, height);
    }

    private static void paintBar(GuiGraphicsExtractor g, HudDefinition.BarStyle bar, int x, int y, int filled) {
        int w = bar.width();
        int h = bar.height();
        if (bar.backSprite().isPresent()) {
            HudRegistration.sprite(g, bar.backSprite().get(), x, y, w, h);
        } else {
            g.fill(x, y, x + w, y + h, 0xff000000 | bar.backColor());
        }
        if (filled <= 0) {
            return;
        }
        if (bar.sprite().isPresent()) {
            HudRegistration.spriteLeft(g, bar.sprite().get(), w, h, x, y, filled);
        } else {
            g.fill(x, y, x + filled, y + h, 0xff000000 | bar.fillColor());
        }
    }

    private static void paintIcons(GuiGraphicsExtractor g, HudDefinition.IconStyle icons, HudLayout.IconFill fill, int x, int y) {
        int k = 0;
        for (int n = 0; n < fill.full(); n++, k++) {
            HudRegistration.sprite(g, icons.icon().get(), x + k * HudLayout.ICON_STEP, y, HudLayout.ICON_SIZE, HudLayout.ICON_SIZE);
        }
        if (fill.half() > 0 && icons.halfIcon().isPresent()) {
            HudRegistration.sprite(g, icons.halfIcon().get(), x + k * HudLayout.ICON_STEP, y, HudLayout.ICON_SIZE, HudLayout.ICON_SIZE);
            k++;
        }
        if (icons.emptyIcon().isPresent()) {
            for (int n = 0; n < fill.empty(); n++, k++) {
                HudRegistration.sprite(g, icons.emptyIcon().get(), x + k * HudLayout.ICON_STEP, y, HudLayout.ICON_SIZE, HudLayout.ICON_SIZE);
            }
        }
    }
}
