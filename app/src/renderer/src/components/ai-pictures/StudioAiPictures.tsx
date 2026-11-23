/**
 * "Draw…" (ADR 0092 D10 (b)) and "Make with AI" (ADR 0093 D6) in the blocks and items Studios:
 * a picture row per project texture of a model (the Block and Item Studios), and the buttons
 * of one texture slot (the Block Studio's Textures section). The picked picture is written
 * through the Studio host's `applyChanges` as one undo step: over the texture's bytes, or as a
 * new texture that the slot then names. Draw needs no AI host, so the rows and Draw are shown
 * whenever the host can write; "Make with AI" only with an AI host. **Start from a Minecraft
 * texture** (ADR 0129 D4) sits beside Draw… and writes the picked picture the same way.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { useEffect, useState } from 'react';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { useBlocksItemsStudioHost } from '../../studios/blocks-items/host';
import { plainWordsIn } from '../../studios/plain-things';
import { DrawButton } from '../art/DrawButton';
import { metaChange, pictureChange } from '../mc-textures/picture-change';
import { StartFromMinecraftButton } from '../mc-textures/StartFromMinecraftButton';
import { InMore, usePlain } from '../ui/MoreOptions';
import { useAiPictures } from './ai-pictures-host';
import { MakeWithAiButton } from './MakeWithAiButton';
import { defaultPrompt, styleForName } from './prompt';
import { textureAsset, textureChange } from './texture-write';

/** The project textures a model uses, from the host (empty while unknown). */
function useModelTextures(model: string): readonly string[] {
  const host = useBlocksItemsStudioHost();
  const read = host?.textureLayers;
  const revision = host?.revision ?? 0;
  const [textures, setTextures] = useState<readonly string[]>([]);
  useEffect(() => {
    void revision;
    if (read === undefined || model === '') {
      setTextures([]);
      return;
    }
    let live = true;
    read(model).then(
      (layers) => {
        if (live) setTextures(layers.map((entry) => entry.texture));
      },
      () => {
        if (live) setTextures([]);
      },
    );
    return () => {
      live = false;
    };
  }, [read, model, revision]);
  return textures;
}

/** Whether a model id names a vanilla model (`minecraft:` or no namespace). */
export function isVanillaModel(model: string): boolean {
  const trimmed = model.trim();
  return trimmed !== '' && (trimmed.startsWith('minecraft:') || !trimmed.includes(':'));
}

/** Props of {@link ModelPicturesAi}. */
export interface ModelPicturesAiProps {
  project: Project;
  /** The model whose project textures get a button. */
  model: string;
  /** The thing's name, for the description. */
  name: string;
  /** `block` for blocks; items pick `item` or `tool` from the name. */
  kind: 'block' | 'item';
  testId: string;
}

/** A row per project texture of `model`, each with "Draw…" and (with an AI host) "Make with AI". */
export function ModelPicturesAi(props: ModelPicturesAiProps) {
  const ai = useAiPictures();
  const host = useBlocksItemsStudioHost();
  const plain = usePlain();
  const textures = useModelTextures(props.model);
  if (host?.applyChanges === undefined) return null;
  if (textures.length === 0) {
    // Vanilla models have no project pictures, so there is nothing to make: say why (no button).
    return isVanillaModel(props.model) ? (
      <p className="text-muted text-xs" data-testid={`${props.testId}-vanilla-note`}>
        This {props.kind} uses Minecraft's own model, so it has no pictures of its own. Give it its
        own model to paint or make pictures.
      </p>
    ) : null;
  }
  const apply = host.applyChanges;
  return (
    <div className="flex flex-col gap-1" data-testid={props.testId}>
      <span className="text-xs text-muted">Pictures</span>
      {plain && (
        <InMore fallbackKey={`${props.testId}-ids`}>
          <p className="font-mono text-muted text-xs" data-testid={`${props.testId}-ids`}>
            {`Pictures: ${textures.join(', ')}`}
          </p>
        </InMore>
      )}
      {textures.map((texture) => {
        const asset = textureAsset(texture);
        if (asset === null) return null;
        const style: AiPictureStyle = styleForName(props.name, props.kind);
        const rowId = `${props.testId}-${texture.replace(/[^a-z0-9]+/gi, '-')}`;
        const write = async (bytes: Uint8Array, label: string) => {
          const change = textureChange(props.project, asset.namespace, asset.path, bytes);
          await apply(change.items, `${label} ${asset.path}`, change.writes);
        };
        return (
          <div key={texture} className="flex items-center gap-2 text-xs">
            {/* The picture's name; its id under the section's More options (ADR 0130). */}
            {plain ? (
              <span>{plainWordsIn(texture)}</span>
            ) : (
              <span className="font-mono">{texture}</span>
            )}
            <DrawButton
              testId={`${rowId}-draw`}
              target={`${asset.namespace}:${asset.path}`}
              field={{
                kinds: props.kind === 'block' ? ['block', 'item'] : ['item', 'block'],
                width: 16,
                height: 16,
                name: texture,
              }}
              onPick={async (picture) => {
                const bytes = picture.pngs[0];
                if (bytes !== undefined) await write(bytes, 'Draw');
              }}
            />
            <StartFromMinecraftButton
              testId={`${rowId}-minecraft`}
              target={asset.path.slice(asset.path.lastIndexOf('/') + 1, -'.png'.length)}
              folder={props.kind === 'block' ? 'block' : 'item'}
              onPick={async (pick) => {
                const change = pictureChange(
                  props.project,
                  asset.namespace,
                  asset.path,
                  pick.bytes,
                  pick.mcmeta,
                );
                await apply(
                  change.items,
                  `Start from ${pick.texture.name}: ${asset.path}`,
                  change.writes,
                );
              }}
            />
            {ai !== null && (
              <MakeWithAiButton
                testId={rowId}
                target={`${asset.namespace}:${asset.path}`}
                defaultPrompt={defaultPrompt(props.name, style)}
                defaultStyle={style}
                size={16}
                onPick={(bytes) => write(bytes, 'Make with AI')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Props of {@link SlotPictureAi}. */
export interface SlotPictureAiProps {
  project: Project;
  element: Element;
  /** The slot's key in `textures`. */
  slot: string;
  /** The slot's words ("Top"). */
  label: string;
  /** The texture id the slot names now (`''`: none). */
  value: string;
}

/**
 * The change of a picture picked for one texture slot (ADR 0045): the bytes over the texture
 * the slot names, or a new texture `<ns>:block/<name>_<slot>` and the slot naming it, as the
 * items and writes of one `applyChanges` step.
 */
export function slotPictureChange(
  project: Project,
  element: Element,
  slot: string,
  value: string,
  bytes: Uint8Array,
): { items: ChangeItem[]; writes: ChangeAsset[] } {
  const { asset, current, textureId } = slotTexture(element, slot, value);
  const change = textureChange(project, asset.namespace, asset.path, bytes);
  const items = [...change.items];
  if (current === null) {
    const data = asObject(element.data);
    const after: Json = {
      ...data,
      textures: { ...asObject(data.textures), [slot]: textureId },
    };
    items.push({
      itemId: `ai-picture-slot:${slot}`,
      op: 'update',
      elementId: element.id,
      kind: element.kind,
      before: element.data,
      after,
      accepted: true,
      problems: [],
    });
  }
  return { items, writes: change.writes };
}

/** The texture a slot names, or the new one a picture for it is saved as. */
function slotTexture(element: Element, slot: string, value: string) {
  const [namespace, name] = splitElementId(element.id);
  const current = value === '' ? null : textureAsset(value);
  const textureId = current === null ? `${namespace}:block/${name}_${slot}` : value;
  const asset = current ?? { namespace, path: `textures/block/${name}_${slot}.png` };
  return { asset, current, textureId, name };
}

/** "Make with AI" for one texture slot of a typed block. */
export function SlotPictureAi(props: SlotPictureAiProps) {
  const ai = useAiPictures();
  const host = useBlocksItemsStudioHost();
  if (ai === null || host?.applyChanges === undefined) return null;
  const apply = host.applyChanges;
  const { asset, name } = slotTexture(props.element, props.slot, props.value);
  const displayName = displayNameOf(props.element.data) ?? name;
  return (
    <MakeWithAiButton
      testId={`block-texture-${props.slot}-ai`}
      target={`${asset.namespace}:${asset.path}`}
      defaultPrompt={defaultPrompt(displayName, 'block')}
      defaultStyle="block"
      size={16}
      onPick={async (bytes) => {
        const change = slotPictureChange(
          props.project,
          props.element,
          props.slot,
          props.value,
          bytes,
        );
        await apply(change.items, `Make with AI ${props.label}`, change.writes);
      }}
    />
  );
}

/** "Draw…" for one texture slot of a typed block (ADR 0092 D10 (b)); no AI host needed. */
export function SlotPictureDraw(props: SlotPictureAiProps) {
  const host = useBlocksItemsStudioHost();
  if (host?.applyChanges === undefined) return null;
  const apply = host.applyChanges;
  const { asset, textureId } = slotTexture(props.element, props.slot, props.value);
  return (
    <>
      <DrawButton
        testId={`block-texture-${props.slot}-draw`}
        target={`${asset.namespace}:${asset.path}`}
        field={{ kinds: ['block'], width: 16, height: 16, name: textureId }}
        onPick={async (picture) => {
          const bytes = picture.pngs[0];
          if (bytes === undefined) return;
          const change = slotPictureChange(
            props.project,
            props.element,
            props.slot,
            props.value,
            bytes,
          );
          await apply(change.items, `Draw ${props.label}`, change.writes);
        }}
      />
      <StartFromMinecraftButton
        testId={`block-texture-${props.slot}-minecraft`}
        target={props.label}
        folder="block"
        onPick={async (pick) => {
          const change = slotPictureChange(
            props.project,
            props.element,
            props.slot,
            props.value,
            pick.bytes,
          );
          const meta = metaChange(
            props.project,
            asset.namespace,
            asset.path,
            pick.bytes,
            pick.mcmeta,
          );
          await apply(
            [...change.items, ...meta.items],
            `Start ${props.label} from ${pick.texture.name}`,
            [...change.writes, ...meta.writes],
          );
        }}
      />
    </>
  );
}

type JsonObject = { [key: string]: Json };

function asObject(value: Json | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function splitElementId(id: string): [string, string] {
  const colon = id.indexOf(':');
  const path = colon < 0 ? id : id.slice(colon + 1);
  return [colon < 0 ? 'minecraft' : id.slice(0, colon), path.split('/').pop() ?? path];
}

function displayNameOf(data: Json): string | undefined {
  const name = asObject(data).display_name;
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}
