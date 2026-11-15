/**
 * Element kinds contributed by `@msm/plugin-controls`: `msm:key_bind` (ADR 0088 D3, folder
 * `key_bind`) and `msm:hud` (ADR 0089 D1, folder `hud`). Neither belongs to a game registry: the
 * runtime reads them at start on both sides and registers a key mapping or a HUD index of its
 * own (a new one needs a restart). Both need the Fabric mod jar.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerHud } from '../lowering/hud';
import { lowerKeyBind } from '../lowering/key-bind';

/** Kind id of key binds (ADR 0088 D3). */
export const KEY_BIND_KIND = 'msm:key_bind';
/** Kind id of HUD elements (ADR 0089 D1). */
export const HUD_KIND = 'msm:hud';
/** Kind id of vehicles, contributed by `@msm/plugin-entities` (ADR 0090 D2). */
export const VEHICLE_KIND = 'msm:vehicle';

/** `format` is written by lowering, so the form hides it. */
const HIDDEN = ['/format'];

/**
 * Key binds: a key in vanilla's Controls screen whose presses fire the element's events on the
 * server. A new key bind defaults to J, which no vanilla control and no runtime vehicle key
 * uses on either target.
 */
export const keyBindKind: ElementKind = {
  id: KEY_BIND_KIND,
  schema: MSM_SCHEMA_REFS.keyBind,
  folder: 'key_bind',
  defaultData: { format: 1, default_key: 'key.keyboard.j' },
  hiddenPaths: HIDDEN,
  lower: lowerKeyBind,
};

/**
 * HUD elements: one bar, text or row of icons drawn by the runtime's HUD layer. A new element
 * is a bar above the hotbar showing what an action, script or rule sets.
 */
export const hudKind: ElementKind = {
  id: HUD_KIND,
  schema: MSM_SCHEMA_REFS.hud,
  folder: 'hud',
  defaultData: { format: 1, type: 'bar', value: { source: 'set' } },
  hiddenPaths: HIDDEN,
  lower: lowerHud,
};

/** Every kind this plugin contributes, in order. */
export const controlsKinds: readonly ElementKind[] = Object.freeze([keyBindKind, hudKind]);
