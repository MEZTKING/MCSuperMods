/**
 * The texture editor (ADR 0047 D5): paints a project PNG pixel by pixel. Pencil, eraser, fill
 * and eyedropper, a colour picker and the texture's own palette, zoom, undo and redo inside the
 * dialog. Save hands the PNG bytes to the host, which writes them as one undoable step.
 * "Draw…" (ADR 0092 D10 (b)) and "Make with AI" (ADR 0093) replace the canvas with the picked
 * picture as one painter undo step.
 *
 * @packageDocumentation
 */

import { Eraser, PaintBucket, Pencil, Pipette, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isSquareStyle } from '../../../../shared/ai-pictures';
import { MakeWithAiButton } from '../ai-pictures/MakeWithAiButton';
import { defaultPrompt, styleForTexturePath } from '../ai-pictures/prompt';
import { shapeForTexture } from '../ai-pictures/shapes';
import { DrawButton, drawFieldForTexture } from '../art/DrawButton';
import type { DrawnPicture } from '../art/draw-model';
import { Button } from '../ui/Button';
import { fitInside } from './image-convert';
import {
  floodFill,
  fromHex,
  PixelHistory,
  paletteOf,
  pixelAt,
  type Rgba,
  type RgbaImage,
  setPixel,
  toHex,
} from './pixels';
import { decodePicture as decodePng, encodePicture as encodePng } from './png-canvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';

const TOOLS: readonly { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'picker', label: 'Pick a colour', icon: Pipette },
];

const CLEAR: Rgba = [0, 0, 0, 0];

export interface TextureEditorDialogProps {
  /** Shown in the title, for example `ruby_mod:textures/item/ruby.png`. */
  name: string;
  /** The PNG to edit, or `null` for a new, transparent picture of `size`. */
  bytes: Uint8Array | null;
  /** The size of a new picture (used when `bytes` is `null`; 16 × 16 by default). */
  size?: { width: number; height: number };
  /**
   * The texture is not in the project yet (a new or drawn picture): Save is offered before any
   * change. Defaults to `bytes === null`.
   */
  isNew?: boolean;
  /** Saves the edited PNG (the host writes it as one undoable step). */
  onSave(bytes: Uint8Array): Promise<void> | void;
  onClose(): void;
}

export function TextureEditorDialog(props: TextureEditorDialogProps) {
  const [image, setImage] = useState<RgbaImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [colour, setColour] = useState<Rgba>([200, 40, 60, 255]);
  const [zoom, setZoom] = useState(16);
  const [dirty, setDirty] = useState(props.isNew ?? props.bytes === null);
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);
  const history = useRef(new PixelHistory());
  const drawing = useRef(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const colourId = useId();

  useEffect(() => {
    let live = true;
    if (props.bytes === null) {
      const width = props.size?.width ?? 16;
      const height = props.size?.height ?? 16;
      setImage({ width, height, data: new Uint8ClampedArray(width * height * 4) });
      return;
    }
    decodePng(props.bytes).then(
      (decoded) => {
        if (live) setImage(decoded);
      },
      (caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      live = false;
    };
  }, [props.bytes, props.size?.width, props.size?.height]);

  // Redraw the zoomed canvas with a checkerboard under transparent pixels and a grid.
  useEffect(() => {
    const element = canvas.current;
    if (element === null || image === null) return;
    element.width = image.width * zoom;
    element.height = image.height * zoom;
    const context = element.getContext('2d');
    if (context === null) return;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const [r, g, b, a] = pixelAt(image, x, y) ?? CLEAR;
        context.fillStyle = (x + y) % 2 === 0 ? '#d8d8d8' : '#b8b8b8';
        context.fillRect(x * zoom, y * zoom, zoom, zoom);
        if (a > 0) {
          context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          context.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }
    if (zoom >= 8) {
      context.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      context.lineWidth = 1;
      for (let x = 0; x <= image.width; x += 1) {
        context.beginPath();
        context.moveTo(x * zoom + 0.5, 0);
        context.lineTo(x * zoom + 0.5, image.height * zoom);
        context.stroke();
      }
      for (let y = 0; y <= image.height; y += 1) {
        context.beginPath();
        context.moveTo(0, y * zoom + 0.5);
        context.lineTo(image.width * zoom, y * zoom + 0.5);
        context.stroke();
      }
    }
  });

  const cellOf = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.floor(((event.clientX - rect.left) / rect.width) * (image?.width ?? 1)),
      Math.floor(((event.clientY - rect.top) / rect.height) * (image?.height ?? 1)),
    ];
  };

  const apply = useCallback(
    (x: number, y: number, first: boolean) => {
      if (image === null) return;
      if (tool === 'picker') {
        const picked = pixelAt(image, x, y);
        if (picked !== null && picked[3] > 0) setColour(picked);
        setTool('pencil');
        return;
      }
      if (first) history.current.push(image);
      const changed =
        tool === 'fill'
          ? floodFill(image, x, y, colour) > 0
          : setPixel(image, x, y, tool === 'eraser' ? CLEAR : colour);
      if (changed) {
        setDirty(true);
        setTick((value) => value + 1);
      }
    },
    [image, tool, colour],
  );

  const undo = (): void => {
    if (image === null) return;
    const previous = history.current.undo(image);
    if (previous !== null) {
      setImage(previous);
      setDirty(true);
    }
  };
  const redo = (): void => {
    if (image === null) return;
    const next = history.current.redo(image);
    if (next !== null) {
      setImage(next);
      setDirty(true);
    }
  };

  const save = async (): Promise<void> => {
    if (image === null) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave(encodePng(image));
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const palette = image === null ? [] : paletteOf(image);
  const aiShape = image === null ? null : shapeForTexture(props.name, image.width, image.height);
  const aiStyle =
    aiShape !== null && !isSquareStyle(aiShape.style)
      ? aiShape.style
      : styleForTexturePath(props.name.slice(props.name.indexOf(':') + 1));
  const aiShapeProps = aiShape !== null && !isSquareStyle(aiShape.style) ? { shape: aiShape } : {};

  /** Puts a picked AI picture (ADR 0093) on the canvas as one painter undo step. */
  const takeAiPicture = async (bytes: Uint8Array): Promise<void> => {
    if (image === null) return;
    const decoded = await decodePng(bytes);
    const next =
      decoded.width === image.width && decoded.height === image.height
        ? decoded
        : fitInside(decoded, image.width, image.height, 'sharp');
    history.current.push(image);
    setImage(next);
    setDirty(true);
  };

  /** Puts a drawn picture (ADR 0092) on the canvas as one painter undo step. */
  const takeDrawnPicture = (picture: DrawnPicture): void => {
    const rgba = picture.rgba[0];
    if (image === null || rgba === undefined) return;
    const drawn: RgbaImage = {
      width: picture.width,
      height: picture.height,
      data: new Uint8ClampedArray(rgba),
    };
    const next =
      drawn.width === image.width && drawn.height === image.height
        ? drawn
        : fitInside(drawn, image.width, image.height, 'sharp');
    history.current.push(image);
    setImage(next);
    setDirty(true);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="texture-editor"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              if (event.shiftKey) redo();
              else undo();
            }
          }}
        >
          <Dialog.Title className="text-base font-semibold">Paint {props.name}</Dialog.Title>
          {image === null && error === null && <p className="text-sm text-muted">Loading…</p>}
          {image !== null && (
            <>
              <div
                className="flex flex-wrap items-center gap-1"
                role="toolbar"
                aria-label="Painting tools"
              >
                {TOOLS.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    aria-pressed={tool === id}
                    data-testid={`texture-tool-${id}`}
                    title={label}
                    className={tool === id ? 'border-accent text-accent' : undefined}
                    onClick={() => setTool(id)}
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                  </Button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                <Button
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  disabled={!history.current.canUndo}
                  onClick={undo}
                >
                  <Undo2 size={14} aria-hidden />
                </Button>
                <Button
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                  disabled={!history.current.canRedo}
                  onClick={redo}
                >
                  <Redo2 size={14} aria-hidden />
                </Button>
                <Button
                  aria-label="Zoom out"
                  disabled={zoom <= 4}
                  onClick={() => setZoom(Math.max(4, zoom / 2))}
                >
                  <ZoomOut size={14} aria-hidden />
                </Button>
                <Button
                  aria-label="Zoom in"
                  disabled={zoom >= 32}
                  onClick={() => setZoom(Math.min(32, zoom * 2))}
                >
                  <ZoomIn size={14} aria-hidden />
                </Button>
                <span className="text-xs text-muted">
                  {image.width}×{image.height}
                </span>
                <DrawButton
                  testId="texture-draw"
                  className="ml-auto"
                  target={props.name}
                  field={drawFieldForTexture(props.name, image.width, image.height)}
                  onPick={takeDrawnPicture}
                  ai={{
                    defaultPrompt: defaultPrompt(props.name, aiStyle),
                    defaultStyle: aiStyle,
                    size: image.width >= 32 ? 32 : 16,
                    ...aiShapeProps,
                    onPick: takeAiPicture,
                  }}
                />
                <MakeWithAiButton
                  testId="texture-make-with-ai"
                  target={props.name}
                  defaultPrompt={defaultPrompt(props.name, aiStyle)}
                  defaultStyle={aiStyle}
                  size={image.width >= 32 ? 32 : 16}
                  {...aiShapeProps}
                  onPick={takeAiPicture}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <label htmlFor={colourId} className="text-sm">
                  Colour
                </label>
                <input
                  id={colourId}
                  type="color"
                  data-testid="texture-colour"
                  value={toHex(colour)}
                  onChange={(event) => {
                    const next = fromHex(event.target.value);
                    if (next !== null) setColour(next);
                  }}
                />
                <span className="text-xs text-muted">This texture's colours:</span>
                {palette.map((entry) => (
                  <button
                    key={entry.join(',')}
                    type="button"
                    aria-label={`Use ${toHex(entry)}`}
                    title={toHex(entry)}
                    className="size-5 cursor-pointer rounded border border-border"
                    style={{
                      backgroundColor: `rgba(${entry[0]}, ${entry[1]}, ${entry[2]}, ${entry[3] / 255})`,
                    }}
                    onClick={() => setColour(entry)}
                  />
                ))}
              </div>
              <div className="flex max-h-[60vh] items-start gap-3 overflow-auto">
                <canvas
                  ref={canvas}
                  data-testid="texture-canvas"
                  aria-label={`${props.name}, ${image.width} by ${image.height} pixels`}
                  className="shrink-0 cursor-crosshair touch-none [image-rendering:pixelated]"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drawing.current = true;
                    const [x, y] = cellOf(event);
                    apply(x, y, true);
                  }}
                  onPointerMove={(event) => {
                    if (!drawing.current || tool === 'fill' || tool === 'picker') return;
                    const [x, y] = cellOf(event);
                    apply(x, y, false);
                  }}
                  onPointerUp={() => {
                    drawing.current = false;
                  }}
                />
              </div>
            </>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button>Cancel</Button>
            </Dialog.Close>
            <Button
              data-testid="texture-save"
              disabled={image === null || !dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
