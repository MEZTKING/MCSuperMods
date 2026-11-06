/**
 * The live armour preview of the editor (ADR 0047 D4): which armour an element shows and where
 * each part's textures come from. Pure; the component draws it with the Creator's humanoid
 * figure (`geo/armour.ts`).
 *
 * - A `minecraft:equipment` element previews its own layers: helmet, chestplate and boots from
 *   `humanoid`, leggings from `humanoid_leggings`, plus `horse_body` and `wolf_body`.
 * - An `msm:item` with `msm:armor` previews the equipment asset its material names (a project
 *   equipment element, or a vanilla one by name), with its own piece shown and the others off.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { ArmourPiece } from './geo/armour';

/** The equipment kind. */
export const EQUIPMENT_KIND = 'minecraft:equipment';

/** A humanoid layer or a body layer. */
export type ArmourLayerName = 'humanoid' | 'humanoid_leggings' | 'horse_body' | 'wolf_body';

/** One row of the parts list. */
export interface ArmourPart {
  /** `helmet` … `boots`, or `horse` / `wolf` for body armour. */
  id: ArmourPiece | 'horse' | 'wolf';
  label: string;
  layer: ArmourLayerName;
  /** The layer's texture id (`<ns>:<name>`), or `null` when the layer is missing. */
  texture: string | null;
  /** Where the form edits it (RFC 6901 pointer into the element's data). */
  pointer: string;
  /** Shown on the figure when the preview opens. */
  shown: boolean;
}

/** What the preview shows for an element. */
export interface ArmourPreview {
  /** The equipment asset id drawn. */
  equipmentId: string;
  /** Whether the equipment is a vanilla one (its textures come from the game). */
  vanilla: boolean;
  parts: ArmourPart[];
}

const HUMANOID: readonly { id: ArmourPiece; label: string; layer: ArmourLayerName }[] = [
  { id: 'helmet', label: 'Helmet', layer: 'humanoid' },
  { id: 'chestplate', label: 'Chestplate', layer: 'humanoid' },
  { id: 'leggings', label: 'Leggings', layer: 'humanoid_leggings' },
  { id: 'boots', label: 'Boots', layer: 'humanoid' },
];

const record = (value: Json | undefined): Record<string, Json> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The first layer entry's texture of `layer` in equipment data, or `null`. */
function layerTexture(data: Json, layer: ArmourLayerName): string | null {
  const entries = record(record(data)?.layers)?.[layer];
  const first = Array.isArray(entries) ? record(entries[0]) : undefined;
  return typeof first?.texture === 'string' && first.texture !== '' ? first.texture : null;
}

function partsOf(
  data: Json | null,
  pointerOf: (layer: ArmourLayerName) => string,
  shown: (id: ArmourPart['id']) => boolean,
  vanillaId: string | null,
): ArmourPart[] {
  const texture = (layer: ArmourLayerName): string | null =>
    data === null
      ? layer === 'humanoid' || layer === 'humanoid_leggings'
        ? vanillaId
        : null
      : layerTexture(data, layer);
  const parts: ArmourPart[] = HUMANOID.map((piece) => ({
    ...piece,
    texture: texture(piece.layer),
    pointer: pointerOf(piece.layer),
    shown: shown(piece.id),
  }));
  for (const [id, layer, label] of [
    ['horse', 'horse_body', 'Horse armour'],
    ['wolf', 'wolf_body', 'Wolf armour'],
  ] as const) {
    const value = texture(layer);
    if (value !== null)
      parts.push({ id, label, layer, texture: value, pointer: pointerOf(layer), shown: shown(id) });
  }
  return parts;
}

/** The slot of `msm:armor` as a part id. */
function slotPart(slot: Json | undefined): ArmourPart['id'] | null {
  switch (slot) {
    case 'helmet':
    case 'chestplate':
    case 'leggings':
    case 'boots':
    case 'horse':
    case 'wolf':
      return slot;
    default:
      return null;
  }
}

/**
 * The preview of `element`, or `null` when it shows no armour.
 *
 * @param project - Looked up for the equipment element an armour item names.
 */
export function armourPreviewOf(element: Element, project: Project | null): ArmourPreview | null {
  if (element.kind === EQUIPMENT_KIND) {
    return {
      equipmentId: element.id,
      vanilla: false,
      parts: partsOf(
        element.data,
        (layer) => `/layers/${layer}/0/texture`,
        (id) => id !== 'horse' && id !== 'wolf',
        null,
      ),
    };
  }
  if (element.kind !== 'msm:item') return null;
  const armor = record(record(record(element.data)?.components)?.['msm:armor']);
  if (armor === undefined) return null;
  const slot = slotPart(armor.slot);
  const material = armor.material;
  const assetPointer = '/components/msm:armor/material/equipment_asset';
  let equipmentId: string | null = null;
  if (typeof material === 'string')
    equipmentId = `minecraft:${material.replace(/^minecraft:/, '')}`;
  else {
    const asset = record(material)?.equipment_asset;
    if (typeof asset === 'string' && asset !== '')
      equipmentId = asset.includes(':') ? asset : `minecraft:${asset}`;
  }
  if (equipmentId === null) return null;
  const equipment = project?.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((entry) => entry.kind === EQUIPMENT_KIND && entry.id === equipmentId);
  const shown = (id: ArmourPart['id']) => slot === null || id === slot;
  if (equipment !== undefined) {
    return {
      equipmentId,
      vanilla: false,
      parts: partsOf(equipment.data, () => assetPointer, shown, null),
    };
  }
  const vanilla = equipmentId.startsWith('minecraft:');
  return {
    equipmentId,
    vanilla,
    parts: vanilla
      ? partsOf(null, () => assetPointer, shown, equipmentId)
      : partsOf({}, () => assetPointer, shown, null),
  };
}
