/**
 * The one bundle-backed blocks and items Studio host (B615; spike answer 2S14): today's Studio
 * previews (the vehicle, particle, liquid and effect pictures) read their pictures through
 * `BlocksItemsStudioHost`, so the views of this folder give them a host whose readers read the
 * view's own project files (a bundle's first, `LiveViewProps.readProject`) and the user's jar
 * cache. It has no actions: painting, adding elements and writing files are absent, so a preview
 * here changes nothing.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import { type ReactNode, useMemo } from 'react';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { hasWebGL } from '../../preview/webgl';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../studios/blocks-items/host';
import { resourceFoldersOf } from '../frame/item-picture';

/** What the host reads. */
export interface BundleHostInput {
  /** A project file by its path (`assets/<ns>/...`), or `null`. */
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly folders: ResourceFolders | null;
  /** Whether the 3D previews may draw (`modelPreview` is left out otherwise). */
  readonly models: boolean;
}

/** A host over {@link BundleHostInput}; see the module comment. */
export function bundleStudioHost(input: BundleHostInput): BlocksItemsStudioHost {
  const read = input.readProject;
  const readProjectAsset = async (namespace: string, path: string) =>
    read === undefined ? null : await read(`assets/${namespace}/${path}`).catch(() => null);
  return {
    async thumbnail(assetPath) {
      const bytes = read === undefined ? null : await read(assetPath);
      if (bytes === null) throw new Error(`${assetPath} is not in the project.`);
      return bytes;
    },
    revision: 0,
    paintTexture() {},
    ...(input.models && input.folders !== null
      ? {
          modelPreview: {
            folders: input.folders,
            readProjectAsset,
            vanilla: input.vanillaAssets,
          },
        }
      : {}),
  };
}

/** Provides {@link bundleStudioHost} to today's Studio previews inside a view. */
export function BundleHost(props: {
  project: Project;
  readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  vanillaAssets: VanillaAssetReader | null;
  /** Default: whether WebGL is there. */
  models?: boolean;
  children: ReactNode;
}) {
  const folders = resourceFoldersOf(props.project);
  const models = props.models ?? hasWebGL();
  const { readProject, vanillaAssets } = props;
  const host = useMemo(
    () => bundleStudioHost({ readProject, vanillaAssets, folders, models }),
    [readProject, vanillaAssets, folders, models],
  );
  return (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {props.children}
    </BlocksItemsStudioHostContext.Provider>
  );
}

/** `assets/<ns>/<path>` read through a view's `readProject`, as `(namespace, path)`. */
export function assetReader(
  readProject: ((path: string) => Promise<Uint8Array | null>) | undefined,
): (namespace: string, path: string) => Promise<Uint8Array | null> {
  return async (namespace, path) =>
    readProject === undefined
      ? null
      : await readProject(`assets/${namespace}/${path}`).catch(() => null);
}
