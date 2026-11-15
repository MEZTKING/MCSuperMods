/// <reference types="node" />
/**
 * The HUD Studio's layout (B420, ADR 0089 D4, D9) against the cross-language golden
 * `fixtures/hud-layout/golden.json`, written by the runtime's `HudLayoutGoldenTest`: every
 * screen's GUI size and positions, every bar fill, every icon row and every number, case for
 * case, plus the constants and the anchor table.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  barFill,
  guiSize,
  HUD_ANCHORS,
  HUD_LAYOUT,
  type HudBox,
  hudNumberText,
  hudText,
  iconRow,
  layoutHud,
} from '../../../../src/renderer/src/studios/controls/hud-layout';

interface Golden {
  format: number;
  constants: Record<string, number>;
  anchors: Record<string, { horizontal: string; vertical: string }>;
  elements: {
    id: string;
    anchor: string;
    order: number;
    size: [number, number];
    offset?: [number, number];
  }[];
  screens: {
    window: [number, number];
    scale: number;
    gui: [number, number];
    positions: Record<string, [number, number]>;
  }[];
  bar_fill: { value: number; max: number; width: number; filled: number }[];
  icons: {
    value: number;
    max: number;
    per_icon: number;
    has_half: boolean;
    has_empty: boolean;
    count: number;
    width: number;
    full: number;
    half: number;
    empty: number;
  }[];
  numbers: { value: number; text: string }[];
}

const golden = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'fixtures',
      'hud-layout',
      'golden.json',
    ),
    'utf8',
  ),
) as Golden;

describe('hud-layout against fixtures/hud-layout/golden.json', () => {
  it('reads format 1 with the same constants and anchor table', () => {
    expect(golden.format).toBe(1);
    expect(golden.constants).toEqual({
      above_hotbar: HUD_LAYOUT.aboveHotbar,
      decimals: HUD_LAYOUT.decimals,
      gap: HUD_LAYOUT.gap,
      icon_size: HUD_LAYOUT.iconSize,
      icon_step: HUD_LAYOUT.iconStep,
      margin: HUD_LAYOUT.margin,
      max_icons: HUD_LAYOUT.maxIcons,
      text_height: HUD_LAYOUT.textHeight,
    });
    expect(HUD_ANCHORS).toEqual(golden.anchors);
  });

  const boxes: HudBox[] = golden.elements.map((entry) => ({
    id: entry.id,
    anchor: entry.anchor,
    order: entry.order,
    size: entry.size,
    offset: entry.offset,
  }));

  it.each(golden.screens.map((screen, index) => [index, screen] as const))(
    'places every element on screen %i',
    (_index, screen) => {
      const gui = guiSize(screen.window, screen.scale);
      expect(gui).toEqual(screen.gui);
      expect(Object.fromEntries(layoutHud(boxes, gui))).toEqual(screen.positions);
    },
  );

  it.each(golden.bar_fill)('fills a bar: $value of $max over $width', (entry) => {
    expect(barFill(entry.value, entry.max, entry.width)).toBe(entry.filled);
  });

  it.each(golden.icons)('draws icons: $value of $max, $per_icon each', (entry) => {
    expect(
      iconRow(entry.value, entry.max, entry.per_icon, entry.has_half, entry.has_empty),
    ).toEqual({
      count: entry.count,
      width: entry.width,
      full: entry.full,
      half: entry.half,
      empty: entry.empty,
    });
  });

  it.each(golden.numbers)('writes $value as text', (entry) => {
    expect(hudNumberText(entry.value)).toBe(entry.text);
  });

  it('fills a text template', () => {
    expect(hudText('Y: {value} of {max}', 64.125, 100)).toBe('Y: 64.13 of 100');
    expect(hudText('{value}', 'hello', undefined)).toBe('hello');
    expect(hudText('[{value}]', undefined, undefined)).toBe('[]');
  });
});
