/**
 * World Setup Studio (ADR 0117 D1, ADR 0113 D2, ADR 0114 D1 to D3; B555) for `msm:world_setup`,
 * "How my world starts", loaded lazily:
 *
 * - **The world**: "Empty sky", "Floating islands", "Flat" (its layers), "As normal" or "My own
 *   world type"; the sky biome; the Nether and the End as normal or empty.
 * - **Start island**: the structure the game starts on, where its corner goes, "Where players
 *   start" on it (picked on its footprint seen from above) and, outside Very easy, "Place it
 *   while the world generates" with its warning (the game turns the piece at random about x 0,
 *   z 0 and ignores the corner's x and z; nothing is placed with "Generate structures" off).
 * - **Players**: "Start as" (the game mode), the difficulty, how far from the start they appear.
 * - **Game rules when the world starts**: vanilla's and the project's, on or off or a number.
 * - **What new players get**: items or a loot table, effects, the "Welcome message", the
 *   "Welcome screen" (a dialog) and the goals (the root advancement).
 *
 * Live view (ADR 0119 D1, B551's note): the live world map of the world preset this setup
 * writes, lowered in memory and laid over the project (never written), drawn by
 * `terrain/LiveMap.tsx` (a lazy chunk) as the Creator's Map tab draws a flow's world; it follows
 * every edit. "As normal" draws nothing (the game's own world); "My own world type" draws the
 * project's preset. Try it's void ground shows the start and the kit (B558).
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { lowerWorldSetup } from '@msm/plugin-games';
import { Plus, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { bundlePreviewProject } from '../../preview/bundle-source';
import { useUiStore } from '../../store/ui-store';
import { asObject, pathSetter } from '../blocks-items/blocks-items-model';
import { CheckField, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { Section } from '../worldgen/parts';
import {
  ADVANCEMENT_KIND,
  BIOME_KIND,
  DEFAULT_START_AT,
  DIALOG_KIND,
  DIFFICULTY_LABELS,
  elementsOf,
  GAME_MODE_LABELS,
  GAME_RULE_KIND,
  idWords,
  LOOT_TABLE_KIND,
  listOf,
  OTHER_DIMENSION_LABELS,
  objectOf,
  type Pos,
  STRUCTURE_KIND,
  startFootprint,
  textOf,
  WORLD_PRESET_KIND,
  WORLD_TYPE_LABELS,
  WORLD_TYPES,
  worldMapPlan,
  worldSetupName,
} from './games-model';
import { NamedIdField, PosField, TextArea, ThingField } from './pickers';
import { GamesStudioShell } from './shell';

const LiveMap = lazy(() => import('../../terrain/LiveMap'));

type SetPath = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** The words of the `world_generation` route's warning (B551's validator says the same). */
export const WORLD_GENERATION_WARNING =
  'The game turns the start at random around x 0, z 0 and ignores the corner’s x and z; with “Generate structures” off nothing is placed.';

// --- The live map ----------------------------------------------------------------------------

/** The live world map of the world this setup writes; see the module comment. */
function WorldSetupMap(props: StudioProps) {
  const { project, element, target } = props;
  const [open, setOpen] = useState(true);
  const root = useUiStore((state) => state.snapshot?.root ?? null);
  const vanillaReady = useUiStore((state) => state.minecraft.status?.cache != null);
  const plan = useMemo(() => {
    let lowered: ReturnType<typeof lowerWorldSetup> | Error;
    try {
      lowered = lowerWorldSetup(element, target);
    } catch (error) {
      lowered = error instanceof Error ? error : new Error(String(error));
    }
    return worldMapPlan({
      project,
      element,
      lowered,
      folders: target.worldgen.terrainPreview?.dataFolders ?? [],
      bundled: bundlePreviewProject,
    });
  }, [project, element, target]);
  const onSetup = useCallback(
    () =>
      useUiStore.getState().setMessage({
        kind: 'info',
        text: 'Set up your Minecraft folder in Settings, under Game locations, to see this world here.',
      }),
    [],
  );
  return (
    <div className="flex flex-col gap-2" data-testid="world-setup-map-line">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-expanded={open}
          data-testid="world-setup-see-map"
          onClick={() => setOpen((before) => !before)}
        >
          {open ? 'Hide the map' : 'See it on the map'}
        </Button>
        <span className="text-muted text-xs">
          The world your game is played in, as you change it.
        </span>
      </div>
      {open &&
        (plan.draw ? (
          <Suspense
            fallback={
              <p className="text-muted text-xs" data-testid="world-setup-map-loading">
                Loading the map…
              </p>
            }
          >
            <LiveMap
              owner="studio"
              project={plan.project}
              target={target}
              element={plan.preset}
              mode="element"
              root={root}
              vanillaReady={vanillaReady}
              onSetup={onSetup}
              testId="world-setup-map-view"
            />
          </Suspense>
        ) : (
          <p className="text-muted text-sm" data-testid="world-setup-map-none">
            {plan.why}
          </p>
        ))}
    </div>
  );
}

// --- The start ---------------------------------------------------------------------------------

/** The start structure seen from above, with the spawn marked; a click moves the spawn. */
function StartPicture(props: { project: Project; data: Json; onSpawn(pos: Pos): void }) {
  const footprint = startFootprint(props.project, props.data);
  if (footprint === null || footprint.size === null) {
    return (
      <p className="text-muted text-xs" data-testid="world-setup-start-picture-none">
        Pick one of your structures to see where players start on it.
      </p>
    );
  }
  const [sx, sy, sz] = footprint.size;
  const cell = Math.max(4, Math.min(16, Math.floor(200 / Math.max(sx, sz, 1))));
  const [px, py, pz] = footprint.spawn;
  return (
    <figure className="flex flex-col gap-1">
      <svg
        role="img"
        aria-label="The start from above"
        data-testid="world-setup-start-picture"
        width={sx * cell}
        height={sz * cell}
        className="rounded bg-[#2b3a24]"
      >
        {Array.from({ length: sx * sz }, (_, at) => {
          const x = at % sx;
          const z = Math.floor(at / sx);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: the fields below set the same spawn by keyboard.
            <rect
              key={at}
              x={x * cell}
              y={z * cell}
              width={cell}
              height={cell}
              fill="rgba(140, 200, 120, 0.35)"
              stroke="rgba(0, 0, 0, 0.2)"
              data-testid={`world-setup-start-cell-${x}-${z}`}
              onClick={() => props.onSpawn([x, py, z])}
            />
          );
        })}
        {px >= 0 && px < sx && pz >= 0 && pz < sz && (
          <circle
            cx={(px + 0.5) * cell}
            cy={(pz + 0.5) * cell}
            r={Math.max(2, cell / 3)}
            fill="#ffdc78"
            data-testid="world-setup-start-spawn"
          />
        )}
      </svg>
      <figcaption className="text-muted text-xs">
        {sx} × {sy} × {sz} blocks seen from above; click where players start.
        {(py < 0 || py > sy || px < 0 || px >= sx || pz < 0 || pz >= sz) &&
          ' The start is outside the structure.'}
      </figcaption>
    </figure>
  );
}

function StartSection(props: { studio: StudioProps; set: SetPath }) {
  const { studio, set } = props;
  const veryEasy = useVeryEasy();
  const data = asObject(studio.element.data);
  const start = data.start === undefined ? null : objectOf(data.start);
  const type = textOf(objectOf(data.world).type);
  const own = elementsOf(studio.project, STRUCTURE_KIND);
  return (
    <Section title="Start island" testId="world-setup-start">
      <CheckField
        label="Players start on a structure of mine"
        checked={start !== null}
        testId="world-setup-start-on"
        onChange={(checked) =>
          set(['start'], checked ? { structure: own[0]?.id ?? '', spawn: [0, 1, 0] } : undefined)
        }
      />
      {start !== null && (
        <>
          <NamedIdField
            project={studio.project}
            label="The structure"
            value={textOf(start.structure)}
            registry="structure"
            kinds={[STRUCTURE_KIND]}
            testId="world-setup-start-structure"
            emptyLabel="Pick a structure"
            suggest={studio.suggest}
            onChange={(value) => set(['start', 'structure'], value ?? '')}
          />
          <PosField
            label="Where its corner goes"
            value={start.at}
            fallback={DEFAULT_START_AT}
            testId="world-setup-start-at"
            onCommit={(pos) => set(['start', 'at'], pos)}
          />
          <PosField
            label="Where players start, on the structure"
            value={start.spawn}
            testId="world-setup-start-spawn"
            onCommit={(pos) => set(['start', 'spawn'], pos)}
          />
          <StartPicture
            project={studio.project}
            data={studio.element.data}
            onSpawn={(pos) => set(['start', 'spawn'], pos)}
          />
          {!veryEasy && (
            <CheckField
              label="Place it while the world generates"
              checked={start.when === 'world_generation'}
              testId="world-setup-start-world-generation"
              onChange={(checked) =>
                set(['start', 'when'], checked ? 'world_generation' : undefined)
              }
            />
          )}
          {start.when === 'world_generation' && (
            <p className="text-warning text-xs" data-testid="world-setup-start-warning">
              {WORLD_GENERATION_WARNING}
            </p>
          )}
          {(type === 'void' || type === 'sky_islands') && start.when !== 'world_generation' && (
            <p className="text-muted text-xs">
              The structure is placed when the first player joins, once for the world.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// --- The world -------------------------------------------------------------------------------

function WorldSection(props: { studio: StudioProps; set: SetPath }) {
  const { studio, set } = props;
  const data = asObject(studio.element.data);
  const world = objectOf(data.world);
  const type = textOf(world.type) || 'void';
  const layers = listOf(world.layers);
  return (
    <Section title="The world" testId="world-setup-world">
      <p className="text-sm" data-testid="world-setup-name">
        {type === 'vanilla' || type === 'preset'
          ? `Play my game names its world “${worldSetupName(studio.element.id)}”.`
          : `Players pick “${worldSetupName(studio.element.id)}” as the world type in Create New World, and Play my game names its world the same.`}{' '}
        <span className="text-muted text-xs">
          To give it a better name, press F2 and type a new one.
        </span>
      </p>
      <ChoiceField
        label="World"
        value={type}
        choices={WORLD_TYPES}
        labels={WORLD_TYPE_LABELS}
        testId="world-setup-type"
        onChange={(value) => set(['world', 'type'], value ?? 'void')}
      />
      {type === 'preset' && (
        <NamedIdField
          project={studio.project}
          label="My own world type"
          value={textOf(world.preset)}
          registry="worldgen/world_preset"
          kinds={[WORLD_PRESET_KIND]}
          testId="world-setup-preset"
          emptyLabel="Pick a world type"
          suggest={studio.suggest}
          onChange={(value) => set(['world', 'preset'], value)}
        />
      )}
      {type === 'flat' && (
        <div className="flex flex-col gap-1" data-testid="world-setup-layers">
          <span className="text-muted text-xs">Layers, from the bottom up</span>
          <ol className="flex flex-col gap-1">
            {layers.map((entry, index) => {
              const layer = objectOf(entry);
              const change = (patch: Record<string, Json>) =>
                set(
                  ['world', 'layers'],
                  layers.map((item, at) => (at === index ? { ...objectOf(item), ...patch } : item)),
                );
              return (
                <li key={index} className="flex flex-wrap items-end gap-2">
                  <ThingField
                    project={studio.project}
                    target={studio.target}
                    sort="block"
                    label="Block"
                    value={textOf(layer.block)}
                    testId={`world-setup-layer-${index}`}
                    suggest={studio.suggest}
                    onChange={(value) => change({ block: value ?? 'minecraft:stone' })}
                  />
                  <NumberField
                    label="How thick"
                    value={layer.height}
                    integer
                    testId={`world-setup-layer-${index}-height`}
                    onCommit={(value) => change({ height: Math.max(0, value ?? 1) })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove layer ${index + 1}`}
                    className={iconButtonClass}
                    onClick={() =>
                      set(
                        ['world', 'layers'],
                        layers.filter((_, at) => at !== index),
                      )
                    }
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
          <Button
            className="self-start text-xs"
            data-testid="world-setup-layer-add"
            onClick={() =>
              set(['world', 'layers'], [...layers, { block: 'minecraft:grass_block', height: 1 }])
            }
          >
            <Plus size={12} aria-hidden />
            Add a layer
          </Button>
        </div>
      )}
      {(type === 'void' || type === 'flat' || type === 'sky_islands') && (
        <NamedIdField
          project={studio.project}
          label="Biome"
          value={textOf(world.biome)}
          registry="worldgen/biome"
          kinds={[BIOME_KIND]}
          testId="world-setup-biome"
          emptyLabel={
            type === 'sky_islands' ? 'The Overworld’s biomes' : 'A sky biome: plains mobs, no trees'
          }
          suggest={studio.suggest}
          vanilla={() => true}
          onChange={(value) => set(['world', 'biome'], value)}
        />
      )}
      {type !== 'vanilla' && type !== 'preset' && (
        <div className="flex flex-wrap items-end gap-2">
          <ChoiceField
            label="The Nether"
            value={textOf(world.nether) || 'vanilla'}
            choices={Object.keys(OTHER_DIMENSION_LABELS)}
            labels={OTHER_DIMENSION_LABELS}
            testId="world-setup-nether"
            onChange={(value) => set(['world', 'nether'], value ?? 'vanilla')}
          />
          <ChoiceField
            label="The End"
            value={textOf(world.end) || 'vanilla'}
            choices={Object.keys(OTHER_DIMENSION_LABELS)}
            labels={OTHER_DIMENSION_LABELS}
            testId="world-setup-end"
            onChange={(value) => set(['world', 'end'], value ?? 'vanilla')}
          />
        </div>
      )}
      {world.end === 'void' && (
        <p className="text-muted text-xs">
          An empty End is reached only through an End portal in your start: leave one eye of ender
          out of its frame, so a player can light it.
        </p>
      )}
    </Section>
  );
}

// --- Game rules --------------------------------------------------------------------------------

/** A game rule's kind: a project rule's own, else `undefined` (one of the game's). */
function ruleKind(project: Project, name: string): 'boolean' | 'integer' | undefined {
  const element = elementsOf(project, GAME_RULE_KIND).find((entry) => entry.id === name);
  if (element === undefined) return undefined;
  return objectOf(element.data).kind === 'integer' ? 'integer' : 'boolean';
}

function RuleValue(props: {
  kind: 'boolean' | 'integer' | undefined;
  value: Json | undefined;
  testId: string;
  label: string;
  onChange(value: boolean | number): void;
}) {
  const id = useId();
  const choice = typeof props.value === 'number' ? 'number' : props.value === true ? 'on' : 'off';
  return (
    <div className="flex items-end gap-2">
      {props.kind !== 'integer' && (
        <div className="flex flex-col gap-0.5 text-xs">
          <label htmlFor={id} className="text-muted">
            {props.label}
          </label>
          <select
            id={id}
            className={inputClass}
            data-testid={props.testId}
            value={choice}
            onChange={(event) => {
              const next = event.target.value;
              props.onChange(next === 'number' ? 0 : next === 'on');
            }}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
            {props.kind === undefined && <option value="number">A number</option>}
          </select>
        </div>
      )}
      {(props.kind === 'integer' || choice === 'number') && (
        <NumberField
          label={props.kind === 'integer' ? props.label : 'Number'}
          value={typeof props.value === 'number' ? props.value : 0}
          integer
          testId={`${props.testId}-number`}
          onCommit={(value) => props.onChange(value ?? 0)}
        />
      )}
    </div>
  );
}

function RulesSection(props: { studio: StudioProps; set: SetPath }) {
  const { studio, set } = props;
  const id = useId();
  const rules = objectOf(asObject(studio.element.data).game_rules);
  const vanilla = studio.target.gameRules?.vanillaNames ?? [];
  const own = elementsOf(studio.project, GAME_RULE_KIND).map((entry) => entry.id as string);
  const words = (name: string) =>
    own.includes(name)
      ? textOf(
          objectOf(elementsOf(studio.project, GAME_RULE_KIND).find((e) => e.id === name)?.data)
            .display_name,
        ) || idWords(name)
      : idWords(name);
  const unused = [...own, ...vanilla].filter((name) => !(name in rules));
  return (
    <Section title="Game rules when the world starts" testId="world-setup-rules">
      {Object.keys(rules).length === 0 && (
        <p className="text-muted text-xs">None: the game's own rules stay as they are.</p>
      )}
      <ul className="flex flex-col gap-1">
        {Object.entries(rules).map(([name, value], index) => (
          <li key={name} className="flex flex-wrap items-end gap-2">
            <RuleValue
              kind={ruleKind(studio.project, name)}
              value={value}
              label={words(name)}
              testId={`world-setup-rule-${index}`}
              onChange={(next) => set(['game_rules', name], next)}
            />
            <button
              type="button"
              aria-label={`Remove ${words(name)}`}
              className={iconButtonClass}
              data-testid={`world-setup-rule-${index}-remove`}
              onClick={() => set(['game_rules', name], undefined)}
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-0.5 text-xs">
        <label htmlFor={id} className="text-muted">
          Add a game rule
        </label>
        <select
          id={id}
          className={inputClass}
          data-testid="world-setup-rule-add"
          value=""
          onChange={(event) => {
            const name = event.target.value;
            if (name === '') return;
            set(['game_rules', name], ruleKind(studio.project, name) === 'integer' ? 0 : false);
          }}
        >
          <option value="">Pick a game rule…</option>
          {unused.map((name) => (
            <option key={name} value={name}>
              {words(name)}
            </option>
          ))}
        </select>
      </div>
    </Section>
  );
}

// --- What new players get ----------------------------------------------------------------------

/** The kit's kind: items, a loot table, or nothing. */
function kitChoice(newPlayer: Record<string, Json>): 'items' | 'loot' | 'none' {
  if (textOf(newPlayer.loot_table) !== '') return 'loot';
  if (newPlayer.items !== undefined) return 'items';
  return 'none';
}

const KIT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  none: 'Nothing',
  items: 'These items',
  loot: 'Items from a loot table',
});

function NewPlayerSection(props: { studio: StudioProps; set: SetPath }) {
  const { studio, set } = props;
  const veryEasy = useVeryEasy();
  const newPlayer = objectOf(asObject(studio.element.data).new_player);
  const kit = kitChoice(newPlayer);
  const items = listOf(newPlayer.items);
  const effects = listOf(newPlayer.effects);
  const setKit = (choice: string) => {
    const next: Record<string, Json> = { ...newPlayer };
    delete next.items;
    delete next.loot_table;
    if (choice === 'items') next.items = [{ item: 'minecraft:bread', count: 3 }];
    if (choice === 'loot') next.loot_table = 'minecraft:chests/simple_dungeon';
    set(['new_player'], Object.keys(next).length === 0 ? undefined : next);
  };
  const setNew = (key: string, value: Json | undefined, coalesce?: string) =>
    set(['new_player', key], value, coalesce);
  return (
    <Section title="What new players get" testId="world-setup-new-player">
      <ChoiceField
        label="Their kit"
        value={kit}
        choices={Object.keys(KIT_LABELS)}
        labels={KIT_LABELS}
        testId="world-setup-kit"
        onChange={(value) => setKit(value ?? 'none')}
      />
      {kit === 'items' && (
        <div className="flex flex-col gap-1">
          <ol className="flex flex-col gap-1">
            {items.map((entry, index) => {
              const item = objectOf(entry);
              const change = (patch: Record<string, Json | undefined>) => {
                const merged: Record<string, Json> = { ...item };
                for (const [key, value] of Object.entries(patch)) {
                  if (value === undefined) delete merged[key];
                  else merged[key] = value;
                }
                setNew(
                  'items',
                  items.map((other, at) => (at === index ? merged : other)),
                );
              };
              return (
                <li key={index} className="flex flex-wrap items-end gap-2">
                  <ThingField
                    project={studio.project}
                    target={studio.target}
                    sort="item"
                    label="Item"
                    value={textOf(item.item)}
                    testId={`world-setup-kit-${index}`}
                    suggest={studio.suggest}
                    onChange={(value) => change({ item: value ?? 'minecraft:bread' })}
                  />
                  <NumberField
                    label="How many"
                    value={item.count}
                    integer
                    testId={`world-setup-kit-${index}-count`}
                    onCommit={(value) => change({ count: Math.min(99, Math.max(1, value ?? 1)) })}
                  />
                  {!veryEasy && (
                    <TextField
                      label="Slot (empty: the first free one)"
                      value={item.slot}
                      testId={`world-setup-kit-${index}-slot`}
                      placeholder="hotbar.0"
                      onCommit={(value) => change({ slot: value })}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    className={iconButtonClass}
                    onClick={() =>
                      setNew(
                        'items',
                        items.filter((_, at) => at !== index),
                      )
                    }
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
          <Button
            className="self-start text-xs"
            data-testid="world-setup-kit-add"
            onClick={() => setNew('items', [...items, { item: 'minecraft:bread', count: 1 }])}
          >
            <Plus size={12} aria-hidden />
            Add an item
          </Button>
        </div>
      )}
      {kit === 'loot' && (
        <NamedIdField
          project={studio.project}
          label="The loot table"
          value={textOf(newPlayer.loot_table)}
          registry="loot_table"
          kinds={[LOOT_TABLE_KIND]}
          testId="world-setup-kit-loot"
          emptyLabel="Pick a loot table"
          suggest={studio.suggest}
          vanilla={(id) => id.includes(':chests/')}
          onChange={(value) => setNew('loot_table', value ?? 'minecraft:chests/simple_dungeon')}
        />
      )}
      <span className="text-muted text-xs">Effects</span>
      <ol className="flex flex-col gap-1">
        {effects.map((entry, index) => {
          const effect = objectOf(entry);
          const change = (patch: Record<string, Json>) =>
            setNew(
              'effects',
              effects.map((other, at) => (at === index ? { ...effect, ...patch } : other)),
            );
          return (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <ThingField
                project={studio.project}
                target={studio.target}
                sort="effect"
                label="Effect"
                value={textOf(effect.effect)}
                testId={`world-setup-effect-${index}`}
                suggest={studio.suggest}
                onChange={(value) => change({ effect: value ?? 'minecraft:speed' })}
              />
              <NumberField
                label="Seconds"
                value={effect.seconds}
                integer
                testId={`world-setup-effect-${index}-seconds`}
                onCommit={(value) => change({ seconds: Math.max(1, value ?? 1) })}
              />
              <button
                type="button"
                aria-label={`Remove effect ${index + 1}`}
                className={iconButtonClass}
                onClick={() => {
                  const next = effects.filter((_, at) => at !== index);
                  setNew('effects', next.length === 0 ? undefined : next);
                }}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="world-setup-effect-add"
        onClick={() =>
          setNew('effects', [...effects, { effect: 'minecraft:regeneration', seconds: 30 }])
        }
      >
        <Plus size={12} aria-hidden />
        Add an effect
      </Button>
      <TextArea
        label="Welcome message"
        value={newPlayer.message}
        testId="world-setup-message"
        placeholder="Welcome! Can you survive on one island?"
        onCommit={(value) => setNew('message', value, typingKey('/new_player/message'))}
      />
      <NamedIdField
        project={studio.project}
        label="Welcome screen"
        value={textOf(newPlayer.dialog)}
        registry="dialog"
        kinds={[DIALOG_KIND]}
        testId="world-setup-dialog"
        emptyLabel="None"
        suggest={studio.suggest}
        onChange={(value) => setNew('dialog', value)}
      />
      <NamedIdField
        project={studio.project}
        label="Goals (their first advancement)"
        value={textOf(asObject(studio.element.data).goals)}
        registry="advancement"
        kinds={[ADVANCEMENT_KIND]}
        testId="world-setup-goals"
        emptyLabel="No goals"
        suggest={studio.suggest}
        onChange={(value) => set(['goals'], value)}
      />
    </Section>
  );
}

// --- The Studio --------------------------------------------------------------------------------

/** The World Setup Studio. */
export default function WorldSetupStudio(props: StudioProps) {
  const { element, onChange } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  return (
    <GamesStudioShell studio={props} label="World Setup Studio" testId="world-setup">
      <Section title="Your world" testId="world-setup-map">
        <WorldSetupMap {...props} />
      </Section>
      <WorldSection studio={props} set={set} />
      <StartSection studio={props} set={set} />
      <Section title="Players" testId="world-setup-players">
        <div className="flex flex-wrap items-end gap-2">
          <ChoiceField
            label="Start as"
            value={textOf(data.game_mode) || 'survival'}
            choices={Object.keys(GAME_MODE_LABELS)}
            labels={GAME_MODE_LABELS}
            testId="world-setup-game-mode"
            onChange={(value) => set(['game_mode'], value ?? 'survival')}
          />
          <ChoiceField
            label="Difficulty"
            value={textOf(data.difficulty) || 'normal'}
            choices={Object.keys(DIFFICULTY_LABELS)}
            labels={DIFFICULTY_LABELS}
            testId="world-setup-difficulty"
            onChange={(value) => set(['difficulty'], value ?? 'normal')}
          />
          <NumberField
            label="How far from the start players appear (blocks)"
            value={typeof data.spawn_radius === 'number' ? data.spawn_radius : 0}
            integer
            testId="world-setup-spawn-radius"
            onCommit={(value) =>
              set(['spawn_radius'], Math.max(0, value ?? 0), typingKey('/spawn_radius'))
            }
          />
        </div>
      </Section>
      <RulesSection studio={props} set={set} />
      <NewPlayerSection studio={props} set={set} />
    </GamesStudioShell>
  );
}
