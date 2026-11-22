/**
 * The live world map's shared controls (ADR 0119 D9; B582): the seed (typed, rolled, or taken
 * from one of the user's worlds), the position (X and Z boxes, Go to spawn), the zoom, the keys
 * that pan and zoom a focused map, the Preview tag, the set-up banner and the notes that say
 * what the view left out. Try it's ground (B584) uses the same seed and position.
 */

import { type KeyboardEvent, useEffect, useState } from 'react';
import type { TryItWorldInfo, TryItWorldsPlatform } from '../../../shared/platform';
import { Button } from '../components/ui/Button';
import { randomSeed, TERRAIN_ZOOMS, type TerrainView, type TerrainZoom } from './view-store';

/** The words of the set-up banner (plan, "Very easy wording"). */
export const SET_UP_WORDS =
  "This world uses Minecraft's own land files. Set up your Minecraft folder to see it here.";

/** Map pixels a key press pans by (Shift: four times as far). */
export const PAN_PIXELS = 16;

/** The next zoom in (`-1`, fewer blocks a pixel) or out (`1`), or the same at either end. */
export function nextZoom(zoom: TerrainZoom, direction: -1 | 1): TerrainZoom {
  const index = TERRAIN_ZOOMS.indexOf(zoom);
  const next = Math.min(TERRAIN_ZOOMS.length - 1, Math.max(0, index + direction));
  return TERRAIN_ZOOMS[next] ?? zoom;
}

/**
 * What a key on a focused map does to the view: arrows (and W, A, S, D) pan, `+` and `-` zoom,
 * Home goes to spawn. `null` for any other key.
 */
export function viewForKey(
  view: Pick<TerrainView, 'x' | 'z' | 'zoom'>,
  key: string,
  shift: boolean,
): Partial<TerrainView> | null {
  const distance = PAN_PIXELS * view.zoom * (shift ? 4 : 1);
  switch (key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { x: view.x - distance };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { x: view.x + distance };
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { z: view.z - distance };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { z: view.z + distance };
    case '+':
    case '=':
      return { zoom: nextZoom(view.zoom, -1) };
    case '-':
    case '_':
      return { zoom: nextZoom(view.zoom, 1) };
    case 'Home':
      return { x: 0, z: 0 };
    default:
      return null;
  }
}

/** A key handler for a map element: applies {@link viewForKey} and stops the page scrolling. */
export function mapKeyHandler(
  view: Pick<TerrainView, 'x' | 'z' | 'zoom'>,
  onChange: (patch: Partial<TerrainView>) => void,
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const patch = viewForKey(view, event.key, event.shiftKey);
    if (patch === null) return;
    event.preventDefault();
    onChange(patch);
  };
}

function savedWorlds(): TryItWorldsPlatform | null {
  const bridge = (globalThis as { msm?: { tryItWorlds?: TryItWorldsPlatform } }).msm;
  return bridge?.tryItWorlds ?? null;
}

/** Props of {@link SeedControls}. */
export interface SeedControlsProps {
  /** The seed as typed. */
  seed: string;
  /** The number the engine made of it (`WorldSummary.seed`), when known. */
  seedNumber: string | null;
  onSeed(seed: string): void;
  /** Test hook: the saves list (default `window.msm.tryItWorlds`). */
  worlds?: TryItWorldsPlatform | null;
}

/** The seed box, Roll a new seed, and Seed of one of my worlds. */
export function SeedControls({ seed, seedNumber, onSeed, worlds }: SeedControlsProps) {
  const [text, setText] = useState(seed);
  const [saves, setSaves] = useState<TryItWorldInfo[] | null>(null);
  const [savesError, setSavesError] = useState<string | null>(null);
  useEffect(() => setText(seed), [seed]);
  const platform = worlds === undefined ? savedWorlds() : worlds;

  const loadSaves = (): void => {
    if (saves !== null || platform === null) return;
    platform.listWorlds().then(
      (list) => setSaves(list.filter((world) => world.seed !== null)),
      (error: unknown) => setSavesError(error instanceof Error ? error.message : String(error)),
    );
  };

  const commit = (): void => {
    const trimmed = text.trim();
    if (trimmed !== '' && trimmed !== seed) onSeed(trimmed);
    else setText(seed);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        Seed
        <input
          data-testid="terrain-seed"
          className="w-48 min-w-0 max-w-full rounded border border-border bg-bg px-1"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </label>
      <Button data-testid="terrain-roll-seed" onClick={() => onSeed(randomSeed())}>
        Roll a new seed
      </Button>
      {platform === null ? null : (
        <label className="flex items-center gap-2">
          Seed of one of my worlds
          <select
            data-testid="terrain-world-seed"
            className="max-w-48 rounded border border-border bg-bg px-1"
            value=""
            onFocus={loadSaves}
            onPointerDown={loadSaves}
            onChange={(event) => {
              if (event.target.value !== '') onSeed(event.target.value);
            }}
          >
            <option value="">
              {saves === null
                ? 'Choose a world…'
                : saves.length === 0
                  ? 'No worlds with a seed found'
                  : 'Choose a world…'}
            </option>
            {(saves ?? []).map((world) => (
              <option key={world.id} value={world.seed ?? ''}>
                {`${world.name} (${world.gameFolder.name})`}
              </option>
            ))}
          </select>
        </label>
      )}
      {savesError === null ? null : <span className="text-xs text-error">{savesError}</span>}
      {seedNumber !== null && seedNumber !== seed.trim() ? (
        <span className="text-xs text-muted" data-testid="terrain-seed-number">
          {`The game makes ${seedNumber} of these words.`}
        </span>
      ) : null}
    </div>
  );
}

/** Props of {@link PositionControls}. */
export interface PositionControlsProps {
  view: Pick<TerrainView, 'x' | 'z' | 'zoom'>;
  onChange(patch: Partial<TerrainView>): void;
}

function NumberBox(props: { label: string; value: number; onValue(value: number): void }) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const commit = (): void => {
    const value = Number(text);
    if (text.trim() !== '' && Number.isFinite(value)) props.onValue(Math.round(value));
    else setText(String(props.value));
  };
  return (
    <label className="flex items-center gap-1">
      {props.label}
      <input
        data-testid={`terrain-${props.label.toLowerCase()}`}
        inputMode="numeric"
        className="w-20 rounded border border-border bg-bg px-1 tabular-nums"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </label>
  );
}

/** X and Z boxes, Go to spawn and the zoom buttons. */
export function PositionControls({ view, onChange }: PositionControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <NumberBox label="X" value={view.x} onValue={(x) => onChange({ x })} />
      <NumberBox label="Z" value={view.z} onValue={(z) => onChange({ z })} />
      <Button data-testid="terrain-spawn" onClick={() => onChange({ x: 0, z: 0 })}>
        Go to spawn
      </Button>
      <Button
        data-testid="terrain-zoom-in"
        aria-label="Zoom in"
        disabled={view.zoom === TERRAIN_ZOOMS[0]}
        onClick={() => onChange({ zoom: nextZoom(view.zoom, -1) })}
      >
        +
      </Button>
      <Button
        data-testid="terrain-zoom-out"
        aria-label="Zoom out"
        disabled={view.zoom === TERRAIN_ZOOMS[TERRAIN_ZOOMS.length - 1]}
        onClick={() => onChange({ zoom: nextZoom(view.zoom, 1) })}
      >
        −
      </Button>
      <span className="text-xs text-muted" data-testid="terrain-zoom">
        {view.zoom === 1 ? '1 block a pixel' : `${view.zoom} blocks a pixel`}
      </span>
    </div>
  );
}

/** The Preview tag (limit WL1). */
export function PreviewTag() {
  return (
    <span
      data-testid="terrain-preview-tag"
      title="Worked out by MSM from your files, not made by the game. Play is the real check."
      className="rounded border border-border px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted"
    >
      Preview
    </span>
  );
}

/** The banner shown instead of a picture that needs Minecraft's own files (ADR 0119 D10). */
export function SetUpBanner({ onSetup }: { onSetup(): void }) {
  return (
    <div
      role="status"
      data-testid="terrain-set-up"
      className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
    >
      <span>{SET_UP_WORDS}</span>
      <Button onClick={onSetup}>Set up Minecraft folder</Button>
    </div>
  );
}

/** The notes under a view: what it drew only about right, and what it left out. */
export function TerrainNotes({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul
      aria-label="What this view leaves out"
      data-testid="terrain-notes"
      className="flex flex-col gap-1 text-xs text-muted [overflow-wrap:anywhere]"
    >
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
