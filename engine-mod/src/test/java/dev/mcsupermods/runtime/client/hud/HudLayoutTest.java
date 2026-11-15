package dev.mcsupermods.runtime.client.hud;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.mcsupermods.runtime.loader.HudDefinition.Anchor;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The layout rules of {@link HudLayout} one by one; {@link HudLayoutGoldenTest} pins them for the app. */
class HudLayoutTest {
    private static HudLayout.Box box(String id, Anchor anchor, int order, int w, int h) {
        return new HudLayout.Box(id, anchor, 0, 0, order, w, h);
    }

    private static int[] at(List<HudLayout.Placed> placed, String id) {
        for (HudLayout.Placed p : placed) {
            if (p.box().id().equals(id)) {
                return new int[] {p.x(), p.y()};
            }
        }
        throw new AssertionError(id);
    }

    @Test
    void guiSizeRoundsUp() {
        assertEquals(427, HudLayout.guiSize(854, 2));
        assertEquals(285, HudLayout.guiSize(854, 3));
        assertEquals(240, HudLayout.guiSize(480, 2));
        assertEquals(1920, HudLayout.guiSize(1920, 1));
    }

    @Test
    void cornersSitAtTheMargin() {
        List<HudLayout.Placed> p = HudLayout.place(400, 300, List.of(
                box("a:tl", Anchor.TOP_LEFT, 0, 10, 5), box("a:tr", Anchor.TOP_RIGHT, 0, 10, 5),
                box("a:bl", Anchor.BOTTOM_LEFT, 0, 10, 5), box("a:br", Anchor.BOTTOM_RIGHT, 0, 10, 5)));
        assertEquals(List.of(2, 2), List.of(at(p, "a:tl")[0], at(p, "a:tl")[1]));
        assertEquals(List.of(388, 2), List.of(at(p, "a:tr")[0], at(p, "a:tr")[1]));
        assertEquals(List.of(2, 293), List.of(at(p, "a:bl")[0], at(p, "a:bl")[1]));
        assertEquals(List.of(388, 293), List.of(at(p, "a:br")[0], at(p, "a:br")[1]));
    }

    @Test
    void stacksFollowOrderThenIdAndGrowAwayFromTheEdge() {
        List<HudLayout.Placed> p = HudLayout.place(400, 300, List.of(
                box("a:b", Anchor.TOP, 0, 20, 9), box("a:a", Anchor.TOP, 0, 20, 9), box("a:first", Anchor.TOP, -5, 20, 5),
                box("a:low", Anchor.BOTTOM, 0, 20, 5), box("a:high", Anchor.BOTTOM, 1, 20, 9)));
        assertEquals(2, at(p, "a:first")[1]);
        assertEquals(9, at(p, "a:a")[1]);
        assertEquals(20, at(p, "a:b")[1]);
        assertEquals(190, at(p, "a:a")[0]);
        assertEquals(293, at(p, "a:low")[1]);
        assertEquals(282, at(p, "a:high")[1]);
    }

    @Test
    void aboveHotbarAndTheMiddleRow() {
        List<HudLayout.Placed> p = HudLayout.place(427, 240, List.of(
                box("a:mana", Anchor.ABOVE_HOTBAR, 0, 81, 5), box("a:one", Anchor.CENTER, 0, 30, 9), box("a:two", Anchor.CENTER, 1, 30, 5)));
        assertEquals(List.of(173, 183), List.of(at(p, "a:mana")[0], at(p, "a:mana")[1]));
        // 9 + 2 + 5 = 16 high, centred: (240 - 16) / 2 = 112.
        assertEquals(112, at(p, "a:one")[1]);
        assertEquals(123, at(p, "a:two")[1]);
    }

    @Test
    void offsetsMoveOnlyTheirOwnElement() {
        List<HudLayout.Placed> p = HudLayout.place(400, 300, List.of(
                new HudLayout.Box("a:a", Anchor.TOP_LEFT, 5, 7, 0, 10, 9), box("a:b", Anchor.TOP_LEFT, 0, 10, 9)));
        assertEquals(List.of(7, 9), List.of(at(p, "a:a")[0], at(p, "a:a")[1]));
        assertEquals(List.of(2, 13), List.of(at(p, "a:b")[0], at(p, "a:b")[1]));
    }

    @Test
    void fillsIconsAndNumbers() {
        assertEquals(41, HudLayout.barFill(10, 20, 81));
        assertEquals(0, HudLayout.barFill(10, 0, 81));
        assertEquals(10, HudLayout.iconCount(20, 2));
        assertEquals(20, HudLayout.iconCount(1000, 2));
        assertEquals(81, HudLayout.iconsWidth(10));
        assertEquals(new HudLayout.IconFill(3, 1, 6), HudLayout.icons(7, 2, 10, true, true));
        assertEquals(new HudLayout.IconFill(3, 0, 0), HudLayout.icons(7, 2, 10, false, false));
        assertEquals("12.5", HudLayout.formatNumber(12.5));
        assertEquals("3", HudLayout.formatNumber(3.0));
        assertEquals("0.33", HudLayout.formatNumber(1.0 / 3));
        assertEquals("0", HudLayout.formatNumber(-0.0));
    }
}
