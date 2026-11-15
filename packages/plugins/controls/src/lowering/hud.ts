/**
 * Lowering of `msm:hud` (ADR 0089 D1): the runtime definition `msm/<ns>/hud/<path>.json`. The
 * element has no element-only field (B409), so the definition is the data with `format` set.
 * A text element's `text` may be a translation key the project's language files hold; lowering
 * writes no language key and no sprite of its own (sprites are project GUI sprites, ADR 0089 D1).
 */
import type { Element, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './key-bind';
import { ControlsLoweringError, definitionPath, isRecord, splitResourceLocation } from './paths';

/** The folder of GUI sprites under the textures folder (`gui/sprites/`, ADR 0089 D1). */
export const HUD_SPRITE_FOLDER = 'gui/sprites';

/** The HUD fields that name a GUI sprite, in the order a host reports them. */
export const HUD_SPRITE_FIELDS = [
  'sprite',
  'back_sprite',
  'icon',
  'half_icon',
  'empty_icon',
] as const;

function hudData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new ControlsLoweringError(`Element ${element.id}: HUD data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime HUD definition: the element data with `format` set to the format this plugin
 * writes. Every other field passes through unchanged.
 *
 * @throws {@link ControlsLoweringError} If the data is not an object.
 */
export function hudDefinition(element: Element): JsonObject {
  const definition = structuredClone(hudData(element));
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * The asset path of a HUD sprite: `<ns>:<name>` is
 * `assets/<ns>/<textures>/gui/sprites/<name>.png` (`minecraft` when no namespace is written),
 * the textures folder taken from the target. Used by hosts to report missing sprites (ADR 0089
 * D9).
 *
 * @param target - The target supplying the textures folder.
 * @param sprite - A sprite id such as `demo:hud/mana`.
 * @returns The asset path, or `undefined` for a sprite id that is not a safe resource location.
 */
export function hudSpritePath(
  target: Pick<TargetFacts, 'folders'>,
  sprite: string,
): string | undefined {
  const id = sprite.includes(':') ? sprite : `minecraft:${sprite}`;
  try {
    const { namespace, path } = splitResourceLocation(id);
    return `assets/${namespace}/${target.folders.resource.textures}/${HUD_SPRITE_FOLDER}/${path}.png`;
  } catch {
    return undefined;
  }
}

/**
 * Lowers an `msm:hud` element: the runtime definition `msm/<ns>/hud/<path>.json` (layer `msm`,
 * schema `msm:hud_definition`).
 *
 * @param element - The element.
 * @param _target - Unused: the runtime folder does not depend on the target.
 * @returns The output files.
 * @throws {@link ControlsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerHud(element: Element, _target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: definitionPath('hud', namespace, path),
      contents: hudDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.hudDefinition,
    },
  ];
}
