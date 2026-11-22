/**
 * The catalogue matches the rule book format (B363's `rules.mcdoc`) id for id, and every entry
 * is complete: words, a sentence whose blanks are its slots, Very easy visibility, and for
 * triggers the subject kinds, actors and where the event goes (ADR 0082 D4, D5).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_IDS,
  type CatalogueEntry,
  CONDITIONS,
  PLACES,
  STEPS,
  TRIGGERS,
  VALUES,
  WHO,
} from '../src/catalogue';

const MCDOC = readFileSync(
  new URL('../../../schemas/mcdoc/msm/rules.mcdoc', import.meta.url),
  'utf8',
);

/** The string values of `enum(string) <name> { ... }` in `rules.mcdoc`. */
function enumValues(name: string): string[] {
  const match = new RegExp(`enum\\(string\\) ${name} \\{([\\s\\S]*?)\\n\\}`).exec(MCDOC);
  if (match === null) throw new Error(`enum ${name} not found`);
  return [...(match[1] ?? '').matchAll(/= "([^"]+)"/g)].map((value) => value[1] ?? '');
}

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('the catalogue', () => {
  it('has exactly the format ids of rules.mcdoc', () => {
    expect(sorted(CATALOGUE_IDS.triggers)).toEqual(sorted(enumValues('Trigger')));
    expect(sorted(CATALOGUE_IDS.steps)).toEqual(sorted(enumValues('StepKind')));
    expect(sorted(STEPS.filter((step) => !step.logic).map((step) => step.id))).toEqual(
      sorted(enumValues('PlainStepKind')),
    );
    expect(sorted(STEPS.filter((step) => step.logic).map((step) => step.id))).toEqual(
      sorted(enumValues('LogicStepKind')),
    );
    expect(sorted(CATALOGUE_IDS.conditions)).toEqual(sorted(enumValues('ConditionKind')));
    expect(sorted(CATALOGUE_IDS.values)).toEqual(sorted(enumValues('ValueKind')));
    expect(sorted(CATALOGUE_IDS.places)).toEqual(
      sorted([...enumValues('PlaceName'), 'player_looking', 'offset']),
    );
    expect(sorted(CATALOGUE_IDS.who)).toEqual(sorted([...enumValues('WhoName'), 'players_nearby']));
  });

  it('counts 62 triggers, 47 steps, 21 conditions, 14 values and 7 places', () => {
    expect([
      TRIGGERS.length,
      STEPS.length,
      CONDITIONS.length,
      VALUES.length,
      PLACES.length,
    ]).toEqual([62, 47, 21, 14, 7]);
  });

  const all: [string, readonly CatalogueEntry[]][] = [
    ['triggers', TRIGGERS],
    ['steps', STEPS],
    ['conditions', CONDITIONS],
    ['values', VALUES],
    ['places', PLACES],
    ['who', WHO],
  ];

  for (const [section, entries] of all) {
    it(`gives every ${section} entry words, a unique id and a sentence of its slots`, () => {
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(entry.label.length, entry.id).toBeGreaterThan(0);
        expect(entry.label, entry.id).not.toMatch(/[a-z]+_[a-z]+/);
        const blanks = [...entry.sentence.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
        const slots = entry.slots.map((slot) => slot.name);
        for (const blank of blanks) expect(slots, `${entry.id} {${blank}}`).toContain(blank);
      }
    });
  }

  it('hides run a command and offsets in Very easy mode only', () => {
    const hidden = all.flatMap(([, entries]) =>
      entries.filter((entry) => !entry.veryEasy).map((entry) => entry.id),
    );
    expect(hidden).toEqual(['run_command', 'offset']);
  });

  it('says where each definition trigger puts its event, and which script event the others use', () => {
    // The key and vehicle triggers have both: plain rules go into the definition's event, the
    // others listen to the Script API 1.5 event (B424); a held key has no such event.
    const both = TRIGGERS.filter(
      (trigger) => trigger.definition !== undefined && trigger.scriptEvent !== undefined,
    ).map((trigger) => [trigger.id, trigger.scriptEvent]);
    expect(Object.fromEntries(both)).toEqual({
      command_used: 'command',
      key_pressed: 'key.pressed',
      key_released: 'key.released',
      vehicle_mounted: 'vehicle.mounted',
      vehicle_dismounted: 'vehicle.dismounted',
      vehicle_fired: 'vehicle.fired',
      vehicle_destroyed: 'vehicle.destroyed',
      vehicle_every: 'player.tick',
    });
    for (const trigger of TRIGGERS) {
      const definition = trigger.definition !== undefined;
      expect(definition || trigger.scriptEvent !== undefined, trigger.id).toBe(true);
      expect(trigger.subjectKinds.length > 0, trigger.id).toBe(definition);
      // The `any_` triggers and the items and advancements of ADR 0111 D3 may name a subject.
      expect(trigger.subjectOptional, trigger.id).toBe(
        trigger.id.startsWith('any_') ||
          ['player_crafted', 'player_picked_up', 'player_ate', 'player_advancement'].includes(
            trigger.id,
          ),
      );
      for (const target of Object.keys(trigger.actionTargets)) {
        expect(trigger.actors, `${trigger.id} ${target}`).toContain(target);
      }
      for (const label of Object.keys(trigger.actorLabels)) {
        expect(trigger.actors, `${trigger.id} ${label}`).toContain(label);
      }
    }
  });

  it('marks the cancellable script events of ADR 0082 D5', () => {
    expect(TRIGGERS.filter((trigger) => trigger.cancellable).map((trigger) => trigger.id)).toEqual([
      'player_chatted',
      'explosion',
      'any_block_used',
      'any_block_broken',
      'any_block_placed',
      'any_item_used',
      'any_mob_hurt',
      'any_mob_used',
    ]);
  });

  it('maps every (A) step of ADR 0082 D5 to a format action', () => {
    expect(
      Object.fromEntries(
        STEPS.filter((step) => step.action !== undefined).map((step) => [step.id, step.action]),
      ),
    ).toEqual({
      give_item: 'give_item',
      heal: 'heal',
      hurt: 'damage',
      launch: 'launch',
      give_effect: 'apply_effect',
      place_block: 'set_block_state',
      run_function: 'run_function',
      light_portal: 'light_portal',
      play_sound: 'play_sound',
      spawn_particles: 'spawn_particle',
      play_animation: 'play_animation',
      show_hud: 'show_hud',
      hide_hud: 'hide_hud',
      set_hud: 'set_hud',
      explode: 'explode',
    });
  });

  it('limits the placing and explosion stops and "caused by" to their triggers (B458)', () => {
    const limited = [...STEPS, ...CONDITIONS].flatMap((entry) =>
      entry.triggers === undefined ? [] : [[entry.id, entry.triggers]],
    );
    expect(Object.fromEntries(limited)).toEqual({
      stop_placing: ['any_block_placed'],
      stop_explosion: ['explosion'],
      keep_blocks_safe: ['explosion'],
      caused_by: ['explosion'],
    });
    const ids = new Set(TRIGGERS.map((trigger) => trigger.id));
    for (const [, triggers] of limited) for (const id of triggers ?? []) expect(ids).toContain(id);
    // What was typed for a command's argument reads only on the command's own rules (ADR 0111 D1).
    expect(
      Object.fromEntries(
        VALUES.flatMap((value) =>
          value.triggers === undefined ? [] : [[value.id, value.triggers]],
        ),
      ),
    ).toEqual({ command_argument: ['command_used'] });
    expect(VALUES.filter((value) => value.words === true).map((value) => value.id)).toEqual([
      'facing',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TRIGGERS)).toBe(true);
    expect(Object.isFrozen(TRIGGERS[0])).toBe(true);
    expect(Object.isFrozen(STEPS[0]?.slots)).toBe(true);
  });
});
