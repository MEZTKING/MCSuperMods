/**
 * The "Use AI pictures" switch of the Creator and "Surprise me" (ADR 0093 D7): shown only when
 * the chosen service has a key, off by default. Nothing is sent until "Create" or "Make it";
 * then each block and item texture is made with one request, with progress and a Stop button.
 * A texture that fails keeps its built-in picture, and the note says so.
 *
 * Test ids: `<testId>` (the switch), `<testId>-progress`, `<testId>-stop`.
 *
 * @packageDocumentation
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { aiPicturesReady, useAiPictures } from './ai-pictures-host';
import {
  type AiBatchProgress,
  type AssetItem,
  aiTextureItems,
  aiTextures,
  batchNote,
  canvasCodec,
} from './generate';

/** The switch's words. */
export const USE_AI_PICTURES = 'Use AI pictures';

/** What {@link useAiBatch} gives. */
export interface AiBatch {
  /** Whether the switch is offered (a key is set). */
  available: boolean;
  on: boolean;
  setOn(on: boolean): void;
  progress: AiBatchProgress | null;
  /** Makes the textures of `items` when the switch is on; else returns them as they are. */
  run<T extends AssetItem>(
    items: readonly T[],
    theme?: string,
  ): Promise<{ items: T[]; note: string | null }>;
  /** Stops the batch: the request running is cancelled, the rest keep their pictures. */
  stop(): void;
}

/** The state of one switch. */
export function useAiBatch(): AiBatch {
  const host = useAiPictures();
  const available = host !== null && aiPicturesReady(host.status);
  const [on, setOn] = useState(false);
  const [progress, setProgress] = useState<AiBatchProgress | null>(null);
  const stopped = useRef(false);
  const request = useRef<string | null>(null);

  const run = useCallback(
    async <T extends AssetItem>(
      items: readonly T[],
      theme?: string,
    ): Promise<{ items: T[]; note: string | null }> => {
      if (!on || !available || host === null || aiTextureItems(items).length === 0) {
        return { items: [...items], note: null };
      }
      stopped.current = false;
      try {
        const result = await aiTextures(items, {
          platform: host.platform,
          codec: host.codec ?? canvasCodec,
          ...(theme === undefined ? {} : { theme }),
          onProgress: setProgress,
          onRequest: (id) => {
            request.current = id;
          },
          cancelled: () => stopped.current,
        });
        return { items: result.items, note: batchNote(result) };
      } finally {
        request.current = null;
        setProgress(null);
      }
    },
    [on, available, host],
  );

  const stop = useCallback(() => {
    stopped.current = true;
    if (request.current !== null && host !== null) void host.platform.cancel(request.current);
  }, [host]);

  return { available, on: on && available, setOn, progress, run, stop };
}

/** The switch, and the progress while a batch runs. */
export function AiPicturesSwitch(props: { batch: AiBatch; testId: string; disabled?: boolean }) {
  const { batch } = props;
  if (!batch.available) return null;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          data-testid={props.testId}
          checked={batch.on}
          disabled={props.disabled === true || batch.progress !== null}
          onChange={(event) => batch.setOn(event.target.checked)}
        />
        {USE_AI_PICTURES}
      </label>
      {batch.on && batch.progress === null && (
        <p className="text-xs text-muted">
          Each block and item picture is made by your image service when you make it: one request a
          picture, charged to your account. Pictures that fail keep the built-in art.
        </p>
      )}
      {batch.progress !== null && (
        <div className="flex items-center gap-2 text-xs" role="status">
          <span data-testid={`${props.testId}-progress`}>
            Making AI pictures: {batch.progress.done} of {batch.progress.total}
            {batch.progress.current === null ? '' : ` (${batch.progress.current})`}…
          </span>
          <Button data-testid={`${props.testId}-stop`} onClick={batch.stop}>
            Stop
          </Button>
        </div>
      )}
    </div>
  );
}
