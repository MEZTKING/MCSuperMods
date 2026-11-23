/**
 * The Block Studio's Textures section for the block types (B268, ADR 0067 D7, ADR 0069 D5):
 * the type's texture slots in words (`textures`), a thumbnail of each project texture, and the
 * models lowering makes for the type's model slots, each with where it comes from (generated
 * from the textures on a vanilla template, or the user's own model in `models`, which can be
 * set per slot under "Own models"). A container or machine (ADR 0076 D1) adds the slot "Front
 * when open" or "Front when working" on the facing types and the model slot `open` or `lit`;
 * on a simple block only those state models are shown, under "Models". A portal (ADR 0078 D1)
 * has the one slot "Portal surface" (empty: vanilla's Nether portal surface) and takes no own
 * models: its two pane models, one per axis, are always made.
 *
 * B452 (ADR 0094 D10, ADR 0101 D1): the new types' slots in words; a berry bush's or pod's
 * picture per age (`textures.stages`); and for a sign or hanging sign, choosing the writing
 * screen picture (`sign` or `hanging_gui`, else `all`) also copies that project picture to
 * `signGuiTextureId`, the asset the game's sign screen reads, in the same undo step as the field
 * (ADR 0094 D6 amended at B448; `signPictureCopy`, the host's `applyChanges`).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { useEffect, useState } from 'react';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { pngDataUrl } from '../../components/AssetList';
import { SlotPictureAi, SlotPictureDraw } from '../../components/ai-pictures/StudioAiPictures';
import { textureChange } from '../../components/ai-pictures/texture-write';
import { buttonClass } from '../../components/ui/Button';
import { InMore } from '../../components/ui/MoreOptions';
import type { FormProblem } from '../../forms';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  blockTypeOfData,
  isRequiredSlot,
  isSignType,
  modelSlotLabel,
  type SignPictureCopy,
  STAGE_TEXTURE_COUNTS,
  shownModelSlots,
  shownStateModelSlots,
  signPictureCopy,
  slotModelRows,
  textureAssetPath,
  textureSlotsOf,
} from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { ProblemsAt } from './parts';

const THUMBNAIL_SIZE = 32;

/** A thumbnail of a project texture from the host, or nothing (vanilla or unknown textures). */
export function TextureThumbnail(props: { texture: string; testId: string }) {
  const host = useBlocksItemsStudioHost();
  const [url, setUrl] = useState<string | null>(null);
  const load = host?.thumbnail;
  const revision = host?.revision ?? 0;
  const assetPath = textureAssetPath(props.texture);
  useEffect(() => {
    void revision;
    setUrl(null);
    if (load === undefined || assetPath === undefined) return;
    let live = true;
    load(assetPath, THUMBNAIL_SIZE).then(
      (bytes) => {
        if (live) setUrl(pngDataUrl(bytes));
      },
      () => {
        if (live) setUrl(null);
      },
    );
    return () => {
      live = false;
    };
  }, [load, assetPath, revision]);
  if (url === null) return <span className="size-8 shrink-0" aria-hidden />;
  return (
    <img
      alt=""
      src={url}
      data-testid={props.testId}
      className="size-8 shrink-0 border border-border [image-rendering:pixelated]"
    />
  );
}

const SOURCE_WORDS = {
  models: 'your own model',
  generated: 'made from the textures',
  model: 'the Model field',
  first: 'not set: uses the first model',
  none: 'not set',
} as const;

/**
 * The change items and byte writes of choosing a sign's writing screen picture: the element
 * update and the copy of `bytes` to the asset the game reads (an undoable write over an asset
 * the project has, else a new asset), for one `applyChanges` step.
 */
export function signPictureChange(
  project: Project | null,
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  copy: SignPictureCopy,
  bytes: Uint8Array,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const change = textureChange(project, copy.to.namespace, copy.to.path, bytes);
  return {
    items: [
      {
        itemId: 'sign-picture-field',
        op: 'update',
        elementId: element.id,
        kind: element.kind,
        before: element.data,
        after: copy.data,
        accepted: true,
        problems: [],
      },
      ...change.items,
    ],
    writes: change.writes,
  };
}

/** Props of {@link TexturesSection}. */
export interface TexturesSectionProps {
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set(path: readonly (string | number)[], value: Json | undefined, coalesce?: string): void;
  /** The project, for "Draw…" and "Make with AI" on each slot (ADRs 0092, 0093); without it none. */
  project?: Project;
}

export function TexturesSection(props: TexturesSectionProps) {
  const { element, problems, set, suggest } = props;
  const host = useBlocksItemsStudioHost();
  const [ownModels, setOwnModels] = useState(false);
  const type = blockTypeOfData(element.data);
  if (type === undefined) return null;
  const data = asObject(element.data);
  const textures = asObject(data.textures);
  const models = asObject(data.models);
  const rows = slotModelRows(element);
  const hasOwnModels = Object.keys(models).length > 0;
  const showOwn = ownModels || hasOwnModels;
  /** Sets one texture; removes `textures` when the last one is cleared. */
  const setTexture = (key: string, value: string) => {
    const copy = signPictureCopy(element, key, value);
    const read = host?.modelPreview?.readProjectAsset;
    const apply = host?.applyChanges;
    if (copy !== undefined && read !== undefined && apply !== undefined) {
      // The writing screen picture goes with the field in one undo step (ADR 0094 D6).
      void read(copy.from.namespace, copy.from.path)
        .then(async (bytes) => {
          if (bytes === null) {
            set(['textures', key], value);
            return;
          }
          const change = signPictureChange(props.project ?? null, element, copy, bytes);
          await apply(change.items, 'Sign picture', change.writes);
        })
        .catch(() => set(['textures', key], value));
      return;
    }
    if (value === '') {
      const rest = Object.keys(textures).filter((entry) => entry !== key);
      set(rest.length === 0 ? ['textures'] : ['textures', key], undefined);
      return;
    }
    set(['textures', key], value);
  };
  const setModel = (slot: string, value: string) => {
    if (value === '') {
      const rest = Object.keys(models).filter((entry) => entry !== slot);
      set(rest.length === 0 ? ['models'] : ['models', slot], undefined);
      return;
    }
    set(['models', slot], value);
  };
  if (type === 'block') {
    // A simple block's look is its Model field; a container or machine adds the model of its
    // `open` or `lit` state (ADR 0076 D1).
    const stateSlots = shownStateModelSlots(type, element.data);
    if (stateSlots.length === 0) return null;
    return (
      <Section title="Models" testId="block-state-models">
        {stateSlots.map((slot) => (
          <IdField
            key={slot}
            label={`${modelSlotLabel(slot)} (optional)`}
            value={typeof models[slot] === 'string' ? String(models[slot]) : ''}
            registry="model"
            suggest={suggest}
            testId={`block-own-model-${slot}`}
            onCommit={(text) => setModel(slot, text)}
          />
        ))}
        <p className="text-muted text-xs">Empty uses the Model field above.</p>
        {Object.keys(models).map((slot) => (
          <ProblemsAt key={slot} problems={problems} pointer={pointerOf(['models', slot])} />
        ))}
        <ProblemsAt problems={problems} pointer={pointerOf(['models'])} />
      </Section>
    );
  }
  const slots = textureSlotsOf(type, element.data);
  const portal = type === 'portal';
  const stageCount = STAGE_TEXTURE_COUNTS[type];
  return (
    <Section title="Textures" testId="block-textures">
      {stageCount !== undefined ? (
        <StageTextures
          count={stageCount}
          textures={Array.isArray(textures.stages) ? textures.stages : []}
          suggest={suggest}
          onChange={(next) =>
            set(['textures'], next.length === 0 ? undefined : { ...textures, stages: [...next] })
          }
        />
      ) : slots.length === 0 ? (
        <p className="text-muted text-xs" data-testid="block-textures-stages-note">
          A crop's stage textures are set in the Crop section above.
        </p>
      ) : (
        <>
          {portal ? (
            <p className="text-muted text-xs" data-testid="block-textures-rule">
              Empty shows vanilla's Nether portal surface, read from your game. The two pane models,
              one for each way the frame can stand, are made on the Nether portal's own templates.
            </p>
          ) : slots[0]?.label !== 'Every face' ? (
            <p className="text-muted text-xs" data-testid="block-textures-rule">
              The models of the {type.replaceAll('_', ' ')} are made from these pictures on
              vanilla's own templates, read from your game.
            </p>
          ) : (
            <p className="text-muted text-xs" data-testid="block-textures-rule">
              "Every face" fills each texture left empty.{' '}
              {type === 'slab' || type === 'stairs'
                ? 'Without it, an empty top or bottom takes the sides, and empty sides take the first texture given.'
                : 'Without it, an empty texture takes the first texture given.'}{' '}
              The models of the {type.replace('_', ' ')} are made from these on vanilla's own
              templates.
            </p>
          )}
          {isSignType(type) && (
            <p className="text-muted text-xs" data-testid="block-textures-sign-note">
              Choosing the writing screen picture (or the board, while the writing screen has none)
              also saves a copy where the game's sign screen looks for it; Undo takes both back.
            </p>
          )}
          <div className="flex flex-col gap-1">
            {slots.map((slot) => {
              const value = typeof textures[slot.key] === 'string' ? textures[slot.key] : '';
              return (
                <div key={slot.key} className="flex items-end gap-2">
                  <TextureThumbnail
                    texture={String(value)}
                    testId={`block-texture-${slot.key}-thumbnail`}
                  />
                  <IdField
                    label={slot.label}
                    value={String(value)}
                    registry="texture"
                    suggest={suggest}
                    testId={`block-texture-${slot.key}`}
                    onCommit={(text) => setTexture(slot.key, text)}
                  />
                  {props.project !== undefined && (
                    <>
                      <SlotPictureDraw
                        project={props.project}
                        element={element}
                        slot={slot.key}
                        label={slot.label}
                        value={String(value)}
                      />
                      <SlotPictureAi
                        project={props.project}
                        element={element}
                        slot={slot.key}
                        label={slot.label}
                        value={String(value)}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {Object.keys(textures).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['textures', key])} />
      ))}
      <ProblemsAt problems={problems} pointer={pointerOf(['textures'])} />
      <InMore>
        <div className="flex flex-col gap-1" data-testid="block-generated-models">
          <h4 className="font-medium text-xs">Models</h4>
          {rows.every((row) => row.model === undefined) ? (
            <p className="text-muted text-xs" data-testid="block-models-empty">
              No models yet: set a texture or your own models.
            </p>
          ) : (
            <ul aria-label="Models" className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
              {rows.map((row) => (
                <li key={row.slot} data-testid={`block-model-row-${row.slot}`}>
                  <span className="text-muted">{modelSlotLabel(row.slot, type)}:</span>{' '}
                  {row.model === undefined ? (
                    <span>{SOURCE_WORDS[row.source]}</span>
                  ) : (
                    <>
                      <span className="font-mono">{row.model}</span>{' '}
                      <span className="text-muted">
                        ({SOURCE_WORDS[row.source]}
                        {row.parent === undefined ? '' : ` on ${row.parent}`})
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </InMore>
      {!portal && (
        <InMore>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              data-testid="block-own-models-toggle"
              checked={showOwn}
              disabled={hasOwnModels}
              onChange={(event) => setOwnModels(event.target.checked)}
            />
            Own models (instead of the made ones)
          </label>
        </InMore>
      )}
      {portal && hasOwnModels && <ProblemsAt problems={problems} pointer={pointerOf(['models'])} />}
      {!portal && showOwn && (
        <InMore>
          <div className="flex flex-col gap-1" data-testid="block-own-models">
            {shownModelSlots(type, element.data).map((slot) => (
              <IdField
                key={slot}
                label={`${modelSlotLabel(slot, type)}${isRequiredSlot(type, slot) ? '' : ' (optional)'}`}
                value={typeof models[slot] === 'string' ? String(models[slot]) : ''}
                registry="model"
                suggest={suggest}
                testId={`block-own-model-${slot}`}
                onCommit={(text) => setModel(slot, text)}
              />
            ))}
            {Object.keys(models).map((slot) => (
              <ProblemsAt key={slot} problems={problems} pointer={pointerOf(['models', slot])} />
            ))}
            <ProblemsAt problems={problems} pointer={pointerOf(['models'])} />
          </div>
        </InMore>
      )}
    </Section>
  );
}

/** One picture per age of a berry bush or pod (`textures.stages`, ADR 0094 D10). */
function StageTextures(props: {
  count: number;
  textures: readonly Json[];
  suggest(registry: string, prefix: string): string[];
  onChange(next: readonly string[]): void;
}) {
  const textures = props.textures.map((entry) => (typeof entry === 'string' ? entry : ''));
  return (
    <div className="flex flex-col gap-1" data-testid="block-stage-textures">
      {textures.map((texture, index) => (
        <div key={index} className="flex items-end gap-1">
          <TextureThumbnail texture={texture} testId={`block-stage-texture-${index}-thumbnail`} />
          <IdField
            label={`Stage ${index}`}
            value={texture}
            registry="texture"
            suggest={props.suggest}
            className="flex-1"
            testId={`block-stage-texture-${index}`}
            onCommit={(value) =>
              props.onChange(textures.map((entry, i) => (i === index ? value : entry)))
            }
          />
          <button
            type="button"
            className={buttonClass}
            aria-label={`Remove stage ${index} picture`}
            data-testid={`block-stage-texture-${index}-remove`}
            onClick={() => props.onChange(textures.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className={buttonClass}
          data-testid="block-stage-texture-add"
          disabled={textures.length >= props.count}
          onClick={() => props.onChange([...textures, textures.at(-1) ?? ''])}
        >
          Add stage picture
        </button>
      </div>
      <p className="text-muted text-xs">
        One picture per stage from the youngest, {props.count} stages in all; fewer pictures are
        repeated over the stages.
      </p>
    </div>
  );
}
