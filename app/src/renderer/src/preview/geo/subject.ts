/**
 * Works out what the geo preview draws for a subject (ADR 0029 D5):
 *
 * - `geo_model`: the element's own data, textured with the conventional texture of the same
 *   id (`<ns>:entity/x` is `textures/entity/x.png`), no animation.
 * - `animation`: the first `msm:geo_model` whose bones include every bone the animation set
 *   moves, or the project's first geo model with a notice naming it; the selected animation
 *   plays.
 * - `entity`: `components["msm:animated_model"]`: the referenced model, texture and animation
 *   set, the `idle` animation playing and `scale` applied. {@link GeoSceneOptions} pick a
 *   variant's texture (`msm:variants`) and the baby size (`msm:breedable.baby_scale`, B297,
 *   ADR 0073 D5); {@link entityPreviewChoices} lists what the switcher offers.
 *
 * Missing references give a `message` that the panel shows instead of the canvas. Pure.
 */

import type { Project } from '@msm/plugin-api';
import { normaliseId, projectElementsOfKind } from '../model-chain';
import { boneNames, isObject } from './json';

/** Kind id of GeckoLib geo models (`@msm/plugin-models-anim`). */
export const GEO_MODEL_KIND = 'msm:geo_model';
/** Kind id of GeckoLib animation sets (`@msm/plugin-models-anim`). */
export const ANIMATION_KIND = 'msm:animation';

/** The preview kinds the geo renderer draws. */
export type GeoPreviewKind = 'geo_model' | 'animation' | 'entity';

/** True for the preview kinds of {@link GeoPreviewKind}. */
export const isGeoPreviewKind = (kind: string): kind is GeoPreviewKind =>
  kind === 'geo_model' || kind === 'animation' || kind === 'entity';

/** What the geo preview draws. */
export type GeoScene =
  | {
      ok: true;
      /** The geo model's id and data. */
      modelId: string;
      model: unknown;
      /** The texture id (`<ns>:<path>`, read from `textures/<path>.png`). */
      textureId: string;
      /** The animation set's data, or `null` for a static model. */
      animations: unknown;
      /** The animation selected first, or `null`. */
      initialAnimation: string | null;
      /** Uniform render scale. */
      scale: number;
      notices: string[];
    }
  | { ok: false; message: string };

/** Every bone name an animation set moves, over all its animations. */
export function animatedBones(data: unknown): Set<string> {
  const bones = new Set<string>();
  const animations = isObject(data) && isObject(data.animations) ? data.animations : {};
  for (const animation of Object.values(animations)) {
    if (isObject(animation) && isObject(animation.bones)) {
      for (const bone of Object.keys(animation.bones)) bones.add(bone);
    }
  }
  return bones;
}

/** The animation names of an animation set, in file order. */
export function animationNames(data: unknown): string[] {
  return isObject(data) && isObject(data.animations) ? Object.keys(data.animations) : [];
}

/** Entity preview options: which variant to draw and whether to draw a baby. */
export interface GeoSceneOptions {
  /** A variant id of `msm:variants`; unknown ids and `undefined` draw the base texture. */
  variant?: string | undefined;
  /** Draw a baby (scaled by `baby_scale`, 0.5 by default); only for `msm:breedable` mobs. */
  baby?: boolean | undefined;
}

/** A baby's size when `msm:breedable` has no `baby_scale` (ADR 0071 D2). */
export const DEFAULT_BABY_SCALE = 0.5;

/** What the entity preview's switcher offers for an entity's data. */
export interface EntityPreviewChoices {
  /** The variants with an id, in list order, and their texture ids. */
  variants: { id: string; texture: string }[];
  /** The baby size when the mob breeds, else `null` (no baby toggle). */
  babyScale: number | null;
}

/** The variants and baby size of an entity's data, for the preview's switcher. */
export function entityPreviewChoices(data: unknown): EntityPreviewChoices {
  const object = isObject(data) ? data : {};
  const components = isObject(object.components) ? object.components : {};
  const variantsComponent = components['msm:variants'];
  const list =
    isObject(variantsComponent) && Array.isArray(variantsComponent.variants)
      ? variantsComponent.variants
      : [];
  const variants = list.flatMap((entry) =>
    isObject(entry) && typeof entry.id === 'string' && entry.id !== ''
      ? [{ id: entry.id, texture: typeof entry.texture === 'string' ? entry.texture.trim() : '' }]
      : [],
  );
  const breedable = components['msm:breedable'];
  const babyScale = !isObject(breedable)
    ? null
    : typeof breedable.baby_scale === 'number' &&
        Number.isFinite(breedable.baby_scale) &&
        breedable.baby_scale > 0
      ? breedable.baby_scale
      : DEFAULT_BABY_SCALE;
  return { variants, babyScale };
}

/** Resolves the scene for a geo preview subject. */
export function resolveGeoScene(
  project: Project,
  subject: { previewKind: GeoPreviewKind; id: string; data: unknown },
  options: GeoSceneOptions = {},
): GeoScene {
  const models = projectElementsOfKind(project, GEO_MODEL_KIND);
  if (subject.previewKind === 'geo_model') {
    const id = normaliseId(subject.id);
    return {
      ok: true,
      modelId: id,
      model: subject.data,
      textureId: id,
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [],
    };
  }

  if (subject.previewKind === 'animation') {
    const first = models.entries().next();
    if (first.done === true) {
      return { ok: false, message: 'Add a geo model to the project to play this animation on.' };
    }
    const wanted = animatedBones(subject.data);
    let match: [string, unknown] | null = null;
    if (wanted.size > 0) {
      for (const [id, element] of models) {
        const names = new Set(boneNames(element.data));
        if ([...wanted].every((bone) => names.has(bone))) {
          match = [id, element.data];
          break;
        }
      }
    }
    const notices: string[] = [];
    if (match === null) {
      const [id, element] = first.value;
      match = [id, element.data];
      notices.push(`No geo model has every bone of this animation set; shown on ${id}.`);
    }
    const names = animationNames(subject.data);
    return {
      ok: true,
      modelId: match[0],
      model: match[1],
      textureId: match[0],
      animations: subject.data,
      initialAnimation: names[0] ?? null,
      scale: 1,
      notices,
    };
  }

  // entity
  const data = isObject(subject.data) ? subject.data : {};
  const components = isObject(data.components) ? data.components : {};
  const animated = components['msm:animated_model'];
  if (!isObject(animated)) {
    return { ok: false, message: 'This entity has no msm:animated_model component.' };
  }
  const modelRef = typeof animated.model === 'string' ? animated.model.trim() : '';
  if (modelRef === '') return { ok: false, message: 'Choose a geo model for this entity.' };
  const modelId = normaliseId(modelRef);
  const model = models.get(modelId);
  if (model === undefined) {
    return { ok: false, message: `Geo model ${modelId} is not in the project.` };
  }
  const notices: string[] = [];
  const choices = entityPreviewChoices(data);
  const variant =
    options.variant === undefined
      ? undefined
      : choices.variants.find((entry) => entry.id === options.variant);
  const ownTexture = typeof animated.texture === 'string' ? animated.texture.trim() : '';
  const textureRef = variant === undefined ? ownTexture : variant.texture;
  if (textureRef === '') {
    notices.push(
      variant === undefined
        ? 'No texture chosen; drawn with the missing texture.'
        : `Variant ${variant.id} has no texture; drawn with the missing texture.`,
    );
  }
  let animations: unknown = null;
  let initialAnimation: string | null = null;
  const animationsRef = typeof animated.animations === 'string' ? animated.animations.trim() : '';
  if (animationsRef !== '') {
    const animationsId = normaliseId(animationsRef);
    const set = projectElementsOfKind(project, ANIMATION_KIND).get(animationsId);
    if (set === undefined) {
      notices.push(`Animation set ${animationsId} is not in the project; shown without animation.`);
    } else {
      animations = set.data;
      const names = animationNames(set.data);
      const idle = typeof animated.idle === 'string' ? animated.idle : '';
      if (idle !== '' && names.includes(idle)) initialAnimation = idle;
      else {
        if (idle !== '') notices.push(`Idle animation "${idle}" is not in ${animationsId}.`);
        else notices.push('No idle animation chosen.');
        initialAnimation = null;
      }
    }
  }
  const adultScale =
    typeof animated.scale === 'number' && Number.isFinite(animated.scale) && animated.scale > 0
      ? animated.scale
      : 1;
  const scale =
    options.baby === true && choices.babyScale !== null
      ? adultScale * choices.babyScale
      : adultScale;
  return {
    ok: true,
    modelId,
    model: model.data,
    textureId: textureRef === '' ? '' : normaliseId(textureRef),
    animations,
    initialAnimation,
    scale,
    notices,
  };
}
