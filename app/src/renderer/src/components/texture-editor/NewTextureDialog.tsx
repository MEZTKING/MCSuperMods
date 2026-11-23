/**
 * "New texture…" (ADR 0047 D5): a name and a kind that fixes the folder and size, and **Start
 * from** (ADR 0092 D10 (b)): **Blank**, or **Drawn picture**, which opens the Draw dialog
 * first. The host then opens the texture editor on the blank or drawn picture and adds the PNG
 * to the namespace on Save. Paintings have no drawing, so they start blank or, with a key for an
 * image service, **Made with AI** (ADR 0093 D6 as amended on 2026-11-22), which opens Make with AI
 * for the kind's shape (a block or item square, a coat laid on the armour or skin boxes, a
 * painting of its size) and then the painter on the cleaned-up picture. **A Minecraft texture**
 * (ADR 0129 D4) opens the picker of the user's own Minecraft textures, and the painter opens on
 * the picked picture at its own size (an animation strip with MSM's own `.png.mcmeta`).
 *
 * @packageDocumentation
 */

import { Suspense, useId, useState } from 'react';
import { isSquareStyle } from '../../../../shared/ai-pictures';
import { usePreferences } from '../../store/preferences';
import { aiPicturesReady, useAiPictures } from '../ai-pictures/ai-pictures-host';
import { MakeWithAiDialog } from '../ai-pictures/MakeWithAiDialog';
import { defaultPrompt } from '../ai-pictures/prompt';
import { shapeForTexture } from '../ai-pictures/shapes';
import { drawFieldForTexture, LazyDrawPictureDialog } from '../art/DrawButton';
import { folderOfPath } from '../mc-textures/catalogue';
import { useMinecraftTextures } from '../mc-textures/host';
import { LazyMinecraftTexturePicker } from '../mc-textures/StartFromMinecraftButton';
import { fieldClass, Modal } from '../NewElementDialog';

/**
 * The kinds of texture offered, with their folder and size. An effect icon's name must be the
 * effect's path: `textures/mob_effect/<path>.png` is found by its id (ADR 0055 D2).
 */
export const NEW_TEXTURE_KINDS = [
  { id: 'item', label: 'Item (16 × 16)', folder: 'textures/item', width: 16, height: 16 },
  { id: 'block', label: 'Block (16 × 16)', folder: 'textures/block', width: 16, height: 16 },
  {
    id: 'armour',
    label: 'Armour layer: helmet, chestplate, boots (64 × 32)',
    folder: 'textures/entity/equipment/humanoid',
    width: 64,
    height: 32,
  },
  {
    id: 'leggings',
    label: 'Armour layer: leggings (64 × 32)',
    folder: 'textures/entity/equipment/humanoid_leggings',
    width: 64,
    height: 32,
  },
  {
    id: 'skin',
    label: 'Mob skin, the player skin layout (64 × 64)',
    folder: 'textures/entity',
    width: 64,
    height: 64,
  },
  {
    id: 'effect_icon',
    label: 'Effect icon (18 × 18)',
    folder: 'textures/mob_effect',
    width: 18,
    height: 18,
  },
  {
    id: 'painting_1x1',
    label: 'Painting, 1 by 1 block (16 × 16)',
    folder: 'textures/painting',
    width: 16,
    height: 16,
  },
  {
    id: 'painting_2x1',
    label: 'Painting, 2 by 1 blocks (32 × 16)',
    folder: 'textures/painting',
    width: 32,
    height: 16,
  },
  {
    id: 'painting',
    label: 'Painting, 2 by 2 blocks (32 × 32)',
    folder: 'textures/painting',
    width: 32,
    height: 32,
  },
  {
    id: 'painting_4x2',
    label: 'Painting, 4 by 2 blocks (64 × 32)',
    folder: 'textures/painting',
    width: 64,
    height: 32,
  },
  {
    id: 'painting_4x4',
    label: 'Painting, 4 by 4 blocks (64 × 64)',
    folder: 'textures/painting',
    width: 64,
    height: 64,
  },
] as const;

export type NewTextureKind = (typeof NEW_TEXTURE_KINDS)[number];

/**
 * Where a new texture starts: a blank picture, a drawn one (ADR 0092 D10 (b)), one made with AI
 * (ADR 0093) or one of the user's Minecraft textures (ADR 0129 D4).
 */
export type NewTextureStart = 'blank' | 'drawn' | 'ai' | 'minecraft';

/** Whether a kind of texture can start from a drawn picture (paintings cannot). */
export function drawableKind(kind: NewTextureKind): boolean {
  return !kind.id.startsWith('painting');
}

/** A texture name: lower case letters, digits, `_`, `-` and `.`, starting with a letter or digit. */
const NAME = /^[a-z0-9][a-z0-9_.-]*$/;

export interface NewTextureDialogProps {
  namespace: string;
  /** Asset paths the namespace already has (`textures/item/ruby.png`), to refuse clashes. */
  existing: readonly string[];
  /**
   * Opens the painter on the new texture: on `bytes` (a drawn or picked picture), or blank
   * without; `mcmeta` is the animation sidecar of a picked animation strip.
   */
  onPaint(choice: {
    kind: NewTextureKind;
    name: string;
    path: string;
    bytes?: Uint8Array;
    mcmeta?: Uint8Array | null;
  }): void;
  onClose(): void;
}

export function NewTextureDialog(props: NewTextureDialogProps) {
  const [name, setName] = useState('');
  const [kindId, setKindId] = useState<NewTextureKind['id']>('item');
  const [startChoice, setStart] = useState<NewTextureStart>('blank');
  const [drawing, setDrawing] = useState(false);
  const [making, setMaking] = useState(false);
  const [picking, setPicking] = useState(false);
  const minecraft = useMinecraftTextures();
  const ai = useAiPictures();
  const aiReady = ai !== null && aiPicturesReady(ai.status);
  const veryEasy = usePreferences((state) => state.mode) === 'very-easy';
  const nameId = useId();
  const kindIdField = useId();
  const kind = NEW_TEXTURE_KINDS.find((entry) => entry.id === kindId) ?? NEW_TEXTURE_KINDS[0];
  const start: NewTextureStart =
    startChoice === 'ai'
      ? aiReady
        ? 'ai'
        : 'blank'
      : startChoice === 'minecraft'
        ? minecraft !== null
          ? 'minecraft'
          : 'blank'
        : drawableKind(kind)
          ? startChoice
          : 'blank';
  const shape = shapeForTexture(`${kind.folder}/x.png`, kind.width, kind.height);
  const path = `${kind.folder}/${name}.png`;
  const pickerFolder = folderOfPath(path);
  const error =
    name === ''
      ? null
      : !NAME.test(name)
        ? 'Use lower case letters, digits, _, - and . only.'
        : props.existing.includes(path)
          ? `${path} already exists: use the brush on its row to paint it.`
          : null;
  return (
    <>
      <Modal
        title={`New texture in ${props.namespace}`}
        error={error}
        testId="new-texture-dialog"
        submitLabel={
          start === 'drawn'
            ? 'Draw…'
            : start === 'ai'
              ? 'Make with AI…'
              : start === 'minecraft'
                ? 'Pick…'
                : 'Paint…'
        }
        busy={name === '' || error !== null || drawing || making || picking}
        onCancel={props.onClose}
        onSubmit={() => {
          if (start === 'drawn') setDrawing(true);
          else if (start === 'ai') setMaking(true);
          else if (start === 'minecraft') setPicking(true);
          else props.onPaint({ kind, name, path });
        }}
      >
        <label htmlFor={nameId} className="text-sm font-medium">
          Name
        </label>
        <input
          id={nameId}
          data-testid="new-texture-name"
          className={fieldClass}
          placeholder="ruby_staff"
          value={name}
          onChange={(event) => setName(event.target.value.trim().toLowerCase())}
        />
        <label htmlFor={kindIdField} className="text-sm font-medium">
          What it is for
        </label>
        <select
          id={kindIdField}
          data-testid="new-texture-kind"
          className={fieldClass}
          value={kindId}
          onChange={(event) => setKindId(event.target.value as NewTextureKind['id'])}
        >
          {NEW_TEXTURE_KINDS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          It is saved as {props.namespace}:{name === '' ? '<name>' : name} in {kind.folder}.{' '}
          {kind.id === 'effect_icon'
            ? 'Name it after the effect (ruby_rush for the effect ruby_rush): the game finds the icon by name.'
            : 'Point a model or an equipment layer at it to use it.'}
        </p>
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="text-sm font-medium">Start from</legend>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="new-texture-start"
              data-testid="new-texture-start-blank"
              checked={start === 'blank'}
              onChange={() => setStart('blank')}
            />
            Blank
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="new-texture-start"
              data-testid="new-texture-start-drawn"
              checked={start === 'drawn'}
              disabled={!drawableKind(kind)}
              onChange={() => setStart('drawn')}
            />
            Drawn picture
          </label>
          {aiReady && (
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="new-texture-start"
                data-testid="new-texture-start-ai"
                checked={start === 'ai'}
                onChange={() => setStart('ai')}
              />
              Made with AI
            </label>
          )}
          {minecraft !== null && (
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="new-texture-start"
                data-testid="new-texture-start-minecraft"
                checked={start === 'minecraft'}
                onChange={() => setStart('minecraft')}
              />
              A Minecraft texture
            </label>
          )}
          {!drawableKind(kind) && (
            <span className="text-xs text-muted">
              {aiReady
                ? 'Paintings are not drawn: start blank or make one with AI.'
                : minecraft !== null
                  ? 'Paintings are not drawn: start blank or from a Minecraft painting.'
                  : 'Paintings start blank.'}
            </span>
          )}
        </fieldset>
      </Modal>
      {drawing && (
        <Suspense fallback={null}>
          <LazyDrawPictureDialog
            field={drawFieldForTexture(path, kind.width, kind.height)}
            target={`${props.namespace}:${path}`}
            veryEasy={veryEasy}
            onPick={(picture) => {
              const bytes = picture.pngs[0];
              if (bytes !== undefined) props.onPaint({ kind, name, path, bytes });
            }}
            onClose={() => setDrawing(false)}
          />
        </Suspense>
      )}
      {picking && minecraft !== null && (
        <Suspense fallback={null}>
          <LazyMinecraftTexturePicker
            host={minecraft}
            title={`Start ${name} from a Minecraft texture`}
            {...(pickerFolder === undefined ? {} : { folder: pickerFolder })}
            onPick={(pick) =>
              props.onPaint({ kind, name, path, bytes: pick.bytes, mcmeta: pick.mcmeta })
            }
            onClose={() => setPicking(false)}
          />
        </Suspense>
      )}
      {making && ai !== null && (
        <MakeWithAiDialog
          host={ai}
          target={`${props.namespace}:${path}`}
          defaultPrompt={defaultPrompt(name, shape.style)}
          defaultStyle={shape.style}
          size={shape.width}
          {...(isSquareStyle(shape.style) ? {} : { shape })}
          veryEasy={veryEasy}
          onPick={(bytes) => props.onPaint({ kind, name, path, bytes })}
          onClose={() => setMaking(false)}
        />
      )}
    </>
  );
}
