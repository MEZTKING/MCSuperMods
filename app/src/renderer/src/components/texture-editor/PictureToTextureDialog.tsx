/**
 * Picture to texture (ADR 0048): paste a screenshot (Ctrl+V), drop a picture or choose one,
 * pick what it is for, crop it, and get a Minecraft texture: scaled sharp or smooth, the
 * background cut away, the colours reduced. A legacy 64 by 32 player skin becomes the 64 by
 * 64 layout. The result is added to the namespace, or opened in the texture editor first.
 *
 * @packageDocumentation
 */

import { ImagePlus } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fieldClass, Modal } from '../NewElementDialog';
import { Button } from '../ui/Button';
import {
  convertPicture,
  fitRect,
  isLegacySkin,
  type Rect,
  type ScaleMode,
  upgradeLegacySkin,
} from './image-convert';
import { NEW_TEXTURE_KINDS, type NewTextureKind } from './NewTextureDialog';
import type { RgbaImage } from './pixels';
import { decodePicture, drawZoomed, encodePicture, MAX_DECODED_EDGE } from './png-canvas';

/** The colour limits offered (0 keeps every colour). */
const COLOUR_LIMITS = [0, 32, 16, 8] as const;

/** A texture name: lower case letters, digits, `_`, `-` and `.`, starting with a letter or digit. */
const NAME = /^[a-z0-9][a-z0-9_.-]*$/;

/** The largest preview of the source picture, in screen pixels. */
const SOURCE_BOX = 320;

/** A texture name from a file name: `My Screenshot (2).png` gives `my_screenshot_2`. */
export function textureNameOf(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').toLowerCase();
  const cleaned = base
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '');
  return cleaned === '' ? 'picture' : cleaned.slice(0, 64);
}

/** The picture for `kind`: a legacy skin upgraded for the mob skin kind, else as it is. */
function sourceFor(picture: RgbaImage, kind: NewTextureKind): RgbaImage {
  return kind.id === 'skin' && isLegacySkin(picture) ? upgradeLegacySkin(picture) : picture;
}

/** The crop a kind starts with: the whole picture when it already fits, else centred. */
function initialCrop(picture: RgbaImage, kind: NewTextureKind): Rect {
  if (picture.width * kind.height === picture.height * kind.width) {
    return { x: 0, y: 0, width: picture.width, height: picture.height };
  }
  return fitRect(picture.width, picture.height, kind.width / kind.height);
}

export interface PictureChoice {
  path: string;
  bytes: Uint8Array;
  kind: NewTextureKind;
}

export interface PictureToTextureDialogProps {
  namespace: string;
  /** Asset paths the namespace already has, to refuse clashes. */
  existing: readonly string[];
  /** Shows the file picker; resolves to the chosen file, or `null` when cancelled. */
  pickPicture(): Promise<{ name: string; data: Uint8Array } | null>;
  /** Adds the texture (one undo step); rejects with a message when it cannot. */
  onAdd(choice: PictureChoice): Promise<void>;
  /** Opens the texture editor on the result instead. */
  onPaint(choice: PictureChoice): void;
  onClose(): void;
}

export function PictureToTextureDialog(props: PictureToTextureDialogProps) {
  const [picture, setPicture] = useState<RgbaImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kindId, setKindId] = useState<NewTextureKind['id']>('item');
  const [crop, setCrop] = useState<Rect | null>(null);
  const [scale, setScale] = useState<ScaleMode>('smooth');
  const [background, setBackground] = useState(false);
  const [tolerance, setTolerance] = useState(32);
  const [colours, setColours] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null);
  const resultCanvas = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const ids = { name: useId(), kind: useId(), tolerance: useId(), colours: useId() };

  const kind = NEW_TEXTURE_KINDS.find((entry) => entry.id === kindId) ?? NEW_TEXTURE_KINDS[0];
  const source = useMemo(
    () => (picture === null ? null : sourceFor(picture, kind)),
    [picture, kind],
  );
  const result = useMemo(() => {
    if (source === null || crop === null) return null;
    return convertPicture(source, {
      crop,
      width: kind.width,
      height: kind.height,
      scale,
      backgroundTolerance: background ? tolerance : 0,
      colours,
    });
  }, [source, crop, kind, scale, background, tolerance, colours]);

  const path = `${kind.folder}/${name}.png`;
  const nameError =
    name === ''
      ? null
      : !NAME.test(name)
        ? 'Use lower case letters, digits, _, - and . only.'
        : props.existing.includes(path)
          ? `${path} already exists: choose another name.`
          : null;

  const load = async (fileName: string, data: Uint8Array): Promise<void> => {
    setError(null);
    try {
      const decoded = await decodePicture(data, MAX_DECODED_EDGE);
      setPicture(decoded);
      // Pictures at texture size (skins, textures) are pixel art: keep them sharp.
      setScale(decoded.width <= 128 && decoded.height <= 128 ? 'sharp' : 'smooth');
      if ((decoded.width === 64 && decoded.height === 64) || isLegacySkin(decoded)) {
        setKindId('skin');
      }
      setName((current) => (current === '' ? textureNameOf(fileName) : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  // Paste a screenshot anywhere while the dialog is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      );
      if (file === undefined) return;
      event.preventDefault();
      void file
        .arrayBuffer()
        .then((buffer) =>
          load(file.name === 'image.png' ? 'screenshot' : file.name, new Uint8Array(buffer)),
        );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // A new picture or kind starts from its default crop.
  useEffect(() => {
    if (source !== null) setCrop(initialCrop(source, kind));
  }, [source, kind]);

  const displayScale =
    source === null ? 1 : Math.min(1, SOURCE_BOX / Math.max(source.width, source.height));

  // The source picture with the crop rectangle on top.
  useEffect(() => {
    const element = sourceCanvas.current;
    if (element === null || source === null) return;
    element.width = Math.max(1, Math.round(source.width * displayScale));
    element.height = Math.max(1, Math.round(source.height * displayScale));
    const context = element.getContext('2d');
    if (context === null) return;
    const full = document.createElement('canvas');
    full.width = source.width;
    full.height = source.height;
    full
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
        0,
        0,
      );
    context.imageSmoothingEnabled = displayScale < 1;
    context.clearRect(0, 0, element.width, element.height);
    context.drawImage(full, 0, 0, element.width, element.height);
    if (crop !== null) {
      context.fillStyle = 'rgba(0, 0, 0, 0.45)';
      const r = {
        x: crop.x * displayScale,
        y: crop.y * displayScale,
        w: crop.width * displayScale,
        h: crop.height * displayScale,
      };
      context.fillRect(0, 0, element.width, r.y);
      context.fillRect(0, r.y + r.h, element.width, element.height - r.y - r.h);
      context.fillRect(0, r.y, r.x, r.h);
      context.fillRect(r.x + r.w, r.y, element.width - r.x - r.w, r.h);
      context.strokeStyle = '#ffd400';
      context.lineWidth = 2;
      context.strokeRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
    }
  }, [source, crop, displayScale]);

  useEffect(() => {
    const element = resultCanvas.current;
    if (element === null || result === null) return;
    drawZoomed(
      element,
      result,
      Math.max(2, Math.floor(192 / Math.max(result.width, result.height))),
    );
  }, [result]);

  /** The picture pixel under a pointer event on the source canvas. */
  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = source?.width ?? 1;
    const height = source?.height ?? 1;
    return {
      x: Math.max(0, Math.min(width, ((event.clientX - rect.left) / rect.width) * width)),
      y: Math.max(0, Math.min(height, ((event.clientY - rect.top) / rect.height) * height)),
    };
  };

  /** A crop from the drag start to `to`, kept to the kind's proportions and the picture. */
  const cropTo = (to: { x: number; y: number }): void => {
    const from = drag.current;
    if (from === null || source === null) return;
    const aspect = kind.width / kind.height;
    let width = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y) * aspect);
    let height = width / aspect;
    const dirX = to.x >= from.x ? 1 : -1;
    const dirY = to.y >= from.y ? 1 : -1;
    const roomX = dirX > 0 ? source.width - from.x : from.x;
    const roomY = dirY > 0 ? source.height - from.y : from.y;
    if (width > roomX) {
      width = roomX;
      height = width / aspect;
    }
    if (height > roomY) {
      height = roomY;
      width = height * aspect;
    }
    if (width < 1 || height < 1) return;
    setCrop({
      x: dirX > 0 ? from.x : from.x - width,
      y: dirY > 0 ? from.y : from.y - height,
      width,
      height,
    });
  };

  const choice = (): PictureChoice | null =>
    result === null || name === '' || nameError !== null
      ? null
      : { path, bytes: encodePicture(result), kind };

  const add = async (): Promise<void> => {
    const chosen = choice();
    if (chosen === null) return;
    setBusy(true);
    setError(null);
    try {
      await props.onAdd(chosen);
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (): Promise<void> => {
    try {
      const picked = await props.pickPicture();
      if (picked !== null) await load(picked.name, picked.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const legacy = picture !== null && kind.id === 'skin' && isLegacySkin(picture);

  return (
    <Modal
      title={`Picture to texture in ${props.namespace}`}
      error={error ?? nameError}
      testId="picture-dialog"
      submitLabel="Add texture"
      wide
      busy={busy || result === null || name === '' || nameError !== null}
      onCancel={props.onClose}
      onSubmit={() => void add()}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; Choose picture… is the keyboard path */}
      <div
        className="flex flex-col items-center gap-2 rounded border border-dashed border-border p-3 text-center text-sm"
        data-testid="picture-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file !== undefined) {
            void file.arrayBuffer().then((buffer) => load(file.name, new Uint8Array(buffer)));
          }
        }}
      >
        {source === null ? (
          <p className="text-muted">
            Paste a screenshot (Ctrl+V), drop a picture here, or choose one. PNG, JPEG, GIF, BMP and
            WebP work; player skins too.
          </p>
        ) : (
          <canvas
            ref={sourceCanvas}
            data-testid="picture-source"
            aria-label="The picture; drag to choose the part to use"
            className="max-w-full cursor-crosshair touch-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = pointOf(event);
            }}
            onPointerMove={(event) => {
              if (drag.current !== null) cropTo(pointOf(event));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button data-testid="picture-choose" onClick={() => void choose()}>
            <ImagePlus size={14} aria-hidden />
            {source === null ? 'Choose picture…' : 'Another picture…'}
          </Button>
          {source !== null && (
            <Button
              data-testid="picture-reset-crop"
              onClick={() => setCrop(initialCrop(source, kind))}
            >
              Reset crop
            </Button>
          )}
        </div>
        {source !== null && (
          <p className="text-xs text-muted">
            {legacy
              ? 'An old 64 by 32 skin: converted to the 64 by 64 layout, the left arm and leg mirrored from the right.'
              : `Drag over the picture to choose the part to use (kept to ${kind.width} by ${kind.height}).`}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <label htmlFor={ids.name} className="text-sm font-medium">
          Name
        </label>
        <input
          id={ids.name}
          data-testid="picture-name"
          className={fieldClass}
          placeholder="ruby_staff"
          value={name}
          onChange={(event) => setName(event.target.value.trim().toLowerCase())}
        />
        <label htmlFor={ids.kind} className="text-sm font-medium">
          What it is for
        </label>
        <select
          id={ids.kind}
          data-testid="picture-kind"
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
      </div>
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">Scaling</legend>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="picture-scale"
            data-testid="picture-scale-smooth"
            checked={scale === 'smooth'}
            onChange={() => setScale('smooth')}
          />
          Smooth (photos, screenshots)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="picture-scale"
            data-testid="picture-scale-sharp"
            checked={scale === 'sharp'}
            onChange={() => setScale('sharp')}
          />
          Sharp (pixel art)
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="picture-background"
            checked={background}
            onChange={(event) => setBackground(event.target.checked)}
          />
          Make the background transparent
        </label>
        {background && (
          <>
            <label htmlFor={ids.tolerance} className="text-xs text-muted">
              Tolerance
            </label>
            <input
              id={ids.tolerance}
              type="range"
              min={4}
              max={128}
              value={tolerance}
              data-testid="picture-tolerance"
              onChange={(event) => setTolerance(Number(event.target.value))}
            />
          </>
        )}
        <label htmlFor={ids.colours} className="text-sm">
          Colours
        </label>
        <select
          id={ids.colours}
          data-testid="picture-colours"
          className={fieldClass}
          value={colours}
          onChange={(event) => setColours(Number(event.target.value))}
        >
          {COLOUR_LIMITS.map((limit) => (
            <option key={limit} value={limit}>
              {limit === 0 ? 'Keep all' : `At most ${limit}`}
            </option>
          ))}
        </select>
      </div>
      {result !== null && (
        <div className="flex items-start gap-3">
          <canvas
            ref={resultCanvas}
            data-testid="picture-result"
            aria-label={`The texture, ${result.width} by ${result.height} pixels`}
            className="shrink-0 border border-border [image-rendering:pixelated]"
          />
          <div className="flex flex-col gap-2 text-xs text-muted">
            <p>
              {props.namespace}:{name === '' ? '<name>' : name} in {kind.folder}, {result.width} by{' '}
              {result.height} pixels.
            </p>
            <Button
              data-testid="picture-paint"
              disabled={name === '' || nameError !== null}
              onClick={() => {
                const chosen = choice();
                if (chosen !== null) props.onPaint(chosen);
              }}
            >
              Touch up in the painter…
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
