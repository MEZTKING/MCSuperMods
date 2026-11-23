/**
 * A decorated pot pattern on a pot (ADR 0121 D5, B628): the pattern's picture
 * (`textures/entity/decorated_pot/` under its `asset_id`) on the sides you tick (all four at
 * first), the plain side from the user's own jar on the rest, drawn flat side by side and, with
 * WebGL, on B623's pot shape. About right: the pot is MSM's own shape and was not measured.
 */

import { useMemo, useState } from 'react';
import { useVeryEasy } from '../../../studios/very-easy';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import {
  FlatPicture,
  recordOf,
  ShapeCanvas,
  stringOf,
  texturePathOf,
  useLookBytes,
  useSettled,
} from '../banner/look-parts';
import { cropPixels, readPixels } from '../banner/pixels';
import { POT_ATLAS, potShape } from '../bodies/shapes';
import { STAND_IN_WORDS, splitId } from '../particle/look-pictures';
import { composePotPicture, POT_SIDES, type PotSide } from './compose';

const POT_GEO = potShape();

const SIDE_WORDS: Readonly<Record<PotSide, string>> = {
  north: 'Front',
  east: 'Right',
  south: 'Back',
  west: 'Left',
};

/** The jar path of a pot pattern's picture. */
export function potPatternPath(assetId: string, textures = 'textures'): string {
  return texturePathOf(assetId, 'entity/decorated_pot', textures);
}

/** The jar path of the plain side. */
export const POT_SIDE_PATH =
  'assets/minecraft/textures/entity/decorated_pot/decorated_pot_side.png';

/** The view; see the module comment. */
export default function PotPatternView(props: LiveViewProps) {
  const { project, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const data = useSettled(props.element.data);
  const assetId = stringOf(recordOf(data)?.asset_id);
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const patternPath = assetId === undefined ? null : potPatternPath(assetId, textures);
  const sidePath = POT_SIDE_PATH.replace('/textures/', `/${textures}/`);
  const bytes = useLookBytes(patternPath === null ? [sidePath] : [patternPath, sidePath], {
    vanillaAssets,
    readProject,
  });
  const [patterned, setPatterned] = useState<ReadonlySet<PotSide>>(() => new Set(POT_SIDES));
  const composed = useMemo(() => {
    if (bytes === null) return null;
    const found = patternPath === null ? null : readPixels(bytes[patternPath]);
    return {
      pattern: found,
      picture: composePotPicture(found, readPixels(bytes[sidePath]), patterned),
    };
  }, [bytes, patternPath, sidePath, patterned]);
  const pattern = composed?.pattern ?? null;
  const picture = composed?.picture ?? null;
  const notes = [
    'Drawn on MSM’s own pot shape; the game’s light is not shown.',
    ...(vanillaAssets === null ? [STAND_IN_WORDS] : []),
    ...(assetId === undefined
      ? ['The pattern names no picture yet (its asset id is empty).']
      : bytes !== null && pattern === null
        ? [
            veryEasy
              ? 'The pattern has no picture yet: its sides show plain clay.'
              : `The pattern has no picture yet: ${patternPath ?? ''}. Its sides show plain clay.`,
          ]
        : []),
  ];
  const toggle = (side: PotSide) => {
    const next = new Set(patterned);
    if (next.has(side)) next.delete(side);
    else next.add(side);
    setPatterned(next);
  };
  const controls = (
    <fieldset className="flex flex-wrap items-center gap-3 text-xs">
      <legend className="sr-only">Sides with the pattern</legend>
      {POT_SIDES.map((side) => (
        <label key={side} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={patterned.has(side)}
            data-testid={`live-pot-side-${side}`}
            onChange={() => toggle(side)}
          />
          {SIDE_WORDS[side]}
        </label>
      ))}
    </fieldset>
  );
  const vanillaPattern = assetId !== undefined && splitId(assetId).namespace === 'minecraft';
  return (
    <LiveViewFrame
      title="Pot pattern"
      fidelity="about_right"
      notes={notes}
      needsSetUp={vanillaAssets === null && vanillaPattern}
      onSetup={props.onSetup}
      controls={controls}
    >
      {picture === null ? (
        <p className="text-sm text-muted">Reading the pictures…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <ol
            className="flex flex-wrap gap-2"
            aria-label="The pot’s four sides"
            data-testid="live-pot"
          >
            {POT_SIDES.map((side) => (
              <li
                key={side}
                className="flex flex-col items-center gap-1 text-xs text-muted"
                data-testid={`live-pot-face-${side}`}
                data-patterned={patterned.has(side) && pattern !== null}
              >
                <FlatPicture
                  pixels={cropPixels(picture, POT_ATLAS.sides[side])}
                  scale={4}
                  label={`${SIDE_WORDS[side]} side`}
                />
                {SIDE_WORDS[side]}
              </li>
            ))}
          </ol>
          <ShapeCanvas
            geo={POT_GEO}
            pixels={picture}
            name="pot"
            folders={resourceFoldersOf(project)}
            testId="live-pot-canvas"
          />
        </div>
      )}
    </LiveViewFrame>
  );
}
