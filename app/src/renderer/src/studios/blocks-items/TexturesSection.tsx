/**
 * The Block Studio's Textures section for the block types (B268, ADR 0067 D7, ADR 0069 D5):
 * the type's texture slots in words (`textures`), a thumbnail of each project texture, and the
 * models lowering makes for the type's model slots, each with where it comes from (generated
 * from the textures on a vanilla template, or the user's own model in `models`, which can be
 * set per slot under "Own models").
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../components/AssetList';
import type { FormProblem } from '../../forms';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  blockTypeOfData,
  isRequiredSlot,
  modelSlotLabel,
  modelSlots,
  slotModelRows,
  TEXTURE_SLOTS,
  textureAssetPath,
} from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { ProblemsAt } from './parts';

const THUMBNAIL_SIZE = 32;

/** A thumbnail of a project texture from the host, or nothing (vanilla or unknown textures). */
function TextureThumbnail(props: { texture: string; testId: string }) {
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

/** Props of {@link TexturesSection}. */
export interface TexturesSectionProps {
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set(path: readonly (string | number)[], value: Json | undefined, coalesce?: string): void;
}

export function TexturesSection(props: TexturesSectionProps) {
  const { element, problems, set, suggest } = props;
  const [ownModels, setOwnModels] = useState(false);
  const type = blockTypeOfData(element.data);
  if (type === undefined || type === 'block') return null;
  const data = asObject(element.data);
  const textures = asObject(data.textures);
  const models = asObject(data.models);
  const rows = slotModelRows(element);
  const hasOwnModels = Object.keys(models).length > 0;
  const showOwn = ownModels || hasOwnModels;
  /** Sets one texture; removes `textures` when the last one is cleared. */
  const setTexture = (key: string, value: string) => {
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
  const slots = TEXTURE_SLOTS[type];
  return (
    <Section title="Textures" testId="block-textures">
      {slots.length === 0 ? (
        <p className="text-muted text-xs" data-testid="block-textures-stages-note">
          A crop's stage textures are set in the Crop section above.
        </p>
      ) : (
        <>
          <p className="text-muted text-xs" data-testid="block-textures-rule">
            "Every face" fills each texture left empty.{' '}
            {type === 'slab' || type === 'stairs'
              ? 'Without it, an empty top or bottom takes the sides, and empty sides take the first texture given.'
              : 'Without it, an empty texture takes the first texture given.'}{' '}
            The models of the {type.replace('_', ' ')} are made from these on vanilla's own
            templates.
          </p>
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
                <span className="text-muted">{modelSlotLabel(row.slot)}:</span>{' '}
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
      {showOwn && (
        <div className="flex flex-col gap-1" data-testid="block-own-models">
          {modelSlots(type).map((slot) => (
            <IdField
              key={slot}
              label={`${modelSlotLabel(slot)}${isRequiredSlot(type, slot) ? '' : ' (optional)'}`}
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
      )}
    </Section>
  );
}
