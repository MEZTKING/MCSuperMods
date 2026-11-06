/**
 * The live armour preview (ADR 0047 D4): the humanoid armour figure of the Creator, drawn from
 * the element's equipment layers, beside a list of its parts. Each part row expands to show
 * its texture, toggles the part on the figure and jumps to the form field that sets it.
 *
 * @packageDocumentation
 */

import { ChevronDown, ChevronRight, PencilLine } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { equipmentTexturePath } from '../components/creator/creator-model';
import type { ArmourPart, ArmourPreview } from './armour-preview';
import { pngDataUrl } from './bundle-source';
import {
  ARMOUR_GEOMETRY_ID,
  type ArmourPiece,
  armourGeometry,
  composeArmourTexture,
} from './geo/armour';
import type { GeoScene } from './geo/subject';
import type { ResourceFolders, VanillaAssetReader } from './model-chain';

const GeoCanvas = lazy(() => import('./geo/GeoCanvas'));

export interface ArmourPreviewViewProps {
  preview: ArmourPreview;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  vanilla: VanillaAssetReader | null;
  webgl: boolean;
  /** Moves the form to a part's field (RFC 6901 pointer). */
  onJumpTo?(pointer: string): void;
}

const HUMANOID_PIECES: ReadonlySet<string> = new Set(['helmet', 'chestplate', 'leggings', 'boots']);

/** Reads a layer texture from the project, or for `minecraft:` ids from the vanilla cache. */
async function readLayer(
  props: Pick<ArmourPreviewViewProps, 'folders' | 'readProjectAsset' | 'vanilla'>,
  part: ArmourPart,
): Promise<Uint8Array | null> {
  if (part.texture === null) return null;
  const { namespace, path } = equipmentTexturePath(
    part.texture,
    part.layer,
    props.folders.textures,
  );
  if (namespace === 'minecraft') {
    return (await props.vanilla?.readAsset(`assets/minecraft/${path}`).catch(() => null)) ?? null;
  }
  return props.readProjectAsset(namespace, path);
}

export function ArmourPreviewView(props: ArmourPreviewViewProps) {
  const { preview } = props;
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [bytes, setBytes] = useState<Record<string, Uint8Array | null>>({});
  const [revision, setRevision] = useState(0);
  const isShown = (part: ArmourPart): boolean => shown[part.id] ?? part.shown;

  // Reload the layer textures whenever the parts (and so their texture ids) change.
  const textureKey = preview.parts.map((part) => `${part.id}=${part.texture ?? ''}`).join('|');
  useEffect(() => {
    let live = true;
    void Promise.all(
      preview.parts.map(async (part) => [part.id, await readLayer(props, part)] as const),
    ).then((entries) => {
      if (!live) return;
      setBytes(Object.fromEntries(entries));
      setRevision((value) => value + 1);
    });
    return () => {
      live = false;
    };
  }, [textureKey, props.readProjectAsset, props.vanilla]);

  const humanoid = preview.parts.filter((part) => HUMANOID_PIECES.has(part.id));
  const pieces = humanoid.filter(isShown).map((part) => part.id as ArmourPiece);
  /** The first loaded texture of a humanoid layer. */
  const layerBytes = (layer: string): Uint8Array | null => {
    for (const part of humanoid) {
      const data = bytes[part.id];
      if (part.layer === layer && data !== null && data !== undefined) return data;
    }
    return null;
  };
  const layer1 = layerBytes('humanoid');
  const layer2 = layerBytes('humanoid_leggings');
  const pieceKey = pieces.join(',');
  const scene = useMemo<Extract<GeoScene, { ok: true }>>(
    () => ({
      ok: true,
      modelId: ARMOUR_GEOMETRY_ID,
      model: armourGeometry(pieceKey === '' ? [] : (pieceKey.split(',') as ArmourPiece[])),
      textureId: `msm:editor/armour_${revision}`,
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [],
    }),
    [pieceKey, revision],
  );

  return (
    <section
      aria-label="Armour preview"
      data-testid="armour-preview"
      className="flex flex-col gap-2"
    >
      <p className="text-xs text-muted">
        Worn look from {preview.equipmentId}
        {preview.vanilla ? ' (a vanilla armour material)' : ''}. Tick parts to show them.
      </p>
      {humanoid.length > 0 &&
        (!props.webgl ? (
          <p role="status" className="text-xs text-muted">
            3D preview unavailable: WebGL is disabled.
          </p>
        ) : (
          <div className="w-full max-w-80" data-testid="armour-preview-canvas">
            <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
              <GeoCanvas
                scene={scene}
                subjectId="Armour"
                folders={props.folders}
                readProjectAsset={() => composeArmourTexture(layer1, layer2)}
              />
            </Suspense>
          </div>
        ))}
      <ul className="flex flex-col gap-1" data-testid="armour-parts">
        {preview.parts.map((part) => {
          const expanded = open[part.id] === true;
          const data = bytes[part.id];
          return (
            <li
              key={part.id}
              className="rounded border border-border"
              data-testid={`armour-part-${part.id}`}
            >
              <div className="flex items-center gap-1 px-1 py-0.5 text-sm">
                <button
                  type="button"
                  className="flex cursor-pointer items-center"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${part.label}`}
                  onClick={() => setOpen({ ...open, [part.id]: !expanded })}
                >
                  {expanded ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                </button>
                <label className="flex flex-1 cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={isShown(part)}
                    disabled={!HUMANOID_PIECES.has(part.id)}
                    data-testid={`armour-part-toggle-${part.id}`}
                    onChange={(event) => setShown({ ...shown, [part.id]: event.target.checked })}
                  />
                  {part.label}
                </label>
                {props.onJumpTo !== undefined && (
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-0.5 text-xs text-accent hover:underline"
                    data-testid={`armour-part-edit-${part.id}`}
                    onClick={() => props.onJumpTo?.(part.pointer)}
                  >
                    <PencilLine size={12} aria-hidden />
                    Edit
                  </button>
                )}
              </div>
              {expanded && (
                <div className="flex items-center gap-2 border-t border-border p-1 text-xs text-muted">
                  {data !== null && data !== undefined ? (
                    <img
                      alt={`${part.label} texture`}
                      src={pngDataUrl(data)}
                      className="h-16 w-32 border border-border [image-rendering:pixelated]"
                    />
                  ) : null}
                  <span>
                    {part.texture === null
                      ? `No ${part.layer} layer yet.`
                      : data === null || data === undefined
                        ? `Texture ${part.texture} (${part.layer}) not found${part.texture.startsWith('minecraft:') ? ': extract the vanilla assets in Settings' : ''}.`
                        : `${part.texture}, ${part.layer} layer`}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
