/**
 * The four batch 1 games the round scripts' tests play (B728), hand-written as the types'
 * starters will make them (B733), and their lowered files with vanilla's bed tag and states
 * standing in for the user's jar (Try it reads them there).
 */
import type { Element, Json, OutputFile, Target } from '@msm/plugin-api';
import { gamesKinds } from '@msm/plugin-games';

export const element = (kind: string, id: string, data: Json): Element =>
  ({
    formatVersion: 1,
    id,
    kind,
    data,
    meta: { createdAt: '2026-11-25T00:00:00.000Z' },
  }) as Element;

const round = (win: Json): Json => ({
  kind: 'rounds',
  start: 'command',
  countdown: 0,
  win,
  after: 'stay',
});

export const LIFESTEAL = [
  element('msm:game', 'demo:lifesteal', {
    type: 'lifesteal',
    name: 'Lifesteal',
    players: { min: 2, max: 16 },
    round: round([{ type: 'last_standing', by: 'players' }]),
    mechanics: [
      {
        type: 'hearts',
        start: 10,
        most: 20,
        per_kill: 1,
        at_zero: 'spectate',
        heart_item: { item: 'minecraft:red_dye', name: 'Heart' },
        withdraw: true,
      },
    ],
  }),
];

export const MANHUNT = [
  element('msm:game', 'demo:manhunt', {
    type: 'manhunt',
    name: 'Manhunt',
    players: { min: 2, max: 10 },
    round: round([{ type: 'role_dies', role: 'runner', winner: 'hunter' }]),
    roles: [
      { id: 'runner', name: 'Runner', count: 1 },
      { id: 'hunter', name: 'Hunters', count: 'rest' },
    ],
    mechanics: [
      {
        type: 'tracker',
        holder: 'hunter',
        target: 'runner',
        every_seconds: 1,
        other_dimension: 'last_place',
      },
      { type: 'head_start', held: 'hunter', seconds: 10, blind: false },
    ],
  }),
];

export const BED_WARS = [
  element('msm:team', 'demo:red', { name: 'Red', colour: 'red' }),
  element('msm:team', 'demo:blue', { name: 'Blue', colour: 'blue' }),
  element('msm:game', 'demo:beds', {
    type: 'bed_wars',
    name: 'Bed battle',
    players: { min: 2, max: 8 },
    round: round([{ type: 'last_standing', by: 'teams' }]),
    lobby: { spawn: [0, 70, 0], teams: 'auto' },
    mechanics: [
      {
        type: 'team_base',
        bases: [
          { team: 'demo:red', bed: [12, 64, 0], spawn: [12, 65, 3] },
          { team: 'demo:blue', bed: [-12, 64, 0], spawn: [-12, 65, 3] },
        ],
        respawn_seconds: 3,
      },
      { type: 'elimination', lives: 3, out: 'spectate', announce: true },
    ],
  }),
];

export const SPLEEF = [
  element('msm:area', 'demo:floor', {
    name: 'Floor',
    dimension: 'minecraft:overworld',
    from: [0, 64, 0],
    to: [15, 64, 15],
  }),
  element('msm:game', 'demo:spleef', {
    type: 'spleef',
    name: 'Spleef',
    players: { min: 2, max: 16 },
    round: round([{ type: 'last_standing', by: 'players' }]),
    mechanics: [
      {
        type: 'floor',
        area: 'demo:floor',
        block: 'minecraft:snow_block',
        tool: 'minecraft:diamond_shovel',
        drops: false,
        from: [0, 64, 0],
        to: [15, 64, 15],
      },
      { type: 'fall_out', below_y: 60, action: 'out' },
    ],
  }),
];

/** Vanilla's bed tag and states, standing in for the user's jar (Try it reads them there). */
const BEDS = ['minecraft:red_bed', 'minecraft:blue_bed'];
export const BED_STATES = new Map(
  BEDS.map((id) => [
    id,
    JSON.stringify({ variants: { 'part=foot': { model: 'b' }, 'part=head': { model: 'b' } } }),
  ]),
);

export async function lowered(elements: readonly Element[], target: Target) {
  const byPath = new Map<string, OutputFile[]>();
  for (const one of elements) {
    const kind = gamesKinds.find((entry) => entry.id === one.kind);
    if (kind === undefined) throw new Error(`no kind ${one.kind}`);
    for (const file of await kind.lower(one, target)) {
      byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
    }
  }
  const files = new Map<string, string | Uint8Array>();
  for (const [path, list] of byPath) {
    const [first] = list;
    if (first === undefined) continue;
    if (first.contents instanceof Uint8Array) files.set(path, first.contents);
    else if (first.merge === 'tag') {
      const values = list.flatMap((file) => (file.contents as { values: string[] }).values);
      files.set(path, JSON.stringify({ values }));
    } else files.set(path, JSON.stringify(first.contents));
  }
  files.set('data/minecraft/tags/block/beds.json', JSON.stringify({ values: BEDS }));
  return files;
}
