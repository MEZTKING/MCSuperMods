/**
 * The prompt's truth test for the data live views (Live views 2, B617; ADR 0125 D7, ADR 0120): a
 * sibling of `ai-prompt-truth.test.ts`. The kinds the paragraph names are the live view
 * registry's data kinds, both ways, and each is a kind of the plugin registry whose Preview is a
 * live view; every label the two paragraphs quote is in the source of the component that shows
 * it; the fidelity words are the frame's. Each check returns the facts it finds false, so the
 * mutation cases at the end prove that it bites.
 */

import {
  LIVE_VIEW_PROMPT_KINDS,
  LIVE_VIEW_PROMPT_LABELS,
  LIVE_VIEW_PROMPT_TAG_REGISTRIES,
  systemPrompt,
} from '@msm/ai';
import { createMemoryFileSystem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  constBlock,
  exportedLiteral,
  labelInSource,
  readRepoFile,
} from './ai-prompt-truth-sources';
import { newSession } from './session-fixture';

const RENDERER = 'app/src/renderer/src';

/** The files the checks read, by a short name. */
const FILES = Object.freeze({
  dataViews: `${RENDERER}/liveviews/data/index.ts`,
  fidelity: `${RENDERER}/liveviews/frame/fidelity.ts`,
  frame: `${RENDERER}/liveviews/frame/LiveViewFrame.tsx`,
  seedBox: `${RENDERER}/liveviews/frame/SeedBox.tsx`,
  picker: `${RENDERER}/liveviews/frame/SituationPicker.tsx`,
  lootParts: `${RENDERER}/liveviews/data/loot/LootParts.tsx`,
  odds: `${RENDERER}/liveviews/data/loot/Odds.tsx`,
  lootModel: `${RENDERER}/liveviews/data/loot/loot-model.ts`,
  withAndWithout: `${RENDERER}/liveviews/data/loot/WithAndWithout.tsx`,
  predicate: `${RENDERER}/liveviews/data/predicate/PredicateView.tsx`,
  predicateModel: `${RENDERER}/liveviews/data/predicate/predicate-model.ts`,
  itemModifier: `${RENDERER}/liveviews/data/item-modifier/ItemModifierView.tsx`,
  enchantment: `${RENDERER}/liveviews/data/enchantment/EnchantmentView.tsx`,
  advancement: `${RENDERER}/liveviews/data/advancement/AdvancementTree.tsx`,
  tag: `${RENDERER}/liveviews/data/tag/TagMembers.tsx`,
  lineMarks: `${RENDERER}/components/function-editor/line-marks.ts`,
  additions: `${RENDERER}/studios/blocks-items/AdditionStudios.tsx`,
  creator: `${RENDERER}/components/creator/creator-model.ts`,
  seeIt: `${RENDERER}/components/ai/AiSeeIt.tsx`,
});

type FileKey = keyof typeof FILES;
type LabelKey = keyof typeof LIVE_VIEW_PROMPT_LABELS;

/** Where each quoted label is shown. */
const LABEL_FILES: Readonly<Record<LabelKey, FileKey>> = Object.freeze({
  preview: 'frame',
  checked: 'fidelity',
  aboutRight: 'fidelity',
  onlyInGame: 'fidelity',
  rollIt: 'lootParts',
  seed: 'seedBox',
  odds: 'odds',
  situation: 'picker',
  without: 'withAndWithout',
  with: 'withAndWithout',
  tryItOn: 'predicate',
  yes: 'predicateModel',
  no: 'predicateModel',
  gameKnows: 'predicateModel',
  before: 'itemModifier',
  after: 'itemModifier',
  levels: 'enchantment',
  does: 'enchantment',
  tab: 'advancement',
  everything: 'tag',
  changed: 'tag',
  runs: 'lineMarks',
  runInTryIt: 'lineMarks',
  tryItHere: 'additions',
  live: 'creator',
  seeIt: 'seeIt',
  differs: 'lootModel',
});

/** The sources the checks read: file texts and the plugin registry's kinds with their Preview. */
interface LiveViewSources {
  readonly files: Readonly<Record<FileKey, string>>;
  readonly previewKinds: ReadonlyMap<string, string | undefined>;
}

function liveViewSources(): LiveViewSources {
  const files = Object.fromEntries(
    Object.entries(FILES).map(([key, path]) => [key, readRepoFile(path)]),
  ) as Record<FileKey, string>;
  const { session } = newSession(createMemoryFileSystem());
  const previewKinds = new Map(session.registry.all().map((kind) => [kind.id, kind.previewKind]));
  return { files, previewKinds };
}

/** The two paragraphs of the topic. */
function topicText(text: string): string {
  const lines = text.split('\n');
  const found = ['- Live views of data:', '- Limits of the data views:'].map((head) => {
    const line = lines.find((candidate) => candidate.startsWith(head));
    if (line === undefined) throw new Error(`No paragraph starts with ${JSON.stringify(head)}.`);
    return line;
  });
  return found.join('\n');
}

/** The data views of the registry (`DATA_VIEWS`): kind ids other than tags, and the tag registries. */
function registryViews(source: string): { kinds: string[]; tags: string[] } {
  const block = constBlock(source, 'DATA_VIEWS');
  const kinds = [...block.matchAll(/^\s*'([a-z_]+:[a-z0-9_/]+)': /gm)].map(
    (match) => match[1] as string,
  );
  const tags = [...constBlock(source, 'TAG_VIEW_REGISTRIES').matchAll(/^\s*'([a-z_/]+)',$/gm)].map(
    (match) => match[1] as string,
  );
  return { kinds, tags };
}

/** The kinds, both ways against the registry, each a plugin kind with a live view, each named. */
function checkKinds(text: string, sources: LiveViewSources): string[] {
  const problems: string[] = [];
  const { kinds, tags } = registryViews(sources.files.dataViews);
  if (kinds.length === 0) problems.push('DATA_VIEWS lists no kinds');
  const named = Object.keys(LIVE_VIEW_PROMPT_KINDS);
  for (const kind of kinds) {
    if (!named.includes(kind)) problems.push(`${kind} has a live view the prompt does not name`);
  }
  for (const kind of named) {
    if (!kinds.includes(kind)) problems.push(`the prompt names ${kind}, which has no live view`);
  }
  if (
    JSON.stringify([...tags].sort()) !== JSON.stringify([...LIVE_VIEW_PROMPT_TAG_REGISTRIES].sort())
  ) {
    problems.push(`the tag views are ${tags.join(', ')}, not the prompt's`);
  }
  const all = [...named, ...LIVE_VIEW_PROMPT_TAG_REGISTRIES.map((tag) => `minecraft:tag/${tag}`)];
  for (const kind of all) {
    if (!sources.previewKinds.has(kind)) problems.push(`${kind} is no kind of the plugin registry`);
    else if (sources.previewKinds.get(kind) !== 'live_view') {
      problems.push(`${kind}'s Preview is not a live view`);
    }
  }
  for (const [kind, words] of Object.entries(LIVE_VIEW_PROMPT_KINDS)) {
    if (!text.includes(words)) problems.push(`the paragraph does not name ${kind} as "${words}"`);
  }
  return problems;
}

/** Every quoted label is a constant's, and each is in the source of the component that shows it. */
function checkLabels(text: string, sources: LiveViewSources): string[] {
  const problems: string[] = [];
  const labels = new Set<string>(Object.values(LIVE_VIEW_PROMPT_LABELS));
  for (const match of text.matchAll(/"([^"]+)"/g)) {
    const label = match[1] as string;
    if (!labels.has(label))
      problems.push(`the paragraph quotes "${label}", which no constant lists`);
  }
  for (const [key, label] of Object.entries(LIVE_VIEW_PROMPT_LABELS) as [LabelKey, string][]) {
    const file = LABEL_FILES[key];
    if (!labelInSource(sources.files[file], label)) {
      problems.push(`"${label}" is not shown by ${FILES[file]}`);
    }
  }
  // The fidelity words are the frame's own, all three, and the roll's sentence is the view's.
  const fidelity = constBlock(sources.files.fidelity, 'FIDELITY_LABELS');
  const words = [...fidelity.matchAll(/^\s*\w+: '([^']+)',$/gm)].map((match) => match[1]);
  const said = [
    LIVE_VIEW_PROMPT_LABELS.checked,
    LIVE_VIEW_PROMPT_LABELS.aboutRight,
    LIVE_VIEW_PROMPT_LABELS.onlyInGame,
  ];
  if (JSON.stringify(words) !== JSON.stringify(said)) {
    problems.push(`the fidelity words are ${words.join(', ')}, not the prompt's`);
  }
  const differs = exportedLiteral(sources.files.lootModel, 'ROLL_DIFFERS');
  if (differs !== LIVE_VIEW_PROMPT_LABELS.differs) {
    problems.push(`ROLL_DIFFERS is ${String(differs)}, not the prompt's sentence`);
  }
  return problems;
}

describe('the data live views topic against the code (B617)', () => {
  const text = topicText(systemPrompt());
  const sources = liveViewSources();

  it("names the live view registry's data kinds, both ways, each with a live Preview", () => {
    expect(checkKinds(text, sources)).toEqual([]);
  });

  it('quotes labels the components show, the fidelity words and the roll sentence', () => {
    expect(checkLabels(text, sources)).toEqual([]);
  });

  it('states the limits 2L1 to 2L12 in plain words', () => {
    for (const words of [
      'Play is the real check',
      'one roll is MSM',
      'named, never left out',
      'need the Minecraft folder set up',
      'a situation is a sample',
      'the advancement layout is about right',
      'criteria never tick',
      'buttons run nothing',
      'functions run as far as Try it understands them',
      'its selectors see one player and its mobs',
      'enchantment effects are described, not played',
      'vanilla blocks in Try it are props',
      "other people's plugin kinds have no live view",
    ]) {
      expect(text, words).toContain(words);
    }
  });

  it('never says what a view shows', () => {
    expect(text).toContain('you cannot see the views, so never say what they show');
  });
});

describe('the checks bite (B617)', () => {
  const text = topicText(systemPrompt());
  const sources = liveViewSources();
  const withFile = (key: FileKey, change: (source: string) => string): LiveViewSources => ({
    ...sources,
    files: { ...sources.files, [key]: change(sources.files[key]) },
  });

  it('a data view dropped from the registry', () => {
    const changed = withFile('dataViews', (source) =>
      source.replace("  'minecraft:chat_type': sampleLine,\n", ''),
    );
    expect(checkKinds(text, changed)).toEqual([
      'the prompt names minecraft:chat_type, which has no live view',
    ]);
  });

  it('a data view added to the registry', () => {
    const changed = withFile('dataViews', (source) =>
      source.replace(
        "  'minecraft:chat_type': sampleLine,\n",
        "  'minecraft:chat_type': sampleLine,\n  'minecraft:recipe': sampleLine,\n",
      ),
    );
    expect(checkKinds(text, changed)).toEqual([
      'minecraft:recipe has a live view the prompt does not name',
    ]);
  });

  it('a kind whose Preview is no longer a live view', () => {
    const previewKinds = new Map(sources.previewKinds);
    previewKinds.set('minecraft:dialog', undefined);
    expect(checkKinds(text, { ...sources, previewKinds })).toEqual([
      "minecraft:dialog's Preview is not a live view",
    ]);
  });

  it('a label changed in a copy of a component', () => {
    const changed = withFile('lineMarks', (source) =>
      source.replace("'Run in Try it'", "'Run it in Try it'"),
    );
    expect(checkLabels(text, changed)).toEqual([
      '"Run in Try it" is not shown by app/src/renderer/src/components/function-editor/line-marks.ts',
    ]);
  });

  it('a fidelity word changed in the frame', () => {
    const changed = withFile('fidelity', (source) =>
      source.replace("about_right: 'About right',", "about_right: 'Roughly',"),
    );
    expect(checkLabels(text, changed)).toEqual([
      '"About right" is not shown by app/src/renderer/src/liveviews/frame/fidelity.ts',
      "the fidelity words are As in the game, checked, Roughly, Only in the game, not the prompt's",
    ]);
  });

  it('a quoted label no constant lists', () => {
    expect(checkLabels(`${text} "Roll it twice"`, sources)).toEqual([
      'the paragraph quotes "Roll it twice", which no constant lists',
    ]);
  });
});
