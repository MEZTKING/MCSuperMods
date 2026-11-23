/**
 * Villager look Studio (ADR 0107 D5 as amended, ADR 0112 D1) for `msm:villager_type` element
 * data, loaded lazily:
 *
 * - "Biomes": the biomes (ids or `#` tags) where villagers and zombie villagers are born or spawn
 *   with this look, with Minecraft's own looks named beside them.
 * - "Pictures": the villager's and the zombie villager's picture (64 x 64, vanilla's villager
 *   layout) and the hat (none, one that shows the job's headwear, one that hides it). The game
 *   draws them only from fixed places (`villagerTypeTexturePaths`), so choosing a picture stored
 *   elsewhere also copies it there in the same undo step (`picture-copies.ts`); "Copy the
 *   pictures" does it for pictures added before. Each picture has **Draw…** (clothes drawn on the
 *   villager's boxes, no key) and **Make with AI** (ADR 0093 D6 as amended on 2026-11-22: a
 *   tileable coat from the image service laid on the same boxes); either writes the picture at
 *   the fixed place and names it, in one undo step ({@link villagerLookChange}). Above them, the
 *   look itself on a turning villager stand-in, with a job's clothes and badge if one is picked
 *   (ADR 0121 D4, B627; loaded when first shown), following each edit at once.
 *
 * Everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { villagerTypeTexturePaths } from '@msm/plugin-entities';
import { lazy, Suspense, useState } from 'react';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { MakeWithAiButton } from '../../components/ai-pictures/MakeWithAiButton';
import { wordsOf } from '../../components/ai-pictures/prompt';
import { boxesShape, VILLAGER_CLOTHES_BOXES } from '../../components/ai-pictures/shapes';
import { textureChange } from '../../components/ai-pictures/texture-write';
import { DrawButton } from '../../components/art/DrawButton';
import { thingWords } from '../../components/thing-picker/thing-sources';
import { Button } from '../../components/ui/Button';
import { useHostProjectReader } from '../../liveviews/looks/particle/host-reader';
import { asObject, pathSetter, pointerOf } from '../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { ProblemsAt } from '../blocks-items/parts';
import { TextureThumbnail } from '../blocks-items/TexturesSection';
import {
  missingPictureCopies,
  type PictureCopy,
  pictureCopiesOf,
  writeWithPictureCopies,
} from '../picture-copies';
import { IdField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, IdList, Section } from '../worldgen/parts';
import { ChoiceField } from './MobKindSection';

type JsonObject = { [key: string]: Json };

/** The look on a villager stand-in (B627), a chunk of its own. */
const VillagerTypeLookFrame = lazy(() =>
  import('../../liveviews/looks/villager/VillagerTypeView').then((module) => ({
    default: module.VillagerTypeLookFrame,
  })),
);

/** The hats of `textures.hat` (vanilla's `villager.hat`), in the picker's order. */
export const VILLAGER_HATS: readonly string[] = Object.freeze(['none', 'partial', 'full']);

/** Each hat in plain words. */
export const VILLAGER_HAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  none: 'No hat',
  partial: 'A hat, with the job’s headwear showing over it',
  full: 'A hat that hides the job’s headwear',
});

/** The picture copies a villager look needs (its pictures that are not at their fixed places). */
export function villagerTypePictureCopies(
  target: StudioProps['target'],
  element: Pick<Element, 'id' | 'kind' | 'data'>,
): PictureCopy[] {
  try {
    return pictureCopiesOf(villagerTypeTexturePaths(target, element as Element));
  } catch {
    return [];
  }
}

/** Villager look data with picture `slot` set (`''` removes it, and `textures` when empty). */
export function withVillagerTypePicture(
  data: Json | undefined,
  slot: 'villager' | 'zombie_villager' | 'hat',
  value: string,
): JsonObject {
  const object = asObject(data);
  const textures: JsonObject = { ...asObject(object.textures) };
  if (value === '') delete textures[slot];
  else textures[slot] = value;
  const out: JsonObject = { ...object, textures };
  if (Object.keys(textures).length === 0) delete out.textures;
  return out;
}

/** The AI shape of a villager look's picture: a coat laid on the villager's clothes boxes. */
export const VILLAGER_LOOK_SHAPE = boxesShape(
  VILLAGER_CLOTHES_BOXES,
  64,
  64,
  'laid on the clothes',
);

/**
 * The change of a made picture for `slot` of a villager look: the bytes at the fixed place the
 * game reads (`<textures>/entity/<slot>/type/<path>.png` of the look's namespace) and the slot
 * naming it, as the items and writes of one `applyChanges` step.
 */
export function villagerLookChange(
  project: Parameters<typeof textureChange>[0],
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  slot: 'villager' | 'zombie_villager',
  bytes: Uint8Array,
  texturesFolder = 'textures',
): { items: ChangeItem[]; writes: ChangeAsset[]; label: string } {
  const colon = element.id.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : element.id.slice(0, colon);
  const path = colon < 0 ? element.id : element.id.slice(colon + 1);
  const assetPath = `${texturesFolder}/entity/${slot}/type/${path}.png`;
  const change = textureChange(project, namespace, assetPath, bytes);
  const textureId = `${namespace}:entity/${slot}/type/${path}`;
  const items = [...change.items];
  const current = asObject(asObject(element.data).textures)[slot];
  if (current !== textureId) {
    items.push({
      itemId: `villager-look:${slot}`,
      op: 'update',
      elementId: element.id,
      kind: element.kind,
      before: element.data,
      after: withVillagerTypePicture(element.data, slot, textureId),
      accepted: true,
      problems: [],
    });
  }
  return { items, writes: change.writes, label: `Villager look picture ${assetPath}` };
}

const strings = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** The Villager look Studio. */
export default function VillagerTypeStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const host = useBlocksItemsStudioHost();
  const readProject = useHostProjectReader(host);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Villager look Studio"
        data-testid="villager-type-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="villager-type-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const textures = asObject(data.textures);
  const picture = (slot: 'villager' | 'zombie_villager') =>
    typeof textures[slot] === 'string' ? String(textures[slot]) : '';
  const write = (after: Json, label: string) => {
    setError(null);
    writeWithPictureCopies(
      { apply: host?.applyChanges, read: host?.modelPreview?.readProjectAsset },
      project,
      element,
      after,
      villagerTypePictureCopies(target, { ...element, data: after }),
      label,
      'villager-type-picture-field',
      (next) => onChange('', next),
    ).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  const missing = missingPictureCopies(project, villagerTypePictureCopies(target, element));
  const lookPrompt = `the clothes of a ${wordsOf(element.id)} villager`;
  const takePicture = async (
    slot: 'villager' | 'zombie_villager',
    bytes: Uint8Array,
  ): Promise<void> => {
    const apply = host?.applyChanges;
    if (apply === undefined) return;
    const change = villagerLookChange(
      project,
      element,
      slot,
      bytes,
      target.folders?.resource?.textures ?? 'textures',
    );
    await apply(change.items, change.label, change.writes);
  };
  const vanillaLooks = target.entities?.villagerTypes ?? [];

  const biomes = (
    <Section title="Biomes" testId="villager-type-biomes">
      <p className="text-muted text-xs">
        Villagers born or spawned in these biomes wear this look, as plains and desert villagers
        wear theirs. Use # before a biome tag.
      </p>
      <IdList
        label="Biome"
        ids={strings(data.biomes)}
        registry="worldgen/biome"
        suggest={suggest}
        pointer={pointerOf(['biomes'])}
        problems={problems}
        onChange={(next) => set(['biomes'], next)}
      />
      {at(['biomes'])}
      {vanillaLooks.length > 0 && (
        <p className="text-muted text-xs" data-testid="villager-type-vanilla">
          Minecraft's own looks: {vanillaLooks.map((id) => thingWords(id)).join(', ')}. A biome
          named here takes this look instead.
        </p>
      )}
    </Section>
  );

  const pictures = (
    <Section title="Pictures" testId="villager-type-pictures">
      <Suspense fallback={<p className="text-muted text-xs">Dressing the villager…</p>}>
        <VillagerTypeLookFrame
          project={project}
          element={element}
          vanillaAssets={host?.modelPreview?.vanilla ?? null}
          readProject={readProject}
        />
      </Suspense>
      {(['villager', 'zombie_villager'] as const).map((slot) => (
        <div key={slot} className="flex items-end gap-2">
          <TextureThumbnail
            texture={picture(slot)}
            testId={`villager-type-picture-${slot}-thumbnail`}
          />
          <IdField
            label={slot === 'villager' ? 'Villager picture' : 'Zombie villager picture (optional)'}
            value={picture(slot)}
            registry="texture"
            suggest={suggest}
            testId={`villager-type-picture-${slot}`}
            onCommit={(value) =>
              write(withVillagerTypePicture(element.data, slot, value), 'Villager look picture')
            }
          />
          {host?.applyChanges !== undefined && (
            <>
              <DrawButton
                testId={`villager-type-picture-${slot}-draw`}
                target={`${element.id} ${slot}`}
                field={{
                  kinds: ['entity'],
                  width: 64,
                  height: 64,
                  name: element.id,
                  skin: true,
                  boxes: VILLAGER_CLOTHES_BOXES,
                }}
                onPick={(picture) => {
                  const bytes = picture.pngs[0];
                  if (bytes !== undefined) return takePicture(slot, bytes);
                }}
                ai={{
                  defaultPrompt: lookPrompt,
                  defaultStyle: 'skin',
                  size: 16,
                  shape: VILLAGER_LOOK_SHAPE,
                  onPick: (bytes) => takePicture(slot, bytes),
                }}
              />
              <MakeWithAiButton
                testId={`villager-type-picture-${slot}-ai`}
                target={`${element.id} ${slot}`}
                defaultPrompt={lookPrompt}
                defaultStyle="skin"
                size={16}
                shape={VILLAGER_LOOK_SHAPE}
                onPick={(bytes) => takePicture(slot, bytes)}
              />
            </>
          )}
        </div>
      ))}
      <ChoiceField
        label="Hat"
        value={typeof textures.hat === 'string' ? textures.hat : 'none'}
        choices={VILLAGER_HATS}
        labels={VILLAGER_HAT_LABELS}
        testId="villager-type-hat"
        onChange={(next) =>
          onChange(
            '',
            withVillagerTypePicture(
              element.data,
              'hat',
              next === undefined || next === 'none' ? '' : next,
            ),
          )
        }
      />
      {at(['textures'])}
      <p className="text-muted text-xs">
        The clothes of the look, 64 by 64, drawn under the job's clothes. Empty zombie picture uses
        the villager's.
      </p>
      {missing.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="villager-type-pictures-missing">
          <p className="text-warning text-xs">
            The game looks for these pictures in a fixed place, and they are not there yet.
          </p>
          <Button
            className="self-start text-xs"
            data-testid="villager-type-pictures-copy"
            disabled={host?.applyChanges === undefined}
            onClick={() => write(element.data, 'Copy villager look pictures')}
          >
            Copy the pictures to where the game looks
          </Button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-error text-xs" data-testid="villager-type-error">
          {error}
        </p>
      )}
    </Section>
  );

  return (
    <section
      aria-label="Villager look Studio"
      data-testid="villager-type-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId="villager-type-advanced-toggle"
      />
      <ProblemsAt problems={problems} pointer="" />
      {biomes}
      {pictures}
    </section>
  );
}
