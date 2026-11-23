/**
 * The prompt's truth test for the looks and sounds (Live views 3, B632; ADR 0125 D7, ADR 0121): a
 * sibling of `ai-prompt-truth.live-views.test.ts`. The kinds the paragraph names are the looks
 * registry's, both ways; the panel kinds are kinds of the plugin registry whose Preview is a live
 * view, and the Studio kinds are kinds of it; every label the two paragraphs quote is in the
 * source of the component that shows it; "every sound picker" is the app's list of them. Each
 * check returns the facts it finds false, so the mutation cases at the end prove that it bites.
 */

import { LOOKS_PROMPT_KINDS, LOOKS_PROMPT_LABELS, systemPrompt } from '@msm/ai';
import { createMemoryFileSystem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { constBlock, labelInSource, readRepoFile } from './ai-prompt-truth-sources';
import { newSession } from './session-fixture';

const RENDERER = 'app/src/renderer/src';

/** The files the checks read, by a short name. */
const FILES = Object.freeze({
  looks: `${RENDERER}/liveviews/looks/index.ts`,
  frame: `${RENDERER}/liveviews/frame/LiveViewFrame.tsx`,
  fidelity: `${RENDERER}/liveviews/frame/fidelity.ts`,
  playButton: `${RENDERER}/audio/SoundPlayButton.tsx`,
  pickers: `${RENDERER}/audio/sound-pickers.ts`,
  myThings: `${RENDERER}/components/home/MyThings.tsx`,
  seeIt: `${RENDERER}/components/ai/AiSeeIt.tsx`,
});

type FileKey = keyof typeof FILES;
type LabelKey = keyof typeof LOOKS_PROMPT_LABELS;

/** Where each quoted label is shown. */
const LABEL_FILES: Readonly<Record<LabelKey, FileKey>> = Object.freeze({
  preview: 'frame',
  play: 'playButton',
  findMinecraft: 'playButton',
  myThings: 'myThings',
  aboutRight: 'fidelity',
  onlyInGame: 'fidelity',
  seeIt: 'seeIt',
});

/** The sources the checks read: file texts and the plugin registry's kinds with their Preview. */
interface LooksSources {
  readonly files: Readonly<Record<FileKey, string>>;
  readonly previewKinds: ReadonlyMap<string, string | undefined>;
}

function looksSources(): LooksSources {
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
  const found = ['- Live views of looks and sounds:', '- Limits of the looks:'].map((head) => {
    const line = lines.find((candidate) => candidate.startsWith(head));
    if (line === undefined) throw new Error(`No paragraph starts with ${JSON.stringify(head)}.`);
    return line;
  });
  return found.join('\n');
}

/** The quoted kind ids of a `const NAME` block of the looks index. */
function kindsOf(source: string, name: string): string[] {
  return [...constBlock(source, name).matchAll(/^\s*'([a-z_]+:[a-z0-9_/]+)'[:,]/gm)].map(
    (match) => match[1] as string,
  );
}

/** The kinds, both ways against the looks registry, each a plugin kind, each named. */
function checkKinds(text: string, sources: LooksSources): string[] {
  const problems: string[] = [];
  const views = kindsOf(sources.files.looks, 'LOOKS_VIEWS');
  if (views.length === 0) problems.push('LOOKS_VIEWS lists no kinds');
  const named = Object.keys(LOOKS_PROMPT_KINDS);
  for (const kind of views) {
    if (!named.includes(kind)) problems.push(`${kind} has a look the prompt does not name`);
  }
  for (const kind of named) {
    if (!views.includes(kind)) problems.push(`the prompt names ${kind}, which has no look`);
  }
  for (const kind of kindsOf(sources.files.looks, 'LOOKS_PANEL_KINDS')) {
    if (!sources.previewKinds.has(kind)) problems.push(`${kind} is no kind of the plugin registry`);
    else if (sources.previewKinds.get(kind) !== 'live_view') {
      problems.push(`${kind}'s Preview is not a live view`);
    }
  }
  for (const kind of kindsOf(sources.files.looks, 'LOOKS_STUDIO_KINDS')) {
    if (!sources.previewKinds.has(kind)) problems.push(`${kind} is no kind of the plugin registry`);
  }
  for (const [kind, words] of Object.entries(LOOKS_PROMPT_KINDS)) {
    if (!text.includes(words)) problems.push(`the paragraph does not name ${kind} as "${words}"`);
  }
  return problems;
}

/** Every quoted label is a constant's, and each is in the source of the component that shows it. */
function checkLabels(text: string, sources: LooksSources): string[] {
  const problems: string[] = [];
  const labels = new Set<string>(Object.values(LOOKS_PROMPT_LABELS));
  for (const match of text.matchAll(/"([^"]+)"/g)) {
    const label = match[1] as string;
    if (!labels.has(label))
      problems.push(`the paragraph quotes "${label}", which no constant lists`);
  }
  for (const [key, label] of Object.entries(LOOKS_PROMPT_LABELS) as [LabelKey, string][]) {
    const file = LABEL_FILES[key];
    if (!labelInSource(sources.files[file], label)) {
      problems.push(`"${label}" is not shown by ${FILES[file]}`);
    }
  }
  // "Also beside every sound picker": the app keeps the list of them, and it is not empty.
  if (
    !/export const SOUND_PICKERS\b[^=]*=\s*(?:Object\.freeze\()?\[\s*\{/.test(sources.files.pickers)
  ) {
    problems.push('SOUND_PICKERS lists no sound pickers');
  }
  return problems;
}

describe('the looks and sounds topic against the code (B632)', () => {
  const text = topicText(systemPrompt());
  const sources = looksSources();

  it("names the looks registry's kinds, both ways, each a kind of the plugin registry", () => {
    expect(checkKinds(text, sources)).toEqual([]);
  });

  it('quotes labels the components show', () => {
    expect(checkLabels(text, sources)).toEqual([]);
  });

  it('states the limits 3L1 to 3L12 in plain words', () => {
    for (const words of [
      'Play is the real check',
      "Minecraft's own sounds and pictures need the Minecraft folder set up",
      'sounds are heard flat, with no distance or echo',
      "bodies are MSM's stand-ins",
      'turning but never walking',
      'the zombie nautilus is a flat sheet with its parts named',
      "villager hats and babies and pets' collars are not drawn",
      'without WebGL looks are flat pictures, and sounds still play',
      "a bottle leaves Minecraft's own effect colours out",
      'shields are not measured',
      'shaders run only where WebGL 2 compiles them',
      "the game's core shaders are a compile check only",
      "effects run on MSM's own test picture with stand-in values for what the game fills",
      'TrueType and unihex fonts are about right',
      'the creative tab page is a drawing without search or scrolling',
      'a day strip shows values, not the sky',
      'only English text shows',
    ]) {
      expect(text, words).toContain(words);
    }
  });

  it('never says what a view shows', () => {
    expect(text).toContain('you cannot see or hear them, so never say what they show');
  });
});

describe('the checks bite (B632)', () => {
  const text = topicText(systemPrompt());
  const sources = looksSources();
  const withFile = (key: FileKey, change: (source: string) => string): LooksSources => ({
    ...sources,
    files: { ...sources.files, [key]: change(sources.files[key]) },
  });

  it('a look dropped from the registry', () => {
    const changed = withFile('looks', (source) =>
      source.replace("  'minecraft:instrument': instrument,\n", ''),
    );
    expect(checkKinds(text, changed)).toEqual([
      'the prompt names minecraft:instrument, which has no look',
    ]);
  });

  it('a look added to the registry', () => {
    const changed = withFile('looks', (source) =>
      source.replace(
        "  'minecraft:instrument': instrument,\n",
        "  'minecraft:instrument': instrument,\n  'minecraft:recipe': instrument,\n",
      ),
    );
    expect(checkKinds(text, changed)).toEqual([
      'minecraft:recipe has a look the prompt does not name',
    ]);
  });

  it('a panel kind whose Preview is no longer a live view', () => {
    const previewKinds = new Map(sources.previewKinds);
    previewKinds.set('minecraft:font', undefined);
    expect(checkKinds(text, { ...sources, previewKinds })).toEqual([
      "minecraft:font's Preview is not a live view",
    ]);
  });

  it('a label changed in a copy of a component', () => {
    const changed = withFile('myThings', (source) =>
      source.replaceAll('Particles and sounds', 'Sounds and particles'),
    );
    expect(checkLabels(text, changed)).toEqual([
      '"Particles and sounds" is not shown by app/src/renderer/src/components/home/MyThings.tsx',
    ]);
  });

  it('the set-up button renamed', () => {
    const changed = withFile('playButton', (source) =>
      source.replace('Find my Minecraft', 'Set up Minecraft'),
    );
    expect(checkLabels(text, changed)).toEqual([
      '"Find my Minecraft" is not shown by app/src/renderer/src/audio/SoundPlayButton.tsx',
    ]);
  });

  it('a quoted label no constant lists', () => {
    expect(checkLabels(`${text} "Play it twice"`, sources)).toEqual([
      'the paragraph quotes "Play it twice", which no constant lists',
    ]);
  });
});
