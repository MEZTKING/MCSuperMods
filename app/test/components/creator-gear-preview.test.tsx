// @vitest-environment happy-dom
import type { Project } from '@msm/core';
import type { ContentBundle, ProjectStarter } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorDialog } from '../../src/renderer/src/components/creator/CreatorDialog';
import type { PickImage } from '../../src/renderer/src/components/creator/CreatorImageField';
import {
  consumeEffectRows,
  enchantmentCards,
  enchantmentSummary,
  levelValue,
  paintingCards,
  pictureFit,
  romanLevel,
} from '../../src/renderer/src/components/creator/creator-cards';
import {
  bundleArmour,
  bundleStats,
  CREATOR_TABS,
  firstTab,
} from '../../src/renderer/src/components/creator/creator-model';
import { paintingTexturePath } from '../../src/renderer/src/preview/bundle-source';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { aiSession } from './ai-fixtures';
import { makePngHeader } from './preview/png';

afterEach(cleanup);

const FOLDERS = { textures: 'textures', models: 'models', blockstates: 'blockstates' } as never;

function starter(session: ProjectSession, id: string): ProjectStarter {
  const found = session.library.starters.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No starter ${id}`);
  return found;
}

async function build(
  session: ProjectSession,
  id: string,
  values: Record<string, unknown> = {},
): Promise<ContentBundle> {
  const flow = starter(session, id);
  const defaults = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return flow.build({
    namespace: 'demo',
    projectName: 'Demo',
    target: session.target,
    values: { ...defaults, ...values } as never,
  });
}

function renderDialog(session: ProjectSession, pickImage?: PickImage) {
  render(
    <CreatorDialog
      session={session}
      project={session.snapshot.project as Project}
      namespaces={['demo']}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      newSetId={() => 'set-1'}
      webgl={false}
      debounceMs={5}
      {...(pickImage === undefined ? {} : { pickImage })}
    />,
  );
  return userEvent.setup();
}

describe('Creator card model', () => {
  it('evaluates level-based values and Roman levels', () => {
    expect(levelValue(2, 3)).toBe(2);
    expect(levelValue({ type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 }, 3)).toBe(
      2,
    );
    expect(levelValue({ type: 'minecraft:levels_squared', added: 1 }, 3)).toBe(10);
    expect(
      levelValue(
        {
          type: 'minecraft:clamped',
          value: { type: 'linear', base: 1, per_level_above_first: 5 },
          min: 0,
          max: 4,
        },
        2,
      ),
    ).toBe(4);
    expect(levelValue({ type: 'minecraft:fraction', numerator: 1, denominator: 4 }, 1)).toBe(0.25);
    expect(levelValue({ type: 'minecraft:lookup', values: [3, 5], fallback: 9 }, 3)).toBe(9);
    expect(levelValue({ type: 'minecraft:unknown' }, 1)).toBeUndefined();
    expect([1, 3, 10, 11].map(romanLevel)).toEqual(['I', 'III', 'X', '11']);
  });

  it('builds an enchantment card with the in-game name, rarity and a per-level table', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'enchantment', { rarity: 'rare', max_level: 3 });
    const [card] = enchantmentCards(bundle);
    expect(card?.name).toBe('Ruby Edge');
    expect(card?.rarity).toBe('Rare');
    expect(card?.weight).toBe(2);
    expect(card?.anvilCost).toBe(4);
    expect(card?.columns).toEqual(['Extra damage']);
    expect(card?.levels.map((row) => [row.roman, row.cost, ...row.values])).toEqual([
      ['I', '5 to 25', '+1'],
      ['II', '13 to 33', '+1.5'],
      ['III', '21 to 41', '+2'],
    ]);
    const summary = enchantmentSummary(card as never).join(' ');
    expect(summary).toContain('#minecraft:swords');
    expect(summary).toContain('the main hand');
    expect(summary).toContain('Levels I to III');
  });

  it('lists a mob effect enchantment as duration and level columns', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'enchantment', { effect: 'mob_effect' });
    const card = enchantmentCards(bundle)[0];
    expect(card?.columns).toEqual(['Slowness (seconds)', 'Slowness level']);
    expect(card?.levels[2]?.values).toEqual(['3 to 7', '1 to 3']);
  });

  it('builds a painting card and checks the picture proportions', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'painting', { size: '4x2' });
    const [card] = paintingCards(bundle);
    expect(card).toMatchObject({
      id: 'demo:ruby_sunset',
      title: 'Ruby Sunset',
      author: 'You',
      width: 4,
      height: 2,
      assetId: 'demo:ruby_sunset',
    });
    expect(paintingTexturePath('demo:ruby_sunset', FOLDERS)).toEqual({
      namespace: 'demo',
      path: 'textures/painting/ruby_sunset.png',
    });
    expect(pictureFit({ width: 64, height: 32 }, { width: 4, height: 2 })).toEqual({
      matches: true,
      text: 'The picture is 64 by 32 pixels: 16 pixels per block.',
    });
    expect(pictureFit({ width: 32, height: 32 }, { width: 4, height: 2 }).matches).toBe(false);
    expect(firstTab(bundle)).toBe('card');
    expect(CREATOR_TABS.map((tab) => tab.id)).toContain('card');
  });

  it('puts a drink, a charm and a totem in words with their effects', async () => {
    const { session } = await aiSession();
    const drink = bundleStats(await build(session, 'consumable', { cooldown_seconds: 2 }));
    const tonic = drink.find((card) => card.id === 'demo:ruby_tonic');
    expect(tonic?.lines).toContain('Takes 1.6 seconds to drink.');
    expect(tonic?.lines).toContain('Leaves glass bottle behind.');
    expect(tonic?.lines).toContain('Then waits 2 seconds before it can be used again.');
    expect(tonic?.effects).toEqual([
      { name: 'Speed', level: 'I', seconds: 60, chance: null, target: null },
      { name: 'Regeneration', level: 'I', seconds: 10, chance: null, target: null },
    ]);

    const charm = bundleStats(
      await build(session, 'consumable', { kind: 'charm', cooldown_seconds: 5 }),
    ).find((card) => card.id === 'demo:ruby_tonic');
    expect(charm?.lines).toContain('Using it gives the effects below; it is not used up.');
    expect(charm?.lines).toContain('Then waits 5 seconds before it can be used again.');
    expect(charm?.effects?.map((row) => row.name)).toEqual(['Speed', 'Regeneration']);

    const totem = bundleStats(await build(session, 'totem')).find(
      (card) => card.id === 'demo:ruby_totem',
    );
    expect(totem?.lines.join(' ')).toContain('saves its holder from death');
    expect(totem?.effects?.[0]).toMatchObject({ name: 'Regeneration', level: 'II', seconds: 45 });
    expect(consumeEffectRows([{ effect: 'minecraft:speed', seconds: 5, chance: 0.5 }])[0]).toEqual({
      name: 'Speed',
      level: 'I',
      seconds: 5,
      chance: 50,
      target: null,
    });
  });

  it('puts weapon stats in words: damage, speed, durability, ranged factors, shields', async () => {
    const { session } = await aiSession();
    const stat = async (values: Record<string, unknown>) =>
      bundleStats(await build(session, 'weapon', values)).find(
        (card) => card.id === 'demo:ruby_spear',
      )?.lines ?? [];
    const spear = await stat({});
    expect(spear).toContain('A spear of the vanilla iron tier.');
    expect(spear).toContain('Attack damage and speed of a vanilla iron spear.');
    expect(spear).toContain('Breaks after 500 uses.');
    const custom = await stat({ custom_damage: true, attack_damage: 7, attack_speed: -3 });
    expect(custom).toContain('Attack damage set to 7.');
    expect(custom).toContain('Attack speed set to -3.');
    const bow = await stat({ weapon_type: 'bow' });
    expect(bow).toContain('Draws 1.25 times as fast as a vanilla bow.');
    expect(bow).toContain('Arrows fly 1.1 times as fast.');
    expect(bow).toContain('Arrows deal 1.2 times the damage.');
    const shield = await stat({ weapon_type: 'shield' });
    expect(shield).toContain('Starts blocking 0.25 seconds after it is raised.');
    expect(shield).toContain('Blocks 100 per cent of the damage from the front.');
  });

  it('shows horse and wolf armour layers of a Gear set', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'gear-set', {
      pieces: ['horse_armor', 'wolf_armor'],
    });
    const info = bundleArmour(bundle);
    expect(info?.pieces).toEqual([]);
    expect(info?.bodyLayers.map((entry) => [entry.layer, entry.label])).toEqual([
      ['horse_body', 'Horse armour'],
      ['wolf_body', 'Wolf armour'],
    ]);
    const stats = bundleStats(bundle);
    expect(stats.find((card) => card.id === 'demo:ruby_horse_armor')?.lines[0]).toMatch(
      /^A horse armour/,
    );
  });
});

describe('Creator previews of the 0.8.0 flows', () => {
  it('opens a Painting on its card, hangs the picture on a wall and picks a PNG', async () => {
    const { session } = await aiSession();
    const picked = makePngHeader(64, 32);
    const pickImage = vi.fn<PickImage>(async () => [{ name: 'sunset.png', data: picked }]);
    const user = renderDialog(session, pickImage);
    await user.click(screen.getByTestId('creator-flow-painting'));
    const card = await screen.findByTestId('creator-painting-demo:ruby_sunset');
    expect(screen.getByTestId('creator-tab-card').getAttribute('aria-selected')).toBe('true');
    expect(within(card).getByRole('img').getAttribute('aria-label')).toBe(
      'Ruby Sunset by You, 2 by 1 blocks, on a wall',
    );
    const picture = await within(card).findByTestId('creator-painting-picture');
    expect(picture.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect((picture as HTMLImageElement).style.width).toBe('80px');
    expect(screen.getByTestId('param-image-empty').textContent).toBe('No image');

    await user.click(screen.getByTestId('param-image'));
    expect(pickImage).toHaveBeenCalledWith('Choose picture');
    expect(await screen.findByTestId('param-image-thumbnail')).toBeTruthy();
    expect(screen.getByTestId('param-image-summary').textContent).toBe(
      'PNG image, 64 by 32 pixels',
    );
    await waitFor(() =>
      expect(screen.getByTestId('creator-painting-fit').textContent).toBe(
        'The picture is 64 by 32 pixels: 32 pixels per block.',
      ),
    );

    await user.click(screen.getByTestId('param-image-clear'));
    expect(screen.getByTestId('param-image-empty')).toBeTruthy();
  });

  it('refuses a file that is not a PNG and keeps the previous value', async () => {
    const { session } = await aiSession();
    const pickImage = vi.fn<PickImage>(async () => [
      { name: 'notes.txt', data: new TextEncoder().encode('hello') },
    ]);
    const user = renderDialog(session, pickImage);
    await user.click(screen.getByTestId('creator-flow-painting'));
    await screen.findByTestId('creator-tab-card');
    await user.click(screen.getByTestId('param-image'));
    expect((await screen.findByTestId('param-image-error')).textContent).toBe(
      'notes.txt: Choose a PNG image.',
    );
    expect(screen.getByTestId('param-image-empty')).toBeTruthy();
    expect(screen.getByTestId('param-image').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the enchantment card with its level table', async () => {
    const { session } = await aiSession();
    const user = renderDialog(session);
    await user.click(screen.getByTestId('creator-flow-enchantment'));
    const card = await screen.findByTestId('creator-enchantment-demo:ruby_edge');
    expect(within(card).getByTestId('creator-enchantment-tooltip').textContent).toContain(
      'Ruby Edge III',
    );
    const table = within(card).getByTestId('creator-enchantment-levels');
    expect(within(table).getByRole('columnheader', { name: 'Extra damage' })).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(card.textContent).toContain('Uncommon: offered with weight 5.');
  });

  it('lists a consumable’s effects in the Stats tab', async () => {
    const { session } = await aiSession();
    const user = renderDialog(session);
    await user.click(screen.getByTestId('creator-flow-consumable'));
    await screen.findByTestId('creator-tab-stats');
    await user.click(screen.getByTestId('creator-tab-stats'));
    const card = screen.getByTestId('creator-stats-demo:ruby_tonic');
    const table = within(card).getByRole('table', { name: 'Effects of Ruby Tonic' });
    expect(within(table).getByRole('rowheader', { name: 'Speed' })).toBeTruthy();
    expect(table.textContent).toContain('60 seconds');
  });

  it('shows weapon stats and, for horse armour, the layer in the Armour tab', async () => {
    const { session } = await aiSession();
    const user = renderDialog(session);
    await user.click(screen.getByTestId('creator-flow-weapon'));
    await screen.findByTestId('creator-tab-stats');
    await user.click(screen.getByTestId('creator-tab-stats'));
    expect(screen.getByTestId('creator-stats-demo:ruby_spear').textContent).toContain(
      'Breaks after 500 uses.',
    );
    await user.click(screen.getByTestId('creator-back'));
    await user.click(screen.getByTestId('creator-flow-gear-set'));
    await screen.findByTestId('creator-tab-armour');
    await user.click(screen.getByTestId('param-pieces-horse_armor'));
    await user.click(screen.getByTestId('creator-tab-armour'));
    expect((await screen.findByTestId('creator-armour-horse_body')).getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(screen.getByTestId('creator-armour-layer-1')).toBeTruthy();
  });
});
