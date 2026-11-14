/**
 * Pure helpers of the Block Studio's Portal section (B337, ADR 0078 D1; format ADR 0077 D1):
 * the frame (a block or a `#tag`, and the block exits are built of), the igniter (an item, a
 * `#tag` or nothing), the travel, sound and particle groups with their clearing rules, the
 * dimension choices, the scale and arrival choices in words, dust colours, the project's
 * portals and the "Light a portal" action. No React, no session.
 *
 * Defaults (igniter, way back, the portal components) come from `@msm/plugin-blocks-items`;
 * the default sounds and particle come from the target (`Target.blocks.portal`).
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import {
  DEFAULT_PORTAL_IGNITER,
  DEFAULT_PORTAL_RETURN_TO,
  DUST_PARTICLE,
  isPortalElement,
  LIGHT_PORTAL_ACTION,
} from '@msm/plugin-blocks-items';
import { asObject, BLOCK_KIND } from './blocks-items-model';

export { DEFAULT_PORTAL_IGNITER, DEFAULT_PORTAL_RETURN_TO, DUST_PARTICLE, LIGHT_PORTAL_ACTION };

type JsonObject = { [key: string]: Json };

/** The field groups of a portal (`travel`, `sounds`, `particles`). */
export type PortalGroup = 'travel' | 'sounds' | 'particles';

/** The scale of "8:1 like the Nether". */
export const NETHER_SCALE = 8;

/** The particles per animation tick without `particles.count` (ADR 0077 D1). */
export const DEFAULT_PARTICLE_COUNT = 4;

/** The format's limits (ADR 0077 D1). */
export const MAX_PARTICLE_COUNT = 16;
export const MAX_PORTAL_TICKS = 32767;

/** Where travellers arrive (`travel.arrival`), in words. */
export const ARRIVAL_LABELS: Readonly<Record<'portal' | 'surface', string>> = Object.freeze({
  portal: 'In a linked portal',
  surface: 'On the ground',
});

/** The arrival choices in the picker's order. */
export const ARRIVALS: readonly ('portal' | 'surface')[] = Object.freeze(['portal', 'surface']);

/** How the scale is chosen: from the two dimension types, or a number (`travel.scale`). */
export type ScaleMode = 'dimensions' | 'number';

export const SCALE_MODE_LABELS: Readonly<Record<ScaleMode, string>> = Object.freeze({
  dimensions: 'From the dimensions',
  number: 'A number',
});

export const SCALE_MODES: readonly ScaleMode[] = Object.freeze(['dimensions', 'number']);

/** Whether `id` names a tag (`#namespace:path`). */
export function isTagId(value: Json | undefined): boolean {
  return typeof value === 'string' && value.startsWith('#');
}

/** `value` when it is a non-empty string, else `''`. */
export function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The portal data after setting its frame, as one edit: an empty frame is removed (the schema
 * then reports it); a plain block frame drops `frame_block`, which is only shown (and needed)
 * for a tag frame.
 */
export function withFrame(data: Json | undefined, frame: string): JsonObject {
  const out: JsonObject = { ...asObject(data) };
  if (frame === '') delete out.frame;
  else out.frame = frame;
  if (!isTagId(frame)) delete out.frame_block;
  return out;
}

/** Whether the portal is lit only by a trigger (`igniter: false`). */
export function litByTriggerOnly(data: Json | undefined): boolean {
  return asObject(data).igniter === false;
}

/**
 * The path and value that set `key` of `group` to `value`: clearing the last field removes
 * the group, so no empty `{}` is left behind.
 */
export function groupEdit(
  data: Json | undefined,
  group: PortalGroup,
  key: string,
  value: Json | undefined,
): { path: string[]; value: Json | undefined } {
  const current = asObject(asObject(data)[group]);
  if (value === undefined) {
    const rest = Object.keys(current).filter((entry) => entry !== key);
    return rest.length === 0 && asObject(data)[group] !== undefined
      ? { path: [group], value: undefined }
      : { path: [group, key], value: undefined };
  }
  return { path: [group, key], value };
}

/** How the scale is chosen now. */
export function scaleModeOf(data: Json | undefined): ScaleMode {
  return typeof asObject(asObject(data).travel).scale === 'number' ? 'number' : 'dimensions';
}

/**
 * The dimensions the pickers offer: the project's own first, then the target's vanilla ones
 * (both from the registry view's `dimension` ids), and `current` when it is neither.
 */
export function dimensionChoices(ids: readonly string[], current?: string): string[] {
  const namespaced = (id: string) => (id.includes(':') ? id : `minecraft:${id}`);
  const all = [...new Set(ids.map(namespaced))];
  const own = all.filter((id) => !id.startsWith('minecraft:')).sort();
  const vanilla = all.filter((id) => id.startsWith('minecraft:')).sort();
  const out = [...own, ...vanilla];
  if (current !== undefined && current !== '' && !out.includes(namespaced(current))) {
    out.unshift(current);
  }
  return out;
}

/**
 * Whether the colour field applies: only dust takes a colour, and a colour alone (no type)
 * gives coloured dust (limit P3).
 */
export function takesColour(data: Json | undefined): boolean {
  const type = asObject(asObject(data).particles).type;
  if (typeof type !== 'string' || type === '') return true;
  return (type.includes(':') ? type : `minecraft:${type}`) === DUST_PARTICLE;
}

/** A colour int (`0xRRGGBB`) as `#rrggbb`. */
export function colourHex(value: Json | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffff) {
    return undefined;
  }
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** `#rrggbb` as a colour int, or `undefined`. */
export function colourFromHex(hex: string): number | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return match === null ? undefined : Number.parseInt(match[1] as string, 16);
}

/** The ids of the project's portal blocks (`msm:block` of type `portal`), sorted. */
export function projectPortals(project: Project | null | undefined): string[] {
  if (project === null || project === undefined) return [];
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === BLOCK_KIND && isPortalElement(element))
    .map((element) => element.id)
    .sort();
}

/** A new "Light a portal" action: the first of the project's portals, or an empty id. */
export function newLightPortalAction(portals: readonly string[]): JsonObject {
  return { type: LIGHT_PORTAL_ACTION, portal: portals[0] ?? '' };
}
