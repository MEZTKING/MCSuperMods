// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemSlot, tooltipLinesOf } from '../../../../src/renderer/src/liveviews/frame/ItemSlot';
import {
  definitionModel,
  enchantmentLine,
  itemName,
  romanNumeral,
} from '../../../../src/renderer/src/liveviews/frame/item-picture';
import { newSeed, SeedBox } from '../../../../src/renderer/src/liveviews/frame/SeedBox';
import type { ResourceFolders } from '../../../../src/renderer/src/preview/model-chain';

afterEach(cleanup);

const folders = {
  model: 'models',
  block_definition: 'blockstates',
  item_definition: 'items',
  lang: 'lang',
  sounds_file: 'sounds.json',
  textures: 'textures',
  atlases: 'atlases',
  font: 'font',
} as ResourceFolders;

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
/** Not a real PNG: the slot only turns the bytes into a `data:` URL. */
const PICTURE = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

/** A made-up cache (MSM's own files, no Mojang file): a pick's definition, a parent model, a picture. */
function fakeAssets() {
  const files: Record<string, Uint8Array> = {
    'assets/minecraft/items/made_up_pick.json': json({
      model: { type: 'minecraft:model', model: 'minecraft:item/made_up_pick' },
    }),
    'assets/minecraft/models/item/made_up_pick.json': json({
      parent: 'minecraft:item/made_up_base',
    }),
    'assets/minecraft/models/item/made_up_base.json': json({
      textures: { layer0: 'minecraft:item/made_up_pick' },
    }),
    'assets/minecraft/textures/item/made_up_pick.png': PICTURE,
  };
  const readAsset = vi.fn(async (path: string) => files[path] ?? null);
  return { readAsset };
}

const lang = {
  'item.minecraft.made_up_pick': 'Made-up Pick',
  'enchantment.minecraft.fortune': 'Fortune',
  'enchantment.level.3': 'III',
};

describe('an item slot (B608)', () => {
  it('draws the picture found as the hotbar finds one, with the count in the corner', async () => {
    const assets = fakeAssets();
    render(
      <ItemSlot
        item={{ id: 'minecraft:made_up_pick', count: 3 }}
        pictures={{ vanillaAssets: assets, folders }}
        lang={lang}
        testId="slot"
      />,
    );
    const slot = screen.getByTestId('slot');
    expect(slot.getAttribute('aria-label')).toBe('Made-up Pick, 3');
    expect(screen.getByTestId('live-view-slot-count').textContent).toBe('3');
    await waitFor(() => expect(slot.querySelector('img')).not.toBeNull());
    expect(slot.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('shows the item’s name when there is no picture, and no count for one', () => {
    render(<ItemSlot item={{ id: 'demo:ruby', count: 1 }} testId="slot" />);
    const slot = screen.getByTestId('slot');
    expect(slot.textContent).toBe('Ruby');
    expect(slot.querySelector('img')).toBeNull();
    expect(screen.queryByTestId('live-view-slot-count')).toBeNull();
  });

  it('shows the tooltip lines on focus, and hides them with Escape', async () => {
    const user = userEvent.setup();
    render(
      <ItemSlot
        item={{
          id: 'minecraft:made_up_pick',
          count: 1,
          enchantments: { 'minecraft:fortune': 3 },
          damage: 0.5,
        }}
        lang={lang}
        extraLines={[{ text: 'From the table', tone: 'lore' }]}
        testId="slot"
      />,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    const tooltip = screen.getByRole('tooltip');
    const lines = [...tooltip.children].map((line) => [
      line.textContent,
      line.getAttribute('data-tone'),
    ]);
    expect(lines).toEqual([
      ['Made-up Pick', 'name'],
      ['Fortune III', 'enchantment'],
      ['Durability left: 50%', 'note'],
      ['From the table', 'lore'],
    ]);
    expect(screen.getByTestId('slot').getAttribute('aria-describedby')).toBe(tooltip.id);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('draws an empty slot', () => {
    render(<ItemSlot item={null} testId="slot" />);
    expect(screen.getByTestId('slot').getAttribute('aria-label')).toBe('Empty slot');
  });

  it('words names and levels from en_us, or from the id', () => {
    expect(itemName('minecraft:made_up_pick', lang)).toBe('Made-up Pick');
    expect(itemName('demo:blue_ruby_block', null)).toBe('Blue Ruby Block');
    expect(enchantmentLine('minecraft:fortune', 3, lang)).toBe('Fortune III');
    expect(enchantmentLine('minecraft:silk_touch', 1, null, 1)).toBe('Silk Touch');
    expect(enchantmentLine('minecraft:unbreaking', 1, null)).toBe('Unbreaking I');
    expect(romanNumeral(14)).toBe('XIV');
    expect(romanNumeral(0)).toBe('0');
    expect(
      tooltipLinesOf({ id: 'demo:x', count: 1, enchantments: { 'demo:curse': 1 } }, null, {
        curses: new Set(['demo:curse']),
      })[1],
    ).toEqual({ text: 'Curse I', tone: 'curse' });
  });

  it('finds the model an item definition shows, plain or in its cases', () => {
    expect(definitionModel({ model: { type: 'minecraft:model', model: 'a:item/x' } })).toBe(
      'a:item/x',
    );
    expect(
      definitionModel({
        model: {
          type: 'minecraft:select',
          cases: [{ when: 'x', model: { type: 'minecraft:model', model: 'a:item/y' } }],
          fallback: { type: 'minecraft:model', model: 'a:item/z' },
        },
      }),
    ).toBe('a:item/z');
    expect(definitionModel(undefined)).toBeUndefined();
  });
});

function SeedHarness(props: { onSeed(seed: string): void }) {
  const [seed, setSeed] = useState('1');
  return (
    <SeedBox
      seed={seed}
      random={() => 0.25}
      onSeed={(next) => {
        setSeed(next);
        props.onSeed(next);
      }}
    />
  );
}

describe('the seed box (B608)', () => {
  it('keeps a typed seed on Enter, rolls a new one, and puts back the old one on Escape', async () => {
    const user = userEvent.setup();
    const onSeed = vi.fn();
    render(<SeedHarness onSeed={onSeed} />);
    const box = screen.getByLabelText('Seed') as HTMLInputElement;
    expect(box.value).toBe('1');
    await user.clear(box);
    await user.type(box, 'ruby{Enter}');
    expect(onSeed).toHaveBeenLastCalledWith('ruby');
    await user.click(screen.getByRole('button', { name: 'Roll again' }));
    expect(onSeed).toHaveBeenLastCalledWith('250000000');
    expect(box.value).toBe('250000000');
    await user.type(box, '9{Escape}');
    expect(box.value).toBe('250000000');
    expect(newSeed(() => 0)).toBe('0');
  });
});
