/**
 * A block or an item (`msm:block`, `msm:item`) as the Creator's Items and Blocks tabs draw it
 * (B615): its picture (the first texture its model names, from the project's or the bundle's
 * files, or the user's game for Minecraft's own) and, with WebGL, the 3D model in the deepslate
 * preview.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { lazy, Suspense, useEffect, useState } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { pngDataUrl } from '../../preview/bundle-source';
import { normaliseId, type ResourceFolders } from '../../preview/model-chain';
import { hasWebGL } from '../../preview/webgl';
import { resourceFoldersOf } from '../frame/item-picture';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { assetReader } from './bundle-host';

const PreviewCanvas = lazy(() => import('../../preview/PreviewCanvas'));

const MODEL_KIND = 'minecraft:model';

const isRecord = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function findModel(project: Project, id: string): Element | undefined {
  const wanted = normaliseId(id);
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === MODEL_KIND && normaliseId(element.id) === wanted) return element;
    }
  }
  return undefined;
}

/** The first texture the piece's model names (following its parents in the project). */
export function pieceTexture(project: Project, data: Json): string | undefined {
  const own = isRecord(data) && typeof data.model === 'string' ? data.model : undefined;
  const seen = new Set<string>();
  let id = own;
  while (id !== undefined && !seen.has(normaliseId(id))) {
    seen.add(normaliseId(id));
    const model = findModel(project, id);
    if (model === undefined || !isRecord(model.data)) return undefined;
    const textures = model.data.textures;
    if (isRecord(textures)) {
      for (const key of [
        'layer0',
        'all',
        'side',
        'top',
        'texture',
        'particle',
        ...Object.keys(textures),
      ]) {
        const value = textures[key];
        if (typeof value === 'string' && !value.startsWith('#')) return normaliseId(value);
      }
    }
    id = typeof model.data.parent === 'string' ? model.data.parent : undefined;
  }
  return undefined;
}

/** `assets/<ns>/<textures>/<path>.png` of a texture id. */
export function textureFile(texture: string, folders: ResourceFolders): string {
  const id = normaliseId(texture);
  const colon = id.indexOf(':');
  return `assets/${id.slice(0, colon)}/${folders.textures}/${id.slice(colon + 1)}.png`;
}

/** The view; see the module comment. */
export default function PieceView(props: LiveViewProps) {
  const { project, element, readProject, vanillaAssets } = props;
  const folders = resourceFoldersOf(project);
  const texture = pieceTexture(project, element.data);
  const file =
    texture === undefined || folders === null ? undefined : textureFile(texture, folders);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (file === undefined) return;
    let live = true;
    const read = file.startsWith('assets/minecraft/')
      ? vanillaAssets?.readAsset(file)
      : readProject?.(file);
    void (read ?? Promise.resolve(null)).then(
      (bytes) => {
        if (live && bytes !== null) setUrl(pngDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [file, readProject, vanillaAssets]);
  const isBlock = element.kind === 'msm:block';
  const name = thingName(project, element.id);
  const modelId =
    isRecord(element.data) && typeof element.data.model === 'string'
      ? element.data.model
      : undefined;
  const model = modelId === undefined ? undefined : findModel(project, modelId);
  const webgl = hasWebGL();
  return (
    <LiveViewFrame
      title={isBlock ? 'Block' : 'Item'}
      fidelity="about_right"
      notes={['Drawn by MSM from the model and its pictures; the game’s light differs.']}
    >
      <div className="flex items-center gap-3">
        {url === null ? (
          <span aria-hidden className="size-12 rounded border border-border" />
        ) : (
          <img
            alt={name}
            src={url}
            data-testid="live-piece-picture"
            className="size-12 [image-rendering:pixelated]"
          />
        )}
        <p className="text-sm" data-testid="live-piece-words">
          {`${name}: ${isBlock ? 'a block' : 'an item'}${texture === undefined ? '' : `, drawn with ${texture}`}.`}
        </p>
      </div>
      {model !== undefined && webgl && folders !== null && (
        <div className="w-56 max-w-full" data-testid="live-piece-canvas">
          <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
            <PreviewCanvas
              project={project}
              folders={folders}
              subject={{ previewKind: 'model', id: model.id, data: model.data }}
              readProjectAsset={assetReader(readProject)}
              vanilla={vanillaAssets}
            />
          </Suspense>
        </div>
      )}
    </LiveViewFrame>
  );
}
