/**
 * What **Start from a Minecraft texture** asks of the host (ADR 0129 D4): the textures of the
 * user's own Minecraft from the local asset cache (ADR 0011; `minecraft:listAssets` and
 * `minecraft:readAsset`), whether that cache is set up, and the way to set it up (Settings).
 * `App` provides it; without a provider (tests, previews) the buttons are not shown.
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';
import { animationMeta, type McTexture } from './catalogue';

/** The host side of the Minecraft texture picker. */
export interface MinecraftTexturesHost {
  /** Whether the user's Minecraft textures can be read (the Minecraft folder is set up). */
  ready: boolean;
  /** The cached jar paths below `assets/minecraft/textures/`, sidecars included. */
  list(): Promise<readonly string[]>;
  /** One cached jar file, or `null` when it is not there. */
  read(jarPath: string): Promise<Uint8Array | null>;
  /** Opens the Minecraft folder set-up (Settings). */
  openSetUp(): void;
}

/** Provided by `App`; `null` outside it. */
export const MinecraftTexturesContext = createContext<MinecraftTexturesHost | null>(null);

/** The Minecraft textures host, or `null` when none is provided. */
export function useMinecraftTextures(): MinecraftTexturesHost | null {
  return useContext(MinecraftTexturesContext);
}

/** A picked Minecraft texture: its picture and MSM's own animation sidecar for a strip. */
export interface McTexturePick {
  readonly texture: McTexture;
  /** The PNG as the user's jar has it, read now (never stored by MSM until the user saves). */
  readonly bytes: Uint8Array;
  /** {@link animationMeta} of the texture's sidecar, or `null` when it is not animated. */
  readonly mcmeta: Uint8Array | null;
}

/** Reads a picked texture (and its sidecar when animated). */
export async function readPick(
  host: Pick<MinecraftTexturesHost, 'read'>,
  texture: McTexture,
): Promise<McTexturePick> {
  const bytes = await host.read(texture.jarPath);
  if (bytes === null) {
    throw new Error(`${texture.name} is not in your Minecraft's textures any more.`);
  }
  const mcmeta = texture.animated
    ? animationMeta(await host.read(`${texture.jarPath}.mcmeta`).catch(() => null))
    : null;
  return { texture, bytes, mcmeta };
}
