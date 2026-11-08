/**
 * Picture to texture (ADR 0048): paste a screenshot (Ctrl+V), drop a picture or choose one,
 * pick what it is for, crop it, and get a Minecraft texture: scaled sharp or smooth, the
 * background cut away, the colours reduced. A legacy 64 by 32 player skin becomes the 64 by
 * 64 layout. The result is added to the namespace, or opened in the texture editor first.
 *
 * @packageDocumentation
 */

import { FlipHorizontal, FlipVertical, ImagePlus, RotateCcw, RotateCw, X } from 'lucide-react';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fieldClass, Modal } from '../NewElementDialog';
import { Button, iconButtonClass } from '../ui/Button';
import {
  type ColourAdjust,
  convertPicture,
  fitRect,
  isLegacySkin,
  type Rect,
  type Rotation,
  type ScaleMode,
  upgradeLegacySkin,
} from './image-convert';
import { NEW_TEXTURE_KINDS, type NewTextureKind } from './NewTextureDialog';
import { fromHex, type Rgba, type RgbaImage } from './pixels';
import {
  decodePicture,
  drawZoomed,
  encodePicture,
  imageDataUrl,
  MAX_DECODED_EDGE,
} from './png-canvas';

/** One picture in the tray. */
interface TrayPicture {
  name: string;
  image: RgbaImage;
  /** The original file as a `data:` URL, for the thumbnail. */
  thumb: string;
}

/** The most pictures the tray keeps (the oldest go). */
const TRAY_MAX = 24;

const NO_ADJUST: ColourAdjust = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
});

const DARK_OUTLINE: Rgba = [26, 26, 26, 255];

const ADJUSTMENTS: readonly { key: keyof ColourAdjust; label: string; min: number; max: number }[] =
  [
    { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
    { key: 'saturation', label: 'Colourfulness', min: -100, max: 100 },
    { key: 'hue', label: 'Hue', min: -180, max: 180 },
  ];

/** The whole picture as a crop. */
function wholeOf(picture: RgbaImage): Rect {
  return { x: 0, y: 0, width: picture.width, height: picture.height };
}

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

/** The crop a texture shape starts with: the whole picture when it already fits, else centred. */
function initialCrop(picture: RgbaImage, aspect: number): Rect {
  if (Math.abs(picture.width / picture.height - aspect) < 1e-9) return wholeOf(picture);
  return fitRect(picture.width, picture.height, aspect);
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
  /** Shows the file picker; resolves to the chosen files (none when cancelled). */
  pickPictures(): Promise<{ name: string; data: Uint8Array }[]>;
  /** Pictures to start with, for example files dropped on the window. */
  initialPictures?: readonly { name: string; data: Uint8Array }[];
  /** Adds the texture (one undo step); rejects with a message when it cannot. */
  onAdd(choice: PictureChoice): Promise<void>;
  /** Opens the texture editor on the result instead. */
  onPaint(choice: PictureChoice): void;
  onClose(): void;
}

export function PictureToTextureDialog(props: PictureToTextureDialogProps) {
  const [pictures, setPictures] = useState<TrayPicture[]>([]);
  const [current, setCurrent] = useState(0);
  const picture = pictures[current]?.image ?? null;
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [fit, setFit] = useState<'fill' | 'fit'>('fill');
  const [adjust, setAdjust] = useState<ColourAdjust>(NO_ADJUST);
  const [outline, setOutline] = useState<'none' | 'dark' | 'colour'>('none');
  const [outlineColour, setOutlineColour] = useState('#1a1a1a');
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
  const ids = {
    name: useId(),
    kind: useId(),
    tolerance: useId(),
    colours: useId(),
    adjust: useId(),
    outline: useId(),
  };

  const kind = NEW_TEXTURE_KINDS.find((entry) => entry.id === kindId) ?? NEW_TEXTURE_KINDS[0];
  const source = useMemo(
    () => (picture === null ? null : sourceFor(picture, kind)),
    [picture, kind],
  );
  const turned = rotation === 90 || rotation === 270;
  /** The width / height the crop keeps in fill mode (inverted when turned a quarter). */
  const aspect = turned ? kind.height / kind.width : kind.width / kind.height;
  const result = useMemo(() => {
    if (source === null || crop === null) return null;
    const outlineRgba =
      outline === 'none'
        ? null
        : outline === 'dark'
          ? DARK_OUTLINE
          : (fromHex(outlineColour) ?? DARK_OUTLINE);
    return convertPicture(source, {
      crop,
      width: kind.width,
      height: kind.height,
      scale,
      backgroundTolerance: background ? tolerance : 0,
      colours,
      rotation,
      flipX,
      flipY,
      fit,
      adjust,
      outline: outlineRgba,
    });
  }, [
    source,
    crop,
    kind,
    scale,
    background,
    tolerance,
    colours,
    rotation,
    flipX,
    flipY,
    fit,
    adjust,
    outline,
    outlineColour,
  ]);

  const path = `${kind.folder}/${name}.png`;
  const nameError =
    name === ''
      ? null
      : !NAME.test(name)
        ? 'Use lower case letters, digits, _, - and . only.'
        : props.existing.includes(path)
          ? `${path} already exists: choose another name.`
          : null;

  /** Selects a tray picture: sharp scaling for pixel art, the skin kind for skins, its name. */
  const select = (entry: TrayPicture, index: number): void => {
    setCurrent(index);
    const image = entry.image;
    // Pictures at texture size (skins, textures) are pixel art: keep them sharp.
    setScale(image.width <= 128 && image.height <= 128 ? 'sharp' : 'smooth');
    if ((image.width === 64 && image.height === 64) || isLegacySkin(image)) setKindId('skin');
    if (!nameEdited) setName(textureNameOf(entry.name));
  };

  /** Adds pictures to the tray and selects the first new one. */
  const load = async (files: readonly { name: string; data: Uint8Array }[]): Promise<void> => {
    setError(null);
    const added: TrayPicture[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        const image = await decodePicture(file.data, MAX_DECODED_EDGE);
        added.push({ name: file.name, image, thumb: imageDataUrl(file.data) });
      } catch (caught) {
        failed.push(`${file.name}: ${caught instanceof Error ? caught.message : String(caught)}`);
      }
    }
    if (failed.length > 0) setError(failed.join(' '));
    const first = added[0];
    if (first === undefined) return;
    const next = [...picturesRef.current, ...added].slice(-TRAY_MAX);
    picturesRef.current = next;
    setPictures(next);
    select(first, next.indexOf(first));
  };

  /** Reads dropped or pasted files that are pictures. */
  const loadFiles = (files: readonly File[]): void => {
    const images = files.filter(
      (file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name),
    );
    void Promise.all(
      images.map(async (file) => ({
        name: file.name === 'image.png' ? 'screenshot' : file.name,
        data: new Uint8Array(await file.arrayBuffer()),
      })),
    ).then(load);
  };

  // Paste a screenshot anywhere while the dialog is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const files = [...(event.clipboardData?.files ?? [])].filter((entry) =>
        entry.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      event.preventDefault();
      loadFiles(files);
    };
    window.addEventListener('paste', onPaste);
    if (props.initialPictures !== undefined && props.initialPictures.length > 0) {
      void load(props.initialPictures);
    }
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // A new picture, kind, turn or fit starts from its default crop.
  useEffect(() => {
    if (source !== null) setCrop(fit === 'fit' ? wholeOf(source) : initialCrop(source, aspect));
  }, [source, aspect, fit]);

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

  /**
   * A crop from the drag start to `to`, kept to the picture; in fill mode also to the texture's
   * proportions, in fit mode free.
   */
  const cropTo = (to: { x: number; y: number }): void => {
    const from = drag.current;
    if (from === null || source === null) return;
    if (fit === 'fit') {
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      const width = Math.abs(to.x - from.x);
      const height = Math.abs(to.y - from.y);
      if (width >= 1 && height >= 1) setCrop({ x, y, width, height });
      return;
    }
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
      const picked = await props.pickPictures();
      if (picked.length > 0) await load(picked);
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
          loadFiles([...event.dataTransfer.files]);
        }}
      >
        {source === null ? (
          <p className="text-muted">
            Paste a screenshot (Ctrl+V), drop pictures here, or choose them. PNG, JPEG, GIF, BMP and
            WebP work; player skins too. With several pictures, click one in the tray to switch.
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
            {source === null ? 'Choose pictures…' : 'More pictures…'}
          </Button>
          {source !== null && (
            <Button
              data-testid="picture-reset-crop"
              onClick={() => setCrop(fit === 'fit' ? wholeOf(source) : initialCrop(source, aspect))}
            >
              Reset crop
            </Button>
          )}
        </div>
        {source !== null && (
          <p className="text-xs text-muted">
            {legacy
              ? 'An old 64 by 32 skin: converted to the 64 by 64 layout, the left arm and leg mirrored from the right.'
              : fit === 'fit'
                ? 'Drag over the picture to choose the part to use; it is fitted whole into the texture.'
                : `Drag over the picture to choose the part to use (kept to ${kind.width} by ${kind.height}).`}
          </p>
        )}
      </div>
      {pictures.length > 1 && (
        <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0" data-testid="picture-tray">
          <legend className="sr-only">Pictures</legend>
          {pictures.map((entry, index) => (
            <span key={`${entry.name}-${index}`} className="relative">
              <button
                type="button"
                className={`cursor-pointer rounded border-2 p-0.5 ${index === current ? 'border-accent' : 'border-border'}`}
                aria-pressed={index === current}
                aria-label={`Use ${entry.name}`}
                data-testid={`picture-tray-${index}`}
                onClick={() => select(entry, index)}
              >
                <img
                  src={entry.thumb}
                  alt=""
                  className="h-12 w-12 object-contain [image-rendering:pixelated]"
                />
              </button>
              <button
                type="button"
                className={`${iconButtonClass} absolute -top-1 -right-1 bg-panel`}
                aria-label={`Remove ${entry.name}`}
                data-testid={`picture-tray-remove-${index}`}
                onClick={() => {
                  const next = pictures.filter((_, other) => other !== index);
                  setPictures(next);
                  const keep = Math.min(
                    current >= index && current > 0 ? current - 1 : current,
                    next.length - 1,
                  );
                  const chosen = next[Math.max(0, keep)];
                  if (chosen !== undefined) select(chosen, Math.max(0, keep));
                  else setCurrent(0);
                }}
              >
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
        </fieldset>
      )}
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
          onChange={(event) => {
            setNameEdited(true);
            setName(event.target.value.trim().toLowerCase());
          }}
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
      <details className="rounded border border-border p-2 text-sm" data-testid="picture-more">
        <summary className="cursor-pointer font-medium">
          More options: turn, fit, colours, outline
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              data-testid="picture-rotate-left"
              aria-label="Turn left"
              onClick={() => setRotation(((rotation + 270) % 360) as Rotation)}
            >
              <RotateCcw size={14} aria-hidden />
            </Button>
            <Button
              data-testid="picture-rotate-right"
              aria-label="Turn right"
              onClick={() => setRotation(((rotation + 90) % 360) as Rotation)}
            >
              <RotateCw size={14} aria-hidden />
            </Button>
            <Button
              data-testid="picture-flip-x"
              aria-pressed={flipX}
              onClick={() => setFlipX(!flipX)}
            >
              <FlipHorizontal size={14} aria-hidden />
              Mirror
            </Button>
            <Button
              data-testid="picture-flip-y"
              aria-pressed={flipY}
              onClick={() => setFlipY(!flipY)}
            >
              <FlipVertical size={14} aria-hidden />
              Upside down
            </Button>
            <span className="text-xs text-muted">
              {rotation === 0 ? '' : `Turned ${rotation}°`}
            </span>
          </div>
          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="sr-only">Fit</legend>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="picture-fit"
                data-testid="picture-fit-fill"
                checked={fit === 'fill'}
                onChange={() => setFit('fill')}
              />
              Fill the texture (crop to its shape)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="picture-fit"
                data-testid="picture-fit-fit"
                checked={fit === 'fit'}
                onChange={() => setFit('fit')}
              />
              Fit the whole part (transparent around it)
            </label>
          </fieldset>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
            {ADJUSTMENTS.map(({ key, label, min, max }) => (
              <Fragment key={key}>
                <label htmlFor={`${ids.adjust}-${key}`} className="text-xs">
                  {label}
                </label>
                <input
                  id={`${ids.adjust}-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  value={adjust[key]}
                  data-testid={`picture-${key}`}
                  onChange={(event) => setAdjust({ ...adjust, [key]: Number(event.target.value) })}
                />
                <span className="w-10 text-right text-xs text-muted">{adjust[key]}</span>
              </Fragment>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="picture-reset-colours"
              disabled={adjust === NO_ADJUST}
              onClick={() => setAdjust(NO_ADJUST)}
            >
              Reset colours
            </Button>
            <label htmlFor={ids.outline} className="text-xs">
              Outline
            </label>
            <select
              id={ids.outline}
              data-testid="picture-outline"
              className={fieldClass}
              value={outline}
              onChange={(event) => setOutline(event.target.value as 'none' | 'dark' | 'colour')}
            >
              <option value="none">None</option>
              <option value="dark">Dark, like vanilla items</option>
              <option value="colour">A colour of your own</option>
            </select>
            {outline === 'colour' && (
              <input
                type="color"
                aria-label="Outline colour"
                data-testid="picture-outline-colour"
                value={outlineColour}
                onChange={(event) => setOutlineColour(event.target.value)}
              />
            )}
          </div>
        </div>
      </details>
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
