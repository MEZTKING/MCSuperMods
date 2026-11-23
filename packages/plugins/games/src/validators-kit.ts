/**
 * `games.*` project validators of `msm:kit` (ADR 0132 D3; B724). Pure. Items and effects the
 * target does not have are the schema's (`schema.unknown-id`), not repeated here. Codes:
 *
 * - `games.kit.bad-slot` (error): an item's slot that is not one of a player's (`hotbar.0` to
 *   `hotbar.8`, `inventory.0` to `inventory.26`, `container.0` to `container.35`, `armor.head`,
 *   `armor.chest`, `armor.legs`, `armor.feet`, `weapon`, `weapon.mainhand`, `weapon.offhand`,
 *   `enderchest.0` to `enderchest.26`).
 * - `games.kit.slot-twice` (warning): two things put in the same slot (an item's slot and the
 *   armour or off hand count); the later one replaces the earlier.
 * - `games.kit.empty` (warning): a kit with no items, armour, off hand or effects.
 */
import type { Element, Json, Problem, ProjectValidator } from '@msm/plugin-api';
import { kitKind } from './kinds/kit';
import { ARMOUR_SLOTS, OFF_HAND_SLOT } from './lowering/kit';
import { dataOf, isRecord } from './lowering/shared-functions';

/** Every code the kit validator reports. */
export const KIT_PROBLEM_CODES = Object.freeze([
  'games.kit.bad-slot',
  'games.kit.slot-twice',
  'games.kit.empty',
] as const);

type KitCode = (typeof KIT_PROBLEM_CODES)[number];

const range = (n: number, from: number, to: number): boolean =>
  Number.isInteger(n) && n >= from && n <= to;

/**
 * The one name of a player's slot (`hotbar.3` and `container.3` are the same slot), or
 * `undefined` when it is not a slot of a player.
 */
export function playerSlot(slot: string): string | undefined {
  const match = /^([a-z]+)(?:\.([a-z0-9]+))?$/.exec(slot);
  if (match === null) return undefined;
  const [, group, rest] = match as unknown as [string, string, string | undefined];
  const n = rest === undefined || !/^[0-9]+$/.test(rest) ? Number.NaN : Number(rest);
  switch (group) {
    case 'hotbar':
      return range(n, 0, 8) ? `container.${n}` : undefined;
    case 'inventory':
      return range(n, 0, 26) ? `container.${n + 9}` : undefined;
    case 'container':
      return range(n, 0, 35) ? `container.${n}` : undefined;
    case 'enderchest':
      return range(n, 0, 26) ? slot : undefined;
    case 'armor':
      return rest !== undefined && (Object.values(ARMOUR_SLOTS) as string[]).includes(slot)
        ? slot
        : undefined;
    case 'weapon':
      if (rest === undefined || rest === 'mainhand') return 'weapon.mainhand';
      return rest === 'offhand' ? OFF_HAND_SLOT : undefined;
    default:
      return undefined;
  }
}

function checkKit(kit: Element): Problem[] {
  const problems: Problem[] = [];
  const report = (
    severity: Problem['severity'],
    code: KitCode,
    path: string | undefined,
    message: string,
  ): void => {
    problems.push({
      severity,
      code,
      elementId: kit.id,
      ...(path === undefined ? {} : { path }),
      message,
    });
  };
  const data = dataOf(kit.data);
  const used = new Map<string, string>();
  const use = (slot: string, path: string, what: string): void => {
    const first = used.get(slot);
    if (first !== undefined) {
      report(
        'warning',
        'games.kit.slot-twice',
        path,
        `${what} goes into ${slot}, where ${first} already goes; only the later one is kept.`,
      );
    } else used.set(slot, what);
  };
  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((stack: Json, i) => {
    if (!isRecord(stack) || typeof stack.slot !== 'string') return;
    const slot = playerSlot(stack.slot);
    if (slot === undefined) {
      report(
        'error',
        'games.kit.bad-slot',
        `/items/${i}/slot`,
        `${JSON.stringify(stack.slot)} is not a slot of a player's inventory (such as hotbar.0, inventory.5 or armor.head).`,
      );
    } else use(slot, `/items/${i}/slot`, `Item ${i + 1}`);
  });
  const armour = isRecord(data.armour) ? data.armour : {};
  for (const [piece, slot] of Object.entries(ARMOUR_SLOTS)) {
    if (isRecord(armour[piece])) use(slot, `/armour/${piece}`, `The ${piece} armour`);
  }
  if (isRecord(data.off_hand)) use(OFF_HAND_SLOT, '/off_hand', 'The off hand item');
  const effects = Array.isArray(data.effects) ? data.effects : [];
  if (items.length === 0 && used.size === 0 && effects.length === 0) {
    report(
      'warning',
      'games.kit.empty',
      undefined,
      'This kit gives nothing: add items, armour, an off hand item or effects.',
    );
  }
  return problems;
}

/** The kit validator. */
export const kitValidator: ProjectValidator = {
  id: 'msm.games.kit',
  kinds: [kitKind.id],
  validate: (input) =>
    input.elements.filter((element) => element.kind === kitKind.id).flatMap(checkKit),
};
