/**
 * The prompt's truth test for the games topic (game modes plan, B561; ADR 0125 D7, ADRs 0113 to
 * 0117): a sibling of `ai-prompt-truth.test.ts`. The kinds are the games plugin's, both ways, and
 * in `PROMPT_KINDS`; the flows are the library's game flows (the Creator group `games`), both
 * ways, in `PROMPT_FLOWS`, with the one that needs the jar; the numbers are the plugin's limits;
 * every field and value the kinds' paragraph names is in `games.mcdoc`; every quoted label is in
 * the source of the component that shows it, and every capitalised quote of the topic is such a
 * label or a flow's title. Each check returns the facts it finds false, so the mutation cases at
 * the end prove that it bites.
 */

import {
  GAMES_PROMPT_FLOWS,
  GAMES_PROMPT_JAR_FLOWS,
  GAMES_PROMPT_KINDS,
  GAMES_PROMPT_LABELS,
  GAMES_PROMPT_NUMBERS,
  PROMPT_FLOWS,
  PROMPT_KINDS,
  systemPrompt,
} from '@msm/ai';
import { GAMES_KIND_IDS, MAX_ONE_BLOCKS, MAX_TIMER_SECONDS } from '@msm/plugin-games';
import { GAME_FLOW_IDS, libraryStarters } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { exportedLiteral, labelInSource, readRepoFile } from './ai-prompt-truth-sources';

const RENDERER = 'app/src/renderer/src';

/** The files the checks read, by a short name. */
const FILES = Object.freeze({
  creator: `${RENDERER}/components/creator/creator-model.ts`,
  tiles: `${RENDERER}/components/home/tiles.ts`,
  gamesModel: `${RENDERER}/studios/games/games-model.ts`,
  playStore: `${RENDERER}/store/play-store.ts`,
  menu: 'app/src/main/menu.ts',
  exportMap: `${RENDERER}/components/ExportMapDialog.tsx`,
  importFiles: `${RENDERER}/components/ImportFilesDialog.tsx`,
  containers: `${RENDERER}/studios/structures/ContainersSection.tsx`,
  grounds: `${RENDERER}/tryit/grounds.ts`,
  gamesPanel: `${RENDERER}/tryit/games/GamesPanel.tsx`,
  start: 'packages/plugins/games/src/lowering/start.ts',
  mcdoc: 'packages/schemas/mcdoc/msm/games.mcdoc',
});

type FileKey = keyof typeof FILES;
type LabelKey = keyof typeof GAMES_PROMPT_LABELS;

/** Where each quoted label is shown. */
const LABEL_FILES: Readonly<Record<LabelKey, FileKey>> = Object.freeze({
  games: 'creator',
  makeGame: 'tiles',
  whileGenerating: 'gamesModel',
  playGame: 'playStore',
  startOver: 'playStore',
  seed: 'playStore',
  exportMap: 'menu',
  keepPlayerData: 'exportMap',
  importStructure: 'menu',
  fromTestWorlds: 'importFiles',
  bringBuilds: 'importFiles',
  containers: 'containers',
  emptySky: 'grounds',
  buildings: 'grounds',
  rebuildNow: 'gamesPanel',
});

/** What the checks read: file texts, the plugin's kinds and limits, the library's game flows. */
interface GamesSources {
  readonly files: Readonly<Record<FileKey, string>>;
  readonly kinds: readonly string[];
  readonly flows: readonly string[];
  /** The game flows whose starter is limited to some targets (the Fabric mod jar's). */
  readonly jarFlows: readonly string[];
  readonly flowTitles: Readonly<Record<string, string>>;
  readonly numbers: Readonly<Record<keyof typeof GAMES_PROMPT_NUMBERS, unknown>>;
}

function gamesSources(): GamesSources {
  const files = Object.fromEntries(
    Object.entries(FILES).map(([key, path]) => [key, readRepoFile(path)]),
  ) as Record<FileKey, string>;
  const games = libraryStarters.filter((starter) => starter.creator?.group === 'games');
  return {
    files,
    kinds: [...GAMES_KIND_IDS],
    flows: games.map((starter) => starter.id),
    jarFlows: games.filter((starter) => starter.supports !== undefined).map((s) => s.id),
    flowTitles: Object.fromEntries(games.map((starter) => [starter.id, starter.title])),
    numbers: {
      oneBlocks: MAX_ONE_BLOCKS,
      timerSeconds: MAX_TIMER_SECONDS,
      startSide: exportedLiteral(files.start, 'START_AREA'),
    },
  };
}

/** The paragraph heads of the topic, in order. */
const HEADS = [
  '- Games:',
  `- Prefer the flows (group "${GAMES_PROMPT_LABELS.games}"`,
  '- Playing games:',
  '- Limits of games,',
] as const;

/** The topic's paragraphs, each one line of the prompt. */
function topicParagraphs(text: string): string[] {
  const lines = text.split('\n');
  return HEADS.map((head) => {
    const line = lines.find((candidate) => candidate.startsWith(head));
    if (line === undefined) throw new Error(`No paragraph starts with ${JSON.stringify(head)}.`);
    return line;
  });
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** The kinds: the plugin's, both ways, each in `PROMPT_KINDS` and quoted in the first paragraph. */
function checkKinds(paragraphs: readonly string[], sources: GamesSources): string[] {
  const problems: string[] = [];
  for (const kind of sources.kinds) {
    if (!GAMES_PROMPT_KINDS.includes(kind))
      problems.push(`${kind} is a games kind the prompt does not name`);
  }
  for (const kind of GAMES_PROMPT_KINDS) {
    if (!sources.kinds.includes(kind))
      problems.push(`the prompt names ${kind}, which is no games kind`);
    if (!PROMPT_KINDS.includes(kind)) problems.push(`${kind} is not in PROMPT_KINDS`);
    if (!(paragraphs[0] ?? '').includes(`"${kind}"`))
      problems.push(`the paragraph does not quote ${kind}`);
  }
  return problems;
}

/** The flows: the library's game flows, both ways, in `PROMPT_FLOWS` by title, and the jar's. */
function checkFlows(paragraphs: readonly string[], sources: GamesSources): string[] {
  const problems: string[] = [];
  if (JSON.stringify(sources.flows) !== JSON.stringify(GAMES_PROMPT_FLOWS)) {
    problems.push(`the game flows are ${sources.flows.join(', ')}, not the prompt's`);
  }
  if (JSON.stringify([...GAME_FLOW_IDS]) !== JSON.stringify(sources.flows)) {
    problems.push('GAME_FLOW_IDS is not the Creator group games');
  }
  for (const id of GAMES_PROMPT_FLOWS) {
    const flow = PROMPT_FLOWS[id];
    if (flow === undefined) problems.push(`${id} is not in PROMPT_FLOWS`);
    else if (!(paragraphs[1] ?? '').includes(`"${flow.title}" (${id}:`)) {
      problems.push(`the flows paragraph does not write "${flow.title}" (${id}: ...)`);
    }
  }
  if (!sameList(sources.jarFlows, GAMES_PROMPT_JAR_FLOWS)) {
    problems.push(`the game flows that need the jar are ${sources.jarFlows.join(', ')}`);
  }
  return problems;
}

/** The numbers, as the plugin has them, and each written in the first paragraph. */
function checkNumbers(paragraphs: readonly string[], sources: GamesSources): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(GAMES_PROMPT_NUMBERS) as [
    keyof typeof GAMES_PROMPT_NUMBERS,
    number,
  ][]) {
    if (sources.numbers[key] !== value) {
      problems.push(`${key}: the prompt says ${value}, the code ${String(sources.numbers[key])}`);
    }
    if (!(paragraphs[0] ?? '').includes(String(value))) problems.push(`${key} is not written`);
  }
  return problems;
}

/**
 * Every snake_case field and every quoted lower-case value the kinds' paragraph names is in
 * `games.mcdoc` (kind ids, tags and the tool name aside).
 */
function checkSchemaWords(paragraphs: readonly string[], sources: GamesSources): string[] {
  const problems: string[] = [];
  const text = paragraphs[0] ?? '';
  const mcdoc = sources.files.mcdoc;
  const fields = new Set(text.match(/(?<![:\w#/"])[a-z]+(?:_[a-z]+)+(?![\w"])/g) ?? []);
  fields.delete('kind_schema');
  for (const field of fields) {
    if (!new RegExp(`\\b${field}\\??:`).test(mcdoc))
      problems.push(`games.mcdoc has no field ${field}`);
  }
  for (const match of text.matchAll(/"([a-z_]+)"/g)) {
    const value = match[1] as string;
    if (!mcdoc.includes(`"${value}"`)) problems.push(`games.mcdoc has no value "${value}"`);
  }
  return problems;
}

/**
 * Every label is in the source of the component that shows it, and every capitalised quote of
 * the topic is a label or a game flow's title.
 */
function checkLabels(paragraphs: readonly string[], sources: GamesSources): string[] {
  const problems: string[] = [];
  const known = new Set<string>([
    ...Object.values(GAMES_PROMPT_LABELS),
    ...Object.values(sources.flowTitles),
  ]);
  for (const match of paragraphs.join('\n').matchAll(/"([A-Z][^"]*)"/g)) {
    const label = match[1] as string;
    if (!known.has(label)) problems.push(`the topic quotes "${label}", which no constant lists`);
  }
  for (const [key, label] of Object.entries(GAMES_PROMPT_LABELS) as [LabelKey, string][]) {
    const file = LABEL_FILES[key];
    if (!labelInSource(sources.files[file], label)) {
      problems.push(`"${label}" is not shown by ${FILES[file]}`);
    }
  }
  return problems;
}

describe('the games topic against the code (B561)', () => {
  const paragraphs = topicParagraphs(systemPrompt());
  const sources = gamesSources();

  it("names the games plugin's kinds, both ways", () => {
    expect(checkKinds(paragraphs, sources)).toEqual([]);
  });

  it("names the library's game flows, both ways, and the one that needs the jar", () => {
    expect(checkFlows(paragraphs, sources)).toEqual([]);
  });

  it("states the plugin's limits as numbers", () => {
    expect(checkNumbers(paragraphs, sources)).toEqual([]);
  });

  it('names fields and values games.mcdoc has', () => {
    expect(checkSchemaWords(paragraphs, sources)).toEqual([]);
  });

  it('quotes labels the components show', () => {
    expect(checkLabels(paragraphs, sources)).toEqual([]);
  });

  it('states the limits M1 to M16 in plain words', () => {
    const text = paragraphs.join('\n');
    for (const words of [
      // M1, M12: Rules and the lucky block need the jar, and such a map is a modpack.
      'rule books still need the jar',
      'the only one that needs the Fabric mod jar',
      'a project that needs the jar becomes a .mrpack',
      // M2, M3, M4.
      'shows only when the pack is added on the Create World screen',
      'the start island appears just after the first join',
      `at most ${GAMES_PROMPT_NUMBERS.startSide} blocks a side`,
      // M5, M6.
      'lava and water always make cobblestone',
      `at most ${GAMES_PROMPT_NUMBERS.oneBlocks} a world`,
      // M7 to M10.
      'teams and objectives stay in old worlds after a rename',
      'areas are boxes',
      'timers count whole seconds',
      'the sidebar shows scores, not Rules counters',
      // M11, M13: maps and Play my game.
      'every player starts fresh',
      'keeps that world under a new name for a fresh one',
      // M14, M15, M16.
      'Try it is single player',
      'commands it cannot run are only in the game',
      'Builds come from the game (no block editor)',
    ]) {
      expect(text, words).toContain(words);
    }
  });
});

describe('the games checks bite (B561)', () => {
  const paragraphs = topicParagraphs(systemPrompt());
  const sources = gamesSources();
  const withFile = (key: FileKey, change: (source: string) => string): GamesSources => ({
    ...sources,
    files: { ...sources.files, [key]: change(sources.files[key]) },
  });

  it('a kind added to the games plugin', () => {
    expect(
      checkKinds(paragraphs, { ...sources, kinds: [...sources.kinds, 'msm:checkpoint'] }),
    ).toEqual(['msm:checkpoint is a games kind the prompt does not name']);
  });

  it('a game flow dropped from the library', () => {
    expect(
      checkFlows(paragraphs, { ...sources, flows: sources.flows.filter((id) => id !== 'race') }),
    ).toEqual([
      "the game flows are skyblock, one-block, sky-islands, lucky-block, adventure-map, arena-game, goals, not the prompt's",
      'GAME_FLOW_IDS is not the Creator group games',
    ]);
  });

  it('a second game flow that needs the jar', () => {
    expect(
      checkFlows(paragraphs, { ...sources, jarFlows: [...sources.jarFlows, 'skyblock'] }),
    ).toEqual(['the game flows that need the jar are lucky-block, skyblock']);
  });

  it('a limit changed in the plugin', () => {
    expect(
      checkNumbers(paragraphs, { ...sources, numbers: { ...sources.numbers, oneBlocks: 8 } }),
    ).toEqual(['oneBlocks: the prompt says 4, the code 8']);
  });

  it('a field renamed in games.mcdoc', () => {
    const changed = withFile('mcdoc', (source) => source.replaceAll('chest_loot', 'chest_table'));
    expect(checkSchemaWords(paragraphs, changed)).toEqual(['games.mcdoc has no field chest_loot']);
  });

  it('a label changed in a copy of a component', () => {
    const changed = withFile('exportMap', (source) =>
      source.replace('Keep my player data', 'Keep my things'),
    );
    expect(checkLabels(paragraphs, changed)).toEqual([
      `"Keep my player data" is not shown by ${FILES.exportMap}`,
    ]);
  });

  it('a quoted label no constant lists', () => {
    expect(checkLabels([...paragraphs, '"Play my map"'], sources)).toEqual([
      'the topic quotes "Play my map", which no constant lists',
    ]);
  });
});
