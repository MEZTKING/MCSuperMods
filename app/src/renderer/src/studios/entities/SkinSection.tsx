/**
 * **Draw a skin** in the Mob Studio (ADR 0092 D10 (c), plan limit A4), beside the texture
 * picker: the mob's model's own box-UV cubes (`boxesOfGeoModel`) drawn in a coat (Fur, Scales,
 * Smooth, Stone, Slime), a colour and a second colour (belly and spots), with six variations,
 * through the shared Draw dialog. **Use this skin** writes over the project texture the mob
 * names, or makes `textures/entity/<path>.png` and names it, in one undo step (ADR 0045). The
 * button is greyed out, with the reason beside it, when the mob has no model, the model is not
 * in the project, it maps its faces one by one (per-face UV) or it has no boxes. Very easy
 * mode reads "Draw its skin". Drawing needs no key and no internet; the writes go through the
 * Studio host's `applyChanges`, so without a host nothing is shown.
 *
 * Test ids: `entity-draw-skin`, `entity-draw-skin-note`.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { boxesOfGeoModel, type SkinBox } from '@msm/plugin-library';
import { Palette } from 'lucide-react';
import { Suspense, useState } from 'react';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { textureAsset, textureChange } from '../../components/ai-pictures/texture-write';
import { LazyDrawPictureDialog } from '../../components/art/DrawButton';
import type { DrawField } from '../../components/art/draw-model';
import { Button } from '../../components/ui/Button';
import { usePreferences } from '../../store/preferences';
import { findElement } from '../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { GEO_MODEL_KIND } from './entities-model';

/** The words of the button, the dialog and the reasons it is greyed out. */
export const DRAW_A_SKIN = 'Draw a skin';
export const DRAW_ITS_SKIN = 'Draw its skin';
export const USE_THIS_SKIN = 'Use this skin';
export const NO_MODEL = 'Choose a model first.';
export const MODEL_NOT_IN_PROJECT = 'The model is not part of this project.';
/** Plan limit A4's words. */
export const PER_FACE_MODEL = "This model's faces are mapped one by one";
export const NO_BOXES = 'This model has no boxes to draw on.';

type JsonObject = { [key: string]: Json };

function asObject(value: Json | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

/** A positive whole number, or `fallback`. */
function size(value: Json | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1024
    ? value
    : fallback;
}

/**
 * The texture size a geometry declares (`texture_width` and `texture_height` of the first
 * `minecraft:geometry` entry's description, or the old form's `texturewidth` and
 * `textureheight`), 64 by 64 when it says nothing.
 */
export function geometryTextureSize(geometry: Json): { width: number; height: number } {
  const data = asObject(geometry);
  const list = data['minecraft:geometry'];
  if (Array.isArray(list)) {
    const description = asObject(asObject(list[0]).description);
    return {
      width: size(description.texture_width, 64),
      height: size(description.texture_height, 64),
    };
  }
  const old = Object.keys(data)
    .filter((key) => key.startsWith('geometry.'))
    .sort()[0];
  const entry = old === undefined ? {} : asObject(data[old]);
  return { width: size(entry.texturewidth, 64), height: size(entry.textureheight, 64) };
}

/** What Draw a skin would draw for a mob: the field, or why it is greyed out. */
export type SkinPlan =
  | { readonly ok: true; readonly field: DrawField; readonly boxes: readonly SkinBox[] }
  | { readonly ok: false; readonly reason: string };

/** The Draw field of a mob's skin: its model's boxes at the model's texture size. */
export function skinPlan(project: Project, mob: Element): SkinPlan {
  const model = asObject(asObject(asObject(mob.data).components)['msm:animated_model']);
  const modelId = typeof model.model === 'string' ? model.model.trim() : '';
  if (modelId === '') return { ok: false, reason: NO_MODEL };
  const geo = findElement(project, modelId, GEO_MODEL_KIND);
  if (geo === undefined) return { ok: false, reason: MODEL_NOT_IN_PROJECT };
  const geometry = asObject(geo.data);
  const boxes = boxesOfGeoModel(geometry as Parameters<typeof boxesOfGeoModel>[0]);
  if (boxes === null) return { ok: false, reason: PER_FACE_MODEL };
  if (boxes.length === 0) return { ok: false, reason: NO_BOXES };
  const { width, height } = geometryTextureSize(geometry);
  const { asset } = skinTexture(mob);
  return {
    ok: true,
    boxes,
    field: { kinds: ['entity'], width, height, name: asset.path, skin: true, boxes },
  };
}

/**
 * The texture a mob's skin goes to: the project texture it names (`ns:entity/x`), or, when it
 * names none (or a vanilla one), `textures/entity/<path>.png` in the mob's namespace, which the
 * pick then names as `ns:entity/<path>`.
 */
export function skinTexture(mob: Element): {
  asset: { namespace: string; path: string };
  textureId: string;
  named: boolean;
} {
  const model = asObject(asObject(asObject(mob.data).components)['msm:animated_model']);
  const value = typeof model.texture === 'string' ? model.texture.trim() : '';
  const current = value === '' ? null : textureAsset(value);
  if (current !== null) return { asset: current, textureId: value, named: true };
  const colon = mob.id.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : mob.id.slice(0, colon);
  const path = colon < 0 ? mob.id : mob.id.slice(colon + 1);
  return {
    asset: { namespace, path: `textures/entity/${path}.png` },
    textureId: `${namespace}:entity/${path}`,
    named: false,
  };
}

/**
 * The change of a picked skin, as the items and writes of one `applyChanges` step: the bytes
 * over the texture the mob names (an undoable write when the project records it), or a new
 * texture and the mob's `texture` naming it.
 */
export function skinChange(
  project: Project,
  mob: Element,
  bytes: Uint8Array,
): { items: ChangeItem[]; writes: ChangeAsset[]; label: string } {
  const { asset, textureId, named } = skinTexture(mob);
  const change = textureChange(project, asset.namespace, asset.path, bytes);
  const items = [...change.items];
  if (!named) {
    const data = asObject(mob.data);
    const components = asObject(data.components);
    const after: Json = {
      ...data,
      components: {
        ...components,
        'msm:animated_model': {
          ...asObject(components['msm:animated_model']),
          texture: textureId,
        },
      },
    };
    items.push({
      itemId: 'draw-skin:texture',
      op: 'update',
      elementId: mob.id,
      kind: mob.kind,
      before: mob.data,
      after,
      accepted: true,
      problems: [],
    });
  }
  return { items, writes: change.writes, label: `Draw a skin ${asset.path}` };
}

/** Props of {@link SkinSection}. */
export interface SkinSectionProps {
  project: Project;
  /** The mob (`msm:entity`). */
  element: Element;
}

/** The Mob Studio's **Draw a skin** button and its reason when greyed out. */
export function SkinSection(props: SkinSectionProps) {
  const host = useBlocksItemsStudioHost();
  const veryEasy = usePreferences((state) => state.mode) === 'very-easy';
  const [open, setOpen] = useState(false);
  if (host?.applyChanges === undefined) return null;
  const apply = host.applyChanges;
  const plan = skinPlan(props.project, props.element);
  const label = veryEasy ? DRAW_ITS_SKIN : DRAW_A_SKIN;
  const { asset } = skinTexture(props.element);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Button
        data-testid="entity-draw-skin"
        disabled={!plan.ok}
        title={plan.ok ? 'Draw a skin on the model’s boxes in a Minecraft-like style' : plan.reason}
        onClick={() => setOpen(true)}
      >
        <Palette size={12} aria-hidden />
        {label}
      </Button>
      {!plan.ok && (
        <span className="text-muted" data-testid="entity-draw-skin-note">
          {plan.reason}
        </span>
      )}
      {open && plan.ok && (
        <Suspense fallback={null}>
          <LazyDrawPictureDialog
            field={plan.field}
            target={`${asset.namespace}:${asset.path}`}
            veryEasy={veryEasy}
            title={label}
            useLabel={USE_THIS_SKIN}
            onPick={async (picture) => {
              const bytes = picture.pngs[0];
              if (bytes === undefined) return;
              const change = skinChange(props.project, props.element, bytes);
              await apply(change.items, change.label, change.writes);
            }}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
