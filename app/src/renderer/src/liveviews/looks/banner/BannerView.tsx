/**
 * A banner pattern on a banner and on a shield (ADR 0121 D5, B628), in a dye colour you pick
 * over a banner colour you pick. The pictures are the pattern's own two (`textures/entity/banner/`
 * and `textures/entity/shield/` under its `asset_id`) and, from the user's own jar, the banner's
 * and shield's base and base colour pictures; each layer is its picture times the dye's colour
 * (the target's `dyes`, B621), alpha-blended in order (3S6). Drawn flat (the front) and, with
 * WebGL, on B623's banner and shield shapes. About right: banners were measured on screen within
 * 5.4 of 255 on MSM's own patterns; shields were not measured.
 */

import { useId, useMemo, useState } from 'react';
import { useVeryEasy } from '../../../studios/very-easy';
import { resourceFoldersOf, wordsOfPath } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { factsOf } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { bannerShape, shieldShape } from '../bodies/shapes';
import { STAND_IN_WORDS, splitId } from '../particle/look-pictures';
import {
  type BannerLayer,
  type BannerPictureKind,
  composeBannerPicture,
  DEFAULT_BASE_DYE,
  DEFAULT_PATTERN_DYE,
  dyeNames,
  dyeRgb,
  FRONT,
} from './compose';
import {
  FlatPicture,
  recordOf,
  ShapeCanvas,
  stringOf,
  texturePathOf,
  useLookBytes,
  useSettled,
} from './look-parts';
import { cropPixels, type Pixels, readPixels, rgbToHex } from './pixels';

/** The jar paths of one kind's pictures: its base, its base colour mask and the pattern's mask. */
export function bannerPicturePaths(
  kind: BannerPictureKind,
  assetId: string | undefined,
  textures = 'textures',
): { base: string; baseMask: string; pattern: string | null } {
  const folder = `entity/${kind}`;
  return {
    base: texturePathOf(`minecraft:${kind}_base`, folder, textures),
    baseMask: texturePathOf('minecraft:base', folder, textures),
    pattern: assetId === undefined ? null : texturePathOf(assetId, folder, textures),
  };
}

const KINDS: readonly BannerPictureKind[] = ['banner', 'shield'];
const SHAPES = { banner: bannerShape(), shield: shieldShape() } as const;

/** The view; see the module comment. */
export default function BannerView(props: LiveViewProps) {
  const { project, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const data = useSettled(props.element.data);
  const assetId = stringOf(recordOf(data)?.asset_id);
  const facts = factsOf(project);
  const dyes = dyeNames(facts);
  const [patternDye, setPatternDye] = useState(DEFAULT_PATTERN_DYE);
  const [baseDye, setBaseDye] = useState(DEFAULT_BASE_DYE);
  const patternFieldId = useId();
  const baseFieldId = useId();
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const paths = useMemo(
    () =>
      Object.fromEntries(KINDS.map((kind) => [kind, bannerPicturePaths(kind, assetId, textures)])),
    [assetId, textures],
  ) as Record<BannerPictureKind, ReturnType<typeof bannerPicturePaths>>;
  const wanted = KINDS.flatMap((kind) => {
    const p = paths[kind];
    return [p.base, p.baseMask, ...(p.pattern === null ? [] : [p.pattern])];
  });
  const bytes = useLookBytes(wanted, { vanillaAssets, readProject });

  const patternRgb = dyeRgb(facts, patternDye);
  const baseRgb = dyeRgb(facts, baseDye);
  const pictures = useMemo(() => {
    if (bytes === null || patternRgb === null || baseRgb === null) return null;
    return Object.fromEntries(
      KINDS.map((kind) => {
        const p = paths[kind];
        const layers: BannerLayer[] = [{ mask: readPixels(bytes[p.baseMask]), dye: baseRgb }];
        const pattern = p.pattern === null ? null : readPixels(bytes[p.pattern]);
        if (pattern !== null) layers.push({ mask: pattern, dye: patternRgb });
        const whole = composeBannerPicture(kind, readPixels(bytes[p.base]), layers);
        return [kind, { whole, front: cropPixels(whole, FRONT[kind]) }];
      }),
    ) as Record<BannerPictureKind, { whole: Pixels; front: Pixels }>;
  }, [bytes, paths, patternRgb, baseRgb]);

  const folders = resourceFoldersOf(project);
  const missing = KINDS.filter((kind) => {
    const path = paths[kind].pattern;
    return bytes !== null && (path === null || readPixels(bytes[path]) === null);
  });
  const vanillaPattern = assetId !== undefined && splitId(assetId).namespace === 'minecraft';
  const notes = [
    'Each layer is its picture times the dye’s colour, laid over the one below in order, as the game does. The shield is drawn the same way; MSM has not compared shields with the game.',
    ...(vanillaAssets === null ? [STAND_IN_WORDS] : []),
    ...(assetId === undefined
      ? ['The pattern names no pictures yet (its asset id is empty).']
      : missing.map((kind) =>
          veryEasy
            ? `The pattern has no ${kind} picture yet.`
            : `The pattern has no ${kind} picture yet: ${paths[kind].pattern ?? ''}.`,
        )),
  ];
  const dyeWords = (name: string) => wordsOfPath(name);
  const controls = (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="flex flex-col gap-0.5" htmlFor={patternFieldId}>
        Pattern colour
        <select
          id={patternFieldId}
          data-testid="live-banner-dye"
          value={patternDye}
          onChange={(event) => setPatternDye(event.target.value)}
          className="rounded border border-border bg-surface px-1 py-0.5"
        >
          {dyes.map((name) => (
            <option key={name} value={name}>
              {dyeWords(name)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5" htmlFor={baseFieldId}>
        Banner colour
        <select
          id={baseFieldId}
          data-testid="live-banner-base-dye"
          value={baseDye}
          onChange={(event) => setBaseDye(event.target.value)}
          className="rounded border border-border bg-surface px-1 py-0.5"
        >
          {dyes.map((name) => (
            <option key={name} value={name}>
              {dyeWords(name)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <LiveViewFrame
      title="Banner pattern"
      fidelity="about_right"
      notes={notes}
      needsSetUp={vanillaAssets === null && vanillaPattern}
      onSetup={props.onSetup}
      controls={dyes.length > 0 ? controls : undefined}
    >
      {dyes.length === 0 || patternRgb === null || baseRgb === null ? (
        <p role="status" className="text-sm text-muted" data-testid="live-banner-message">
          This Minecraft version gives MSM no dye colours, so the pattern cannot be coloured here.
        </p>
      ) : pictures === null ? (
        <p className="text-sm text-muted">Reading the pictures…</p>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          {KINDS.map((kind) => (
            <figure
              key={kind}
              className="m-0 flex flex-col items-center gap-1 text-xs text-muted"
              data-testid={`live-banner-${kind}`}
              data-pattern-dye={rgbToHex(patternRgb)}
              data-base-dye={rgbToHex(baseRgb)}
            >
              <FlatPicture
                pixels={pictures[kind].front}
                scale={kind === 'banner' ? 4 : 6}
                label={`The pattern in ${dyeWords(patternDye).toLowerCase()} on a ${dyeWords(baseDye).toLowerCase()} ${kind}`}
                testId={`live-banner-${kind}-front`}
              />
              <figcaption>{kind === 'banner' ? 'On a banner' : 'On a shield'}</figcaption>
              <ShapeCanvas
                geo={SHAPES[kind]}
                pixels={pictures[kind].whole}
                name={kind}
                folders={folders}
                testId={`live-banner-${kind}-canvas`}
              />
            </figure>
          ))}
        </div>
      )}
    </LiveViewFrame>
  );
}
