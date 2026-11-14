/**
 * "Make with AI" in the blocks and items Studios (ADR 0093 D6): a picture row per project
 * texture of a model (the Block and Item Studios), and the button of one texture slot (the Block
 * Studio's Textures section). The picked picture is written through the Studio host's
 * `applyChanges` as one undo step: over the texture's bytes, or as a new texture that the slot
 * then names.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { useEffect, useState } from 'react';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import { useBlocksItemsStudioHost } from '../../studios/blocks-items/host';
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

/** A row per project texture of `model`, each with "Make with AI". */
export function ModelPicturesAi(props: ModelPicturesAiProps) {
  const ai = useAiPictures();
  const host = useBlocksItemsStudioHost();
  const textures = useModelTextures(props.model);
  if (ai === null || host?.applyChanges === undefined) return null;
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
      {textures.map((texture) => {
        const asset = textureAsset(texture);
        if (asset === null) return null;
        const style: AiPictureStyle = styleForName(props.name, props.kind);
        return (
          <div key={texture} className="flex items-center gap-2 text-xs">
            <span className="font-mono">{texture}</span>
            <MakeWithAiButton
              testId={`${props.testId}-${texture.replace(/[^a-z0-9]+/gi, '-')}`}
              target={`${asset.namespace}:${asset.path}`}
              defaultPrompt={defaultPrompt(props.name, style)}
              defaultStyle={style}
              size={16}
              onPick={async (bytes) => {
                const change = textureChange(props.project, asset.namespace, asset.path, bytes);
                await apply(change.items, `Make with AI ${asset.path}`, change.writes);
              }}
            />
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

/** "Make with AI" for one texture slot of a typed block. */
export function SlotPictureAi(props: SlotPictureAiProps) {
  const ai = useAiPictures();
  const host = useBlocksItemsStudioHost();
  if (ai === null || host?.applyChanges === undefined) return null;
  const apply = host.applyChanges;
  const [namespace, name] = splitElementId(props.element.id);
  const current = props.value === '' ? null : textureAsset(props.value);
  const textureId = current === null ? `${namespace}:block/${name}_${props.slot}` : props.value;
  const asset = current ?? { namespace, path: `textures/block/${name}_${props.slot}.png` };
  const displayName = displayNameOf(props.element.data) ?? name;
  return (
    <MakeWithAiButton
      testId={`block-texture-${props.slot}-ai`}
      target={`${asset.namespace}:${asset.path}`}
      defaultPrompt={defaultPrompt(displayName, 'block')}
      defaultStyle="block"
      size={16}
      onPick={async (bytes) => {
        const change = textureChange(props.project, asset.namespace, asset.path, bytes);
        const items = [...change.items];
        if (current === null) {
          const data = asObject(props.element.data);
          const after: Json = {
            ...data,
            textures: { ...asObject(data.textures), [props.slot]: textureId },
          };
          items.push({
            itemId: `ai-picture-slot:${props.slot}`,
            op: 'update',
            elementId: props.element.id,
            kind: props.element.kind,
            before: props.element.data,
            after,
            accepted: true,
            problems: [],
          });
        }
        await apply(items, `Make with AI ${props.label}`, change.writes);
      }}
    />
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
