// @vitest-environment happy-dom

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type SituationChoice,
  SituationPicker,
  useSituationChoice,
} from '../../../../src/renderer/src/liveviews/frame/SituationPicker';
import {
  CUSTOM_SITUATION,
  PICKER_PRESETS,
  presetById,
  readFields,
  situationOf,
} from '../../../../src/renderer/src/liveviews/frame/situations';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
  readPrefs,
} from '../../../../src/renderer/src/liveviews/view-prefs';

afterEach(cleanup);

function Harness(props: { onChoose?(choice: SituationChoice): void; contexts?: string[] }) {
  const first = PICKER_PRESETS[0] as (typeof PICKER_PRESETS)[number];
  const [choice, setChoice] = useState<SituationChoice>({ preset: first.id, fields: first.fields });
  return (
    <SituationPicker
      choice={choice}
      {...(props.contexts === undefined ? {} : { contexts: props.contexts })}
      onChoose={(next) => {
        setChoice(next);
        props.onChoose?.(next);
      }}
    />
  );
}

const field = (key: string) => screen.getByTestId(`situation-field-${key}`) as HTMLInputElement;

describe('the situation picker (B608)', () => {
  it('asks “What happens to it?” with the presets in plain words', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'What happens to it?' })).toBeTruthy();
    const labels = screen.getAllByRole('radio').map((radio) => radio.textContent);
    expect(labels).toHaveLength(10);
    expect(labels).toContain('Mining a block with a Fortune III pickaxe');
    expect(labels).toContain('A mob killed by a player');
    expect(labels).toContain('Opening a chest');
  });

  it('fills the Advanced fields from the preset chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('situation-preset-mine_fortune'));
    await user.click(screen.getByTestId('situation-advanced'));
    expect(field('context').value).toBe('minecraft:block');
    expect(field('tool').value).toBe('minecraft:diamond_pickaxe');
    expect(field('toolEnchantments').value).toBe('minecraft:fortune 3');
    expect(field('block').value).toBe('minecraft:stone');
    expect(field('killer').value).toBe('');
    await user.click(screen.getByTestId('situation-preset-kill_looting'));
    expect(field('context').value).toBe('minecraft:entity');
    expect(field('killer').value).toBe('minecraft:player');
    expect(field('killerIsPlayer').checked).toBe(true);
    expect(field('weaponEnchantments').value).toBe('minecraft:looting 3');
    expect(field('tool').value).toBe('');
    await user.click(screen.getByTestId('situation-preset-block_exploded'));
    expect(field('explosion').checked).toBe(true);
    expect(field('explosionPower').value).toBe('4');
  });

  it('makes the situation the user’s own once a field changes, and a preset’s again when it matches', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    await user.click(screen.getByTestId('situation-advanced'));
    await user.type(field('luck'), '2');
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preset: CUSTOM_SITUATION,
        fields: expect.objectContaining({ luck: '2' }),
      }),
    );
    expect(screen.getByTestId('situation-custom')).toBeTruthy();
    expect(
      screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    await user.clear(field('luck'));
    expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'mine_hand' }));
  });

  it('works from the keyboard: arrows, Home and End choose, one stop in the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const radios = () => screen.getAllByRole('radio');
    expect(radios().filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toBe(radios()[0]);
    await user.keyboard('{ArrowDown}');
    expect(radios()[1]?.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radios()[1]);
    await user.keyboard('{End}');
    expect(radios().at(-1)?.getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{ArrowUp}');
    expect(radios().at(-1)?.getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{Home}');
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    // Tab leaves the group for Advanced, which opens with Enter.
    await user.tab();
    const advanced = screen.getByTestId('situation-advanced');
    expect(document.activeElement).toBe(advanced);
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard('{Enter}');
    expect(advanced.getAttribute('aria-expanded')).toBe('true');
    await user.tab();
    expect(document.activeElement).toBe(field('context'));
    expect(screen.getByLabelText('Tool')).toBe(field('tool'));
  });

  it('offers only the presets that fit the view’s contexts', () => {
    render(<Harness contexts={['minecraft:entity']} />);
    const ids = screen.getAllByRole('radio').map((radio) => radio.dataset.testid);
    expect(ids).toEqual([
      'situation-preset-kill_player',
      'situation-preset-kill_looting',
      'situation-preset-kill_mob',
      'situation-preset-mob_died',
    ]);
  });
});

describe('the situation a view uses (B608)', () => {
  it('turns the presets into @msm/sim situations, the thing shown in place of the sample', () => {
    const of = (id: string, subject = {}) =>
      situationOf((presetById(id) as (typeof PICKER_PRESETS)[number]).fields, subject, true);
    expect(of('mine_fortune', { block: 'demo:ruby_ore' })).toEqual({
      context: 'minecraft:block',
      tool: { id: 'minecraft:diamond_pickaxe', count: 1, enchantments: { 'minecraft:fortune': 3 } },
      block: { id: 'demo:ruby_ore' },
    });
    expect(of('mine_fortune')).toMatchObject({ block: { id: 'minecraft:stone' } });
    expect(of('kill_looting', { entity: 'demo:goblin' })).toEqual({
      context: 'minecraft:entity',
      thisEntity: { type: 'demo:goblin' },
      killer: {
        type: 'minecraft:player',
        player: true,
        weapon: {
          id: 'minecraft:diamond_sword',
          count: 1,
          enchantments: { 'minecraft:looting': 3 },
        },
      },
      directKiller: { type: 'minecraft:player' },
      damage: { type: 'minecraft:player_attack' },
    });
    expect(of('mob_died', { entity: 'demo:goblin' })).toEqual({
      context: 'minecraft:entity',
      thisEntity: { type: 'demo:goblin' },
      damage: { type: 'minecraft:fall' },
    });
    expect(of('chest', { entity: 'demo:goblin' })).toEqual({
      context: 'minecraft:chest',
      thisEntity: { type: 'minecraft:player' },
    });
    expect(of('block_exploded')).toMatchObject({ explosion: { power: 4, decays: true } });
    // The user's own block wins over the thing shown.
    const own = {
      ...(presetById('mine_hand') as (typeof PICKER_PRESETS)[number]).fields,
      block: 'dirt',
    };
    expect(situationOf(own, { block: 'demo:ruby_ore' }).block).toEqual({ id: 'minecraft:dirt' });
  });

  it('reads the Advanced fields: state, flags, weather, time, position and luck', () => {
    const fields = {
      ...(presetById('mob_died') as (typeof PICKER_PRESETS)[number]).fields,
      entity: 'zombie',
      entityFlags: 'is_on_fire, is_baby',
      block: 'wheat',
      blockState: 'age=7',
      weather: 'thunder',
      clock: 'minecraft:overworld',
      ticks: '6000',
      position: '1 64 -3',
      luck: '1.5',
      dimension: 'the_nether',
      biome: 'minecraft:plains',
    };
    expect(situationOf(fields)).toMatchObject({
      thisEntity: { type: 'minecraft:zombie', flags: { is_on_fire: true, is_baby: true } },
      block: { id: 'minecraft:wheat', state: { age: '7' } },
      weather: { raining: true, thundering: true },
      time: { clock: 'minecraft:overworld', ticks: 6000 },
      position: [1, 64, -3],
      luck: 1.5,
      dimension: 'minecraft:the_nether',
      biome: 'minecraft:plains',
    });
    expect(situationOf({ ...fields, weather: '', position: '1 2', luck: 'x' })).not.toHaveProperty(
      'weather',
    );
  });

  it('keeps the choice with the view preferences, never anything but checked fields', () => {
    const stored = readPrefs({
      seed: '7',
      situation: 'custom',
      situationFields: { luck: '2', explosion: 'yes' },
    });
    expect(stored.seed).toBe('7');
    expect(stored.situationFields?.luck).toBe('2');
    expect(stored.situationFields?.explosion).toBe(false);
    expect(readPrefs({ situationFields: [1] }).situationFields).toBeNull();
    expect(readFields(null)).toBeNull();
  });

  it('gives the view the stored choice and writes a new one to the preferences', () => {
    const onPreferences = vi.fn();
    const prefs: LiveViewPrefs = { ...DEFAULT_PREFS };
    const { result } = renderHook(() =>
      useSituationChoice(prefs, onPreferences, ['minecraft:entity'], { entity: 'demo:goblin' }),
    );
    expect(result.current.preset).toBe('kill_player');
    expect(result.current.situation.thisEntity).toEqual({ type: 'demo:goblin' });
    const dies = presetById('mob_died') as (typeof PICKER_PRESETS)[number];
    act(() => result.current.choose({ preset: 'mob_died', fields: dies.fields }));
    expect(onPreferences).toHaveBeenLastCalledWith({
      situation: 'mob_died',
      situationFields: null,
    });
    // The choice holds even where the host keeps no preferences (a bundle without a folder).
    expect(result.current.preset).toBe('mob_died');
    act(() =>
      result.current.choose({ preset: CUSTOM_SITUATION, fields: { ...dies.fields, luck: '3' } }),
    );
    expect(onPreferences).toHaveBeenLastCalledWith({
      situation: CUSTOM_SITUATION,
      situationFields: expect.objectContaining({ luck: '3' }),
    });
    expect(result.current.situation.luck).toBe(3);
  });
});
