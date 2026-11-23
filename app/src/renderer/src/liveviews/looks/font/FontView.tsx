/**
 * The font's live view (ADR 0121 D6; B624): a line the user types, drawn with the font at GUI
 * scales 1 to 4, missing letters marked, and every provider listed with how close it is
 * (`providers.ts`). Bitmap, space and reference providers are as in the game (B619 3S7);
 * TrueType through the browser's own font loading and `unihex` through the font worker are about
 * right; a provider the view cannot draw is named with the reason.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VanillaSoundReader } from '../../../audio/vanilla-sounds';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { FIDELITY_LABELS, type Fidelity, weakest } from '../../frame/fidelity';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { drawLine, lineCanvasSize } from './draw';
import { codePointName, type FoundGlyph, type LineLayout, layoutLine } from './layout';
import type { RgbaPixels } from './png';
import {
  type BitmapReady,
  type FontSources,
  type ProviderEntry,
  providerAdvance,
  type ResolvedFont,
  resolveFont,
  type TtfReady,
} from './providers';
import { type UnihexGlyph, unihexGlyph } from './unihex';
import { sharedUnihexClient } from './unihex-client';

/** The line drawn until the user types one. */
export const DEFAULT_FONT_SAMPLE = 'Hello, world! 123';

/** The longest line drawn, in characters. */
export const MAX_FONT_SAMPLE = 200;

/** The GUI scales drawn. */
export const FONT_SCALES: readonly number[] = [1, 2, 3, 4];

const TYPE_WORDS: Readonly<Record<string, string>> = {
  bitmap: 'Picture',
  space: 'Spaces',
  reference: 'Uses the font',
  ttf: 'TrueType',
  unihex: 'Unifont (unihex)',
};

/** The value after it has stopped changing for 150 ms. */
function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), LIVE_VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, settled]);
  return settled;
}

/** The project's font `id` (the element being shown is its newest data). */
function projectFontOf(project: Project, element: Element, id: string): Json | null {
  if (id === element.id) return element.data as Json;
  for (const namespace of project.namespaces) {
    for (const other of namespace.elements) {
      if (other.kind === 'minecraft:font' && other.id === id) return other.data as Json;
    }
  }
  return null;
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.length}-${(hash >>> 0).toString(16)}`;
}

const loadedFaces = new Map<string, Promise<string | null>>();

/** Loads a TrueType file with the browser's own font loading (each file once per run). */
export function loadTtfInBrowser(bytes: Uint8Array): Promise<string | null> {
  const key = hashBytes(bytes);
  let family = loadedFaces.get(key);
  if (family === undefined) {
    family = (async () => {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null;
      const name = `msm-font-${loadedFaces.size}`;
      const face = new FontFace(name, bytes.slice().buffer);
      await face.load();
      document.fonts.add(face);
      return name;
    })().catch(() => null);
    loadedFaces.set(key, family);
  }
  return family;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
const measured = new Map<string, number>();

/** A TrueType glyph's width at its size, from the browser; `null` where it cannot measure. */
function measureTtf(ready: TtfReady, text: string): number | null {
  const key = `${ready.family}|${ready.size}|${text}`;
  const known = measured.get(key);
  if (known !== undefined) return known;
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (measureContext === null) return null;
  measureContext.font = `${ready.size}px "${ready.family}"`;
  const width = measureContext.measureText(text).width;
  measured.set(key, width);
  return width;
}

const sheets = new WeakMap<RgbaPixels, HTMLCanvasElement | null>();

/** A bitmap provider's picture as a canvas (made once per picture). */
function sheetCanvas(ready: BitmapReady): CanvasImageSource | null {
  if (sheets.has(ready.sheet)) return sheets.get(ready.sheet) ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = ready.sheet.width;
  canvas.height = ready.sheet.height;
  const context = canvas.getContext('2d');
  const made = context === null ? null : canvas;
  if (context !== null && typeof ImageData !== 'undefined') {
    context.putImageData(
      new ImageData(new Uint8ClampedArray(ready.sheet.data), ready.sheet.width, ready.sheet.height),
      0,
      0,
    );
  }
  sheets.set(ready.sheet, made);
  return made;
}

/** Where the view reads a font's files from. */
export function fontSourcesOf(
  project: Project,
  element: Element,
  readers: {
    readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
    vanillaAssets: VanillaAssetReader | null;
    sounds?: VanillaSoundReader | null | undefined;
    loadTtf?: ((bytes: Uint8Array) => Promise<string | null>) | undefined;
  },
): FontSources {
  const { vanillaAssets, sounds } = readers;
  return {
    projectFont: (id) => projectFontOf(project, element, id),
    readProject: readers.readProject,
    readJar: vanillaAssets === null ? undefined : (path) => vanillaAssets.readAsset(path),
    readStore: sounds === null || sounds === undefined ? undefined : (key) => sounds.file(key),
    loadTtf: readers.loadTtf ?? loadTtfInBrowser,
  };
}

/** The glyph finder over a font's providers. */
export function glyphFinder(
  entries: readonly ProviderEntry[],
  unihex: ReadonlyMap<number, ReadonlyMap<number, UnihexGlyph>>,
  measure: (ready: TtfReady, text: string) => number | null = measureTtf,
): (codePoint: number, text: string) => FoundGlyph | null {
  return (codePoint, text) => {
    for (let index = 0; index < entries.length; index += 1) {
      const ready = entries[index]?.ready;
      if (ready === null || ready === undefined) continue;
      const glyphs = unihex.get(index);
      const advance = providerAdvance(ready, codePoint, measure, glyphs);
      if (advance === null) continue;
      switch (ready.type) {
        case 'bitmap': {
          const cell = ready.cells.get(codePoint);
          if (cell === undefined) continue;
          return { advance, provider: index, draw: { kind: 'bitmap', ...cell } };
        }
        case 'space':
          return { advance, provider: index, draw: { kind: 'space' } };
        case 'ttf':
          return { advance, provider: index, draw: { kind: 'ttf', text } };
        case 'unihex': {
          const glyph = glyphs?.get(codePoint);
          if (glyph === undefined) continue;
          return { advance, provider: index, draw: { kind: 'unihex', glyph } };
        }
      }
    }
    return null;
  };
}

/** The font read and made ready, following edits after they settle. */
function useResolvedFont(props: LiveViewProps): ResolvedFont | null {
  const { project, element, readProject, vanillaAssets, sounds } = props;
  const settled = useSettled(useMemo(() => ({ project, element }), [project, element]));
  const [resolved, setResolved] = useState<ResolvedFont | null>(null);
  useEffect(() => {
    let live = true;
    const sources = fontSourcesOf(settled.project, settled.element, {
      readProject,
      vanillaAssets,
      sounds,
    });
    void resolveFont(settled.element.data as Json, settled.element.id, sources).then(
      (font) => {
        if (live) setResolved(font);
      },
      () => {
        if (live) setResolved({ entries: [], needsSetUp: false });
      },
    );
    return () => {
      live = false;
    };
  }, [settled, readProject, vanillaAssets, sounds]);
  return resolved;
}

interface UnihexState {
  readonly glyphs: ReadonlyMap<number, ReadonlyMap<number, UnihexGlyph>>;
  readonly problems: ReadonlyMap<number, string>;
}

const NO_UNIHEX: UnihexState = { glyphs: new Map(), problems: new Map() };

/** The unihex glyphs of the typed line, from the font worker (only when the font names one). */
function useUnihexGlyphs(font: ResolvedFont | null, text: string): UnihexState {
  const [state, setState] = useState<UnihexState>(NO_UNIHEX);
  useEffect(() => {
    const wanted = (font?.entries ?? [])
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.ready?.type === 'unihex');
    if (wanted.length === 0) {
      setState(NO_UNIHEX);
      return;
    }
    let live = true;
    const codePoints = Array.from(new Set(Array.from(text, (char) => char.codePointAt(0) ?? 0)));
    void (async () => {
      const glyphs = new Map<number, Map<number, UnihexGlyph>>();
      const problems = new Map<number, string>();
      for (const { entry, index } of wanted) {
        const ready = entry.ready;
        if (ready?.type !== 'unihex') continue;
        const answer = await sharedUnihexClient().glyphs(ready.file, ready.read, codePoints);
        if (!live || answer === null) return;
        if (!answer.ok) {
          problems.set(
            index,
            answer.reason === 'missing'
              ? 'the hex file was not found'
              : 'the hex file could not be read',
          );
          continue;
        }
        const made = new Map<number, UnihexGlyph>();
        for (const [codePoint, hex] of answer.glyphs) {
          made.set(codePoint, unihexGlyph(codePoint, hex, ready.overrides));
        }
        glyphs.set(index, made);
      }
      if (live) setState({ glyphs, problems });
    })();
    return () => {
      live = false;
    };
  }, [font, text]);
  return state;
}

/** One scale's line. */
function LineCanvas(props: {
  layout: LineLayout;
  entries: readonly ProviderEntry[];
  scale: number;
}) {
  const { layout, entries, scale } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const size = lineCanvasSize(layout.width, scale);
  useEffect(() => {
    const context = ref.current?.getContext('2d') ?? null;
    if (context === null) return;
    drawLine(context, layout, entries, scale, sheetCanvas);
  }, [layout, entries, scale]);
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-muted">{`GUI scale ${scale}`}</figcaption>
      <div className="max-w-full overflow-x-auto">
        <canvas
          ref={ref}
          data-testid="font-line"
          data-scale={scale}
          data-width={layout.width * scale}
          width={size.width}
          height={size.height}
          aria-label={`The line at GUI scale ${scale}, ${layout.width * scale} pixels wide`}
          style={{ width: size.width, height: size.height, backgroundColor: '#1f1f1f' }}
          className="block rounded"
        />
      </div>
    </figure>
  );
}

/** The provider list. */
function ProviderList(props: {
  entries: readonly ProviderEntry[];
  problems: ReadonlyMap<number, string>;
}) {
  const { entries, problems } = props;
  return (
    <ul aria-label="Providers" data-testid="font-providers" className="flex flex-col gap-1 text-xs">
      {entries.map((entry, index) => {
        const problem = entry.problem ?? problems.get(index) ?? null;
        const fidelity: Fidelity = problem === null ? entry.fidelity : 'only_in_game';
        const drawn = entry.ready !== null && problem === null;
        return (
          <li
            key={index}
            data-type={entry.type}
            data-fidelity={fidelity}
            data-drawn={entry.type === 'reference' ? 'through' : drawn ? 'yes' : 'no'}
            className="[overflow-wrap:anywhere]"
          >
            <span className="font-medium">{TYPE_WORDS[entry.type] ?? entry.type}</span>
            {` ${entry.what}`}
            {entry.through === null ? '' : ` (through ${entry.through})`}
            {`: ${FIDELITY_LABELS[fidelity]}`}
            {problem === null ? '' : `; not drawn: ${problem}.`}
          </li>
        );
      })}
    </ul>
  );
}

/** The view. */
export default function FontView(props: LiveViewProps) {
  const { preferences, onPreferences, onSetup } = props;
  const typed = preferences.sampleText ?? '';
  const [text, setText] = useState(typed);
  useEffect(() => setText(preferences.sampleText ?? ''), [preferences.sampleText]);
  const shown = Array.from(text.trim() === '' ? DEFAULT_FONT_SAMPLE : text)
    .slice(0, MAX_FONT_SAMPLE)
    .join('');
  const font = useResolvedFont(props);
  const unihex = useUnihexGlyphs(font, shown);
  const entries = useMemo(() => font?.entries ?? [], [font]);
  const layout = useMemo(
    () => layoutLine(shown, glyphFinder(entries, unihex.glyphs)),
    [shown, entries, unihex.glyphs],
  );
  const levels: Fidelity[] = entries.map((entry, index) =>
    entry.problem !== null || unihex.problems.has(index) ? 'only_in_game' : entry.fidelity,
  );
  const fidelity = entries.length === 0 ? 'checked' : weakest(levels);
  const notes: string[] = [];
  if (entries.some((entry) => entry.ready?.type === 'ttf')) {
    notes.push(
      'TrueType letters are drawn by the app’s browser, so their shapes and widths are about right (within about a pixel a word).',
    );
  }
  if (entries.some((entry) => entry.ready?.type === 'unihex')) {
    notes.push('Unifont widths are about right: the game was measured on one wide letter only.');
  }
  notes.push(
    'Text is drawn without its shadow, colour or bold, which the game adds in each place.',
  );
  return (
    <LiveViewFrame
      title="Font"
      fidelity={fidelity}
      notes={notes}
      needsSetUp={font?.needsSetUp ?? false}
      onSetup={onSetup}
      controls={
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Type to try it
          <input
            data-testid="font-sample-text"
            className="min-w-0 flex-1 rounded border border-border bg-bg px-1"
            value={text}
            placeholder={DEFAULT_FONT_SAMPLE}
            maxLength={MAX_FONT_SAMPLE}
            onChange={(event) => {
              setText(event.target.value);
              onPreferences({ sampleText: event.target.value });
            }}
          />
        </label>
      }
    >
      {font === null ? (
        <p className="text-sm text-muted">Reading the font…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.length === 0 && (
            <p data-testid="font-empty" className="text-sm text-muted">
              This font has no providers yet, so every letter is the missing box.
            </p>
          )}
          {FONT_SCALES.map((scale) => (
            <LineCanvas key={scale} layout={layout} entries={entries} scale={scale} />
          ))}
          <p data-testid="font-width" className="text-xs text-muted">
            {`${layout.width} pixels wide at GUI scale 1.`}
          </p>
          {layout.missing.length > 0 && (
            <p
              data-testid="font-missing"
              role="status"
              className="text-sm [overflow-wrap:anywhere]"
            >
              {`Not in this font, drawn as the marked box: ${layout.missing
                .map((char) => `${char.trim() === '' ? '(space)' : char} (${codePointName(char)})`)
                .join(', ')}.`}
            </p>
          )}
          {entries.length > 0 && <ProviderList entries={entries} problems={unihex.problems} />}
        </div>
      )}
    </LiveViewFrame>
  );
}
