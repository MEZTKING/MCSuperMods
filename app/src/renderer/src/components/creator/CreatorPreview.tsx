/**
 * The Creator's live preview (ADR 0043 D3): six tabs over the bundle the flow builds now, read
 * from memory (nothing is applied). Items and Blocks list every piece with its generated
 * texture as a `data:` image and draw the chosen one with the deepslate preview; Recipes draws
 * crafting grids; Armour shows the two layer textures and the humanoid armour geometry in the
 * geo renderer; Stats puts the numbers in words; Elements lists what Create will do.
 *
 * deepslate, gl-matrix and the geo renderer load lazily, only when a canvas is shown on a
 * machine with WebGL (as in the Preview panel).
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import { Tabs } from 'radix-ui';
import { lazy, type ReactNode, Suspense, useMemo, useState } from 'react';
import type { CreatorPlan } from '../../changeset/creator-sets';
import {
  bundleAssetBytes,
  bundleAssetReader,
  bundlePreviewProject,
  displayName,
  elementModel,
  elementTextureBytes,
  pngDataUrl,
} from '../../preview/bundle-source';
import {
  ARMOUR_GEOMETRY_ID,
  type ArmourPiece,
  armourGeometry,
  composeArmourTexture,
} from '../../preview/geo/armour';
import type { GeoScene } from '../../preview/geo/subject';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { hasWebGL } from '../../preview/webgl';
import { RecipeGridView } from '../recipe-grid/RecipeGridView';
import { tabTriggerClass } from '../ui/Button';
import { CreatorElements } from './CreatorElements';
import {
  bundleArmour,
  bundleBlocks,
  bundleItems,
  bundleRecipes,
  bundleStats,
  CREATOR_TABS,
  type CreatorTab,
  equipmentTexturePath,
} from './creator-model';

const PreviewCanvas = lazy(() => import('../../preview/PreviewCanvas'));
const GeoCanvas = lazy(() => import('../../preview/geo/GeoCanvas'));

/** Props of {@link CreatorPreview}. */
export interface CreatorPreviewProps {
  bundle: ContentBundle;
  /** Increases on every rebuild, so canvases reload their textures. */
  revision: number;
  plan: CreatorPlan | null;
  project: Project;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  vanilla: VanillaAssetReader | null;
  /** Keys of kept entries the user chose to overwrite. */
  overwrite: ReadonlySet<string>;
  onOverwriteChange(key: string, overwrite: boolean): void;
  tab: CreatorTab;
  onTabChange(tab: CreatorTab): void;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** A grid of pieces (items or blocks) with their textures; the chosen one is drawn in 3D. */
function PieceGallery(props: {
  type: 'item' | 'block';
  bundle: ContentBundle;
  revision: number;
  project: Project;
  folders: ResourceFolders;
  readProjectAsset: CreatorPreviewProps['readProjectAsset'];
  vanilla: VanillaAssetReader | null;
  webgl: boolean;
}) {
  const { bundle, folders, type } = props;
  const pieces = type === 'item' ? bundleItems(bundle) : bundleBlocks(bundle);
  const [chosen, setChosen] = useState<string | null>(null);
  const current = pieces.find((piece) => piece.id === chosen) ?? pieces[0];
  const previewProject = useMemo(
    () => bundlePreviewProject(props.project, bundle),
    [props.project, bundle],
  );
  const reader = useMemo(
    () => bundleAssetReader(bundle, props.readProjectAsset),
    [bundle, props.readProjectAsset],
  );
  const modelId = current === undefined ? undefined : elementModel(current.data);
  const model = bundle.elements.find(
    (entry) => entry.kind === 'minecraft:model' && entry.id === modelId,
  );
  if (pieces.length === 0) {
    return (
      <Empty>{type === 'item' ? 'This flow makes no items.' : 'This flow makes no blocks.'}</Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul
        className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5 p-0"
        aria-label={type === 'item' ? 'Items' : 'Blocks'}
      >
        {pieces.map((piece) => {
          const bytes = elementTextureBytes(bundle, piece.data, folders);
          const name = displayName(bundle, piece.id, type) ?? piece.id;
          const selected = piece.id === current?.id;
          return (
            <li key={piece.id}>
              <button
                type="button"
                data-testid={`creator-${type}-${piece.id}`}
                aria-pressed={selected}
                onClick={() => setChosen(piece.id)}
                className={
                  'flex w-full cursor-pointer flex-col items-center gap-1 rounded border p-1.5 text-xs ' +
                  (selected ? 'border-accent bg-bg' : 'border-border')
                }
              >
                {bytes === undefined ? (
                  <span className="size-10" aria-hidden />
                ) : (
                  <img
                    alt=""
                    src={pngDataUrl(bytes)}
                    className="size-10 [image-rendering:pixelated]"
                  />
                )}
                <span className="text-center [overflow-wrap:anywhere]">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {model === undefined || current === undefined ? null : !props.webgl ? (
        <p role="status" className="text-xs text-muted">
          3D preview unavailable: WebGL is disabled.
        </p>
      ) : (
        <div className="w-56 max-w-full" data-testid={`creator-${type}-canvas`}>
          <Suspense fallback={<Empty>Loading preview…</Empty>}>
            <PreviewCanvas
              key={`${model.id}-${props.revision}`}
              project={previewProject}
              folders={folders}
              subject={{ previewKind: 'model', id: model.id, data: model.data }}
              readProjectAsset={reader}
              vanilla={props.vanilla}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function ArmourTab(props: {
  bundle: ContentBundle;
  revision: number;
  folders: ResourceFolders;
  webgl: boolean;
}) {
  const { bundle, folders } = props;
  const info = bundleArmour(bundle);
  const textures = folders.textures;
  const layer = (id: string | null, name: 'humanoid' | 'humanoid_leggings') => {
    if (id === null) return null;
    const { namespace, path } = equipmentTexturePath(id, name, textures);
    return bundleAssetBytes(bundle, namespace, path) ?? null;
  };
  const layer1 = info === null ? null : layer(info.layer1, 'humanoid');
  const layer2 = info === null ? null : layer(info.layer2, 'humanoid_leggings');
  const pieces = info?.pieces.join(',') ?? '';
  const scene = useMemo<Extract<GeoScene, { ok: true }>>(
    () => ({
      ok: true,
      modelId: ARMOUR_GEOMETRY_ID,
      model: armourGeometry(pieces === '' ? [] : (pieces.split(',') as ArmourPiece[])),
      textureId: `msm:creator/armour_${props.revision}`,
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [],
    }),
    [pieces, props.revision],
  );
  if (info === null) return <Empty>This flow makes no armour.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Worn pieces: {info.pieces.join(', ')}. Drawn by {info.equipmentId}.
      </p>
      <div className="flex flex-wrap gap-3">
        {[
          { bytes: layer1, label: 'Layer 1 (helmet, chestplate and boots)', id: 'layer-1' },
          { bytes: layer2, label: 'Layer 2 (leggings)', id: 'layer-2' },
        ].map((entry) =>
          entry.bytes === null ? null : (
            <figure key={entry.id} className="m-0 flex flex-col gap-1 text-xs text-muted">
              <img
                alt={entry.label}
                data-testid={`creator-armour-${entry.id}`}
                src={pngDataUrl(entry.bytes)}
                className="h-16 w-32 border border-border [image-rendering:pixelated]"
              />
              <figcaption>{entry.label}</figcaption>
            </figure>
          ),
        )}
      </div>
      {!props.webgl ? (
        <p role="status" className="text-xs text-muted">
          3D preview unavailable: WebGL is disabled.
        </p>
      ) : (
        <div className="w-72 max-w-full" data-testid="creator-armour-canvas">
          <Suspense fallback={<Empty>Loading preview…</Empty>}>
            <GeoCanvas
              scene={scene}
              subjectId="Armour"
              folders={folders}
              readProjectAsset={() => composeArmourTexture(layer1, layer2)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/** The six preview tabs. */
export function CreatorPreview(props: CreatorPreviewProps) {
  const { bundle } = props;
  const webgl = props.webgl ?? hasWebGL();
  const icon = (id: string): string | undefined => {
    const piece = bundle.elements.find(
      (entry) => entry.id === id && (entry.kind === 'msm:item' || entry.kind === 'msm:block'),
    );
    if (piece === undefined) return undefined;
    const bytes = elementTextureBytes(bundle, piece.data, props.folders);
    return bytes === undefined ? undefined : pngDataUrl(bytes);
  };
  const name = (id: string): string | undefined =>
    displayName(bundle, id, 'item') ?? displayName(bundle, id, 'block');
  const recipes = bundleRecipes(bundle);
  const stats = bundleStats(bundle);
  return (
    <Tabs.Root
      value={props.tab}
      onValueChange={(value) => props.onTabChange(value as CreatorTab)}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <Tabs.List aria-label="Preview" className="flex flex-wrap border-b border-border">
        {CREATOR_TABS.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className={tabTriggerClass}
            data-testid={`creator-tab-${tab.id}`}
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <Tabs.Content value="items">
          <PieceGallery type="item" {...props} webgl={webgl} />
        </Tabs.Content>
        <Tabs.Content value="blocks">
          <PieceGallery type="block" {...props} webgl={webgl} />
        </Tabs.Content>
        <Tabs.Content value="recipes">
          {recipes.length === 0 ? (
            <Empty>This flow makes no recipes.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="creator-recipes">
              {recipes.map((recipe) => (
                <RecipeGridView
                  key={recipe.id}
                  label={recipe.id}
                  recipe={recipe.data}
                  icon={icon}
                  name={name}
                />
              ))}
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="armour">
          <ArmourTab
            bundle={bundle}
            revision={props.revision}
            folders={props.folders}
            webgl={webgl}
          />
        </Tabs.Content>
        <Tabs.Content value="stats">
          {stats.length === 0 ? (
            <Empty>No numbers to show for this flow.</Empty>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="creator-stats">
              {stats.map((card) => (
                <li key={card.id} data-testid={`creator-stats-${card.id}`}>
                  <p className="font-medium text-sm">
                    {name(card.id) ?? card.id}{' '}
                    <code className="font-mono text-xs text-muted">{card.id}</code>
                  </p>
                  <ul className="m-0 list-disc pl-5 text-sm">
                    {card.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>
        <Tabs.Content value="elements">
          {props.plan === null ? (
            <Empty>Fix the highlighted fields to see what will be created.</Empty>
          ) : (
            <CreatorElements
              plan={props.plan}
              overwrite={props.overwrite}
              onOverwriteChange={props.onOverwriteChange}
            />
          )}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}
