/**
 * Particle Studio (B353, ADR 0081 D1) for `msm:particle` element data (ADR 0080 D1), loaded
 * with `React.lazy` from `studios.tsx` so its code is a chunk of its own:
 *
 * - Pictures: the frames in order (a project sprite `<ns>:<name>`, the picture
 *   `textures/particle/<name>.png`, or a vanilla sprite id), "Add frame", reorder, remove,
 *   "Paint" and "New picture" (the texture editor at 8 by 8), "Draw frames…" (four drawn
 *   frames `<id>_0` to `<id>_3` in one undo step, ADR 0092 D10), "Split a strip into frames"
 *   (one PNG cut into `<id>_<n>` frames in one undo step, ADR 0045) and "Animation".
 * - Life and size: "Lifetime" (one number or "Between" two), "Size", "Size at the end".
 * - Movement: "Gravity" with "Floats up", "None" and "Falls", "Drag", "Stops on blocks",
 *   "Spin".
 * - Colour and light: "Tint", "Tint at the end", "Opacity", "Fade", "Glows in the dark",
 *   "See-through", "Show from far away".
 * - Preview: `ParticlePreview`, a 2D canvas driven by `particle-sim.ts`.
 *
 * Every change is one undoable edit; everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, Paintbrush, X } from 'lucide-react';
import { useState } from 'react';
import { MakeWithAiButton } from '../../components/ai-pictures/MakeWithAiButton';
import { defaultPrompt } from '../../components/ai-pictures/prompt';
import { particleShape } from '../../components/ai-pictures/shapes';
import { textureChange } from '../../components/ai-pictures/texture-write';
import { DrawButton } from '../../components/art/DrawButton';
import type { DrawnPicture } from '../../components/art/draw-model';
import { pictureChange } from '../../components/mc-textures/picture-change';
import { StartFromMinecraftButton } from '../../components/mc-textures/StartFromMinecraftButton';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { IdInput, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { plainIdWords, usePlainWords } from '../very-easy-things';
import { ColourField } from '../worldgen/ColourField';
import { AdvancedToggle, Section } from '../worldgen/parts';
import { asObject, moved, pathSetter, pointerOf } from './blocks-items-model';
import { LabelledChoice } from './EventsEditor';
import { useBlocksItemsStudioHost } from './host';
import { ParticlePreview } from './ParticlePreview';
import {
  FRAME_LAYOUT_LABELS,
  FRAME_LAYOUTS,
  type FrameLayout,
  MAX_FRAMES,
  splitPicture,
} from './particle-frames';
import {
  ANIMATION_LABELS,
  defaultTranslucent,
  FADE_LABELS,
  GRAVITY_SHORTCUTS,
  hasSpritePicture,
  isLifetimeRange,
  isVanillaSprite,
  lifetimeWithRange,
  NEW_PICTURE_SIZE,
  nextFrameSprite,
  particleFrames,
  projectSprites,
  splitChangeset,
  spriteAsset,
} from './particle-model';
import { CheckField, ProblemsAt } from './parts';

const ANIMATIONS = Object.keys(ANIMATION_LABELS);
const FADES = Object.keys(FADE_LABELS);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function ParticleStudio(props: StudioProps) {
  const { project, element, problems, onChange, target } = props;
  const host = useBlocksItemsStudioHost();
  const [advanced, setAdvanced] = useState(false);
  // Very easy names the frames' pictures, never their ids (ADR 0083 D3).
  const veryEasy = useVeryEasy();
  const words = usePlainWords();
  const [layout, setLayout] = useState<FrameLayout>('horizontal');
  const [splitCount, setSplitCount] = useState<number | undefined>(undefined);
  const [splitColumns, setSplitColumns] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const frames = particleFrames(element.data);
  const sprites = projectSprites(project, target);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const number = (key: string, label: string, testId: string, integer = false) => (
    <NumberField
      label={label}
      value={data[key]}
      allowEmpty
      integer={integer}
      testId={testId}
      onCommit={(value) => set([key], value, typingKey(`/${key}`))}
    />
  );

  if (advanced) {
    return (
      <section
        aria-label="Particle Studio"
        data-testid="particle-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="particle-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const setFrames = (next: readonly string[]) => set(['textures'], [...next]);
  const paint = (sprite: string) => {
    const asset = spriteAsset(target, sprite);
    if (host === null || asset === undefined) return;
    host.paintTexture(asset.namespace, asset.path, { ...NEW_PICTURE_SIZE });
  };
  const split = async (file: File) => {
    if (host?.applyChanges === undefined) {
      setStatus({ text: 'Splitting needs the full app (it writes picture files).', error: true });
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pictures = await splitPicture(bytes, {
        layout,
        frames: splitCount,
        columns: layout === 'grid' ? splitColumns : undefined,
      });
      const change = splitChangeset(project, target, element, pictures);
      await host.applyChanges(change.items, `Split ${file.name} into frames`, change.writes);
      setStatus({
        text: `Split into ${change.sprites.length} frames, ${change.sprites[0]} to ${change.sprites.at(-1)}. Undo puts the old frames back.`,
        error: false,
      });
    } catch (error) {
      setStatus({ text: messageOf(error), error: true });
    }
  };

  /** The four drawn frames as `<id>_0` to `<id>_3`, pictures and list in one undo step. */
  const drawFrames = async (picture: DrawnPicture) => {
    if (host?.applyChanges === undefined) {
      throw new Error('Drawing needs the full app (it writes picture files).');
    }
    const change = splitChangeset(project, target, element, picture.pngs);
    await host.applyChanges(change.items, 'Draw frames', change.writes);
    setStatus({
      text: `Drew ${change.sprites.length} frames, ${change.sprites[0]} to ${change.sprites.at(-1)}. Undo puts the old frames back.`,
      error: false,
    });
  };

  const life = data.lifetime;
  const range = isLifetimeRange(element.data);
  const lifeRange = asObject(life);
  const translucent =
    typeof data.translucent === 'boolean' ? data.translucent : defaultTranslucent(element.data);

  const pictures = (
    <Section title="Pictures" testId="particle-pictures">
      <ol className="flex flex-col gap-1" data-testid="particle-frames">
        {frames.map((sprite, index) => {
          const missing = !hasSpritePicture(project, target, sprite);
          return (
            <li
              key={`${index}-${sprite}`}
              className="flex flex-wrap items-center gap-1 text-xs"
              data-testid={`particle-frame-${index}`}
            >
              <span className="w-14 text-muted">Frame {index + 1}</span>
              {veryEasy ? (
                <span className="w-56" data-testid={`particle-frame-${index}-sprite`}>
                  {plainIdWords(project, sprite)}
                </span>
              ) : (
                <IdInput
                  value={sprite}
                  label={`Frame ${index + 1}`}
                  testId={`particle-frame-${index}-sprite`}
                  className="w-56 font-mono"
                  placeholder="mymod:spark_0"
                  suggestions={(text) =>
                    sprites.filter(
                      (id) => id.startsWith(text) || id.split(':')[1]?.startsWith(text) === true,
                    )
                  }
                  onCommit={(text) =>
                    setFrames(frames.map((entry, at) => (at === index ? text.trim() : entry)))
                  }
                />
              )}
              {isVanillaSprite(sprite) ? (
                <span className="text-muted">vanilla picture</span>
              ) : (
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Paint frame ${index + 1}`}
                  title="Paint this picture"
                  data-testid={`particle-frame-${index}-paint`}
                  disabled={host === null}
                  onClick={() => paint(sprite)}
                >
                  <Paintbrush size={12} aria-hidden />
                </button>
              )}
              {!isVanillaSprite(sprite) &&
                host?.applyChanges !== undefined &&
                spriteAsset(target, sprite) !== undefined && (
                  <MakeWithAiButton
                    testId={`particle-frame-${index}-ai`}
                    target={sprite}
                    defaultPrompt={defaultPrompt(sprite.replace(/_\d+$/, ''), 'particle')}
                    defaultStyle="particle"
                    size={NEW_PICTURE_SIZE.width}
                    maxSize={NEW_PICTURE_SIZE.width}
                    shape={particleShape(NEW_PICTURE_SIZE.width)}
                    onPick={async (bytes) => {
                      const asset = spriteAsset(target, sprite);
                      if (asset === undefined || host.applyChanges === undefined) return;
                      const change = textureChange(project, asset.namespace, asset.path, bytes);
                      await host.applyChanges(
                        change.items,
                        `Make with AI ${sprite}`,
                        change.writes,
                      );
                    }}
                  />
                )}
              {!isVanillaSprite(sprite) &&
                host?.applyChanges !== undefined &&
                spriteAsset(target, sprite) !== undefined && (
                  <StartFromMinecraftButton
                    testId={`particle-frame-${index}-minecraft`}
                    target={`frame ${index + 1}`}
                    folder="particle"
                    onPick={async (pick) => {
                      const asset = spriteAsset(target, sprite);
                      if (asset === undefined || host.applyChanges === undefined) return;
                      const change = pictureChange(
                        project,
                        asset.namespace,
                        asset.path,
                        pick.bytes,
                        pick.mcmeta,
                      );
                      await host.applyChanges(
                        change.items,
                        `Start ${sprite} from ${pick.texture.name}`,
                        change.writes,
                      );
                    }}
                  />
                )}
              {missing && (
                <span
                  role="status"
                  className="text-warning"
                  data-testid={`particle-frame-${index}-missing`}
                >
                  No picture yet
                </span>
              )}
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Move frame ${index + 1} up`}
                data-testid={`particle-frame-${index}-up`}
                disabled={index === 0}
                onClick={() => setFrames(moved(frames, index, index - 1))}
              >
                <ArrowUp size={12} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Move frame ${index + 1} down`}
                data-testid={`particle-frame-${index}-down`}
                disabled={index === frames.length - 1}
                onClick={() => setFrames(moved(frames, index, index + 1))}
              >
                <ArrowDown size={12} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove frame ${index + 1}`}
                data-testid={`particle-frame-${index}-remove`}
                disabled={frames.length <= 1}
                onClick={() => setFrames(frames.filter((_, at) => at !== index))}
              >
                <X size={12} aria-hidden />
              </button>
              {at(['textures', index])}
            </li>
          );
        })}
      </ol>
      {at(['textures'])}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={buttonClass}
          data-testid="particle-add-frame"
          disabled={frames.length >= MAX_FRAMES}
          onClick={() => setFrames([...frames, nextFrameSprite(element.id, frames)])}
        >
          Add frame
        </button>
        <button
          type="button"
          className={buttonClass}
          data-testid="particle-new-picture"
          disabled={frames.length >= MAX_FRAMES || host === null}
          title="Add a frame and paint its picture (8 by 8)"
          onClick={() => {
            const sprite = nextFrameSprite(element.id, frames);
            setFrames([...frames, sprite]);
            paint(sprite);
          }}
        >
          New picture
        </button>
        <DrawButton
          testId="particle-draw-frames"
          label="Draw frames…"
          target={element.id}
          field={{
            kinds: ['particle'],
            width: NEW_PICTURE_SIZE.width,
            height: NEW_PICTURE_SIZE.height,
            name: element.id,
          }}
          disabled={host?.applyChanges === undefined}
          title={
            host?.applyChanges === undefined
              ? 'Drawing needs the full app (it writes picture files).'
              : 'Draw all four frames in a Minecraft-like style, in one step'
          }
          onPick={drawFrames}
        />
      </div>
      {veryEasy ? (
        <p className="text-muted text-xs">
          Each frame is a picture of 8 by 8 or 16 by 16; paint it, draw the frames or make them with
          AI.
        </p>
      ) : (
        <p className="text-muted text-xs">
          A project picture <code>mymod:spark_0</code> is the file{' '}
          <code>textures/particle/spark_0.png</code> (8 by 8 or 16 by 16); vanilla pictures such as{' '}
          <code>minecraft:generic_0</code> or <code>minecraft:glow</code> come from the game.
        </p>
      )}
      <div
        className="flex flex-wrap items-end gap-2 rounded border border-border p-2"
        data-testid="particle-split"
      >
        <LabelledChoice
          label="Split a strip into frames"
          value={layout}
          labels={FRAME_LAYOUT_LABELS}
          order={FRAME_LAYOUTS}
          testId="particle-split-layout"
          onChange={(next) => setLayout(next as FrameLayout)}
        />
        <NumberField
          label="Frames (empty: square frames)"
          value={splitCount}
          integer
          allowEmpty
          testId="particle-split-count"
          onCommit={setSplitCount}
        />
        {layout === 'grid' && (
          <NumberField
            label="Columns"
            value={splitColumns}
            integer
            allowEmpty
            testId="particle-split-columns"
            onCommit={setSplitColumns}
          />
        )}
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted">Picture to split (PNG)</span>
          <input
            type="file"
            accept="image/png"
            aria-label="Picture to split into frames"
            className={inputClass}
            data-testid="particle-split-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) void split(file);
            }}
          />
        </label>
      </div>
      {status !== null && (
        <p
          role="status"
          className={status.error ? 'text-error text-xs' : 'text-muted text-xs'}
          data-testid="particle-split-status"
        >
          {words(status.text)}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <LabelledChoice
          label="Animation"
          value={typeof data.animation === 'string' ? data.animation : 'age'}
          labels={ANIMATION_LABELS}
          order={ANIMATIONS}
          testId="particle-animation"
          onChange={(next) => set(['animation'], next === 'age' ? undefined : next)}
        />
        {data.animation === 'loop' &&
          number('frame_ticks', 'Ticks per frame', 'particle-frame-ticks', true)}
      </div>
      {at(['animation'])}
      {at(['frame_ticks'])}
    </Section>
  );

  const lifeAndSize = (
    <Section title="Life and size" testId="particle-life">
      <div className="flex flex-wrap items-end gap-2">
        {range ? (
          <>
            <NumberField
              label="Lifetime from (ticks)"
              value={lifeRange.min}
              integer
              testId="particle-lifetime-min"
              onCommit={(value) => {
                if (value !== undefined)
                  set(['lifetime', 'min'], value, typingKey('/lifetime/min'));
              }}
            />
            <NumberField
              label="Lifetime to (ticks)"
              value={lifeRange.max}
              integer
              testId="particle-lifetime-max"
              onCommit={(value) => {
                if (value !== undefined)
                  set(['lifetime', 'max'], value, typingKey('/lifetime/max'));
              }}
            />
          </>
        ) : (
          number('lifetime', 'Lifetime (ticks)', 'particle-lifetime', true)
        )}
        <CheckField
          label="Between"
          checked={range}
          testId="particle-lifetime-between"
          onChange={(checked) => set(['lifetime'], lifetimeWithRange(life, checked))}
        />
      </div>
      <p className="text-muted text-xs">20 ticks are one second. Empty: 20.</p>
      {at(['lifetime'])}
      {at(['lifetime', 'min'])}
      {at(['lifetime', 'max'])}
      <div className="flex flex-wrap items-end gap-2">
        {number('size', 'Size', 'particle-size')}
        {number('size_end', 'Size at the end', 'particle-size-end')}
      </div>
      <p className="text-muted text-xs">
        Size is half the width in blocks (0.2 draws a square 0.4 blocks wide). Empty size at the
        end: the same size.
      </p>
      {at(['size'])}
      {at(['size_end'])}
    </Section>
  );

  const movement = (
    <Section title="Movement" testId="particle-movement">
      <div className="flex flex-wrap items-end gap-2">
        {number('gravity', 'Gravity', 'particle-gravity')}
        {GRAVITY_SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.key}
            type="button"
            className={buttonClass}
            data-testid={`particle-gravity-${shortcut.key}`}
            aria-pressed={
              shortcut.value === undefined
                ? data.gravity === undefined || data.gravity === 0
                : data.gravity === shortcut.value
            }
            onClick={() => set(['gravity'], shortcut.value)}
          >
            {shortcut.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {number('friction', 'Drag (speed kept per tick, 0 to 1)', 'particle-drag')}
        {number('spin', 'Spin (degrees per tick)', 'particle-spin')}
      </div>
      <CheckField
        label="Stops on blocks"
        checked={data.collision !== false}
        testId="particle-collision"
        onChange={(checked) => set(['collision'], checked ? undefined : false)}
      />
      <p className="text-muted text-xs">
        Gravity below 0 floats up. Empty drag: 0.98, as vanilla's particles; 1 keeps the speed.
      </p>
      {['gravity', 'friction', 'spin', 'collision'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={`/${key}`} />
      ))}
    </Section>
  );

  const colour = (
    <Section title="Colour and light" testId="particle-colour">
      <ColourField
        label="Tint"
        value={data.color}
        clearable
        testId="particle-tint"
        onChange={(value) => set(['color'], value, typingKey('/color'))}
      />
      <ColourField
        label="Tint at the end"
        value={data.color_end}
        clearable
        testId="particle-tint-end"
        onChange={(value) => set(['color_end'], value, typingKey('/color_end'))}
      />
      <p className="text-muted text-xs">No tint: the picture as drawn.</p>
      <div className="flex flex-wrap items-end gap-2">
        {number('alpha', 'Opacity (0 to 1)', 'particle-opacity')}
        <LabelledChoice
          label="Fade"
          value={typeof data.fade === 'string' ? data.fade : 'none'}
          labels={FADE_LABELS}
          order={FADES}
          testId="particle-fade"
          onChange={(next) => set(['fade'], next === 'none' ? undefined : next)}
        />
      </div>
      <CheckField
        label="Glows in the dark"
        checked={data.emissive === true}
        testId="particle-emissive"
        onChange={(checked) => set(['emissive'], checked ? true : undefined)}
      />
      <CheckField
        label="See-through"
        checked={translucent}
        testId="particle-translucent"
        onChange={(checked) =>
          set(['translucent'], checked === defaultTranslucent(element.data) ? undefined : checked)
        }
      />
      <CheckField
        label="Show from far away"
        checked={data.always_show === true}
        testId="particle-always-show"
        onChange={(checked) => set(['always_show'], checked ? true : undefined)}
      />
      <p className="text-muted text-xs">
        See-through draws soft edges and fades (on by itself with an opacity below 1 or a fade).
        Show from far away draws it beyond 32 blocks and with Particles: Minimal.
      </p>
      {['color', 'color_end', 'alpha', 'fade', 'emissive', 'translucent', 'always_show'].map(
        (key) => (
          <ProblemsAt key={key} problems={problems} pointer={`/${key}`} />
        ),
      )}
    </Section>
  );

  return (
    <section
      aria-label="Particle Studio"
      data-testid="particle-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="particle-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      <p className="text-muted text-xs">
        {veryEasy
          ? 'Use it in a "Spawn particle" step of your rules, as a block’s particles, for an effect or a portal. It needs your mod on the client and the server.'
          : `Use it with /particle ${element.id}, in a "Spawn particle" action, as a block's ambient particles, for an effect or a portal. It needs the mod jar on the client and the server.`}
      </p>
      {pictures}
      {lifeAndSize}
      {movement}
      {colour}
      <Section title="Preview" testId="particle-preview-section">
        <ParticlePreview data={element.data as Json} target={target} />
      </Section>
    </section>
  );
}
