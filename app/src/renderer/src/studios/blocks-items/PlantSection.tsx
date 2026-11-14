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
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { ExternalLink } from 'lucide-react';
import { useId } from 'react';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { useStructureStudioHost } from '../structures/host';
import { IdField, NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { blockTypeOfData } from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, ProblemsAt } from './parts';
import {
  bonemealGrowth,
  colourHex,
  cropMaxAge,
  DEFAULT_BONEMEAL_GROWTH,
  DEFAULT_CROP_MAX_AGE,
  DEFAULT_CROP_SOIL,
  DEFAULT_PARTICLE_CHANCE,
  DEFAULT_SAPLING_SOIL,
  defaultStageHeights,
  LEAF_TINT_LABELS,
  LEAF_TINTS,
  type LeafTint,
  leafTintOf,
  MAX_CROP_MAX_AGE,
  ownStageHeights,
  parseColourHex,
  projectFeature,
  projectHasId,
  resizeStageHeights,
  SAPLING_TREE_TEMPLATE,
  saplingTreeId,
  stageTextures,
  tintValue,
  treeBlockIds,
  withBonemealBound,
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
}

/** The plant section of the element's type, or nothing for the other types. */
export function PlantSection(props: PlantSectionProps) {
  const type = blockTypeOfData(props.element.data);
  if (type === 'crop') return <CropSection {...props} />;
  if (type === 'sapling') return <SaplingSection {...props} />;
  if (type === 'leaves') return <LeavesSection {...props} />;
  return null;
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
              A range is set; edit it under "Advanced (all fields)".
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
