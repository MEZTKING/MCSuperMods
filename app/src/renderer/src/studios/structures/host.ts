/**
 * What the structure Studios ask of the host beyond `StudioProps`: replacing a template from
 * a file, the two structure export commands and going to another element. `App` provides it
 * around the Form tab; without a provider the buttons that need it are disabled.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from '@msm/core';
import { createContext, useContext } from 'react';

/** The host actions of the structure Studios. */
export interface StructureStudioHost {
  /** Picks a `.nbt` or `.schem` file and replaces the element's data with it (one undo step). */
  replaceFromFile(elementId: ResourceLocation): void;
  /** Runs File > More Exports for every structure template: `.nbt` or Sponge `.schem`. */
  exportStructures(format: 'nbt' | 'schem'): void;
  /** Selects another element (go to definition). */
  openElement(id: ResourceLocation): void;
}

/** Provided by `App`; `null` outside it (tests, previews). */
export const StructureStudioHostContext = createContext<StructureStudioHost | null>(null);

/** The structure Studio host, or `null` when none is provided. */
export function useStructureStudioHost(): StructureStudioHost | null {
  return useContext(StructureStudioHostContext);
}
