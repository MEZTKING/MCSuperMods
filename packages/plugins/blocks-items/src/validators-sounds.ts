/**
 * `blocks-items.*` project validators of own block sounds, own set types and the rules for
 * vanilla blocks (ADR 0105 D1, D2, D4 and the amendment after B503). They read the block and
 * `msm:vanilla_block_rules` elements, the project's `minecraft:sounds` keys, the registry index
 * (vanilla sound events) and the target's block facts (`soundModel`, `soundTypes`,
 * `vanillaPairs`; a check that needs an absent fact is skipped):
 *
 * - `blocks-items.block-sound-unknown` (warning): a `block_sounds` event or a sound of an own
 *   set type that is neither a vanilla sound event nor a key of the project's `sounds.json`, so
 *   nothing plays there.
 * - `blocks-items.block-sounds-partial` (warning): on a target whose block sounds are data
 *   (`soundModel` `block_sound_set`), `block_sounds` that leave events out: the block's
 *   own entry holds only the events given, so the others are silent there instead of the
 *   `sound_type`'s.
 * - `blocks-items.block-sounds-range` (warning): on such a target, a `pitch` above 2 or a
 *   `volume` of 0, which the game's entry does not take; lowering writes the nearest it takes.
 * - `blocks-items.sound-type-unknown` (error): a `sound_type` that is neither one of the format's
 *   names (which the runtime maps on every target) nor one of the target's own `soundTypes`.
 * - `blocks-items.set-type-field-unused` (info): a setting of an own set type the block's type
 *   never uses (door sounds on a button, `plate_sensitivity` on a door, and so on).
 * - `blocks-items.vanilla-pair-override` (warning): a strip, flatten, till, wax or age rule for a
 *   block vanilla already pairs the same way (`vanillaPairs`): the rule replaces vanilla's (for
 *   `age`, vanilla's next stage). Vanilla's strip, flatten and till pairs can also be changed by a
 *   data pack's `block_transformer` files; the facts are vanilla's own.
 * - `blocks-items.vanilla-rule-duplicate` (warning): the same block given twice for one rule,
 *   in one file or in several: the last file (by namespace and path), and the last entry in it,
 *   wins. Every entry after the first is reported.
 * - `blocks-items.vanilla-rule-same-block` (warning): a rule whose block turns into itself.
 * - `blocks-items.vanilla-rule-project-block` (info): a rule for a block of this project, whose
 *   own component does the same (`msm:strippable`, `msm:flattenable`, `msm:tillable`,
 *   `msm:waxable`, `msm:weathering`, `msm:flammable`) and shows in its Studio.
 *
 * Unknown block ids in the rules are the schema's `schema.unknown-id` and are not repeated.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
  VanillaPairFacts,
} from '@msm/plugin-api';
import { BLOCK_KIND, VANILLA_BLOCK_RULES_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import {
  BLOCK_SOUNDS_FIELD,
  blockSoundsOf,
  FORMAT_SOUND_TYPES,
  missingSoundEvents,
  SOUND_SET_MAX_PITCH,
  usesSoundSets,
} from './lowering/sounds';

/** Every code these validators report. */
export const SOUND_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.block-sound-unknown',
  'blocks-items.block-sounds-partial',
  'blocks-items.block-sounds-range',
  'blocks-items.sound-type-unknown',
  'blocks-items.set-type-field-unused',
  'blocks-items.vanilla-pair-override',
  'blocks-items.vanilla-rule-duplicate',
  'blocks-items.vanilla-rule-same-block',
  'blocks-items.vanilla-rule-project-block',
]);

const SOUNDS_KIND = 'minecraft:sounds';
const SOUND_EVENT_REGISTRY = 'sound_event';
const WEIGHED_SOUND_EVENT_REGISTRY = 'weighed_sound_event';

/** The block types whose `set_type` may be an own set type, and the settings each uses. */
const SET_TYPE_USES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  door: ['sounds/open', 'sounds/close', 'can_open_by_hand', 'can_open_by_wind_charge'],
  trapdoor: ['sounds/open', 'sounds/close', 'can_open_by_hand', 'can_open_by_wind_charge'],
  button: ['sounds/press', 'sounds/release', 'arrows_press'],
  pressure_plate: ['sounds/press', 'sounds/release', 'plate_sensitivity'],
});
const SET_TYPE_SETTINGS: readonly string[] = Object.freeze([
  'can_open_by_hand',
  'can_open_by_wind_charge',
  'arrows_press',
  'plate_sensitivity',
]);
const SET_TYPE_SOUNDS: readonly string[] = Object.freeze(['open', 'close', 'press', 'release']);

/** The rules of `msm:vanilla_block_rules`, the field naming the block each becomes, and the component a project block uses instead. */
const RULES: readonly {
  rule: string;
  into: string;
  pairs: keyof VanillaPairFacts | undefined;
  component: string;
}[] = Object.freeze([
  { rule: 'strip', into: 'into', pairs: 'strip', component: 'msm:strippable' },
  { rule: 'flatten', into: 'into', pairs: 'flatten', component: 'msm:flattenable' },
  { rule: 'till', into: 'into', pairs: 'till', component: 'msm:tillable' },
  { rule: 'wax', into: 'into', pairs: 'wax', component: 'msm:waxable' },
  { rule: 'age', into: 'next', pairs: 'age', component: 'msm:weathering' },
  { rule: 'burn', into: '', pairs: undefined, component: 'msm:flammable' },
]);

/** What each rule does, in plain words, for the messages. */
const RULE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  strip: 'an axe strips',
  flatten: 'a shovel flattens',
  till: 'a hoe tills',
  wax: 'honeycomb waxes',
  age: 'ages',
  burn: 'burns',
});

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const typeOf = (data: JsonObject): string => (typeof data.type === 'string' ? data.type : 'block');

const blocks = (elements: readonly Element[]) =>
  elements
    .filter((element) => element.kind === BLOCK_KIND)
    .map((element) => ({ element, data: dataOf(element) }));

/** The project's sound event keys: `<ns>:<key>` for every key of a `minecraft:sounds` element. */
function projectSoundKeys(elements: readonly Element[]): Set<string> {
  const keys = new Set<string>();
  for (const element of elements) {
    if (element.kind !== SOUNDS_KIND || !isRecord(element.data)) continue;
    const colon = element.id.indexOf(':');
    const namespace = colon < 0 ? 'minecraft' : element.id.slice(0, colon);
    for (const key of Object.keys(element.data)) {
      if (key !== '') keys.add(`${namespace}:${key}`);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Own block sounds and set types (ADR 0105 D1, D2)

/** Every sound an element names: `[sound id, JSON pointer]`. */
function namedSounds(data: JsonObject): [string, string][] {
  const out: [string, string][] = [];
  const own = data[BLOCK_SOUNDS_FIELD];
  if (isRecord(own)) {
    for (const [event, value] of Object.entries(own)) {
      const id = text(value);
      if (id !== undefined) out.push([id, pointer(BLOCK_SOUNDS_FIELD, event)]);
    }
  }
  const setType = data.set_type;
  if (isRecord(setType) && isRecord(setType.sounds)) {
    for (const name of SET_TYPE_SOUNDS) {
      const id = text(setType.sounds[name]);
      if (id !== undefined) out.push([id, pointer('set_type', 'sounds', name)]);
    }
  }
  return out;
}

function unknownSounds(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  if (registry.ids(SOUND_EVENT_REGISTRY).length === 0) return [];
  const projectKeys = projectSoundKeys(elements);
  const known = (id: string): boolean =>
    projectKeys.has(id) ||
    registry.has(SOUND_EVENT_REGISTRY, id) ||
    registry.has(WEIGHED_SOUND_EVENT_REGISTRY, id);
  const problems: Problem[] = [];
  for (const { element, data } of blocks(elements)) {
    for (const [sound, path] of namedSounds(data)) {
      if (known(namespaced(sound))) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.block-sound-unknown',
        elementId: element.id,
        path,
        message: `Sound "${sound}" is neither a vanilla sound event nor a sound of this project, so nothing plays there. Pick an existing sound, or add it to the project's sounds.`,
      });
    }
  }
  return problems;
}

function soundSetLimits(elements: readonly Element[], target: TargetFacts): Problem[] {
  if (!usesSoundSets(target.blocks)) return [];
  const problems: Problem[] = [];
  for (const { element, data } of blocks(elements)) {
    const sounds = blockSoundsOf(data);
    if (sounds === undefined) continue;
    const missing = missingSoundEvents(sounds);
    if (missing.length > 0) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.block-sounds-partial',
        elementId: element.id,
        path: pointer(BLOCK_SOUNDS_FIELD),
        message: `On Minecraft ${target.mcVersion} a block's own sounds are one data entry that cannot borrow from its sound type, so ${missing.map((event) => `"${event}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} silent there. Give every sound to keep them.`,
      });
    }
    if (sounds.pitch !== undefined && sounds.pitch > SOUND_SET_MAX_PITCH) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.block-sounds-range',
        elementId: element.id,
        path: pointer(BLOCK_SOUNDS_FIELD, 'pitch'),
        message: `On Minecraft ${target.mcVersion} a block's sounds play at a pitch of at most ${String(SOUND_SET_MAX_PITCH)}, so ${String(sounds.pitch)} plays as ${String(SOUND_SET_MAX_PITCH)}.`,
      });
    }
    if (sounds.volume === 0) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.block-sounds-range',
        elementId: element.id,
        path: pointer(BLOCK_SOUNDS_FIELD, 'volume'),
        message: `On Minecraft ${target.mcVersion} a block's sounds cannot have a volume of 0, so they play almost too quietly to hear instead. Remove the sounds you do not want rather than muting them.`,
      });
    }
  }
  return problems;
}

function unknownSoundTypes(elements: readonly Element[], target: TargetFacts): Problem[] {
  const facts = target.blocks?.soundTypes;
  if (facts === undefined) return [];
  return blocks(elements).flatMap(({ element, data }): Problem[] => {
    const name = text(data.sound_type);
    if (name === undefined || FORMAT_SOUND_TYPES.includes(name) || facts.includes(name)) return [];
    return [
      {
        severity: 'error',
        code: 'blocks-items.sound-type-unknown',
        elementId: element.id,
        path: pointer('sound_type'),
        message: `"${name}" is not a sound type Minecraft ${target.mcVersion} has, so the game refuses the block. Pick one of the listed sound types.`,
      },
    ];
  });
}

function unusedSetTypeFields(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data } of blocks(elements)) {
    const setType = data.set_type;
    const type = typeOf(data);
    const uses = SET_TYPE_USES[type];
    if (!isRecord(setType) || uses === undefined) continue;
    const given: string[] = SET_TYPE_SETTINGS.filter((field) => setType[field] !== undefined);
    if (isRecord(setType.sounds)) {
      for (const name of SET_TYPE_SOUNDS) {
        if (setType.sounds[name] !== undefined) given.push(`sounds/${name}`);
      }
    }
    for (const field of given) {
      if (uses.includes(field)) continue;
      problems.push({
        severity: 'info',
        code: 'blocks-items.set-type-field-unused',
        elementId: element.id,
        path: pointer('set_type', ...field.split('/')),
        message: `A ${type.replaceAll('_', ' ')} never uses "${field.replace('sounds/', '')}" of its set type, so it does nothing here.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Rules for vanilla blocks (ADR 0105 D4)

/** One entry of a rules element. */
interface RuleEntry {
  element: Element;
  rule: (typeof RULES)[number];
  index: number;
  block: string;
  into: string | undefined;
}

function ruleEntries(elements: readonly Element[]): RuleEntry[] {
  const files = elements
    .filter((element) => element.kind === VANILLA_BLOCK_RULES_KIND)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: RuleEntry[] = [];
  for (const element of files) {
    const data = dataOf(element);
    for (const rule of RULES) {
      const list = data[rule.rule];
      if (!Array.isArray(list)) continue;
      list.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        const block = text(entry.block);
        if (block === undefined) return;
        const into = rule.into === '' ? undefined : text(entry[rule.into]);
        out.push({
          element,
          rule,
          index,
          block: namespaced(block),
          into: into === undefined ? undefined : namespaced(into),
        });
      });
    }
  }
  return out;
}

function vanillaRuleProblems(elements: readonly Element[], target: TargetFacts): Problem[] {
  const entries = ruleEntries(elements);
  if (entries.length === 0) return [];
  const pairs = target.blocks?.vanillaPairs;
  const projectBlocks = new Set(blocks(elements).map(({ element }) => element.id as string));
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const { element, rule, index, block, into } of entries) {
    const path = pointer(rule.rule, index, 'block');
    const words = RULE_WORDS[rule.rule] ?? rule.rule;
    const vanilla = rule.pairs === undefined ? undefined : pairs?.[rule.pairs][block];
    if (vanilla !== undefined) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.vanilla-pair-override',
        elementId: element.id,
        path,
        message:
          rule.rule === 'age'
            ? `"${block}" already ages into "${vanilla}" in vanilla, so this rule replaces vanilla's next stage.`
            : `In vanilla, ${words} "${block}" into "${vanilla}" already, so this rule replaces vanilla's.`,
      });
    }
    const key = `${rule.rule} ${block}`;
    if (seen.has(key)) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.vanilla-rule-duplicate',
        elementId: element.id,
        path,
        message: `"${block}" already has a "${rule.rule}" rule earlier in this project's rules; the last one wins, so the earlier one does nothing. Keep one.`,
      });
    }
    seen.add(key);
    if (into !== undefined && into === block) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.vanilla-rule-same-block',
        elementId: element.id,
        path: pointer(rule.rule, index, rule.into),
        message: `"${block}" turns into itself here, so the rule does nothing. Pick the block it should become.`,
      });
    }
    if (projectBlocks.has(block)) {
      problems.push({
        severity: 'info',
        code: 'blocks-items.vanilla-rule-project-block',
        elementId: element.id,
        path,
        message: `"${block}" is a block of this project: give it "${rule.component}" instead, which does the same and shows in its Studio.`,
      });
    }
  }
  return problems;
}

export const soundValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.sounds',
    kinds: [BLOCK_KIND, SOUNDS_KIND, VANILLA_BLOCK_RULES_KIND],
    validate: ({ elements, target, registry }) => [
      ...unknownSounds(elements, registry),
      ...soundSetLimits(elements, target),
      ...unknownSoundTypes(elements, target),
      ...unusedSetTypeFields(elements),
      ...vanillaRuleProblems(elements, target),
    ],
  },
] satisfies ProjectValidator[]);
