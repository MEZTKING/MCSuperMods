/**
 * The grounds picker (ADR 0087 D1, B405): Grid, Flat world, Quick world (shape, layers, water,
 * trees, seed, presets and the user's own presets), From my world (the user's saves and a
 * centre) and My world generation (B584, ADR 0119 D8: one of the project's dimensions or world
 * types, the seed shared with the world map, and a place). It only gathers the choice; the view
 * loads it ({@link GroundPickerProps.onApply}) and the picker shows the progress and any error
 * in plain words. When the area has something to lose, "Use this ground" asks first.
 *
 * Empty sky and One of my buildings (B558, ADR 0117 D4) are the games grounds: the first says
 * what it will show for the project, the second lists the project's structures by name.
 *
 * {@link GeneratedGroundPanel} is the side panel's part of a generated ground: Move up, Move
 * down, Make the land around me, Show on the map, the Preview tag, the stage arriving, the
 * set-up banner and the notes.
 *
 * Part of the lazy Try it chunk.
 */

import type { Project } from '@msm/plugin-api';
import {
  type GamesProject,
  GENERATED_MOVE_BLOCKS,
  type GroundKind,
  QUICK_LIMITS,
  QUICK_PRESETS,
  QUICK_SHAPES,
  QUICK_TREES,
  type QuickLayer,
  type QuickWorldOptions,
  stretchLayerIndex,
} from '@msm/sim';
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { TryItWorldInfo, TryItWorldsPlatform } from '../../../shared/platform';
import { pngDataUrl } from '../components/AssetList';
import {
  ThingPicker,
  type ThingPictures,
  type ThingSection,
  thingWords,
  vanillaPicturePaths,
} from '../components/thing-picker/ThingPicker';
import { Button, iconButtonClass } from '../components/ui/Button';
import { useUiStore } from '../store/ui-store';
import { PreviewTag, SeedControls, SetUpBanner } from '../terrain/controls';
import type { WorldgenSession } from '../terrain/files';
import { useTerrainView } from '../terrain/view-store';
import { terrainSessionFor } from '../terrain/WorldMap';
import {
  DEFAULT_QUICK_OPTIONS,
  defaultGeneratedSource,
  GENERATED_WORDS,
  type GeneratedSourceChoice,
  GROUND_CHOICES,
  type GroundChoice,
  generatedSources,
  generatedStripLine,
  groundBuildings,
  lastOpenElementId,
  NO_GENERATED_HERE,
  NO_GENERATED_SOURCE,
  newSeed,
  parseCentre,
  SHAPE_LABELS,
  STAGE_WORDS,
  TREE_LABELS,
  terrainViewKey,
  unreadableReason,
  useGroundPresets,
  voidGroundWords,
} from './grounds';
import type {
  GeneratedGroundState,
  GroundTerrainLink,
  LoweringSession,
  TryItArea,
} from './session-source';

/** Blocks offered for layers when the registry cannot be read. */
const COMMON_LAYER_BLOCKS: readonly string[] = [
  'minecraft:grass_block',
  'minecraft:dirt',
  'minecraft:coarse_dirt',
  'minecraft:podzol',
  'minecraft:stone',
  'minecraft:deepslate',
  'minecraft:sand',
  'minecraft:red_sand',
  'minecraft:sandstone',
  'minecraft:gravel',
  'minecraft:snow_block',
  'minecraft:smooth_stone',
  'minecraft:bedrock',
];

/** Props of {@link GroundPicker}. */
export interface GroundPickerProps {
  /** The tab to open on. */
  initial: GroundKind;
  /** The quick world options to start from (the last quick world), or the first preset. */
  quick?: QuickWorldOptions;
  /** Whether replacing the area loses something (placed blocks, mobs). */
  hasChanges: boolean;
  /** Reads the user's worlds; `null` when this app cannot. */
  worlds: TryItWorldsPlatform | null;
  /** The game's block ids, for the layers' picker. */
  blockIds?: () => Promise<readonly string[]>;
  /** Pictures for the layers' picker. */
  pictures?: ThingPictures | null;
  /** The target's textures folder name, for vanilla pictures. */
  texturesFolder: string;
  /**
   * My world generation (B584): the project's worlds, the seed and the place to start from;
   * `null` (or absent) when this window cannot make land.
   */
  generated?: GeneratedPickerProps | null;
  /** The project's games and structures (B558), for Empty sky and One of my buildings. */
  games?: GamesProject | null;
  /** Loads the choice; a rejection is shown in the picker. Resolves when the area is ready. */
  onApply(choice: GroundChoice, progress: (text: string) => void): Promise<void>;
  onClose(): void;
}

/** What the picker needs for My world generation. */
export interface GeneratedPickerProps {
  /** The project's worlds (`grounds.ts` `generatedSources`). */
  readonly sources: readonly GeneratedSourceChoice[];
  /** The one to start on (the element open in the editor, else the first). */
  readonly initial: GeneratedSourceChoice | null;
  /** The seed as typed (shared with the world map). */
  readonly seed: string;
  /** The place to start on (the map's position). */
  readonly centre: { readonly x: number; readonly z: number };
}

const clampNumber = (text: string, min: number, max: number, fallback: number): number => {
  const value = Math.round(Number(text));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

const blockLabel = (id: string): string => thingWords(id.replace(/\[.*$/, ''), 'block');

/** The picker; see the module comment. */
export function GroundPicker(props: GroundPickerProps) {
  const [kind, setKind] = useState<GroundKind>(props.initial);
  const [quick, setQuick] = useState<QuickWorldOptions>(props.quick ?? DEFAULT_QUICK_OPTIONS);
  const [presetName, setPresetName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [pickingLayer, setPickingLayer] = useState<number | null>(null);
  const [blockIds, setBlockIds] = useState<readonly string[] | null>(null);
  const userPresets = useGroundPresets((state) => state.presets);

  // From my world.
  const [worldList, setWorldList] = useState<TryItWorldInfo[] | null>(null);
  const [worldsError, setWorldsError] = useState<string | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [centreMode, setCentreMode] = useState<'spawn' | 'xz'>('spawn');
  const [centreX, setCentreX] = useState('0');
  const [centreZ, setCentreZ] = useState('0');

  // My world generation.
  const generated = props.generated ?? null;
  const [genKey, setGenKey] = useState<string | null>(generated?.initial?.key ?? null);
  const [genSeed, setGenSeed] = useState(generated?.seed ?? '0');
  const [genX, setGenX] = useState(String(generated?.centre.x ?? 0));
  const [genZ, setGenZ] = useState(String(generated?.centre.z ?? 0));

  // The games grounds (B558).
  const buildings = useMemo(
    () => (props.games == null ? [] : groundBuildings(props.games)),
    [props.games],
  );
  const [building, setBuilding] = useState<string | null>(null);
  const chosenBuilding = buildings.find((one) => one.id === building) ?? buildings[0] ?? null;

  useEffect(() => {
    if (kind !== 'world' || worldList !== null || props.worlds === null) return;
    let live = true;
    props.worlds.listWorlds().then(
      (list) => {
        if (!live) return;
        setWorldList(list);
        setWorldId((current) => current ?? list.find((world) => world.readable)?.id ?? null);
      },
      (failure: unknown) => {
        if (!live) return;
        setWorldList([]);
        setWorldsError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      live = false;
    };
  }, [kind, worldList, props.worlds]);

  const { blockIds: readBlockIds } = props;
  useEffect(() => {
    if (pickingLayer === null || blockIds !== null) return;
    let live = true;
    const done = (ids: readonly string[]) => {
      if (live) setBlockIds(ids.length === 0 ? COMMON_LAYER_BLOCKS : ids);
    };
    if (readBlockIds === undefined) done([]);
    else readBlockIds().then(done, () => done([]));
    return () => {
      live = false;
    };
  }, [pickingLayer, blockIds, readBlockIds]);

  const sections = useMemo((): ThingSection[] => {
    if (blockIds === null) return [];
    const things = blockIds
      .filter((id) => id.startsWith('minecraft:') && !id.endsWith('air'))
      .map((id) => {
        const paths = vanillaPicturePaths(id, 'block', props.texturesFolder);
        return {
          id,
          name: thingWords(id, 'block'),
          sort: 'block' as const,
          source: 'vanilla' as const,
          picture: paths.length === 0 ? null : { from: 'vanilla' as const, paths },
        };
      });
    return [{ id: 'blocks', label: 'Minecraft blocks', things }];
  }, [blockIds, props.texturesFolder]);

  const setQuickPart = (part: Partial<QuickWorldOptions>): void => {
    setQuick((before) => ({ ...before, ...part }));
    setPresetName(undefined);
  };
  const setLayers = (layers: readonly QuickLayer[]): void => setQuickPart({ layers });
  const stretch = stretchLayerIndex(quick.layers);

  const selectedWorld = worldList?.find((world) => world.id === worldId) ?? null;
  const centre = centreMode === 'spawn' ? 'spawn' : parseCentre(centreX, centreZ);

  const choice = (): GroundChoice | string => {
    switch (kind) {
      case 'grid':
        return { kind: 'grid' };
      case 'flat':
        return { kind: 'flat' };
      case 'quick':
        return {
          kind: 'quick',
          options: quick,
          ...(presetName === undefined ? {} : { preset: presetName }),
        };
      case 'world':
        if (selectedWorld === null || !selectedWorld.readable) return 'Choose one of your worlds.';
        if (centre !== 'spawn' && typeof centre === 'string') return centre;
        return {
          kind: 'world',
          worldId: selectedWorld.id,
          worldName: selectedWorld.name,
          centre,
        };
      case 'generated': {
        if (generated === null) return NO_GENERATED_HERE;
        const world =
          generated.sources.find((source) => source.key === genKey) ?? generated.sources[0];
        if (world === undefined) return NO_GENERATED_SOURCE;
        const at = parseCentre(genX, genZ);
        if (typeof at === 'string') return at;
        return {
          kind: 'generated',
          world,
          seed: genSeed.trim() === '' ? '0' : genSeed.trim(),
          centre: at,
        };
      }
      case 'void':
        return { kind: 'void' };
      case 'structure':
        if (chosenBuilding === null) return 'Your project has no buildings yet.';
        return { kind: 'structure', structure: chosenBuilding.id };
    }
  };

  const apply = async (confirmed: boolean): Promise<void> => {
    const chosen = choice();
    if (typeof chosen === 'string') {
      setError(chosen);
      return;
    }
    if (props.hasChanges && !confirmed) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    setBusy('Loading the ground…');
    try {
      await props.onApply(chosen, setBusy);
      props.onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  const quickPanel = (
    <div className="flex flex-col gap-2" data-testid="tryit-quick">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted">Presets:</span>
        {QUICK_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            data-testid={`tryit-quick-preset-${preset.id}`}
            aria-pressed={presetName === preset.name}
            onClick={() => {
              setQuick(preset.options);
              setPresetName(preset.name);
            }}
          >
            {preset.name}
          </Button>
        ))}
        {userPresets.map((preset) => (
          <span key={preset.name} className="inline-flex items-center">
            <Button
              data-testid="tryit-quick-user-preset"
              data-name={preset.name}
              aria-pressed={presetName === preset.name}
              onClick={() => {
                setQuick(preset.options);
                setPresetName(preset.name);
              }}
            >
              {preset.name}
            </Button>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Delete my preset ${preset.name}`}
              onClick={() => useGroundPresets.getState().remove(preset.name)}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
        <label htmlFor="tryit-quick-shape">Shape</label>
        <select
          id="tryit-quick-shape"
          data-testid="tryit-quick-shape"
          className="rounded border border-border bg-bg px-1"
          value={quick.shape}
          onChange={(event) =>
            setQuickPart({ shape: event.target.value as QuickWorldOptions['shape'] })
          }
        >
          {QUICK_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {SHAPE_LABELS[shape]}
            </option>
          ))}
        </select>
        <label htmlFor="tryit-quick-trees">Trees</label>
        <select
          id="tryit-quick-trees"
          data-testid="tryit-quick-trees"
          className="rounded border border-border bg-bg px-1"
          value={quick.trees}
          onChange={(event) =>
            setQuickPart({ trees: event.target.value as QuickWorldOptions['trees'] })
          }
        >
          {QUICK_TREES.map((trees) => (
            <option key={trees} value={trees}>
              {TREE_LABELS[trees]}
            </option>
          ))}
        </select>
        <span>Water</span>
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="tryit-quick-water"
              checked={quick.water}
              onChange={(event) => setQuickPart({ water: event.target.checked })}
            />
            On
          </label>
          <label className="flex items-center gap-1">
            Level
            <input
              type="number"
              data-testid="tryit-quick-water-level"
              className="w-14 rounded border border-border bg-bg px-1"
              min={QUICK_LIMITS.minWaterLevel}
              max={QUICK_LIMITS.maxWaterLevel}
              disabled={!quick.water}
              value={quick.waterLevel}
              onChange={(event) =>
                setQuickPart({
                  waterLevel: clampNumber(
                    event.target.value,
                    QUICK_LIMITS.minWaterLevel,
                    QUICK_LIMITS.maxWaterLevel,
                    quick.waterLevel,
                  ),
                })
              }
            />
          </label>
        </span>
        <label htmlFor="tryit-quick-seed">Seed</label>
        <span className="flex items-center gap-1">
          <input
            id="tryit-quick-seed"
            type="number"
            data-testid="tryit-quick-seed"
            className="w-28 rounded border border-border bg-bg px-1"
            value={quick.seed}
            onChange={(event) =>
              setQuickPart({ seed: clampNumber(event.target.value, 0, 0xffffffff, quick.seed) })
            }
          />
          <Button
            data-testid="tryit-quick-new-seed"
            onClick={() => setQuickPart({ seed: newSeed() })}
          >
            New seed
          </Button>
        </span>
      </div>
      <fieldset className="flex flex-col gap-1 rounded border border-border p-1">
        <legend className="px-1 text-xs text-muted">Layers, top to bottom</legend>
        <ol className="flex flex-col gap-1" data-testid="tryit-quick-layers">
          {quick.layers.map((layer, index) => (
            <li key={index} className="flex items-center gap-1" data-testid="tryit-quick-layer">
              <button
                type="button"
                className="flex-1 truncate rounded border border-border bg-bg px-1 text-left"
                data-testid={`tryit-quick-layer-${index}-block`}
                data-block={layer.block}
                aria-label={`Layer ${index + 1}: ${blockLabel(layer.block)}. Change the block`}
                onClick={() => setPickingLayer(index)}
              >
                {blockLabel(layer.block)}
                {index === stretch && <span className="text-xs text-muted"> (stretches)</span>}
              </button>
              <input
                type="number"
                aria-label={`Layer ${index + 1} thickness`}
                data-testid={`tryit-quick-layer-${index}-thickness`}
                className="w-12 rounded border border-border bg-bg px-1"
                min={1}
                max={QUICK_LIMITS.maxThickness}
                value={layer.thickness}
                onChange={(event) =>
                  setLayers(
                    quick.layers.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            thickness: clampNumber(
                              event.target.value,
                              1,
                              QUICK_LIMITS.maxThickness,
                              entry.thickness,
                            ),
                          }
                        : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Move layer ${index + 1} up`}
                disabled={index === 0}
                onClick={() => {
                  const layers = [...quick.layers];
                  [layers[index - 1], layers[index]] = [
                    layers[index] as QuickLayer,
                    layers[index - 1] as QuickLayer,
                  ];
                  setLayers(layers);
                }}
              >
                <ArrowUp size={12} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Move layer ${index + 1} down`}
                disabled={index === quick.layers.length - 1}
                onClick={() => {
                  const layers = [...quick.layers];
                  [layers[index], layers[index + 1]] = [
                    layers[index + 1] as QuickLayer,
                    layers[index] as QuickLayer,
                  ];
                  setLayers(layers);
                }}
              >
                <ArrowDown size={12} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove layer ${index + 1}`}
                disabled={quick.layers.length === 1}
                onClick={() => setLayers(quick.layers.filter((_, i) => i !== index))}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <div>
          <Button
            data-testid="tryit-quick-add-layer"
            disabled={quick.layers.length >= QUICK_LIMITS.maxLayers}
            onClick={() =>
              setLayers([
                ...quick.layers.slice(0, -1),
                { block: 'minecraft:stone', thickness: 2 },
                ...quick.layers.slice(-1),
              ])
            }
          >
            Add a layer
          </Button>
        </div>
        <p className="text-xs text-muted">
          The thickest layer stretches with hills and valleys. Grass and dirt by the water turn to
          sand.
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-1">
        {saving === null ? (
          <Button data-testid="tryit-quick-save" onClick={() => setSaving('')}>
            Save as my preset
          </Button>
        ) : (
          <>
            <input
              aria-label="Name of my preset"
              data-testid="tryit-quick-save-name"
              className="rounded border border-border bg-bg px-1"
              placeholder="My island"
              value={saving}
              onChange={(event) => setSaving(event.target.value)}
            />
            <Button
              data-testid="tryit-quick-save-confirm"
              disabled={saving.trim() === ''}
              onClick={() => {
                useGroundPresets.getState().save(saving, quick);
                setPresetName(saving.trim());
                setSaving(null);
              }}
            >
              Save
            </Button>
            <Button onClick={() => setSaving(null)}>Cancel</Button>
          </>
        )}
        <span className="text-xs text-muted">
          Kept on this computer for you, not in the project.
        </span>
      </div>
    </div>
  );

  const worldPanel = (
    <div className="flex min-h-0 flex-col gap-2" data-testid="tryit-world">
      {props.worlds === null ? (
        <p className="text-muted">Your worlds cannot be read in this window.</p>
      ) : worldList === null ? (
        <p className="text-muted">Looking for your worlds…</p>
      ) : worldList.length === 0 ? (
        <p className="text-muted" data-testid="tryit-world-none">
          {worldsError ??
            'No worlds found. Set up your Minecraft folder or launcher in Settings, and play a world once.'}
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-auto" aria-label="Your worlds">
          {worldList.map((world) => (
            <li key={world.id}>
              <button
                type="button"
                data-testid="tryit-world-item"
                data-world={world.id}
                aria-pressed={world.id === worldId}
                disabled={!world.readable}
                title={world.readable ? undefined : unreadableReason(world)}
                className={`flex w-full items-center gap-2 rounded border px-1 py-0.5 text-left ${world.id === worldId ? 'border-accent' : 'border-border'} ${world.readable ? 'cursor-pointer hover:bg-bg' : 'opacity-50'}`}
                onClick={() => setWorldId(world.id)}
              >
                {world.icon === null ? (
                  <span className="size-8 shrink-0 rounded bg-bg" aria-hidden />
                ) : (
                  <img
                    src={pngDataUrl(world.icon)}
                    alt=""
                    className="size-8 shrink-0 rounded"
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{world.name}</span>
                  <span className="truncate text-xs text-muted">
                    {world.gameFolder.name}
                    {world.lastPlayed === null
                      ? ''
                      : `, last played ${new Date(world.lastPlayed).toLocaleDateString()}`}
                    {world.versionName === null ? '' : `, ${world.versionName}`}
                  </span>
                  {!world.readable && (
                    <span className="text-xs text-error" data-testid="tryit-world-unreadable">
                      {unreadableReason(world)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="flex flex-wrap items-center gap-2 rounded border border-border p-1">
        <legend className="px-1 text-xs text-muted">Centre of the area</legend>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="tryit-world-centre"
            data-testid="tryit-world-centre-spawn"
            checked={centreMode === 'spawn'}
            onChange={() => setCentreMode('spawn')}
          />
          The world spawn
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="tryit-world-centre"
            data-testid="tryit-world-centre-xz"
            checked={centreMode === 'xz'}
            onChange={() => setCentreMode('xz')}
          />
          Here:
        </label>
        <label className="flex items-center gap-1">
          X
          <input
            data-testid="tryit-world-x"
            inputMode="numeric"
            className="w-24 rounded border border-border bg-bg px-1"
            value={centreX}
            disabled={centreMode !== 'xz'}
            onChange={(event) => setCentreX(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          Z
          <input
            data-testid="tryit-world-z"
            inputMode="numeric"
            className="w-24 rounded border border-border bg-bg px-1"
            value={centreZ}
            disabled={centreMode !== 'xz'}
            onChange={(event) => setCentreZ(event.target.value)}
          />
        </label>
      </fieldset>
      <p className="text-xs text-muted">
        The Overworld only, saved by Minecraft 1.18 or later. Chests’ contents, signs and mobs are
        not copied.
      </p>
    </div>
  );

  const generatedPanel = (
    <div className="flex flex-col gap-2" data-testid="tryit-generated">
      {generated === null ? (
        <p className="text-muted">{NO_GENERATED_HERE}</p>
      ) : generated.sources.length === 0 ? (
        <p className="text-muted" data-testid="tryit-generated-none">
          {NO_GENERATED_SOURCE}
        </p>
      ) : (
        <ul
          className="flex max-h-40 flex-col gap-1 overflow-auto"
          aria-label="Your worlds to walk in"
        >
          {generated.sources.map((source) => (
            <li key={source.key}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="tryit-generated-source"
                  data-testid="tryit-generated-source"
                  data-key={source.key}
                  checked={(genKey ?? generated.sources[0]?.key) === source.key}
                  onChange={() => setGenKey(source.key)}
                />
                <span className="truncate" title={source.ids}>
                  {source.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {generated !== null && (
        <>
          <SeedControls
            seed={genSeed}
            seedNumber={null}
            onSeed={setGenSeed}
            worlds={props.worlds}
          />
          <fieldset className="flex flex-wrap items-center gap-2 rounded border border-border p-1">
            <legend className="px-1 text-xs text-muted">Where you stand</legend>
            <label className="flex items-center gap-1">
              X
              <input
                data-testid="tryit-generated-x"
                inputMode="numeric"
                className="w-24 rounded border border-border bg-bg px-1"
                value={genX}
                onChange={(event) => setGenX(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-1">
              Z
              <input
                data-testid="tryit-generated-z"
                inputMode="numeric"
                className="w-24 rounded border border-border bg-bg px-1"
                value={genZ}
                onChange={(event) => setGenZ(event.target.value)}
              />
            </label>
            <Button
              data-testid="tryit-generated-spawn"
              onClick={() => {
                setGenX('0');
                setGenZ('0');
              }}
            >
              Go to spawn
            </Button>
          </fieldset>
          <p className="text-xs text-muted">
            A window of your world 48 by 48 blocks and 32 high (3 by 3 chunks); tall land is cut at
            the top. The seed and place are the world map’s too.
          </p>
        </>
      )}
    </div>
  );

  const voidPanel = (
    <p className="text-muted" data-testid="tryit-void">
      {props.games == null
        ? 'Empty sky: your game’s start island in the middle.'
        : voidGroundWords(props.games)}
    </p>
  );

  const structurePanel = (
    <div className="flex flex-col gap-2" data-testid="tryit-structure">
      {buildings.length === 0 ? (
        <p className="text-muted" data-testid="tryit-structure-none">
          Your project has no buildings yet. Make one in Minecraft, save it with a structure block
          and bring it in.
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto" aria-label="Your buildings">
          {buildings.map((one) => (
            <li key={one.id}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="tryit-structure-building"
                  data-testid="tryit-structure-building"
                  data-id={one.id}
                  checked={chosenBuilding?.id === one.id}
                  onChange={() => setBuilding(one.id)}
                />
                {one.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Choose the ground"
      data-testid="tryit-grounds"
      className="absolute inset-x-4 top-4 bottom-16 z-30 flex flex-col gap-2 overflow-hidden rounded border border-border bg-panel p-2 text-sm shadow-lg"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && busy === null && pickingLayer === null) props.onClose();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Ground</h3>
        <span className="ml-auto" />
        <button
          type="button"
          aria-label="Close"
          data-testid="tryit-grounds-close"
          className="cursor-pointer text-muted hover:text-text"
          disabled={busy !== null}
          onClick={props.onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {/* The list and the chosen ground's settings scroll as one, under the title and above the
          buttons: beside the tools the panel is narrow, and seven grounds with their lines fill
          its height, so a scroller of the settings alone was squeezed to nothing. The columns
          follow the panel's own width, not the window's. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        <div
          role="radiogroup"
          aria-label="Ground"
          className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1"
        >
          {GROUND_CHOICES.map((entry) => (
            // biome-ignore lint/a11y/useSemanticElements: a button row reads better than radios here.
            <button
              key={entry.kind}
              type="button"
              role="radio"
              aria-checked={kind === entry.kind}
              data-testid={`tryit-ground-${entry.kind}`}
              className={`flex cursor-pointer flex-col rounded border p-1 text-left hover:bg-bg ${kind === entry.kind ? 'border-accent' : 'border-border'}`}
              onClick={() => {
                setKind(entry.kind);
                setError(null);
                setConfirming(false);
              }}
            >
              <span className="font-medium">{entry.label}</span>
              <span className="text-xs text-muted">{entry.line}</span>
            </button>
          ))}
        </div>
        <div>
          {kind === 'quick' && quickPanel}
          {kind === 'world' && worldPanel}
          {kind === 'generated' && generatedPanel}
          {kind === 'void' && voidPanel}
          {kind === 'structure' && structurePanel}
        </div>
      </div>
      {busy !== null && (
        <p role="status" data-testid="tryit-ground-progress" className="text-muted">
          {busy}
        </p>
      )}
      {error !== null && (
        <p role="alert" data-testid="tryit-ground-error" className="text-error">
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Replace the area?"
          data-testid="tryit-ground-confirm"
          className="flex flex-wrap items-center gap-2 rounded border border-warning p-1"
        >
          <span>
            Changing the ground replaces the whole area: the blocks you placed and the mobs go.
          </span>
          <Button data-testid="tryit-ground-confirm-yes" onClick={() => void apply(true)}>
            Replace the area
          </Button>
          <Button data-testid="tryit-ground-confirm-no" onClick={() => setConfirming(false)}>
            Keep my area
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            data-testid="tryit-ground-apply"
            disabled={busy !== null}
            onClick={() => void apply(false)}
          >
            Use this ground
          </Button>
          <Button disabled={busy !== null} onClick={props.onClose}>
            Cancel
          </Button>
        </div>
      )}
      {pickingLayer !== null && (
        <ThingPicker
          title="Pick a block for the layer"
          sort="block"
          sections={sections}
          value={quick.layers[pickingLayer]?.block.replace(/\[.*$/, '')}
          pictures={props.pictures ?? null}
          onCancel={() => setPickingLayer(null)}
          onPick={(id) => {
            const index = pickingLayer;
            setPickingLayer(null);
            if (id === null) return;
            setLayers(
              quick.layers.map((layer, i) => (i === index ? { ...layer, block: id } : layer)),
            );
          }}
        />
      )}
    </div>
  );
}

/** Props of {@link GeneratedGroundPanel}. */
export interface GeneratedGroundPanelProps {
  readonly state: GeneratedGroundState;
  /** Move up (`1`) or Move down (`-1`). */
  onMove(direction: 1 | -1): void;
  onAroundMe(): void;
  /** Opens the world map at the player's place; absent when there is no map to open. */
  onShowOnMap?(): void;
  /** Opens the Minecraft folder settings (the set-up banner). */
  onSetUp?(): void;
}

/** The side panel's part of a generated ground; see the module comment. */
export function GeneratedGroundPanel({
  state,
  onMove,
  onAroundMe,
  onShowOnMap,
  onSetUp,
}: GeneratedGroundPanelProps) {
  const busy = state.status === 'drawing';
  const window = state.window;
  const top = state.summary === null ? null : state.summary.minY + state.summary.height;
  const status =
    state.status === 'drawing'
      ? STAGE_WORDS[state.asking ?? 'terrain']
      : state.status === 'waiting'
        ? 'Reading your world’s files…'
        : null;
  return (
    <div className="flex flex-col gap-1" data-testid="tryit-generated-panel">
      <div className="flex flex-wrap items-center gap-2">
        <PreviewTag />
        {status !== null && (
          <span role="status" className="text-xs text-muted" data-testid="tryit-generated-status">
            {status}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          data-testid="tryit-generated-up"
          disabled={busy || window === null || (top !== null && window.y0 + window.sizeY >= top)}
          onClick={() => onMove(1)}
        >
          {GENERATED_WORDS.moveUp}
        </Button>
        <Button
          data-testid="tryit-generated-down"
          disabled={
            busy || window === null || (state.summary !== null && window.y0 <= state.summary.minY)
          }
          onClick={() => onMove(-1)}
        >
          {GENERATED_WORDS.moveDown}
        </Button>
        <Button
          data-testid="tryit-generated-around"
          disabled={busy || window === null}
          onClick={onAroundMe}
        >
          {GENERATED_WORDS.aroundMe}
        </Button>
        {onShowOnMap !== undefined && (
          <Button
            data-testid="tryit-generated-map"
            disabled={window === null}
            onClick={onShowOnMap}
          >
            {GENERATED_WORDS.showOnMap}
          </Button>
        )}
      </div>
      {window !== null && (
        <p className="text-xs text-muted" data-testid="tryit-generated-window">
          {`X ${window.x0} to ${window.x0 + window.sizeX - 1}, Z ${window.z0} to ${window.z0 + window.sizeZ - 1}, heights ${window.y0} to ${window.y0 + window.sizeY - 1}.`}
        </p>
      )}
      {state.status === 'needsSetUp' && onSetUp !== undefined && <SetUpBanner onSetup={onSetUp} />}
      {state.status === 'error' && state.error !== null && (
        <p role="alert" className="text-xs text-error" data-testid="tryit-generated-error">
          {state.error}
        </p>
      )}
      {state.notes.length > 0 && (
        <ul
          aria-label="What this ground leaves out"
          data-testid="tryit-generated-notes"
          className="flex flex-col gap-1 text-xs text-muted [overflow-wrap:anywhere]"
        >
          {state.notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <output
        className="sr-only"
        data-testid="tryit-generated-state"
        data-status={state.status}
        data-stage={state.stage ?? ''}
        data-reason={state.reason}
        data-runs={state.runs}
        data-terrain-ms={state.times.terrain ?? ''}
        data-surface-ms={state.times.surface ?? ''}
        data-features-ms={state.times.features ?? ''}
        data-edit-ms={state.editMs ?? ''}
        data-window={window === null ? '' : `${window.x0},${window.y0},${window.z0}`}
      >
        {`${state.status}; ${state.stage ?? 'nothing yet'}`}
      </output>
    </div>
  );
}

/** What {@link useGeneratedGround} reads from the view. */
export interface GeneratedGroundInput {
  readonly session: LoweringSession;
  readonly root: string | null;
  readonly project: Project | null;
  readonly area: TryItArea | null;
  /** Reads Minecraft's block states of a stage's props before it goes in. */
  beforeFill(palette: readonly string[]): Promise<void>;
  /** Opens an element (Show on the map opens the world's dimension or world type). */
  openElement(elementId: string): void;
  /** Opens the Minecraft folder settings. */
  onSetUp?(): void;
  /** Test hook: the terrain link (default: the session's, shared with the world map). */
  terrain?: GroundTerrainLink | null;
}

/** What the view gets from {@link useGeneratedGround}. */
export interface GeneratedGroundOutput {
  /** The picker's part, or `null` when this window cannot make land. */
  readonly picker: GeneratedPickerProps | null;
  /** Loads a generated ground (the picker's "Use this ground"); resolves on its first stage. */
  apply(
    choice: Extract<GroundChoice, { kind: 'generated' }>,
    progress: (text: string) => void,
  ): Promise<void>;
  /** The side panel's part while the ground is in, else `null`. */
  readonly panel: ReactNode;
  /** The strip's line while the ground is in, else `null`. */
  readonly stripLine: string | null;
}

/**
 * Try it's side of My world generation (B584): the session's terrain link (the world map's
 * client and files), the seed and place shared with the map (`terrain/view-store.ts`), the
 * picker's worlds, the side panel and the strip's line. A seed changed in the map makes the
 * land again around the same place.
 */
export function useGeneratedGround(input: GeneratedGroundInput): GeneratedGroundOutput {
  const { session, root, project, area } = input;
  const terrain = useMemo((): GroundTerrainLink | null => {
    if (input.terrain !== undefined) return input.terrain;
    return session.registry === undefined ? null : terrainSessionFor(session as WorldgenSession);
  }, [session, input.terrain]);
  const viewKey = terrainViewKey(root, project);
  const stored = useTerrainView((state) => state.views.get(viewKey));
  useEffect(() => {
    useTerrainView.getState().viewFor(viewKey);
  }, [viewKey]);
  const sources = useMemo(() => generatedSources(project), [project]);
  const selectedId = useUiStore((state) => state.selectedId);
  const openId = selectedId ?? lastOpenElementId();
  const controller = area?.ground === 'generated' ? area.generated : null;

  // A seed typed in the world map makes the land again.
  const seed = stored?.seed;
  useEffect(() => {
    if (controller !== null && seed !== undefined) void controller.setSeed(seed);
  }, [controller, seed]);

  const picker: GeneratedPickerProps | null =
    terrain === null
      ? null
      : {
          sources,
          initial: defaultGeneratedSource(sources, openId),
          seed: stored?.seed ?? '0',
          centre: { x: stored?.x ?? 0, z: stored?.z ?? 0 },
        };

  const apply: GeneratedGroundOutput['apply'] = async (choice, progress) => {
    if (area === null) throw new Error('The test area is not ready yet.');
    if (terrain === null) throw new Error(NO_GENERATED_HERE);
    useTerrainView
      .getState()
      .setView(viewKey, { seed: choice.seed, x: choice.centre.x, z: choice.centre.z });
    progress(STAGE_WORDS.terrain);
    await area.useGenerated(
      terrain,
      {
        source: choice.world.source,
        seed: choice.seed,
        centre: choice.centre,
        label: choice.world.label,
        elementId: choice.world.elementId,
      },
      { beforeFill: input.beforeFill },
    );
  };

  let panel: ReactNode = null;
  let stripLine: string | null = null;
  if (controller !== null && area !== null) {
    const state = controller.state;
    stripLine = generatedStripLine(state.notes);
    panel = (
      <GeneratedGroundPanel
        state={state}
        onMove={(direction) => void controller.move(direction * GENERATED_MOVE_BLOCKS)}
        onAroundMe={() => void controller.aroundPlayer()}
        onShowOnMap={() => {
          const window = area.generatedWindow;
          const at = area.source.player.position;
          if (window !== null) {
            useTerrainView.getState().setView(viewKey, {
              x: Math.floor(at.x) + window.x0,
              z: Math.floor(at.z) + window.z0,
              seed: controller.seed,
            });
          }
          input.openElement(controller.spec.elementId);
        }}
        {...(input.onSetUp === undefined ? {} : { onSetUp: input.onSetUp })}
      />
    );
  }
  return { picker, apply, panel, stripLine };
}
