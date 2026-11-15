package dev.mcsupermods.runtime.client.hud;

import dev.mcsupermods.runtime.loader.HudDefinition.Anchor;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * Where HUD elements go and how much of them is filled (ADR 0089 D4), in GUI pixels. Pure: no Minecraft class, so JUnit
 * checks it and writes {@code fixtures/hud-layout/golden.json}, which the app's HUD Studio (B420) and Try it (B429)
 * follow. The rules, also in that folder's README:
 *
 * <ul>
 *   <li>The GUI's scaled size is the window size divided by the GUI scale, rounded up ({@link #guiSize}).</li>
 *   <li>Each anchor holds a stack of the visible elements placed there, sorted by {@code order} and then by id as a
 *       string. Horizontally each element is placed on its own: {@code left} at {@link #MARGIN}, {@code centre} at
 *       {@code floor((width - w) / 2)}, {@code right} at {@code width - MARGIN - w}.</li>
 *   <li>Vertically the stack grows away from its edge with {@link #GAP} between elements: {@code top} anchors start at
 *       {@link #MARGIN} and grow down; {@code bottom} anchors end at {@code height - MARGIN} and grow up;
 *       {@code above_hotbar} ends at {@code height - ABOVE_HOTBAR} (above vanilla's hotbar and status bars) and grows
 *       up; the middle row ({@code left}, {@code center}, {@code right}) is centred as a whole, starting at
 *       {@code floor((height - total) / 2)}, and grows down.</li>
 *   <li>Then each element moves by its own {@code offset}; the offset never moves the others.</li>
 *   <li>Sizes: a text is its font width by {@link #TEXT_HEIGHT}; a bar is its {@code size}; a row of icons is
 *       {@link #iconsWidth} by {@link #ICON_SIZE}.</li>
 * </ul>
 */
public final class HudLayout {
    /** Space between the screen's edge and an edge anchor's stack. */
    public static final int MARGIN = 2;
    /** Space between two elements of one stack. */
    public static final int GAP = 2;
    /** The bottom of the {@code above_hotbar} stack, this far above the screen's bottom edge. */
    public static final int ABOVE_HOTBAR = 52;
    /** A line of text's height (the font's line height). */
    public static final int TEXT_HEIGHT = 9;
    /** An icon's size, and the step from one icon to the next (they overlap by one pixel, as hearts). */
    public static final int ICON_SIZE = 9;
    public static final int ICON_STEP = 8;
    /** The most icons in a row. */
    public static final int MAX_ICONS = 20;
    /** Numbers are shown with at most this many decimals. */
    public static final int DECIMALS = 2;

    private HudLayout() {}

    /** Where an anchor puts an element across the screen. */
    public enum Horizontal {
        LEFT, CENTRE, RIGHT
    }

    /** Where an anchor's stack starts and which way it grows. */
    public enum Vertical {
        TOP, MIDDLE, BOTTOM, ABOVE_HOTBAR
    }

    /** The anchor table. */
    public static Horizontal horizontal(Anchor anchor) {
        return switch (anchor) {
            case TOP_LEFT, LEFT, BOTTOM_LEFT -> Horizontal.LEFT;
            case TOP, CENTER, BOTTOM, ABOVE_HOTBAR -> Horizontal.CENTRE;
            case TOP_RIGHT, RIGHT, BOTTOM_RIGHT -> Horizontal.RIGHT;
        };
    }

    public static Vertical vertical(Anchor anchor) {
        return switch (anchor) {
            case TOP_LEFT, TOP, TOP_RIGHT -> Vertical.TOP;
            case LEFT, CENTER, RIGHT -> Vertical.MIDDLE;
            case BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT -> Vertical.BOTTOM;
            case ABOVE_HOTBAR -> Vertical.ABOVE_HOTBAR;
        };
    }

    /**
     * One element to place.
     *
     * @param id     its id as a string (the second sort key)
     * @param width  its width in GUI pixels
     * @param height its height in GUI pixels
     */
    public record Box(String id, Anchor anchor, int offsetX, int offsetY, int order, int width, int height) {}

    /** Where a box's top left corner goes. */
    public record Placed(Box box, int x, int y) {}

    private static final Comparator<Box> STACK = Comparator.comparingInt(Box::order).thenComparing(Box::id);

    /** The GUI's scaled size along one side: the window's pixels over the scale, rounded up. */
    public static int guiSize(int windowPixels, int scale) {
        return Math.ceilDiv(windowPixels, scale);
    }

    /** Places {@code boxes} on a GUI of {@code width} by {@code height}; the result keeps their order. */
    public static List<Placed> place(int width, int height, List<Box> boxes) {
        Map<Anchor, List<Box>> stacks = new EnumMap<>(Anchor.class);
        for (Box box : boxes) {
            stacks.computeIfAbsent(box.anchor(), a -> new ArrayList<>()).add(box);
        }
        Map<Box, int[]> at = new IdentityHashMap<>();
        stacks.forEach((anchor, list) -> {
            list.sort(STACK);
            Vertical v = vertical(anchor);
            int cursor = switch (v) {
                case TOP -> MARGIN;
                case BOTTOM -> height - MARGIN;
                case ABOVE_HOTBAR -> height - ABOVE_HOTBAR;
                case MIDDLE -> {
                    int total = GAP * (list.size() - 1);
                    for (Box b : list) {
                        total += b.height();
                    }
                    yield Math.floorDiv(height - total, 2);
                }
            };
            for (Box b : list) {
                int y;
                if (v == Vertical.TOP || v == Vertical.MIDDLE) {
                    y = cursor;
                    cursor += b.height() + GAP;
                } else {
                    y = cursor - b.height();
                    cursor = y - GAP;
                }
                int x = switch (horizontal(anchor)) {
                    case LEFT -> MARGIN;
                    case CENTRE -> Math.floorDiv(width - b.width(), 2);
                    case RIGHT -> width - MARGIN - b.width();
                };
                at.put(b, new int[] {x + b.offsetX(), y + b.offsetY()});
            }
        });
        List<Placed> out = new ArrayList<>(boxes.size());
        for (Box box : boxes) {
            int[] xy = at.get(box);
            out.add(new Placed(box, xy[0], xy[1]));
        }
        return out;
    }

    /** How many GUI pixels of a bar {@code width} wide {@code value} out of {@code max} fills (rounded, half up). */
    public static int barFill(double value, double max, int width) {
        if (!(max > 0) || !Double.isFinite(value)) {
            return 0;
        }
        double fraction = Math.max(0, Math.min(1, value / max));
        return (int) Math.round(width * fraction);
    }

    /** How many icons a row has: {@code max} over {@code perIcon} rounded up, 0 to {@link #MAX_ICONS}. */
    public static int iconCount(double max, double perIcon) {
        if (!(max > 0) || !(perIcon > 0)) {
            return 0;
        }
        double n = Math.ceil(max / perIcon - 1e-9);
        return (int) Math.max(0, Math.min(MAX_ICONS, n));
    }

    /** A row of {@code count} icons' width. */
    public static int iconsWidth(int count) {
        return count <= 0 ? 0 : ICON_STEP * (count - 1) + ICON_SIZE;
    }

    /**
     * How a row of {@code count} icons is drawn for {@code value}: full icons, then one half icon when the value has a
     * half left over and there is a half icon, then empty icons up to {@code count} when there is an empty icon.
     */
    public record IconFill(int full, int half, int empty) {}

    public static IconFill icons(double value, double perIcon, int count, boolean hasHalf, boolean hasEmpty) {
        if (count <= 0 || !(perIcon > 0) || !Double.isFinite(value)) {
            return new IconFill(0, 0, hasEmpty ? Math.max(0, count) : 0);
        }
        long halves = (long) Math.floor(value * 2 / perIcon + 1e-9);
        halves = Math.max(0, Math.min(halves, 2L * count));
        int full = (int) (halves / 2);
        int half = hasHalf && halves % 2 == 1 ? 1 : 0;
        int empty = hasEmpty ? count - full - half : 0;
        return new IconFill(full, half, empty);
    }

    /**
     * A number as a text shows it: rounded half away from zero (from the double's exact value) to at most
     * {@link #DECIMALS} decimals, without trailing zeros, never in exponent form; {@code -0} shows as {@code 0}; a
     * value that is not finite shows as nothing.
     */
    public static String formatNumber(double value) {
        if (!Double.isFinite(value)) {
            return "";
        }
        BigDecimal rounded = new BigDecimal(value).setScale(DECIMALS, RoundingMode.HALF_UP).stripTrailingZeros();
        if (rounded.signum() == 0) {
            return "0";
        }
        return rounded.toPlainString();
    }
}
