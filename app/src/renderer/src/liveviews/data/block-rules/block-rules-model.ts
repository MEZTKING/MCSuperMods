/**
 * What the block rules view shows (B614), as plain data: the rows of a block transformer or of
 * a vanilla block rules file, each a block **Before** and **After** with the tool that does it,
 * its sound and what the preview leaves out. Read with `@msm/sim`'s own readers
 * (`blocks/vanilla-rules.ts`), the code Try it uses, so the panel and Try it agree.
 */

import type { Element, Json, Project, VanillaPairFacts } from '@msm/plugin-api';
import {
  fullId,
  RULE_TOOL_ITEMS,
  rulesFromData,
  toolOfTransformer,
  transformerOfDefinition,
  transformerRows,
  transformSteps,
  VANILLA_RULE_SOUNDS,
} from '@msm/sim';
import type { Fidelity } from '../../frame/fidelity';

/** One row: what a tool turns a block into. */
export interface RuleRow {
  readonly key: string;
  /** Block ids and `#tags` before, or `*` for any block. */
  readonly before: readonly string[];
  /** The block after, when known. */
  readonly after?: string;
  /** Block state properties the row sets, as `name=value`. */
  readonly properties: readonly string[];
  /** True when the block keeps the properties it shares with the new one. */
  readonly keeps: boolean;
  /** The tool in plain words ("An axe"). */
  readonly tool: string;
  /** The item a slot shows for the tool, when there is one. */
  readonly toolItem?: string;
  /** The sound the change plays. */
  readonly sound?: string;
  /** More about the row, one plain line each. */
  readonly lines: readonly string[];
  /** What the preview cannot work out about it. */
  readonly unknown?: string;
  readonly fidelity: Fidelity;
}

/** A group of rows under a heading. */
export interface RuleGroup {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly RuleRow[];
}

/** The whole view. */
export interface BlockRulesModel {
  readonly title: string;
  readonly groups: readonly RuleGroup[];
  /** Who uses it, one plain line each. */
  readonly usedBy: readonly string[];
  /** The blocks and tools Try it's picker offers for it. */
  readonly tryItBlocks: readonly string[];
  readonly tryItTools: readonly string[];
  readonly notes: readonly string[];
}

const TOOL_WORDS = {
  axe: 'An axe',
  shovel: 'A shovel',
  hoe: 'A hoe',
  honeycomb: 'Honeycomb',
} as const;

/** The vanilla block rules lists with the tool and the heading of each (the Studio's words). */
const LISTS = [
  { list: 'strip', tool: 'axe', title: 'When you use an axe on it', sound: 'strip' },
  { list: 'flatten', tool: 'shovel', title: 'When you use a shovel on it', sound: 'flatten' },
  { list: 'till', tool: 'hoe', title: 'When you use a hoe on it', sound: 'till' },
  { list: 'wax', tool: 'honeycomb', title: 'When you use honeycomb on it', sound: 'wax' },
] as const;

const NOT_IN_PREVIEW = 'Not in Try it';

/** The model of a `msm:vanilla_block_rules` element. */
export function vanillaRulesModel(
  element: Pick<Element, 'id' | 'data'>,
  pairs: VanillaPairFacts | undefined,
): BlockRulesModel {
  const lists = rulesFromData(element.data as Json, element.id);
  const groups: RuleGroup[] = [];
  const blocks = new Set<string>();
  const tools = new Set<string>();
  for (const { list, tool, title, sound } of LISTS) {
    const rows: RuleRow[] = lists[list].map((pair, index) => {
      const replaced = pairs?.[list]?.[pair.block];
      blocks.add(pair.block);
      tools.add(RULE_TOOL_ITEMS[tool]);
      if (list === 'wax') tools.add(RULE_TOOL_ITEMS.axe);
      const lines: string[] = [];
      if (list === 'flatten' || list === 'till') lines.push('Only with air above it.');
      if (pair.drops !== undefined) lines.push(`Drops ${pair.drops} once.`);
      if (list === 'wax') lines.push('An axe takes the wax off again.');
      if (replaced !== undefined) {
        lines.push(`Minecraft already turns it into ${replaced}; this rule replaces that.`);
      }
      return {
        key: `${list}-${index}`,
        before: [pair.block],
        after: pair.into,
        properties: [],
        keeps: true,
        tool: TOOL_WORDS[tool],
        toolItem: RULE_TOOL_ITEMS[tool],
        sound: VANILLA_RULE_SOUNDS[sound],
        lines,
        fidelity: 'about_right',
      };
    });
    if (rows.length > 0) groups.push({ key: list, title, rows });
  }
  const age: RuleRow[] = lists.age.map((pair, index) => ({
    key: `age-${index}`,
    before: [pair.block],
    after: pair.into,
    properties: [],
    keeps: true,
    tool: 'Time',
    lines: [
      'It ages slowly in the game, as copper does, and an axe scrapes it back; Try it does not age Minecraft’s blocks.',
    ],
    unknown: NOT_IN_PREVIEW,
    fidelity: 'only_in_game',
  }));
  if (age.length > 0) groups.push({ key: 'age', title: 'Ages like copper', rows: age });
  const burn: RuleRow[] = lists.burn.map((pair, index) => ({
    key: `burn-${index}`,
    before: [pair.block],
    properties: [],
    keeps: false,
    tool: 'Fire',
    lines: [
      `Catches fire ${pair.burnOdds} of 300, burns away ${pair.igniteOdds} of 300; Try it has no fire.`,
    ],
    unknown: NOT_IN_PREVIEW,
    fidelity: 'only_in_game',
  }));
  if (burn.length > 0) groups.push({ key: 'burn', title: 'Burns', rows: burn });
  return {
    title: 'Vanilla block rules',
    groups,
    usedBy: [
      'Every axe, shovel, hoe and honeycomb, before the tool’s own block transformer (Fabric mod export only).',
    ],
    tryItBlocks: [...blocks].sort(),
    tryItTools: [...tools],
    notes: [
      'Try it places Minecraft’s blocks as props; the rules change them, but their other behaviour is not there.',
      'Try it does not know which face you clicked: in the game flattening and tilling do nothing on a block’s bottom face.',
      'Sounds are Minecraft’s own: Try it shows them as captions and they play only in the game.',
    ],
  };
}

/** The project's items whose `minecraft:block_transformer` names `id`. */
export function itemsNaming(project: Project, id: string): string[] {
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== 'msm:item') continue;
      if (transformerOfDefinition(element.data as Json) === id) out.push(fullId(element.id));
    }
  }
  return out.sort();
}

/** The model of a `minecraft:block_transformer` element. */
export function transformerModel(
  element: Pick<Element, 'id' | 'data'>,
  project: Project,
): BlockRulesModel {
  const id = fullId(element.id);
  const tool = toolOfTransformer(id);
  const items = itemsNaming(project, id);
  const toolWords = tool === undefined ? 'An item naming it' : TOOL_WORDS[tool];
  const toolItem = tool === undefined ? items[0] : RULE_TOOL_ITEMS[tool];
  const data = element.data as Json;
  const raw = (Array.isArray(data) ? data : [data]).filter(
    (one) => typeof one === 'object' && one !== null && !Array.isArray(one),
  );
  const steps = transformSteps(raw);
  const groups: RuleGroup[] = steps.map((step, index) => {
    const rows = transformerRows(raw[index] ?? null).map((row, at): RuleRow => {
      const lines: string[] = [];
      if (row.condition !== undefined) lines.push(`Only ${row.condition}.`);
      if (step.disallowedFaces.length > 0) {
        lines.push(`Not on the faces ${step.disallowedFaces.join(', ')}.`);
      }
      if (step.particle !== undefined && step.particle !== 'none') {
        lines.push(`Particles: ${step.particle.replaceAll('_', ' ')}.`);
      }
      if (step.loot !== undefined) lines.push(`Drops the loot of ${step.loot}.`);
      if (step.transformType === 'copper_chest') {
        lines.push('Changes the other half of a double copper chest too.');
      }
      return {
        key: `${index}-${at}`,
        before: row.before,
        ...(row.after === undefined ? {} : { after: row.after.id }),
        properties: Object.entries(row.after?.properties ?? {}).map(
          ([name, value]) => `${name}=${value}`,
        ),
        keeps: row.after?.copy === true,
        tool: toolWords,
        ...(toolItem === undefined ? {} : { toolItem }),
        ...(step.sound === undefined ? {} : { sound: step.sound }),
        lines,
        ...(row.unknown === undefined ? {} : { unknown: row.unknown }),
        fidelity: row.unknown === undefined ? 'about_right' : 'only_in_game',
      };
    });
    return { key: String(index), title: `Transform ${index + 1}`, rows };
  });
  const blocks = new Set<string>();
  for (const group of groups) {
    for (const row of group.rows) {
      for (const block of row.before) {
        if (block !== '*' && !block.startsWith('#')) blocks.add(block);
      }
    }
  }
  const usedBy =
    tool !== undefined
      ? [
          `Every ${tool}: Minecraft’s ${tool}s name ${id}, so this file replaces what they do to every block (Minecraft’s own pairs for the ${tool} are gone while it is there).`,
        ]
      : items.length > 0
        ? items.map((item) => `${item} (its Block transformer component names it).`)
        : [`Nothing uses it yet: give an item the Block transformer component naming ${id}.`];
  const tools = tool !== undefined ? [RULE_TOOL_ITEMS[tool]] : items;
  return {
    title: 'Block transformer',
    groups,
    usedBy,
    tryItBlocks: [...blocks].sort(),
    tryItTools: tools,
    notes: [
      'Transforms are tried in order; the first that gives a block wins, as in the game.',
      'Try it places Minecraft’s blocks as props; a transformer changes them, but their other behaviour is not there.',
      'Try it reads your own block tags only; a rule on one of Minecraft’s tags is said there, not guessed.',
      'Try it does not know which face you clicked, gives no loot, and its tools never wear.',
    ],
  };
}
