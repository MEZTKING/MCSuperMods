/**
 * Lowering of `msm:one_block` (ADR 0113 D3, limit M6: four per world). A one block `<ns>:<path>`
 * keeps its phase and its breaks in the phase on the objective `<ns>.msm_one_block` (shared by the
 * namespace's one blocks) as `#<path>.phase` and `#<path>.breaks`, and draws its random numbers
 * into `#<path>.roll`. The functions under `<ns>:msm_games/one_block/<path>/` (B547 Y9):
 *
 * - `load` (joins the plugin's load): makes the objective and, the first time, sets phase 0 with
 *   breaks at -1, so the first fill is not counted; a phase past the last (phases taken out) goes
 *   back to the first;
 * - `tick` (joins the plugin's tick): one `execute in <dimension> if block <at> minecraft:air`
 *   test, which calls `next`;
 * - `next`: runs the hook `#<ns>:msm_games/one_block/<path>/broken` (not on the first fill),
 *   counts the break, moves to the next phase when this one's breaks are done (`phase_<n>`;
 *   after the last the first again with `loop`, otherwise the last phase stays), then fills the
 *   block from the phase (`fill_<n>`);
 * - `fill_<n>`: a chest with the phase's loot table at `chest_chance`, otherwise a block picked by
 *   weight (`blocks_<n>`), then at `mob_chance` a mob picked by weight above it (`mobs_<n>`).
 *
 * Chances are drawn as `random value 1..10000`, so a chance is kept to four decimal places.
 */
import type { Element, Json, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  blockPos,
  bool,
  dataOf,
  fillForm,
  functionFile,
  gamesFunctionId,
  holderOf,
  hookTagFile,
  isRecord,
  num,
  oneBlocksObjective,
  runHook,
  type SharedContribution,
  sharedFunctionFiles,
  splitId,
  str,
  textComponent,
} from './shared-functions';

/** The draws of a chance: `random value 1..CHANCE_DRAWS`. */
export const CHANCE_DRAWS = 10_000;

interface Weighted {
  id: string;
  weight: number;
}

/** The entries of a weighted list with an id and a whole weight above zero. */
function weightedList(value: Json | undefined, key: 'block' | 'mob'): Weighted[] {
  if (!Array.isArray(value)) return [];
  const list: Weighted[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry[key] !== 'string') continue;
    const weight = Math.trunc(num(entry.weight, 0));
    if (weight > 0) list.push({ id: entry[key] as string, weight });
  }
  return list;
}

/** A chance from 0 to 1 as a number of draws out of {@link CHANCE_DRAWS}. */
const draws = (chance: number): number =>
  Math.min(CHANCE_DRAWS, Math.max(0, Math.round(chance * CHANCE_DRAWS)));

/**
 * The names of the functions a one block's phases add below `<ns>:msm_games/one_block/<path>/`,
 * as {@link lowerOneBlock} writes them: `phase_<n>`, `blocks_<n>` and `fill_<n>` for every phase,
 * and `mobs_<n>` for a phase with mobs and a mob chance that draws at least once.
 */
export function oneBlockPhaseFunctionNames(data: Json): string[] {
  const phases = (Array.isArray(dataOf(data).phases) ? (dataOf(data).phases as Json[]) : []).map(
    dataOf,
  );
  return phases.flatMap((phase, index) => {
    const mobs = weightedList(phase.mobs, 'mob');
    const mob = mobs.length === 0 ? 0 : draws(num(phase.mob_chance, 0));
    return [
      `phase_${index}`,
      `blocks_${index}`,
      ...(mob > 0 ? [`mobs_${index}`] : []),
      `fill_${index}`,
    ];
  });
}

/** Lowers a one block to its functions, its hook tag and the tag entries that run it. */
export function lowerOneBlock(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const data = dataOf(element.data);
  const objective = oneBlocksObjective(namespace);
  const phaseHolder = holderOf(path, 'phase');
  const breaks = holderOf(path, 'breaks');
  const roll = holderOf(path, 'roll');
  const dimension = str(data.dimension, 'minecraft:overworld');
  const [x, y, z] = blockPos(data.at, [0, 64, 0]);
  const at = `${x} ${y} ${z}`;
  const phases = (Array.isArray(data.phases) ? data.phases : []).map(dataOf);
  const loop = bool(data.loop, true);
  const announce = bool(data.announce, true);
  const fn = (name: string): string => gamesFunctionId(namespace, `one_block/${path}/${name}`);
  const set = (holders: string, score: number): string =>
    fillForm(target, 'score_set', { holders, objective, score });
  const drawInto = (max: number): string =>
    `execute store result score ${roll} ${objective} run ${fillForm(target, 'random_value', {
      min: 1,
      max,
    })}`;

  const load = [
    fillForm(target, 'objective_add', { objective, criterion: 'dummy' }),
    `execute unless score ${phaseHolder} ${objective} matches 0.. run ${set(breaks, -1)}`,
    `execute unless score ${phaseHolder} ${objective} matches 0.. run ${set(phaseHolder, 0)}`,
    `execute if score ${phaseHolder} ${objective} matches ${Math.max(phases.length, 1)}.. run ${set(phaseHolder, 0)}`,
  ];
  const tick = [`execute in ${dimension} if block ${at} minecraft:air run function ${fn('next')}`];

  const next = [
    `execute if score ${breaks} ${objective} matches 0.. run ${runHook(namespace, `one_block/${path}/broken`)}`,
    fillForm(target, 'score_add', { holders: breaks, objective, score: 1 }),
  ];
  const extra: OutputFile[] = [];
  phases.forEach((phase, index) => {
    const following = index + 1 < phases.length ? index + 1 : loop ? 0 : undefined;
    if (following === undefined) return;
    const count = Math.max(1, Math.trunc(num(phase.breaks, 1)));
    next.push(
      `execute if score ${phaseHolder} ${objective} matches ${index} if score ${breaks} ${objective} matches ${count}.. run function ${fn(`phase_${following}`)}`,
    );
  });
  phases.forEach((_phase, index) => {
    next.push(
      `execute if score ${phaseHolder} ${objective} matches ${index} run function ${fn(`fill_${index}`)}`,
    );
  });

  phases.forEach((phase, index) => {
    // Entering a phase.
    const enter = [set(phaseHolder, index), set(breaks, 0)];
    if (announce) enter.push(`tellraw @a ${textComponent(str(phase.name, `Phase ${index + 1}`))}`);
    extra.push(functionFile(target, namespace, `one_block/${path}/phase_${index}`, enter));

    // The block (by weight).
    const blocks = weightedList(phase.blocks, 'block');
    const blockLines: string[] = [];
    if (blocks.length === 1) {
      blockLines.push(`setblock ${at} ${(blocks[0] as Weighted).id}`);
    } else if (blocks.length > 1) {
      blockLines.push(drawInto(blocks.reduce((sum, entry) => sum + entry.weight, 0)));
      let low = 1;
      for (const entry of blocks) {
        const high = low + entry.weight - 1;
        blockLines.push(
          `execute if score ${roll} ${objective} matches ${low}..${high} run setblock ${at} ${entry.id}`,
        );
        low = high + 1;
      }
    }
    extra.push(functionFile(target, namespace, `one_block/${path}/blocks_${index}`, blockLines));

    // The fill: a chest now and then, otherwise the block; then a mob now and then.
    const fill: string[] = [];
    const chest = typeof phase.chest_loot === 'string' ? draws(num(phase.chest_chance, 0)) : 0;
    if (chest > 0) {
      fill.push(
        drawInto(CHANCE_DRAWS),
        `execute if score ${roll} ${objective} matches 1..${chest} run setblock ${at} minecraft:chest{LootTable:${JSON.stringify(phase.chest_loot)}}`,
      );
      if (chest < CHANCE_DRAWS) {
        fill.push(
          `execute if score ${roll} ${objective} matches ${chest + 1}.. run function ${fn(`blocks_${index}`)}`,
        );
      }
    } else {
      fill.push(`function ${fn(`blocks_${index}`)}`);
    }
    const mobs = weightedList(phase.mobs, 'mob');
    const mob = mobs.length === 0 ? 0 : draws(num(phase.mob_chance, 0));
    if (mob > 0) {
      const summonAt = `${x + 0.5} ${y + 1} ${z + 0.5}`;
      const mobLines: string[] = [];
      if (mobs.length === 1) {
        mobLines.push(`summon ${(mobs[0] as Weighted).id} ${summonAt}`);
      } else {
        mobLines.push(drawInto(mobs.reduce((sum, entry) => sum + entry.weight, 0)));
        let low = 1;
        for (const entry of mobs) {
          const high = low + entry.weight - 1;
          mobLines.push(
            `execute if score ${roll} ${objective} matches ${low}..${high} run summon ${entry.id} ${summonAt}`,
          );
          low = high + 1;
        }
      }
      extra.push(functionFile(target, namespace, `one_block/${path}/mobs_${index}`, mobLines));
      if (mob >= CHANCE_DRAWS) {
        fill.push(`function ${fn(`mobs_${index}`)}`);
      } else {
        fill.push(
          drawInto(CHANCE_DRAWS),
          `execute if score ${roll} ${objective} matches 1..${mob} run function ${fn(`mobs_${index}`)}`,
        );
      }
    }
    extra.push(functionFile(target, namespace, `one_block/${path}/fill_${index}`, fill));
  });

  const contributions: SharedContribution[] = [
    { phase: 'load', path: `one_block/${path}/load`, lines: load },
    { phase: 'tick', path: `one_block/${path}/tick`, lines: tick },
  ];
  return [
    ...sharedFunctionFiles(target, namespace, contributions),
    functionFile(target, namespace, `one_block/${path}/next`, next),
    ...extra,
    hookTagFile(target, namespace, `one_block/${path}/broken`),
  ];
}
