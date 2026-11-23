/**
 * The live view of `minecraft:particle` (ADR 0121 D7, B625): the description's sprites played in
 * order over a life you pick, as the Particle Studio plays its own frames (`particle-sim.ts`'s
 * "age" animation: frame = age x frames / life), with every sprite in a strip below. Pictures
 * come from the project, then from the user's own jar (`textures/particle`, B621). A sprite with
 * no picture is marked and named. Under reduced motion nothing plays until Play is pressed.
 * Follows an edit at once: the view reads the element as it is now.
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useId, useMemo, useState } from 'react';
import { inputClass } from '../../../forms';
import { particleFrames, spriteAsset } from '../../../studios/blocks-items/particle-model';
import { useVeryEasy } from '../../../studios/very-easy';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { factsOf } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { PixelPicture } from './LookPicture';
import {
  isVanillaPath,
  type PictureState,
  prefersReducedMotion,
  STAND_IN_WORDS,
  useLookPictures,
} from './look-pictures';

/** The notes under the view. */
export const PARTICLE_SPRITES_NOTES: readonly string[] = [
  'Which sprite shows when is up to the particle’s own code: many play in order over their life, some pick one at random.',
  'Drawn flat: the game draws it in the world, facing you, in its own size and colour.',
];

/** The life a sprite list is played over when the viewer has not picked one, in ticks. */
export const DEFAULT_PARTICLE_LIFE = 20;
const TICK_MS = 50;

/** The sprite shown at `age` ticks of a `life`-tick life (the Particle Studio's "age" rule). */
export function spriteAtAge(age: number, life: number, count: number): number {
  if (count <= 1) return 0;
  const span = Math.max(1, life);
  return Math.min(count - 1, Math.floor((Math.max(0, age % span) * count) / span));
}

/** Words for sprite `index`: its id, or "Picture n" in Very easy. */
function spriteWords(sprite: string, index: number, veryEasy: boolean): string {
  return veryEasy || sprite === '' ? `Picture ${index + 1}` : sprite;
}

function SpriteBox(props: { picture: PictureState | undefined; size: number; label: string }) {
  const { picture, size } = props;
  if (picture?.state === 'found') {
    return <PixelPicture url={picture.url} width={size} height={size} label={props.label} />;
  }
  return (
    <span
      role="img"
      aria-label={props.label}
      className="flex items-center justify-center rounded border border-dashed border-border text-muted text-xs"
      style={{ width: size, height: size }}
    >
      {picture?.state === 'loading' ? '' : '?'}
    </span>
  );
}

/** The view; see the module comment. */
export default function ParticleSprites(props: LiveViewProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const lifeId = useId();
  const sprites = particleFrames(element.data as Json);
  const facts = factsOf(project);
  // Keyed by the list as text, so a new array of the same sprites does not reload.
  const spriteKey = JSON.stringify(sprites);
  const paths = useMemo(
    () =>
      (JSON.parse(spriteKey) as string[]).map((sprite) =>
        sprite === '' ? null : (spriteAsset(facts ?? undefined, sprite)?.assetPath ?? null),
      ),
    [spriteKey, facts],
  );
  const pictures = useLookPictures(paths, { vanillaAssets, readProject });
  const [life, setLife] = useState(DEFAULT_PARTICLE_LIFE);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [age, setAge] = useState(0);
  useEffect(() => {
    if (!playing || sprites.length <= 1) return;
    const timer = setInterval(() => setAge((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, sprites.length]);

  const current = spriteAtAge(age, life, sprites.length);
  const wantsVanilla = paths.some((path) => path !== null && isVanillaPath(path));
  const notSetUp = wantsVanilla && vanillaAssets === null;
  const missing = sprites
    .map((sprite, index) => ({ sprite, index, picture: pictures[index] }))
    .filter((entry) => entry.picture?.state === 'missing')
    .filter(
      (entry) =>
        !(notSetUp && paths[entry.index] !== null && isVanillaPath(paths[entry.index] ?? '')),
    );
  const notes = [
    ...PARTICLE_SPRITES_NOTES,
    ...(notSetUp ? [STAND_IN_WORDS] : []),
    ...missing.map(
      (entry) =>
        `${spriteWords(entry.sprite, entry.index, veryEasy)} has no picture yet: it shows as a question mark.`,
    ),
  ];

  const controls = sprites.length > 1 && (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={lifeId} className="text-muted">
          Life (ticks)
        </label>
        <input
          id={lifeId}
          type="number"
          min={1}
          max={400}
          className={`${inputClass} w-20`}
          data-testid="particle-sprites-life"
          value={life}
          onChange={(event) => {
            const next = Math.round(Number(event.target.value));
            if (Number.isFinite(next) && next >= 1) setLife(Math.min(400, next));
          }}
        />
      </div>
      <button
        type="button"
        className="rounded border border-border px-2 py-1"
        data-testid="particle-sprites-play"
        aria-pressed={playing}
        onClick={() => setPlaying((value) => !value)}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="rounded border border-border px-2 py-1"
        data-testid="particle-sprites-step"
        onClick={() => {
          setPlaying(false);
          setAge((value) => value + Math.max(1, Math.round(life / sprites.length)));
        }}
      >
        Next sprite
      </button>
    </div>
  );

  return (
    <LiveViewFrame
      title="Particle sprites"
      fidelity="about_right"
      notes={notes}
      needsSetUp={notSetUp}
      onSetup={props.onSetup}
      controls={controls}
    >
      {sprites.length === 0 ? (
        <p className="text-muted text-sm" data-testid="particle-sprites-empty">
          No sprites yet: add a picture to the list.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="flex h-24 w-24 items-center justify-center rounded border border-border bg-black/80"
            data-testid="particle-sprites-current"
            data-index={current}
          >
            <SpriteBox
              picture={pictures[current]}
              size={64}
              label={`Now showing ${spriteWords(sprites[current] ?? '', current, veryEasy)}`}
            />
          </div>
          <ol className="flex flex-wrap gap-2" aria-label="Sprites in order">
            {sprites.map((sprite, index) => (
              <li
                key={`${sprite}-${index}`}
                className={`flex flex-col items-center gap-0.5 rounded p-1 text-xs ${
                  index === current ? 'bg-accent/20' : ''
                }`}
                data-testid={`particle-sprites-frame-${index}`}
                data-state={pictures[index]?.state ?? 'loading'}
              >
                <SpriteBox
                  picture={pictures[index]}
                  size={32}
                  label={spriteWords(sprite, index, veryEasy)}
                />
                <span className="max-w-20 truncate text-muted">{index + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </LiveViewFrame>
  );
}
