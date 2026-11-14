/**
 * The grounds picker (ADR 0087 D1, B405): Grid, Flat world, Quick world (shape, layers, water,
 * trees, seed, presets and the user's own presets) and From my world (the user's saves and a
 * centre). It only gathers the choice; the view loads it ({@link GroundPickerProps.onApply})
 * and the picker shows the progress and any error in plain words. When the area has something
 * to lose, "Use this ground" asks first.
 *
 * Part of the lazy Try it chunk.
 */

import {
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
import { useEffect, useMemo, useState } from 'react';
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
import {
  DEFAULT_QUICK_OPTIONS,
  GROUND_CHOICES,
  type GroundChoice,
  newSeed,
  parseCentre,
  SHAPE_LABELS,
  TREE_LABELS,
  unreadableReason,
  useGroundPresets,
} from './grounds';

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
  /** Loads the choice; a rejection is shown in the picker. Resolves when the area is ready. */
  onApply(choice: GroundChoice, progress: (text: string) => void): Promise<void>;
  onClose(): void;
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
      <div role="radiogroup" aria-label="Ground" className="grid grid-cols-2 gap-1 lg:grid-cols-4">
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
      <div className="min-h-0 flex-1 overflow-auto">
        {kind === 'quick' && quickPanel}
        {kind === 'world' && worldPanel}
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
