/**
 * The Preview dock panel (DESIGN §8, ADR 0010). It is light: deepslate and gl-matrix live in the
 * lazily loaded `PreviewCanvas` chunk, which loads only for a previewable element on a machine
 * with WebGL. Without vanilla assets it still previews models built on MSM's fallback parents
 * and shows a banner that leads to the Minecraft folder settings.
 *
 * Structure templates render in the same WebGL canvas. Dimensions and world presets show the
 * climate map instead, a 2D canvas that needs neither WebGL nor vanilla assets (ADR 0023).
 *
 * Geo models, animation sets and entities render in the app's own WebGL renderer (`geo/`,
 * ADR 0029 D5), a separate lazy chunk that needs no vanilla assets. The subject is resolved
 * here (cheap, no gl-matrix), so a missing model reference shows a message without WebGL.
 */

import type { Element, Project } from '@msm/plugin-api';
import { lazy, Suspense, useMemo, useState } from 'react';
import { RecipeGridView } from '../components/recipe-grid/RecipeGridView';
import { Button } from '../components/ui/Button';
import { ArmourPreviewView } from './ArmourPreviewView';
import { armourPreviewOf } from './armour-preview';
import type { PreviewKind, PreviewSubject } from './asset-source';
import { isGeoPreviewKind, resolveGeoScene } from './geo/subject';
import {
  createVanillaJsonCache,
  type ResourceFolders,
  type VanillaAssetReader,
} from './model-chain';
import { hasWebGL } from './webgl';

const PreviewCanvas = lazy(() => import('./PreviewCanvas'));
const ClimateMap = lazy(() => import('./ClimateMap'));
const GeoCanvas = lazy(() => import('./geo/GeoCanvas'));

const PREVIEW_KINDS: readonly string[] = [
  'model',
  'block_definition',
  'item_definition',
  'structure',
  'climate_map',
  'geo_model',
  'animation',
  'entity',
];

/** True when the panel can preview an element whose kind declares `previewKind`. */
export function isPreviewKind(previewKind: string | undefined): previewKind is PreviewKind {
  return previewKind !== undefined && PREVIEW_KINDS.includes(previewKind);
}

/** Props of {@link PreviewPanel}. */
export interface PreviewPanelProps {
  project: Project;
  /** The selected element, or `null`. */
  element: Element | null;
  /** The selected element's `ElementKind.previewKind`. */
  previewKind: string | undefined;
  /** `target.folders.resource` of the project's target. */
  folders: ResourceFolders;
  /** Reads a project asset (`path` relative to `assets/<namespace>/`), or `null` when absent. */
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /**
   * The extracted vanilla cache for the project's Minecraft version (for example
   * `platform.minecraft.readAsset` bound to the version), or `null` when it is not set up.
   */
  vanilla: VanillaAssetReader | null;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
  /** Moves the form to a field (RFC 6901 pointer), for the armour parts list. */
  onJumpTo?(pointer: string): void;
}

/** Kinds whose `model` field the panel previews (custom items and blocks, ADR 0047 D4). */
const MODEL_FIELD_KINDS: ReadonlySet<string> = new Set(['msm:item', 'msm:block']);

/**
 * The model a custom item or block shows: the project's model element of that id, or a stand-in
 * whose parent is the (vanilla) model, previewed under the element's own id.
 */
export function modelFieldSubject(element: Element, project: Project): PreviewSubject | null {
  if (!MODEL_FIELD_KINDS.has(element.kind)) return null;
  const data = element.data;
  const model =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? data.model : undefined;
  if (typeof model !== 'string' || model === '') return null;
  const own = project.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((entry) => entry.kind === 'minecraft:model' && entry.id === model);
  return own === undefined
    ? { previewKind: 'model', id: element.id, data: { parent: model } }
    : { previewKind: 'model', id: own.id, data: own.data };
}

/** Shows a 3D preview of the selected model, blockstate or item definition. */
export function PreviewPanel(props: PreviewPanelProps) {
  const { project, element, previewKind, folders, vanilla, onSetup } = props;
  const [webglLost, setWebglLost] = useState(false);
  const webgl = (props.webgl ?? hasWebGL()) && !webglLost;
  const vanillaJson = useMemo(
    () => (vanilla === null ? null : createVanillaJsonCache(vanilla)),
    [vanilla],
  );
  const kind = isPreviewKind(previewKind) ? previewKind : null;
  const subject = useMemo<PreviewSubject | null>(
    () =>
      element === null
        ? null
        : kind === null
          ? modelFieldSubject(element, project)
          : kind === 'climate_map'
            ? null
            : { data: element.data, id: element.id, previewKind: kind },
    [element, kind, project],
  );
  const armour = useMemo(
    () => (element === null ? null : armourPreviewOf(element, project)),
    [element, project],
  );
  const extras =
    element === null ? null : (
      <>
        {armour !== null && (
          <ArmourPreviewView
            preview={armour}
            folders={folders}
            readProjectAsset={props.readProjectAsset}
            vanilla={vanilla}
            webgl={webgl}
            {...(props.onJumpTo === undefined ? {} : { onJumpTo: props.onJumpTo })}
          />
        )}
        {element.kind === 'minecraft:recipe' && (
          <div data-testid="preview-recipe">
            <RecipeGridView recipe={element.data} label={element.id} />
          </div>
        )}
      </>
    );

  if (subject !== null && isGeoPreviewKind(subject.previewKind)) {
    const scene = resolveGeoScene(project, {
      previewKind: subject.previewKind,
      id: subject.id,
      data: subject.data,
    });
    return (
      <section aria-label="Preview" className="flex flex-col gap-3">
        {!scene.ok ? (
          <p role="status" data-testid="preview-geo-message" className="text-sm text-muted">
            {scene.message}
          </p>
        ) : !webgl ? (
          <p role="status" className="text-sm text-muted">
            Preview unavailable: WebGL is disabled.
          </p>
        ) : (
          <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
            <GeoCanvas
              scene={scene}
              subjectId={subject.id}
              folders={folders}
              readProjectAsset={props.readProjectAsset}
              onWebGLUnavailable={() => setWebglLost(true)}
            />
          </Suspense>
        )}
      </section>
    );
  }

  if (element !== null && kind === 'climate_map') {
    return (
      <section aria-label="Preview" className="flex flex-col gap-3">
        <Suspense fallback={<p className="text-sm text-muted">Loading climate map…</p>}>
          <ClimateMap project={project} id={element.id} data={element.data} />
        </Suspense>
      </section>
    );
  }

  return (
    <section aria-label="Preview" className="flex flex-col gap-3">
      {vanilla === null ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
        >
          <span>Vanilla assets not found — set your Minecraft folder.</span>
          <Button onClick={onSetup}>Set up Minecraft folder</Button>
        </div>
      ) : null}
      {subject === null ? (
        armour === null && element?.kind !== 'minecraft:recipe' ? (
          <p className="text-sm text-muted">
            Select an item, block, armour look, recipe, model, blockstate, item definition,
            structure template, dimension, geo model, animation set or entity to preview it.
          </p>
        ) : null
      ) : !webgl ? (
        <p role="status" className="text-sm text-muted">
          Preview unavailable: WebGL is disabled.
        </p>
      ) : (
        <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
          <PreviewCanvas
            project={project}
            folders={folders}
            subject={subject}
            readProjectAsset={props.readProjectAsset}
            vanilla={vanilla}
            vanillaJson={vanillaJson}
            onWebGLUnavailable={() => setWebglLost(true)}
          />
        </Suspense>
      )}
      {extras}
    </section>
  );
}
