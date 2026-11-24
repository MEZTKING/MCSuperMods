export type Face = 'side' | 'top' | 'bottom';
export type Finish = 'rugged' | 'balanced' | 'smooth';

export interface PromptColor {
  name?: string;
  hue: number;
  sat: number;
  light?: number;
}

export interface MaterialRecipe {
  id: string;
  name: string;
  group: string;
  base: string;
  type: string;
  accent?: string;
  ore?: string;
  stage?: number;
  dirt?: string;
  keywords: string[];
}

export interface ResolvedRecipe {
  prompt: string;
  materialId: string;
  materialName: string;
  modifiers: string[];
  accent: string | null;
  promptColor: PromptColor | null;
  seed: number;
  size: number;
  face: Face;
  finish: Finish;
  grain: number;
  contrast: number;
  hue: number;
  engineVersion: string;
}

export interface GenerateOptions {
  prompt?: string;
  recipe?: MaterialRecipe | string | {
    id?: string;
    materialId?: string;
    modifiers?: string[];
    accent?: string;
    promptColor?: PromptColor;
    tint?: string;
    seed?: number;
    size?: number;
    face?: Face;
    finish?: Finish;
    grain?: number;
    contrast?: number;
    hue?: number;
  };
  materialId?: string;
  material?: string;
  seed?: number;
  size?: number;
  face?: Face;
  finish?: Finish;
  grain?: number;
  contrast?: number;
  hue?: number;
  modifiers?: string[] | string;
  accent?: string;
  tint?: string;
}

export interface GeneratedTexture {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  recipe: ResolvedRecipe;
  version: string;
}

export interface ParsedPrompt {
  materialId: string | null;
  modifiers: string[];
  color: { name: string; hex: string; hue: number; sat: number; light: number } | null;
  colorAsAccent: boolean;
  matchedColor: string | null;
}

export interface ColorWord {
  name: string;
  hex: string;
  hue: number;
  sat: number;
  words: string[];
  light?: number;
}

export interface Modifier {
  id: string;
  label: string;
  words: string[];
}

export interface FinishInfo {
  id: Finish;
  label: string;
  note: string;
}

export const ENGINE_VERSION: string;
export const MATERIALS: MaterialRecipe[];
export const MATERIAL_GROUPS: string[];
export const MODIFIERS: Modifier[];
export const MODIFIER_WORDS: Modifier[];
export const COLOR_WORDS: ColorWord[];
export const FINISHES: FinishInfo[];
export const FINISH_CONFIG: Record<Finish, { grain: number; depth: number; dither: number; clutter: number }>;

export function getMaterial(id: string): MaterialRecipe;
export function parsePrompt(text: string): ParsedPrompt;
export function listMaterials(): MaterialRecipe[];
export function listModifiers(): Modifier[];
export function textureTitle(materialId: string, modifiers?: string[]): string;
export function modifierLabel(id: string): string;
export interface GeneratedFace {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface GeneratedTextureSet {
  width: number;
  height: number;
  version: string;
  recipe: ResolvedRecipe;
  faces: { side: GeneratedFace; top: GeneratedFace; bottom: GeneratedFace };
}

export function generate(options?: GenerateOptions): GeneratedTexture;
export function generateSet(options?: GenerateOptions): GeneratedTextureSet;
export function renderTextureBuffer(params: Record<string, unknown>): {
  buffer: Uint8ClampedArray;
  size: number;
  face: Face;
  material: MaterialRecipe;
  palette: number[][];
  swatches: string[];
  accentSwatches: string[];
  overlayAccentSwatches: string[];
  modifiers: string[];
};
