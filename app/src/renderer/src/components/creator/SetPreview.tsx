/**
 * The Creator's row of blocks (B272, ADR 0069 D5): every block a flow makes, side by side in
 * one 3D view (a door stands as both halves), so a wood or stone set is seen as a whole. The
 * row is a structure drawn from memory over the project ({@link setRow}); nothing is applied.
 * deepslate loads lazily, only with WebGL.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import { lazy, Suspense, useMemo } from 'react';
import { bundleAssetReader, bundlePreviewProject, displayName } from '../../preview/bundle-source';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { setRow } from './set-preview';

const PreviewCanvas = lazy(() => import('../../preview/PreviewCanvas'));

/** Props of {@link SetPreview}. */
export interface SetPreviewProps {
  bundle: ContentBundle;
  revision: number;
  project: Project;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  vanilla: VanillaAssetReader | null;
  webgl: boolean;
}

export function SetPreview(props: SetPreviewProps) {
  const { bundle } = props;
  const row = useMemo(() => setRow(bundle), [bundle]);
  const previewProject = useMemo(
    () => (row === null ? null : bundlePreviewProject(props.project, row.bundle)),
    [props.project, row],
  );
  const reader = useMemo(
    () => bundleAssetReader(bundle, props.readProjectAsset),
    [bundle, props.readProjectAsset],
  );
  if (row === null || previewProject === null) return null;
  return (
    <figure className="m-0 flex flex-col gap-1" data-testid="creator-set-preview">
      <figcaption className="text-xs text-muted">
        The whole set, left to right:{' '}
        <span data-testid="creator-set-order">
          {row.pieces.map((piece) => displayName(bundle, piece.id, 'block') ?? piece.id).join(', ')}
        </span>
        .
      </figcaption>
      {!props.webgl ? (
        <p role="status" className="text-xs text-muted">
          3D preview unavailable: WebGL is disabled.
        </p>
      ) : (
        <div className="w-full max-w-xl" data-testid="creator-set-canvas">
          <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
            <PreviewCanvas
              key={`set-${props.revision}`}
              project={previewProject}
              folders={props.folders}
              subject={{ previewKind: 'structure', id: 'msm:creator/set', data: row.structure }}
              readProjectAsset={reader}
              vanilla={props.vanilla}
            />
          </Suspense>
        </div>
      )}
    </figure>
  );
}
