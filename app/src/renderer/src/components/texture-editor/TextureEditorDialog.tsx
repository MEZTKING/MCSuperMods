/**
 * The texture editor (ADR 0047 D5): paints a project PNG pixel by pixel. Pencil, eraser, fill
 * and eyedropper, a colour picker and the texture's own palette, zoom, undo and redo inside the
 * dialog. Save hands the PNG bytes to the host, which writes them as one undoable step.
 *
 * @packageDocumentation
 */

import { Eraser, PaintBucket, Pencil, Pipette, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { pngDataUrl } from '../AssetList';
import { Button } from '../ui/Button';
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
  /** The PNG to edit. */
  bytes: Uint8Array;
  /** Saves the edited PNG (the host writes it as one undoable step). */
  onSave(bytes: Uint8Array): Promise<void> | void;
  onClose(): void;
}

/** Decodes PNG bytes into RGBA pixels with an image and a canvas. */
async function decodePng(bytes: Uint8Array): Promise<RgbaImage> {
  const image = new Image();
  image.src = pngDataUrl(bytes);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This computer cannot draw images here.');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data) };
}

/** Encodes RGBA pixels as PNG bytes. */
function encodePng(image: RgbaImage): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This computer cannot draw images here.');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  const url = canvas.toDataURL('image/png');
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

export function TextureEditorDialog(props: TextureEditorDialogProps) {
  const [image, setImage] = useState<RgbaImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [colour, setColour] = useState<Rgba>([200, 40, 60, 255]);
  const [zoom, setZoom] = useState(16);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);
  const history = useRef(new PixelHistory());
  const drawing = useRef(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const colourId = useId();

  useEffect(() => {
    let live = true;
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
  }, [props.bytes]);

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
