/**
 * The Block Studio's plant sections (B272, ADR 0068 D3, D4, D6), one per plant type:
 *
 * - Crop: the last age, stage textures (fewer repeat), stage heights (vanilla's ramp or the
 *   crop's own), soil, bone meal growth, the seeds item (`item.id`), the crop drops preset
 *   (produce, count, extra seeds) and whether farmer villagers plant the seeds.
 * - Sapling: the tree, two-by-two tree and flower tree, each with "Open" when the project has
 *   the feature (the Tree Studio), "New tree" from the worldgen template "Tree for a sapling",
 *   and the soil.
 * - Leaves: the tint (biome colours or one colour, with the note that it shows in game only),
 *   the falling leaf chance and particle, and the leaves drops preset (sapling, sticks, extra).
 *
 * B452 (ADR 0094 D2, ADR 0101 D1), the new plant and food types' own fields:
 *
 * - Cake: what a slice gives (hunger and saturation) and the event fired after a slice.
 * - Berry bush: the berry item (the bush's own item in one click), the harvest counts when ripe
 *   and full, and whether it hurts.
 * - Tall plant: what bone meal does. Vine: whether it spreads. Pod: the blocks it hangs on.
 * - Potted plant: the plant, picked from the project's saplings and berry bushes or any block.
 * - Stem: the fruit, picked from the project's blocks or any block, and the soils (defaults from
 *   the target's `blocks.stemTags`).
 *
 * B516 (ADR 0103, ADR 0112 D1), the growing and climbing plants and the flower pot:
 *
 * - Strands (`growing_plant`): which way it grows, starting age, chance to grow, bone meal, lives
 *   in water, berries (item and light), climbable, and what it grows on.
 * - Tall stalks (`column_plant`): cane, cactus or bamboo, the tallest and shortest stop, what it
 *   grows on (defaults from the target's `blocks.plantSoils`), water beside it and touch damage.
 * - Spreading plants (`multiface`): light, spreads with bone meal, holds water.
 * - Dripleaf: big or small, what a small one grows into (the project's big dripleaf), and a big
 *   one's tilt timing.
 * - Flower pot: the plants it takes, picked in the ThingPicker from the project's plants and the
 *   plants Minecraft's own pot takes (by name, the ids in More options), and how many potted
 *   blocks that makes. A potted plant also names its pot (Minecraft's or a project pot).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { blockItemIdOf } from '@msm/plugin-blocks-items';
import { ExternalLink, Plus, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  ThingPicker,
  type ThingPictures,
  type ThingSection,
  thingName,
  thingSections,
} from '../../components/thing-picker/ThingPicker';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { InMore } from '../../components/ui/MoreOptions';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { useStructureStudioHost } from '../structures/host';
import { IdField, NumberField } from '../structures/pickers';
import { IdList, Section } from '../worldgen/parts';
import {
  BLOCK_TYPE_LABELS,
  type BlockTypeName,
  blockTypeOfData,
  COLUMN_PLANT_STYLE_LABELS,
  companionRows,
  DRIPLEAF_SIZE_LABELS,
  potPlantsOf,
  TALL_PLANT_BONEMEAL_LABELS,
} from './block-type-model';
import { asObject, eventNames, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, EventSelect, ProblemsAt } from './parts';
import {
  bonemealGrowth,
  COLUMN_PLANT_DEFAULTS,
  colourHex,
  columnMaxHeight,
  columnStyleOf,
  cropMaxAge,
  DEFAULT_BONEMEAL_GROWTH,
  DEFAULT_CROP_MAX_AGE,
  DEFAULT_CROP_SOIL,
  DEFAULT_MULTIFACE_LIGHT,
  DEFAULT_PARTICLE_CHANCE,
  DEFAULT_SAPLING_SOIL,
  DEFAULT_TILT_TICKS,
  defaultColumnMinHeight,
  defaultStageHeights,
  GROWING_PLANT_DEFAULTS,
  LEAF_TINT_LABELS,
  LEAF_TINTS,
  type LeafTint,
  leafTintOf,
  MAX_CROP_MAX_AGE,
  ownStageHeights,
  parseColourHex,
  projectFeature,
  projectHasId,
  projectPottablePlants,
  resizeStageHeights,
  SAPLING_TREE_TEMPLATE,
  saplingTreeId,
  stageTextures,
  tintValue,
  treeBlockIds,
  vanillaPottablePlants,
  withBonemealBound,
  withColumnStyle,
  withPotPlant,
  withRangeBound,
  withTiltTicks,
} from './plant-model';

type SetPath = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props of {@link PlantSection}. */
export interface PlantSectionProps {
  project: Project;
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set: SetPath;
  /** The target, for the stem's default soils (`blocks.stemTags`); absent: the schema's words. */
  target?: Target;
}

/** The plant section of the element's type, or nothing for the other types. */
export function PlantSection(props: PlantSectionProps) {
  const type = blockTypeOfData(props.element.data);
  if (type === 'crop') return <CropSection {...props} />;
  if (type === 'sapling') return <SaplingSection {...props} />;
  if (type === 'leaves') return <LeavesSection {...props} />;
  if (type === 'cake') return <CakeSection {...props} />;
  if (type === 'berry_bush') return <BerryBushSection {...props} />;
  if (type === 'tall_plant') return <TallPlantSection {...props} />;
  if (type === 'potted_plant') return <PottedPlantSection {...props} />;
  if (type === 'vine') return <VineSection {...props} />;
  if (type === 'stem') return <StemSection {...props} />;
  if (type === 'cocoa') return <CocoaSection {...props} />;
  if (type === 'growing_plant') return <GrowingPlantSection {...props} />;
  if (type === 'column_plant') return <ColumnPlantSection {...props} />;
  if (type === 'multiface') return <MultifaceSection {...props} />;
  if (type === 'dripleaf') return <DripleafSection {...props} />;
  if (type === 'flower_pot') return <FlowerPotSection {...props} />;
  return null;
}

/** The plant section test ids of the ADR 0103 types (B516), for the main area's list. */
export const GROWING_PLANT_SECTION_IDS: readonly string[] = Object.freeze([
  'block-growing-plant',
  'block-column-plant',
  'block-multiface',
  'block-dripleaf',
  'block-flower-pot',
]);

/** The plant section test ids of the new types (B452), for the main area's list. */
export const NEW_PLANT_SECTION_IDS: readonly string[] = Object.freeze([
  'block-cake',
  'block-berry-bush',
  'block-tall-plant',
  'block-potted-plant',
  'block-vine',
  'block-stem',
  'block-cocoa',
]);

/** Defaults of the new plant fields, as the format documents them (ADR 0094 D2). */
export const PLANT_FIELD_DEFAULTS = Object.freeze({
  cakeNutrition: 2,
  cakeSaturation: 0.1,
  ripe: [1, 2] as const,
  full: [2, 3] as const,
  cocoaSupport: '#minecraft:supports_cocoa',
});

/** The project's blocks of `types`, as `{ id, label }` for a quick picker. */
export function projectBlocksOf(
  project: Project,
  types: readonly BlockTypeName[],
  except?: string,
): { id: string; label: string }[] {
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((entry) => entry.kind === 'msm:block' && entry.id !== except)
    .flatMap((entry) => {
      const type = blockTypeOfData(entry.data);
      if (type === undefined || !types.includes(type)) return [];
      const name = asObject(entry.data).display_name;
      const label = typeof name === 'string' && name !== '' ? `${name} (${entry.id})` : entry.id;
      return [{ id: entry.id, label: `${label}, ${BLOCK_TYPE_LABELS[type].split(' (')[0]}` }];
    });
}

/**
 * The cake's `food` after setting one of its two numbers: both are required once `food` is
 * given, so the other takes vanilla's slice value; clearing one while the other is vanilla's
 * removes `food`.
 */
export function withCakeFood(
  food: Json | undefined,
  key: 'nutrition' | 'saturation',
  value: number | undefined,
): Json | undefined {
  const current = asObject(food);
  const defaults = {
    nutrition: PLANT_FIELD_DEFAULTS.cakeNutrition,
    saturation: PLANT_FIELD_DEFAULTS.cakeSaturation,
  };
  const other = key === 'nutrition' ? 'saturation' : 'nutrition';
  // Clearing the one number while the other says vanilla's slice too removes `food`.
  if (value === undefined && (current[other] ?? defaults[other]) === defaults[other]) {
    return undefined;
  }
  return {
    nutrition: current.nutrition ?? defaults.nutrition,
    saturation: current.saturation ?? defaults.saturation,
    [key]: value ?? defaults[key],
  };
}

/**
 * A berry bush's `harvest` after setting one bound: `ripe` and `full` are both required pairs
 * once `harvest` is given, so the others take vanilla's counts.
 */
export function withHarvest(
  harvest: Json | undefined,
  stage: 'ripe' | 'full',
  bound: 0 | 1,
  value: number | undefined,
): Json {
  const current = asObject(harvest);
  const pair = (key: 'ripe' | 'full'): number[] => {
    const given = current[key];
    const fallback = PLANT_FIELD_DEFAULTS[key];
    return Array.isArray(given) && given.length === 2 && given.every((n) => typeof n === 'number')
      ? (given as number[])
      : [...fallback];
  };
  const next = { ripe: pair('ripe'), full: pair('full') };
  next[stage][bound] = value ?? PLANT_FIELD_DEFAULTS[stage][bound];
  return next;
}

function useAt(problems: readonly FormProblem[]) {
  return (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path.map(String))} />
  );
}

const text = (value: Json | undefined): string => (typeof value === 'string' ? value : '');

/** The seeds or own item id field (`item.id`); a note when the block has no item. */
function ItemIdField(props: PlantSectionProps & { label: string; note: string }) {
  const data = asObject(props.element.data);
  const at = useAt(props.problems);
  if (data.item === false) {
    return (
      <p className="text-muted text-xs" data-testid="plant-no-item">
        The block has no item (see "Block item"), so nothing plants it.
      </p>
    );
  }
  return (
    <>
      <IdField
        label={props.label}
        value={text(asObject(data.item).id)}
        registry="item"
        suggest={props.suggest}
        testId="plant-item-id"
        onCommit={(value) => props.set(['item', 'id'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">{props.note}</p>
      {at(['item', 'id'])}
    </>
  );
}

function CropSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const maxAge = cropMaxAge(element.data);
  const textures = stageTextures(element.data);
  const heights = ownStageHeights(element.data);
  const growth = bonemealGrowth(element.data) ?? DEFAULT_BONEMEAL_GROWTH;
  const drops = asObject(data.crop_drops);
  const cropDrops = data.loot === 'crop';
  const setTextures = (next: readonly string[]) =>
    set(
      ['textures'],
      next.length === 0 ? undefined : { ...asObject(data.textures), stages: [...next] },
    );
  const count = drops.produce_count;
  return (
    <Section title="Crop" testId="block-crop">
      <NumberField
        label={`Last age (1 to ${MAX_CROP_MAX_AGE}; empty: ${DEFAULT_CROP_MAX_AGE})`}
        value={data.max_age}
        integer
        allowEmpty
        testId="crop-max-age"
        onCommit={(value) => {
          const key = typingKey('/max_age');
          set(['max_age'], value, key);
          // Keep the crop's own heights in step with the stages.
          if (heights !== undefined) {
            const next =
              typeof value === 'number' && value >= 1 && value <= MAX_CROP_MAX_AGE
                ? value
                : DEFAULT_CROP_MAX_AGE;
            set(['stage_heights'], resizeStageHeights(heights, next), key);
          }
        }}
      />
      <p className="text-muted text-xs">
        The crop grows through {maxAge + 1} stages, from age 0 to age {maxAge}.
      </p>
      {at(['max_age'])}

      <h4 className="font-medium text-xs">Stage textures</h4>
      <div className="flex flex-col gap-1" data-testid="crop-stage-textures">
        {textures.map((texture, index) => (
          <div key={index} className="flex items-end gap-1">
            <IdField
              label={`Stage ${index}`}
              value={texture}
              registry="texture"
              suggest={suggest}
              className="flex-1"
              testId={`crop-stage-texture-${index}`}
              onCommit={(value) =>
                setTextures(textures.map((entry, i) => (i === index ? value : entry)))
              }
            />
            <button
              type="button"
              className={buttonClass}
              aria-label={`Remove stage ${index} texture`}
              data-testid={`crop-stage-texture-${index}-remove`}
              onClick={() => setTextures(textures.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={buttonClass}
            data-testid="crop-stage-texture-add"
            disabled={textures.length >= maxAge + 1}
            onClick={() => setTextures([...textures, textures.at(-1) ?? ''])}
          >
            Add stage texture
          </button>
        </div>
      </div>
      <p className="text-muted text-xs">
        One texture per stage from age 0. Fewer textures than stages are spread over the ages, as
        vanilla potatoes repeat four pictures over eight ages. The last texture is also the seeds'
        picture.
      </p>
      {at(['textures', 'stages'])}

      <CheckField
        label="Own stage heights (the outline of each stage)"
        checked={heights !== undefined}
        testId="crop-own-heights"
        onChange={(checked) =>
          set(['stage_heights'], checked ? defaultStageHeights(maxAge) : undefined)
        }
      />
      {heights === undefined ? (
        <p className="text-muted text-xs" data-testid="crop-heights-default">
          Vanilla's heights in pixels: {defaultStageHeights(maxAge).join(', ')}.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1" data-testid="crop-heights">
          {heights.map((height, index) => (
            <NumberField
              key={index}
              label={`Stage ${index} height`}
              value={height}
              integer
              testId={`crop-height-${index}`}
              onCommit={(value) => {
                if (value === undefined) return;
                set(['stage_heights', index], value, typingKey(`/stage_heights/${index}`));
              }}
            />
          ))}
        </div>
      )}
      {at(['stage_heights'])}

      <IdField
        label={`Planted on (a block or #tag; empty: ${DEFAULT_CROP_SOIL})`}
        value={text(data.soil)}
        registry="block"
        suggest={suggest}
        testId="crop-soil"
        onCommit={(value) => set(['soil'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">
        Farmer villagers only farm crops on farmland, so another soil keeps them away.
      </p>
      {at(['soil'])}

      <div className="flex flex-wrap gap-2">
        <NumberField
          label="Bone meal grows at least"
          value={growth.min}
          integer
          allowEmpty
          testId="crop-bonemeal-min"
          onCommit={(value) =>
            set(
              ['bonemeal_growth'],
              withBonemealBound(element.data, 'min', value),
              typingKey('/bonemeal_growth/min'),
            )
          }
        />
        <NumberField
          label="Bone meal grows at most"
          value={growth.max}
          integer
          allowEmpty
          testId="crop-bonemeal-max"
          onCommit={(value) =>
            set(
              ['bonemeal_growth'],
              withBonemealBound(element.data, 'max', value),
              typingKey('/bonemeal_growth/max'),
            )
          }
        />
      </div>
      <p className="text-muted text-xs">
        Stages added by one bone meal, picked at random; vanilla's are {DEFAULT_BONEMEAL_GROWTH.min}{' '}
        to {DEFAULT_BONEMEAL_GROWTH.max}.
      </p>
      {at(['bonemeal_growth'])}

      <ItemIdField
        {...props}
        label="Seeds item (empty: the crop's own id)"
        note="The item that plants the crop, such as tomato seeds for tomatoes. For a crop planted from its produce (like carrots), name the produce here and as the produce below."
      />
      <CheckField
        label="Farmer villagers plant the seeds"
        checked={data.villager_plantable !== false}
        testId="crop-villager-plantable"
        onChange={(checked) => set(['villager_plantable'], checked ? undefined : false)}
      />
      {at(['villager_plantable'])}

      <CheckField
        label="Crop drops (the produce when grown, the seeds before)"
        checked={cropDrops}
        testId="crop-drops"
        onChange={(checked) => set(['loot'], checked ? 'crop' : 'self')}
      />
      {cropDrops && (
        <div className="flex flex-col gap-1" data-testid="crop-drops-fields">
          <IdField
            label="Produce (harvested when grown)"
            value={text(drops.produce)}
            registry="item"
            suggest={suggest}
            testId="crop-produce"
            onCommit={(value) => set(['crop_drops', 'produce'], value === '' ? undefined : value)}
          />
          {at(['crop_drops', 'produce'])}
          <NumberField
            label="How many (empty: one)"
            value={typeof count === 'number' ? count : undefined}
            integer
            allowEmpty
            testId="crop-produce-count"
            onCommit={(value) =>
              set(['crop_drops', 'produce_count'], value, typingKey('/crop_drops/produce_count'))
            }
          />
          {typeof count === 'object' && count !== null && (
            <p className="text-muted text-xs">
              A range is set; edit it under "Every setting", at the bottom.
            </p>
          )}
          {at(['crop_drops', 'produce_count'])}
          <CheckField
            label="Extra seeds when grown (Fortune adds more, as wheat)"
            checked={drops.seed_bonus !== false}
            testId="crop-seed-bonus"
            onChange={(checked) => set(['crop_drops', 'seed_bonus'], checked ? undefined : false)}
          />
        </div>
      )}
    </Section>
  );
}

/** A tree feature field with "Open" for a project feature. */
function TreeField(props: {
  project: Project;
  label: string;
  value: string;
  suggest(registry: string, prefix: string): string[];
  testId: string;
  onCommit(value: string): void;
}) {
  const host = useStructureStudioHost();
  const own = projectFeature(props.project, props.value);
  return (
    <div className="flex items-end gap-1">
      <IdField
        label={props.label}
        value={props.value}
        registry="worldgen/feature"
        suggest={props.suggest}
        className="flex-1"
        testId={props.testId}
        onCommit={props.onCommit}
      />
      <button
        type="button"
        aria-label={`Open ${props.label.toLowerCase()}`}
        title={
          own === undefined
            ? 'The tree is not part of this project'
            : host === null
              ? 'Not available here'
              : `Open ${own.id} in the Tree Studio`
        }
        className={iconButtonClass}
        data-testid={`${props.testId}-open`}
        disabled={own === undefined || host === null}
        onClick={() => {
          if (own !== undefined) host?.openElement(own.id);
        }}
      >
        <ExternalLink size={12} aria-hidden />
      </button>
    </div>
  );
}

function SaplingSection(props: PlantSectionProps) {
  const { project, element, problems, set, suggest } = props;
  const host = useBlocksItemsStudioHost();
  const data = asObject(element.data);
  const at = useAt(problems);
  const tree = text(data.tree);
  const newTree = saplingTreeId(element.id);
  const taken = projectHasId(project, newTree);
  const colon = newTree.indexOf(':');
  const blocks = treeBlockIds(newTree, newTree.slice(0, colon));
  const create = host?.newFromTemplate;
  return (
    <Section title="Sapling" testId="block-sapling">
      <TreeField
        project={project}
        label="Tree"
        value={tree}
        suggest={suggest}
        testId="sapling-tree"
        onCommit={(value) => set(['tree'], value)}
      />
      {at(['tree'])}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          data-testid="sapling-new-tree"
          disabled={create === undefined || taken}
          title={
            create === undefined
              ? 'Not available here'
              : taken
                ? `${newTree} is already in the project`
                : `Make ${newTree} from the template "Tree for a sapling"`
          }
          onClick={() => {
            if (create === undefined || taken) return;
            set(['tree'], newTree);
            create(SAPLING_TREE_TEMPLATE, newTree as ResourceLocation);
          }}
        >
          New tree
        </button>
        <p className="m-0 text-muted text-xs" data-testid="sapling-new-tree-note">
          Makes {newTree} with oak's shape, grown from {blocks.log} and {blocks.leaves}, and opens
          it in the Tree Studio.
        </p>
      </div>
      <TreeField
        project={project}
        label="Two-by-two tree (empty: none)"
        value={text(data.mega_tree)}
        suggest={suggest}
        testId="sapling-mega-tree"
        onCommit={(value) => set(['mega_tree'], value === '' ? undefined : value)}
      />
      {at(['mega_tree'])}
      <TreeField
        project={project}
        label="Tree near flowers (empty: the tree)"
        value={text(data.flower_tree)}
        suggest={suggest}
        testId="sapling-flower-tree"
        onCommit={(value) => set(['flower_tree'], value === '' ? undefined : value)}
      />
      {at(['flower_tree'])}
      <IdField
        label={`Planted on (a block or #tag; empty: ${DEFAULT_SAPLING_SOIL})`}
        value={text(data.soil)}
        registry="block"
        suggest={suggest}
        testId="sapling-soil"
        onCommit={(value) => set(['soil'], value === '' ? undefined : value)}
      />
      {at(['soil'])}
      <p className="text-muted text-xs">
        The tree is looked up when the sapling grows; a tree missing from the game is a warning at
        start-up and the sapling does not grow.
      </p>
    </Section>
  );
}

function LeavesSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const tintId = useId();
  const colourId = useId();
  const tint = leafTintOf(element.data);
  const drops = asObject(data.leaves_drops);
  const leavesDrops = data.loot === 'leaves';
  const extra = asObject(drops.extra);
  return (
    <Section title="Leaves" testId="block-leaves">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 text-xs">
          <label htmlFor={tintId} className="text-muted">
            Tint
          </label>
          <select
            id={tintId}
            className={inputClass}
            data-testid="leaves-tint"
            value={tint}
            onChange={(event) =>
              set(['tint'], tintValue(event.target.value as LeafTint, element.data))
            }
          >
            {(['none', ...LEAF_TINTS] as const).map((choice) => (
              <option key={choice} value={choice}>
                {LEAF_TINT_LABELS[choice]}
              </option>
            ))}
          </select>
        </div>
        {tint === 'colour' && typeof data.tint === 'number' && (
          <div className="flex flex-col gap-0.5 text-xs">
            <label htmlFor={colourId} className="text-muted">
              Colour
            </label>
            <input
              id={colourId}
              type="color"
              data-testid="leaves-tint-colour"
              value={colourHex(data.tint)}
              onChange={(event) => {
                const value = parseColourHex(event.target.value);
                if (value !== undefined) set(['tint'], value, typingKey('/tint'));
              }}
            />
          </div>
        )}
      </div>
      <p className="text-muted text-xs" data-testid="leaves-tint-note">
        The tint shows in game only: the preview draws the texture's own colours. Biome tints colour
        a grey texture, as vanilla's leaves; the leaves item takes a fixed colour.
      </p>
      {at(['tint'])}
      <NumberField
        label={`Falling leaf chance (0 to 1; empty: ${DEFAULT_PARTICLE_CHANCE})`}
        value={data.particle_chance}
        allowEmpty
        testId="leaves-particle-chance"
        onCommit={(value) => set(['particle_chance'], value, typingKey('/particle_chance'))}
      />
      {at(['particle_chance'])}
      {tint === 'none' ? (
        <IdField
          label="Falling particle (empty: none)"
          value={text(data.falling_particle)}
          registry="particle_type"
          suggest={suggest}
          testId="leaves-falling-particle"
          onCommit={(value) => set(['falling_particle'], value === '' ? undefined : value)}
        />
      ) : (
        <p className="text-muted text-xs" data-testid="leaves-particle-tinted">
          Tinted leaves drop leaf particles in their tint; a particle of your choice needs "None".
        </p>
      )}
      {at(['falling_particle'])}
      <CheckField
        label="Leaves drops (now and then the sapling, sticks and an extra item; itself with shears)"
        checked={leavesDrops}
        testId="leaves-drops"
        onChange={(checked) => set(['loot'], checked ? 'leaves' : 'self')}
      />
      {leavesDrops && (
        <div className="flex flex-col gap-1" data-testid="leaves-drops-fields">
          <IdField
            label="Sapling (empty: none)"
            value={text(drops.sapling)}
            registry="item"
            suggest={suggest}
            testId="leaves-drop-sapling"
            onCommit={(value) => set(['leaves_drops', 'sapling'], value === '' ? undefined : value)}
          />
          {at(['leaves_drops', 'sapling'])}
          <CheckField
            label="Sticks"
            checked={drops.sticks !== false}
            testId="leaves-drop-sticks"
            onChange={(checked) => set(['leaves_drops', 'sticks'], checked ? undefined : false)}
          />
          <IdField
            label="Extra item, as apples (empty: none)"
            value={text(extra.item)}
            registry="item"
            suggest={suggest}
            testId="leaves-drop-extra"
            onCommit={(value) =>
              set(['leaves_drops', 'extra'], value === '' ? undefined : { ...extra, item: value })
            }
          />
          {at(['leaves_drops', 'extra'])}
        </div>
      )}
    </Section>
  );
}

/** A quick picker of project blocks next to an id field ("Your plants", "Your blocks"). */
function OwnBlockPicker(props: {
  label: string;
  choices: readonly { id: string; label: string }[];
  value: string;
  testId: string;
  onPick(id: string): void;
}) {
  const id = useId();
  if (props.choices.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={props.choices.some((choice) => choice.id === props.value) ? props.value : ''}
        onChange={(event) => {
          if (event.target.value !== '') props.onPick(event.target.value);
        }}
      >
        <option value="">(pick one)</option>
        {props.choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CakeSection(props: PlantSectionProps) {
  const { element, problems, set } = props;
  const data = asObject(element.data);
  const food = asObject(data.food);
  const at = useAt(problems);
  return (
    <Section title="Cake" testId="block-cake">
      <p className="text-muted text-xs">
        Players eat it a slice at a time, seven slices in all; a comparator reads the slices left.
        It takes no candles.
      </p>
      <NumberField
        label={`Hunger a slice fills (1 to 20; empty: ${PLANT_FIELD_DEFAULTS.cakeNutrition})`}
        value={food.nutrition}
        integer
        allowEmpty
        testId="cake-nutrition"
        onCommit={(value) =>
          set(['food'], withCakeFood(data.food, 'nutrition', value), typingKey('/food'))
        }
      />
      <NumberField
        label={`Saturation (0 to 2; empty: ${PLANT_FIELD_DEFAULTS.cakeSaturation})`}
        value={food.saturation}
        allowEmpty
        testId="cake-saturation"
        onCommit={(value) =>
          set(['food'], withCakeFood(data.food, 'saturation', value), typingKey('/food'))
        }
      />
      {at(['food'])}
      {at(['food', 'nutrition'])}
      {at(['food', 'saturation'])}
      <EventSelect
        label="After a slice is eaten, run"
        value={data.on_eat}
        events={eventNames(element.data)}
        emptyLabel="(nothing)"
        testId="cake-on-eat"
        onChange={(value) => set(['on_eat'], value)}
      />
      {at(['on_eat'])}
    </Section>
  );
}

function BerryBushSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const own = blockItemIdOf(element.id, data);
  const harvest = asObject(data.harvest);
  const bound = (stage: 'ripe' | 'full', index: 0 | 1): Json | undefined => {
    const pair = harvest[stage];
    return Array.isArray(pair) ? pair[index] : undefined;
  };
  const countField = (stage: 'ripe' | 'full', index: 0 | 1, label: string) => (
    <NumberField
      label={`${label} (empty: ${PLANT_FIELD_DEFAULTS[stage][index]})`}
      value={bound(stage, index)}
      integer
      allowEmpty
      testId={`berry-harvest-${stage}-${index === 0 ? 'min' : 'max'}`}
      onCommit={(value) =>
        set(['harvest'], withHarvest(data.harvest, stage, index, value), typingKey('/harvest'))
      }
    />
  );
  return (
    <Section title="Berry bush" testId="block-berry-bush">
      <div className="flex items-end gap-1">
        <IdField
          label="Berry (picked from the bush, and planted to grow a new one)"
          value={text(data.berry)}
          registry="item"
          suggest={suggest}
          className="flex-1"
          testId="berry-item"
          onCommit={(value) => set(['berry'], value === '' ? undefined : value)}
        />
        <button
          type="button"
          className={buttonClass}
          data-testid="berry-use-own"
          disabled={own === undefined || data.berry === own}
          title={own === undefined ? 'The bush has no item' : `Use ${own}`}
          onClick={() => {
            if (own !== undefined) set(['berry'], own);
          }}
        >
          Use the bush's own item
        </button>
      </div>
      <p className="text-muted text-xs">
        Usually the bush's own item: planting it grows the bush, as sweet berries do.
      </p>
      {at(['berry'])}
      <h4 className="font-medium text-xs">Berries picked</h4>
      <div className="grid grid-cols-2 gap-1">
        {countField('ripe', 0, 'When ripe, at least')}
        {countField('ripe', 1, 'When ripe, at most')}
        {countField('full', 0, 'When full, at least')}
        {countField('full', 1, 'When full, at most')}
      </div>
      {at(['harvest'])}
      <CheckField
        label="Slows and hurts whoever walks through it (like sweet berry bushes)"
        checked={data.hurts !== false}
        testId="berry-hurts"
        onChange={(checked) => set(['hurts'], checked ? undefined : false)}
      />
      {at(['hurts'])}
    </Section>
  );
}

function TallPlantSection(props: PlantSectionProps) {
  const { element, problems, set } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const id = useId();
  const current = typeof data.bonemeal === 'string' ? data.bonemeal : 'drop_copy';
  return (
    <Section title="Tall plant" testId="block-tall-plant">
      <p className="text-muted text-xs">
        Two blocks high; the lower half drops the item, and placing it places both halves.
      </p>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        <label htmlFor={id} className="text-muted">
          Bone meal
        </label>
        <select
          id={id}
          className={inputClass}
          data-testid="tall-plant-bonemeal"
          value={current}
          onChange={(event) =>
            set(['bonemeal'], event.target.value === 'drop_copy' ? undefined : event.target.value)
          }
        >
          {Object.entries(TALL_PLANT_BONEMEAL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {at(['bonemeal'])}
    </Section>
  );
}

function PottedPlantSection(props: PlantSectionProps) {
  const { project, element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const plant = text(data.plant);
  return (
    <Section title="Potted plant" testId="block-potted-plant">
      <OwnBlockPicker
        label="Your plants"
        choices={projectBlocksOf(project, ['sapling', 'berry_bush'], element.id)}
        value={plant}
        testId="potted-plant-own"
        onPick={(id) => set(['plant'], id)}
      />
      <IdField
        label="Plant in the pot"
        value={plant}
        registry="block"
        suggest={suggest}
        testId="potted-plant-plant"
        onCommit={(value) => set(['plant'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">
        A sapling, a berry bush or a block drawn as a cross; a plant Minecraft already pots cannot
        be potted again, and tall plants do not fit. Breaking it drops the pot and the plant. It has
        no item of its own: players make it by putting the plant in a flower pot.
      </p>
      {at(['plant'])}
      <OwnBlockPicker
        label="Your pots"
        choices={projectBlocksOf(project, ['flower_pot'], element.id)}
        value={text(data.pot)}
        testId="potted-plant-own-pot"
        onPick={(id) => set(['pot'], id)}
      />
      <IdField
        label="Pot (empty: Minecraft's flower pot)"
        value={text(data.pot)}
        registry="block"
        suggest={suggest}
        testId="potted-plant-pot"
        onCommit={(value) => set(['pot'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">
        The empty pot the plant goes into: Minecraft's own, or a flower pot of this project. A
        project pot can also list the plant itself, under "Plants it takes".
      </p>
      {at(['pot'])}
    </Section>
  );
}

function VineSection(props: PlantSectionProps) {
  const { element, problems, set } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  return (
    <Section title="Vine" testId="block-vine">
      <CheckField
        label="Spreads over time, as vanilla's vines"
        checked={data.spreads !== false}
        testId="vine-spreads"
        onChange={(checked) => set(['spreads'], checked ? undefined : false)}
      />
      <p className="text-muted text-xs">It grows on walls and under blocks, and is climbable.</p>
      {at(['spreads'])}
    </Section>
  );
}

function StemSection(props: PlantSectionProps) {
  const { project, element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const tags = props.target?.blocks?.stemTags;
  const fruit = text(data.fruit);
  return (
    <Section title="Stem" testId="block-stem">
      <OwnBlockPicker
        label="Your blocks"
        choices={projectBlocksOf(project, ['block', 'horizontal'], element.id)}
        value={fruit}
        testId="stem-fruit-own"
        onPick={(id) => set(['fruit'], id)}
      />
      <IdField
        label="Fruit (grows next to the stem when it is fully grown)"
        value={fruit}
        registry="block"
        suggest={suggest}
        testId="stem-fruit"
        onCommit={(value) => set(['fruit'], value === '' ? undefined : value)}
      />
      {at(['fruit'])}
      <IdField
        label={`Planted on (empty: ${tags?.soil === undefined ? "the melon stem's blocks" : `#${tags.soil}`})`}
        value={text(data.soil)}
        registry="block"
        suggest={suggest}
        testId="stem-soil"
        onCommit={(value) => set(['soil'], value === '' ? undefined : value)}
      />
      {at(['soil'])}
      <IdField
        label={`Fruit grows on (empty: ${tags?.fruitSoil === undefined ? "the melon's blocks" : `#${tags.fruitSoil}`})`}
        value={text(data.fruit_soil)}
        registry="block"
        suggest={suggest}
        testId="stem-fruit-soil"
        onCommit={(value) => set(['fruit_soil'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">
        Both are block tags, such as #minecraft:dirt. The stem grows through eight stages, then
        bends onto the fruit it grew.
      </p>
      {at(['fruit_soil'])}
    </Section>
  );
}

function CocoaSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  return (
    <Section title="Pod" testId="block-cocoa">
      <IdField
        label={`Hangs on (empty: ${PLANT_FIELD_DEFAULTS.cocoaSupport})`}
        value={text(data.support)}
        registry="block"
        suggest={suggest}
        testId="cocoa-support"
        onCommit={(value) => set(['support'], value === '' ? undefined : value)}
      />
      <p className="text-muted text-xs">
        A block tag of the logs it grows on; it grows through three stages, as cocoa does.
      </p>
      {at(['support'])}
    </Section>
  );
}

/** A select over worded choices; the empty choice clears the field. */
function WordsSelect(props: {
  label: string;
  value: string | undefined;
  labels: Readonly<Record<string, string>>;
  testId: string;
  /** The empty choice's words; no empty choice when absent. */
  emptyLabel?: string;
  onChange(value: string | undefined): void;
}) {
  const id = useId();
  const current = props.value ?? '';
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={current}
        onChange={(event) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        {props.emptyLabel !== undefined && <option value="">{props.emptyLabel}</option>}
        {current !== '' && props.labels[current] === undefined && (
          <option value={current}>{current}</option>
        )}
        {Object.entries(props.labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The ids or tags a plant grows on (`soil`): words, and the id list in More options. */
function SoilField(props: {
  label: string;
  data: { [key: string]: Json };
  fallback: string;
  suggest(registry: string, prefix: string): string[];
  problems: readonly FormProblem[];
  set: SetPath;
  testId: string;
}) {
  const soil = Array.isArray(props.data.soil)
    ? props.data.soil.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return (
    <div className="flex flex-col gap-0.5 text-xs" data-testid={props.testId}>
      <span className="text-muted">{props.label}</span>
      <p className="text-muted" data-testid={`${props.testId}-words`}>
        {soil.length === 0 ? props.fallback : `${soil.length} kinds of block you chose`}
      </p>
      <InMore fallbackKey={props.testId}>
        <IdList
          label={props.label}
          ids={soil}
          registry="block"
          suggest={props.suggest}
          pointer="/soil"
          problems={props.problems}
          onChange={(next) => props.set(['soil'], next.length === 0 ? undefined : next)}
        />
        <p className="text-muted">
          Empty: {props.fallback}. Blocks or block tags (starting with #), up to 16; the plant
          checks them itself, so Minecraft's own plants are not changed.
        </p>
      </InMore>
      <ProblemsAt problems={props.problems} pointer="/soil" />
    </div>
  );
}

function GrowingPlantSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const berries = asObject(data.berries);
  const hasBerries = typeof data.berries === 'object' && data.berries !== null;
  const own = blockItemIdOf(element.id, data);
  const growth = asObject(data.bonemeal_growth);
  const water = data.needs_water === true;
  return (
    <Section title="Grows in long strands" testId="block-growing-plant">
      <p className="text-muted text-xs">
        The block you place is the tip; as it grows it leaves a strand behind it, as kelp and vines
        do.
      </p>
      <WordsSelect
        label="Grows"
        value={data.direction === 'down' ? 'down' : 'up'}
        labels={{
          up: 'Grows up (like kelp and twisting vines)',
          down: 'Grows down (like weeping and cave vines)',
        }}
        testId="growing-plant-direction"
        onChange={(value) => set(['direction'], value === 'down' ? 'down' : undefined)}
      />
      {at(['direction'])}
      <NumberField
        label={`Starts at age (0 to 25; empty: ${GROWING_PLANT_DEFAULTS.maxAge})`}
        value={data.max_age}
        integer
        allowEmpty
        testId="growing-plant-max-age"
        onCommit={(value) => set(['max_age'], value, typingKey('/max_age'))}
      />
      <p className="text-muted text-xs">
        It stops at age 25, so a tip placed at age 0 grows up to 26 blocks.
      </p>
      {at(['max_age'])}
      <NumberField
        label={`Chance to grow (0 to 1 a random tick; empty: ${GROWING_PLANT_DEFAULTS.growthChance})`}
        value={data.growth_chance}
        allowEmpty
        testId="growing-plant-growth-chance"
        onCommit={(value) => set(['growth_chance'], value, typingKey('/growth_chance'))}
      />
      {at(['growth_chance'])}
      <div className="flex flex-wrap gap-2">
        <NumberField
          label="Bone meal adds at least"
          value={growth.min}
          integer
          allowEmpty
          testId="growing-plant-bonemeal-min"
          onCommit={(value) =>
            set(
              ['bonemeal_growth'],
              withRangeBound(data.bonemeal_growth, 'min', value, 1),
              typingKey('/bonemeal_growth'),
            )
          }
        />
        <NumberField
          label="Bone meal adds at most"
          value={growth.max}
          integer
          allowEmpty
          testId="growing-plant-bonemeal-max"
          onCommit={(value) =>
            set(
              ['bonemeal_growth'],
              withRangeBound(data.bonemeal_growth, 'max', value, 1),
              typingKey('/bonemeal_growth'),
            )
          }
        />
      </div>
      <p className="text-muted text-xs">
        Blocks one bone meal adds; empty uses Minecraft's for the strand (one for a water plant).
      </p>
      {at(['bonemeal_growth'])}
      <CheckField
        label="Lives in water (like kelp: placed only in water, breaks when the water goes)"
        checked={water}
        testId="growing-plant-needs-water"
        onChange={(checked) => set(['needs_water'], checked ? true : undefined)}
      />
      {at(['needs_water'])}
      <CheckField
        label="Can be climbed (like vines)"
        checked={typeof data.climbable === 'boolean' ? data.climbable : !water}
        testId="growing-plant-climbable"
        onChange={(checked) => set(['climbable'], checked === !water ? undefined : checked)}
      />
      {at(['climbable'])}
      <CheckField
        label="Berries (picked from the strand, like glow berries)"
        checked={hasBerries}
        testId="growing-plant-berries"
        onChange={(checked) =>
          set(['berries'], checked ? { item: own ?? 'minecraft:glow_berries' } : undefined)
        }
      />
      {hasBerries && (
        <div className="flex flex-col gap-1" data-testid="growing-plant-berry-fields">
          <InMore>
            <IdField
              label="Berry item"
              value={text(berries.item)}
              registry="item"
              suggest={suggest}
              testId="growing-plant-berry-item"
              onCommit={(value) => set(['berries', 'item'], value)}
            />
          </InMore>
          <button
            type="button"
            className={`${buttonClass} self-start`}
            data-testid="growing-plant-berry-own"
            disabled={own === undefined || berries.item === own}
            onClick={() => {
              if (own !== undefined) set(['berries', 'item'], own);
            }}
          >
            Use the plant's own item
          </button>
          <NumberField
            label={`Light while it has berries (0 to 15; empty: ${GROWING_PLANT_DEFAULTS.berryLight})`}
            value={berries.light}
            integer
            allowEmpty
            testId="growing-plant-berry-light"
            onCommit={(value) => set(['berries', 'light'], value, typingKey('/berries/light'))}
          />
          <p className="text-muted text-xs">
            Using the strand picks the berries; when the berry is the plant's own item, planting it
            grows a new strand, as glow berries do.
          </p>
          {at(['berries'])}
          {at(['berries', 'item'])}
        </div>
      )}
      <SoilField
        label="Grows on"
        data={data}
        fallback="any block with a solid face"
        suggest={suggest}
        problems={problems}
        set={set}
        testId="growing-plant-soil"
      />
    </Section>
  );
}

function ColumnPlantSection(props: PlantSectionProps) {
  const { element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const style = columnStyleOf(element.data);
  const soils = props.target?.blocks?.plantSoils;
  const soilTag =
    style === 'cane' ? soils?.cane : style === 'cactus' ? soils?.cactus : soils?.bamboo;
  const max = columnMaxHeight(element.data);
  return (
    <Section title="Grows tall like sugar cane" testId="block-column-plant">
      <WordsSelect
        label="Shape"
        value={style}
        labels={COLUMN_PLANT_STYLE_LABELS}
        testId="column-plant-style"
        onChange={(value) => {
          const next = value === 'cactus' || value === 'bamboo' ? value : 'cane';
          if (next !== style) set([], withColumnStyle(element.data, next));
        }}
      />
      {at(['style'])}
      <div className="flex flex-wrap gap-2">
        <NumberField
          label={`Tallest stop (1 to 32; empty: ${COLUMN_PLANT_DEFAULTS.height[style]})`}
          value={data.max_height}
          integer
          allowEmpty
          testId="column-plant-max-height"
          onCommit={(value) => set(['max_height'], value, typingKey('/max_height'))}
        />
        <NumberField
          label={`Shortest stop (empty: ${defaultColumnMinHeight(element.data)})`}
          value={data.min_height}
          integer
          allowEmpty
          testId="column-plant-min-height"
          onCommit={(value) => set(['min_height'], value, typingKey('/min_height'))}
        />
      </div>
      <p className="text-muted text-xs">
        Each stalk stops growing at a height picked between the two, up to {max} blocks; bone meal
        can grow bamboo past its stop up to the tallest.
      </p>
      {at(['max_height'])}
      {at(['min_height'])}
      <SoilField
        label="Grows on"
        data={data}
        fallback={soilTag === undefined ? "Minecraft's blocks for the shape" : `#${soilTag}`}
        suggest={suggest}
        problems={problems}
        set={set}
        testId="column-plant-soil"
      />
      <CheckField
        label="Needs water beside it (like sugar cane)"
        checked={
          typeof data.needs_water_nearby === 'boolean' ? data.needs_water_nearby : style === 'cane'
        }
        testId="column-plant-needs-water"
        onChange={(checked) =>
          set(['needs_water_nearby'], checked === (style === 'cane') ? undefined : checked)
        }
      />
      {at(['needs_water_nearby'])}
      <NumberField
        label={`Hurts when touched (damage 0 to 100; empty: ${style === 'cactus' ? COLUMN_PLANT_DEFAULTS.cactusDamage : 0})`}
        value={data.touch_damage}
        allowEmpty
        testId="column-plant-touch-damage"
        onCommit={(value) => set(['touch_damage'], value, typingKey('/touch_damage'))}
      />
      {at(['touch_damage'])}
      {style === 'bamboo' && (
        <p className="text-muted text-xs" data-testid="column-plant-bamboo-note">
          Bamboo starts as a shoot, grows leaves near its top and turns thick from the fourth block,
          as Minecraft's bamboo.
        </p>
      )}
    </Section>
  );
}

function MultifaceSection(props: PlantSectionProps) {
  const { element, problems, set } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  return (
    <Section title="Spreads over any side" testId="block-multiface">
      <p className="text-muted text-xs">
        It covers any side of the blocks around it, as glow lichen; one block can cover several
        sides.
      </p>
      <NumberField
        label={`Light (0 to 15; empty: ${DEFAULT_MULTIFACE_LIGHT})`}
        value={data.light}
        integer
        allowEmpty
        testId="multiface-light"
        onCommit={(value) => set(['light'], value, typingKey('/light'))}
      />
      {at(['light'])}
      <CheckField
        label="Spreads with bone meal"
        checked={data.spreads !== false}
        testId="multiface-spreads"
        onChange={(checked) => set(['spreads'], checked ? undefined : false)}
      />
      {at(['spreads'])}
      <CheckField
        label="Holds water (placed underwater, it stays full of water)"
        checked={data.waterloggable !== false}
        testId="multiface-waterloggable"
        onChange={(checked) => set(['waterloggable'], checked ? undefined : false)}
      />
      {at(['waterloggable'])}
    </Section>
  );
}

/** The project's big dripleaf elements, for a small one's "Grows into". */
function projectBigDripleaves(project: Project, except: string): { id: string; label: string }[] {
  const bigIds = new Set<string>(
    project.namespaces
      .flatMap((namespace) => namespace.elements)
      .filter((entry) => entry.kind === 'msm:block' && asObject(entry.data).size !== 'small')
      .map((entry) => entry.id),
  );
  return projectBlocksOf(project, ['dripleaf'], except).filter((entry) => bigIds.has(entry.id));
}

function DripleafSection(props: PlantSectionProps) {
  const { project, element, problems, set, suggest } = props;
  const data = asObject(element.data);
  const at = useAt(problems);
  const size = data.size === 'small' ? 'small' : 'big';
  const tilt = Array.isArray(data.tilt_ticks) ? data.tilt_ticks : [];
  const tiltField = (index: 0 | 1 | 2, label: string) => (
    <NumberField
      label={`${label} (ticks; empty: ${DEFAULT_TILT_TICKS[index]})`}
      value={tilt[index]}
      integer
      allowEmpty
      testId={`dripleaf-tilt-${index}`}
      onCommit={(value) =>
        set(['tilt_ticks'], withTiltTicks(element.data, index, value), typingKey('/tilt_ticks'))
      }
    />
  );
  return (
    <Section title="Tips when you stand on it" testId="block-dripleaf">
      <WordsSelect
        label="Size"
        value={size}
        labels={DRIPLEAF_SIZE_LABELS}
        testId="dripleaf-size"
        onChange={(value) => {
          if (value === undefined || value === size) return;
          const next: { [key: string]: Json } = { ...data, size: value };
          // A big leaf has tilt timing, a small one the leaf it grows into.
          if (value === 'big') delete next.grows_into;
          else delete next.tilt_ticks;
          set([], next);
        }}
      />
      {at(['size'])}
      {size === 'big' ? (
        <>
          <p className="text-muted text-xs">
            It stands on a stem; whoever stands on the leaf tips it a little, then right over, and
            falls through. Bone meal grows it a block taller.
          </p>
          <div className="flex flex-wrap gap-2">
            {tiltField(0, 'Starts tipping after')}
            {tiltField(1, 'Tips right over after')}
            {tiltField(2, 'Drops whoever stands on it after')}
          </div>
          {at(['tilt_ticks'])}
        </>
      ) : (
        <>
          <OwnBlockPicker
            label="Grows into (your big dripleaves)"
            choices={projectBigDripleaves(project, element.id)}
            value={text(data.grows_into)}
            testId="dripleaf-grows-into-own"
            onPick={(id) => set(['grows_into'], id)}
          />
          <InMore>
            <IdField
              label="Grows into"
              value={text(data.grows_into)}
              registry="block"
              suggest={suggest}
              testId="dripleaf-grows-into"
              onCommit={(value) => set(['grows_into'], value === '' ? undefined : value)}
            />
          </InMore>
          <p className="text-muted text-xs">
            Two blocks high; bone meal turns it into the big dripleaf you pick, which must be one of
            this project's.
          </p>
          {at(['grows_into'])}
        </>
      )}
    </Section>
  );
}

function FlowerPotSection(props: PlantSectionProps) {
  const { project, element, problems, set, suggest } = props;
  const at = useAt(problems);
  const host = useBlocksItemsStudioHost();
  const [open, setOpen] = useState(false);
  const plants = potPlantsOf(element.data);
  const companions = companionRows(element);
  const texturesFolder = props.target?.folders.resource.textures ?? 'textures';
  const sections = useMemo<ThingSection[]>(() => {
    if (!open) return [];
    const own = projectPottablePlants(project).filter((id) => id !== element.id);
    const vanilla = vanillaPottablePlants(suggest);
    const ids = [...own, ...vanilla];
    const ownSet = new Set(own);
    const found = thingSections({
      project,
      registries: { ids: (registry) => (registry === 'block' ? ids : []) },
      sort: 'block',
      texturesFolder,
    });
    return found.flatMap((section): ThingSection[] => {
      if (section.id === 'own') {
        const things = section.things.filter((thing) => ownSet.has(thing.id));
        return things.length === 0 ? [] : [{ ...section, label: 'Your plants', things }];
      }
      return [{ ...section, label: 'Plants Minecraft pots' }];
    });
  }, [open, project, element.id, suggest, texturesFolder]);
  const pictures = useMemo<ThingPictures | null>(() => {
    const vanilla = host?.modelPreview?.vanilla;
    if (host === null) return null;
    return {
      project: host.thumbnail,
      vanilla:
        vanilla === null || vanilla === undefined ? undefined : (path) => vanilla.readAsset(path),
      revision: host.revision,
    };
  }, [host]);
  const write = (next: readonly string[]) => set(['plants'], [...next]);
  return (
    <Section title="A flower pot" testId="block-flower-pot">
      <p className="text-muted text-xs">
        Using the pot with one of these plants puts it in; Minecraft's own flower pot is not
        changed.
      </p>
      <span className="text-muted text-xs">Plants it takes</span>
      {plants.length === 0 && (
        <p className="text-warning text-xs" data-testid="flower-pot-empty">
          Pick at least one plant.
        </p>
      )}
      <ul className="flex flex-wrap gap-1" data-testid="flower-pot-plants">
        {plants.map((plant, index) => (
          <li
            key={plant}
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs"
            data-testid={`flower-pot-plant-${index}`}
          >
            <span>{thingName(project, plant, 'block')}</span>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Remove ${thingName(project, plant, 'block')}`}
              data-testid={`flower-pot-plant-${index}-remove`}
              onClick={() => write(plants.filter((_, at) => at !== index))}
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {plants.length > 0 && (
        <InMore>
          <p className="font-mono text-muted text-xs" data-testid="flower-pot-plant-ids">
            {plants.join(', ')}
          </p>
        </InMore>
      )}
      <button
        type="button"
        className={`${buttonClass} self-start`}
        data-testid="flower-pot-add"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} aria-hidden />
        Add a plant
      </button>
      {open && (
        <ThingPicker
          title="Pick a plant for the pot"
          sort="block"
          sections={sections}
          pictures={pictures}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            if (id !== null) write(withPotPlant(plants, id));
          }}
        />
      )}
      <InMore>
        <IdField
          label="Add any other block by id"
          value=""
          registry="block"
          suggest={suggest}
          testId="flower-pot-add-id"
          onCommit={(value) => {
            if (value.trim() !== '') write(withPotPlant(plants, value.trim()));
          }}
        />
      </InMore>
      <p className="text-muted text-xs" data-testid="flower-pot-count">
        {companions.length === 1
          ? 'It makes 1 potted plant block with the pot.'
          : `It makes ${companions.length} potted plant blocks with the pot, one for each plant.`}{' '}
        A plant takes the pot's pictures with its own; tall plants and plants without an item do not
        fit.
      </p>
      {at(['plants'])}
    </Section>
  );
}
