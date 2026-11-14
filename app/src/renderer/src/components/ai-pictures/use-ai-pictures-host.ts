/**
 * `App`'s AI pictures host (ADR 0093 D6): reads the status from main at start and on
 * `refresh`, and opens Settings for "Set up AI pictures in Settings".
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPicturesPlatform, AiPicturesStatus } from '../../../../shared/ai-pictures';
import type { AiPicturesHost } from './ai-pictures-host';

/** The host, or `null` without main's AI pictures services. */
export function useAiPicturesHost(
  platform: AiPicturesPlatform | undefined,
  openSettings: () => void,
): AiPicturesHost | null {
  const [status, setStatus] = useState<AiPicturesStatus | null>(null);
  const settingsRef = useRef(openSettings);
  settingsRef.current = openSettings;
  const refresh = useCallback(() => {
    if (platform === undefined) return;
    platform.status().then(setStatus, () => setStatus(null));
  }, [platform]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return useMemo(
    () =>
      platform === undefined
        ? null
        : { platform, status, refresh, openSettings: () => settingsRef.current() },
    [platform, status, refresh],
  );
}
