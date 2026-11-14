/**
 * "Make with AI" (ADR 0093 D5): a description prefilled from the thing's name, kind and theme
 * (editable), the style ("Minecraft block texture", "Item icon", "Tool"), the size, and
 * "Make 4": four pictures from the chosen service, each shown before and after the clean-up.
 * Picking one hands its cleaned-up PNG to the host, which writes it as one undoable step. A
 * running request can be cancelled.
 *
 * Test ids: `ai-pictures-dialog`, `ai-pictures-prompt`, `ai-pictures-style-<style>`,
 * `ai-pictures-size`, `ai-pictures-generate`, `ai-pictures-cancel`, `ai-pictures-status`,
 * `ai-pictures-error`, `ai-pictures-result-<n>`, `ai-pictures-before-<n>`,
 * `ai-pictures-after-<n>`, `ai-pictures-use`, `ai-pictures-close`.
 *
 * @packageDocumentation
 */

import { Sparkles } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AI_PICTURE_SERVICE_INFO,
  AI_PICTURE_STYLE_LABELS,
  AI_PICTURE_STYLES,
  AI_PICTURES_MAX_COUNT,
  AI_PICTURES_PROMPT_MAX,
  type AiPictureStyle,
} from '../../../../shared/ai-pictures';
import { fieldClass } from '../NewElementDialog';
import { imageDataUrl } from '../texture-editor/png-canvas';
import { Button } from '../ui/Button';
import type { AiPicturesHost } from './ai-pictures-host';
import { type AiCandidate, AiRoundError, canvasCodec, runRound } from './generate';

/** Props of {@link MakeWithAiDialog}. */
export interface MakeWithAiDialogProps {
  host: AiPicturesHost;
  /** What is being made, for the title: "ruby_mod:textures/item/ruby.png". */
  target: string;
  defaultPrompt: string;
  defaultStyle: AiPictureStyle;
  /** The texture's edge (16 or 32). */
  size: number;
  /** The largest edge allowed (smaller sizes only); absent: 16 and 32. */
  maxSize?: number;
  /** Very easy mode's wording. */
  veryEasy?: boolean;
  /** Writes the picked picture; rejects with a message when it cannot. */
  onPick(bytes: Uint8Array): Promise<void> | void;
  onClose(): void;
}

const SIZES = [16, 32] as const;

/** The sizes offered: 16 and 32, those up to `maxSize`, or `maxSize` itself when smaller. */
export function sizesUpTo(maxSize: number | undefined, size: number): number[] {
  if (maxSize === undefined) return [...SIZES];
  const allowed = SIZES.filter((value) => value <= maxSize);
  return allowed.length > 0 ? allowed : [Math.max(1, Math.min(size, maxSize))];
}

export function MakeWithAiDialog(props: MakeWithAiDialogProps) {
  const { host } = props;
  const codec = host.codec ?? canvasCodec;
  const [prompt, setPrompt] = useState(props.defaultPrompt);
  const [style, setStyle] = useState<AiPictureStyle>(props.defaultStyle);
  const sizes = sizesUpTo(props.maxSize, props.size);
  const [size, setSize] = useState(sizes.includes(props.size) ? props.size : (sizes[0] as number));
  const [results, setResults] = useState<AiCandidate[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const liveRef = useRef(true);
  const promptId = useId();
  const sizeId = useId();
  const service = host.status === null ? null : AI_PICTURE_SERVICE_INFO[host.status.service];

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (requestRef.current !== null) void host.platform.cancel(requestRef.current);
    };
  }, [host.platform]);

  const generate = async (): Promise<void> => {
    if (prompt.trim() === '' || running) return;
    setRunning(true);
    setError(null);
    setChosen(null);
    try {
      const made = await runRound(
        host.platform,
        codec,
        { prompt: prompt.trim(), style, size, count: AI_PICTURES_MAX_COUNT },
        (requestId) => {
          requestRef.current = requestId;
        },
      );
      if (!liveRef.current) return;
      setResults(made);
      setChosen(0);
    } catch (caught) {
      if (!liveRef.current) return;
      if (caught instanceof AiRoundError && caught.errorClass === 'cancelled') {
        setError('Cancelled.');
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      requestRef.current = null;
      if (liveRef.current) setRunning(false);
    }
  };

  const cancel = (): void => {
    if (requestRef.current !== null) void host.platform.cancel(requestRef.current);
  };

  const use = async (): Promise<void> => {
    const picked = chosen === null ? undefined : results[chosen];
    if (picked === undefined) return;
    setSaving(true);
    setError(null);
    try {
      await props.onPick(picked.cleaned);
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  const urls = useMemo(
    () =>
      results.map((result) => ({
        before: imageDataUrl(result.raw),
        after: imageDataUrl(result.cleaned),
      })),
    [results],
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content
          data-testid="ai-pictures-dialog"
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[70] flex max-h-[92vh] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">
            {props.veryEasy === true ? 'Make it with AI' : 'Make with AI'}: {props.target}
          </Dialog.Title>
          <p className="text-xs text-muted">
            Only the description below is sent to {service?.label ?? 'the image service'}, never
            your project files. Each picture costs a little on your own account.
          </p>
          <label htmlFor={promptId} className="text-sm">
            Description
          </label>
          <textarea
            id={promptId}
            data-testid="ai-pictures-prompt"
            className={`${fieldClass} min-h-16`}
            maxLength={AI_PICTURES_PROMPT_MAX}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Style">
            {AI_PICTURE_STYLES.map((id) => (
              <label key={id} className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name="ai-pictures-style"
                  data-testid={`ai-pictures-style-${id}`}
                  checked={style === id}
                  onChange={() => setStyle(id)}
                />
                {AI_PICTURE_STYLE_LABELS[id]}
              </label>
            ))}
            <label htmlFor={sizeId} className="ml-auto text-sm">
              Size
            </label>
            <select
              id={sizeId}
              data-testid="ai-pictures-size"
              className={fieldClass}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            >
              {sizes.map((value) => (
                <option key={value} value={value}>
                  {value} × {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              data-testid="ai-pictures-generate"
              disabled={running || saving || prompt.trim() === ''}
              onClick={() => void generate()}
            >
              <Sparkles size={14} aria-hidden />
              {results.length === 0 ? 'Make 4' : 'Make 4 more'}
            </Button>
            {running && (
              <Button data-testid="ai-pictures-cancel" onClick={cancel}>
                Cancel
              </Button>
            )}
            <span role="status" className="text-xs text-muted" data-testid="ai-pictures-status">
              {running
                ? 'Making pictures… this can take up to a minute.'
                : results.length > 0
                  ? 'Pick one. Left: what the service drew. Right: cleaned up for Minecraft.'
                  : ''}
            </span>
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-error" data-testid="ai-pictures-error">
              {error}
            </p>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-2" role="listbox" aria-label="Pictures">
              {results.map((result, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={chosen === index}
                  data-testid={`ai-pictures-result-${index}`}
                  className={`flex items-center gap-2 rounded border p-2 ${chosen === index ? 'border-accent' : 'border-border'}`}
                  onClick={() => setChosen(index)}
                >
                  <img
                    alt={`Number ${index + 1} as drawn`}
                    src={urls[index]?.before}
                    data-testid={`ai-pictures-before-${index}`}
                    className="size-24 object-contain"
                  />
                  <img
                    alt={`Number ${index + 1} cleaned up`}
                    src={urls[index]?.after}
                    data-testid={`ai-pictures-after-${index}`}
                    className="size-24 bg-[repeating-conic-gradient(#d8d8d8_0_25%,#b8b8b8_0_50%)] bg-[length:12px_12px] [image-rendering:pixelated]"
                  />
                  <span className="text-xs text-muted">
                    {result.image.width} × {result.image.height}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            <Button
              data-testid="ai-pictures-use"
              disabled={chosen === null || running || saving}
              onClick={() => void use()}
            >
              {saving ? 'Saving…' : 'Use this picture'}
            </Button>
            <Button data-testid="ai-pictures-close" disabled={saving} onClick={props.onClose}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
