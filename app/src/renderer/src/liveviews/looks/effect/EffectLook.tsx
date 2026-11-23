/**
 * The look of `msm:effect` (ADR 0121 D1, D7, B625): the icon in the corner frame of the screen
 * (24 by 24 with the 18 by 18 icon inset 3, and the beacon's faint frame beside it; B619 3S11),
 * the inventory's 120 by 32 panel with the icon, name and a time, and the swirl in the effect's
 * colour (the `entity_effect` particle's sprites, tinted). The frames and sprites are the user's
 * own GUI and particle pictures from the jar, or MSM's plain drawing when the Minecraft folder is
 * not set up. The live view keeps B615's card (name, levels) below. Follows an edit at once.
 *
 * The default export is the live view; {@link EffectLookFrame} is what the Effect Studio's
 * Preview draws above its own card.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { type ReactNode, useMemo } from 'react';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { EffectPreviewCard, useIconThumbnail } from '../../../studios/blocks-items/EffectPreview';
import { effectDisplayName, effectIconPath } from '../../../studios/blocks-items/effect-model';
import { usePlain } from '../../../studios/plain';
import { BundleHost } from '../../existing/bundle-host';
import { resourceFoldersOf, wordsOfPath } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { PixelPicture } from '../particle/LookPicture';
import {
  cssColour,
  type PictureState,
  STAND_IN_WORDS,
  useLookPicture,
  useLookPictures,
} from '../particle/look-pictures';

/** GUI scale the frames are drawn at. */
const SCALE = 2;
/** The swirl's sprites, as vanilla's `entity_effect` description lists them (both targets). */
const SWIRL_SPRITES = [7, 6, 5, 4, 3, 2, 1, 0].map((n) => `effect_${n}`);

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

/** The notes under the view. */
export const EFFECT_LOOK_NOTES: readonly string[] = [
  'The frames are drawn as the game lays them out; the time is an example.',
];

/** The effect's colour as `#rrggbb`, or `null` when it has none. */
export function effectColourOf(data: Json | undefined): string | null {
  const colour = asObject(data).color;
  return typeof colour === 'number' ? cssColour(colour) : null;
}

function Icon(props: { icon: PictureState; colour: string; label: string; testId: string }) {
  const size = 18 * SCALE;
  return props.icon.state === 'found' ? (
    <PixelPicture
      url={props.icon.url}
      width={size}
      height={size}
      label={props.label}
      testId={props.testId}
    />
  ) : (
    <span
      role="img"
      aria-label={props.label}
      data-testid={props.testId}
      className="block rounded-sm"
      style={{ width: size, height: size, background: props.colour, opacity: 0.8 }}
    />
  );
}

/** The corner frame (normal or a beacon's faint one) with the icon inset 3. */
function HudFrame(props: {
  frame: PictureState;
  icon: PictureState;
  colour: string;
  label: string;
  ambient: boolean;
}) {
  const s = (value: number) => value * SCALE;
  return (
    <div
      className="relative"
      style={{ width: s(24), height: s(24) }}
      data-testid={props.ambient ? 'effect-look-hud-ambient' : 'effect-look-hud'}
      data-drawn={props.frame.state === 'found' ? 'jar' : 'msm'}
    >
      {props.frame.state === 'found' ? (
        <PixelPicture url={props.frame.url} width={s(24)} height={s(24)} layer />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 rounded"
          style={{
            background: props.ambient ? '#2e4a5e' : '#3c3c3c',
            border: `${SCALE}px solid ${props.ambient ? '#7fb3d5' : '#8b8b8b'}`,
          }}
        />
      )}
      <span className="absolute" style={{ left: s(3), top: s(3) }}>
        <Icon
          icon={props.icon}
          colour={props.colour}
          label={props.label}
          testId="effect-look-hud-icon"
        />
      </span>
    </div>
  );
}

/** The inventory's panel: a 32 by 32 nine-slice picture (border 4) stretched to 120 by 32. */
function InventoryPanel(props: {
  panel: PictureState;
  icon: PictureState;
  colour: string;
  name: string;
}) {
  const s = (value: number) => value * SCALE;
  const look =
    props.panel.state === 'found'
      ? {
          borderStyle: 'solid',
          borderWidth: s(4),
          borderImageSource: `url("${props.panel.url}")`,
          borderImageSlice: '4 fill',
          borderImageRepeat: 'stretch',
          imageRendering: 'pixelated' as const,
        }
      : { background: '#c6c6c6', border: `${SCALE}px solid #555`, borderRadius: SCALE * 2 };
  return (
    <div
      className="relative box-border"
      style={{ width: s(120), height: s(32), ...look }}
      data-testid="effect-look-panel"
      data-drawn={props.panel.state === 'found' ? 'jar' : 'msm'}
    >
      <span className="absolute" style={{ left: s(3), top: s(3) }}>
        <Icon
          icon={props.icon}
          colour={props.colour}
          label={props.name}
          testId="effect-look-panel-icon"
        />
      </span>
      <span
        className="absolute truncate"
        style={{
          left: s(24),
          top: s(2),
          maxWidth: s(88),
          color: '#ffffff',
          fontSize: s(8) - 2,
          textShadow: '2px 2px #3f3f3f',
        }}
        data-testid="effect-look-panel-name"
      >
        {props.name}
      </span>
      <span
        className="absolute"
        style={{
          left: s(24),
          top: s(12),
          color: '#7f7f7f',
          fontSize: s(8) - 2,
          textShadow: '2px 2px #1f1f1f',
        }}
      >
        0:30
      </span>
    </div>
  );
}

/** Props of {@link EffectLookFrame}. */
export interface EffectLookFrameProps {
  readonly project: Project;
  readonly element: Element;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  /** Shown below the frames (the live view's card), or nothing. */
  readonly children?: ReactNode;
}

/** The frames and the swirl in the view's frame; see the module comment. */
export function EffectLookFrame(props: EffectLookFrameProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = usePlain();
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const source = { vanillaAssets, readProject };
  const gui = `assets/minecraft/${textures}/gui/sprites`;
  const [hud, hudAmbient, panel] = useLookPictures(
    [
      `${gui}/hud/effect_background.png`,
      `${gui}/hud/effect_background_ambient.png`,
      `${gui}/container/inventory/effect_background.png`,
    ],
    source,
  );
  const icon = useLookPicture(effectIconPath(element.id).assetPath, source);
  const swirlPaths = useMemo(
    () => SWIRL_SPRITES.map((sprite) => `assets/minecraft/${textures}/particle/${sprite}.png`),
    [textures],
  );
  const swirl = useLookPictures(swirlPaths, source);
  const data = asObject(element.data);
  const colour = effectColourOf(element.data);
  const shown = colour ?? '#808080';
  const name = effectDisplayName(element);
  const particle = typeof data.particle === 'string' && data.particle !== '' ? data.particle : null;
  const loading: PictureState = { state: 'loading' };
  const notes = [
    ...EFFECT_LOOK_NOTES,
    ...(icon.state === 'missing'
      ? ['The effect has no icon picture yet: its colour shows in its place.']
      : []),
    ...(particle === null
      ? []
      : [
          `It shows ${veryEasy ? wordsOfPath(particle) : particle} around the player in place of the swirl; that particle is played in the game only.`,
        ]),
    ...(vanillaAssets === null ? [STAND_IN_WORDS] : []),
  ];
  return (
    <LiveViewFrame title="Status effect" fidelity="about_right" notes={notes}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <figure className="flex flex-col items-center gap-1 text-xs">
            <div className="flex gap-1 rounded bg-black/70 p-2">
              <HudFrame
                frame={hud ?? loading}
                icon={icon}
                colour={shown}
                label={name}
                ambient={false}
              />
              <HudFrame
                frame={hudAmbient ?? loading}
                icon={icon}
                colour={shown}
                label={`${name} from a beacon`}
                ambient
              />
            </div>
            <figcaption className="text-muted">Corner of the screen (and from a beacon)</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1 text-xs">
            <InventoryPanel panel={panel ?? loading} icon={icon} colour={shown} name={name} />
            <figcaption className="text-muted">In the inventory</figcaption>
          </figure>
        </div>
        <figure
          className="flex flex-col gap-1 text-xs"
          data-testid="effect-look-swirl"
          data-colour={colour ?? ''}
        >
          <div className="flex flex-wrap items-center gap-1 rounded bg-black/70 p-2">
            {colour === null ? (
              <span className="text-white">No colour set.</span>
            ) : (
              SWIRL_SPRITES.map((sprite, index) => {
                const picture = swirl[index];
                return picture?.state === 'found' ? (
                  <PixelPicture
                    key={sprite}
                    url={picture.url}
                    width={16}
                    height={16}
                    tint={colour}
                  />
                ) : (
                  <span
                    key={sprite}
                    aria-hidden
                    className="inline-block rounded-full"
                    style={{
                      width: 6 + (index % 4) * 2,
                      height: 6 + (index % 4) * 2,
                      background: colour,
                    }}
                  />
                );
              })
            )}
          </div>
          <figcaption className="text-muted">
            {particle === null
              ? 'The swirl around a player who has it'
              : 'Its own particle replaces the swirl'}
          </figcaption>
        </figure>
        {props.children}
      </div>
    </LiveViewFrame>
  );
}

function Card({ element }: { element: Element }) {
  const icon = useIconThumbnail(effectIconPath(element.id).assetPath, true);
  return <EffectPreviewCard element={element} iconUrl={icon} testId="live-effect" />;
}

/** The live view; see the module comment. */
export default function EffectLook(props: LiveViewProps) {
  return (
    <EffectLookFrame
      project={props.project}
      element={props.element}
      vanillaAssets={props.vanillaAssets}
      readProject={props.readProject}
    >
      <BundleHost
        project={props.project}
        readProject={props.readProject}
        vanillaAssets={props.vanillaAssets}
        models
      >
        <Card element={props.element} />
      </BundleHost>
    </EffectLookFrame>
  );
}
