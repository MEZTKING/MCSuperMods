import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import { useEffect, useRef } from 'react';
import type { AiPlatform } from '../../../../shared/platform';
import { Button } from '../ui/Button';
import { AiKeySetup } from './AiKeySetup';
import { useAiPanelStore } from './ai-controller';
import { SETUP_WORDS } from './ai-setup-words';

/** How long "The key works. You can start." stays before the panel goes on to the chat. */
export const READY_PAUSE_MS = 1200;

/** Main's AI services from the preload bridge, when there is one. */
function bridgeAi(): AiPlatform | undefined {
  return typeof window === 'undefined' ? undefined : (window as Partial<Window>).msm?.ai;
}

/**
 * The panel's first screen without a key (ADR 0125 D5): the set-up card in place, so the user
 * does not leave the panel. A passed check hands the new key status to the panel's store, which
 * then shows the chat; a failed one keeps the card with what to do. **All AI helper settings**
 * opens Settings on the helper's section.
 */
export function AiKeyMissing(props: {
  onOpenSettings(): void;
  /** Main's AI services; default the preload bridge's. */
  ai?: AiPlatform | undefined;
  /** Called once the key works; default: the panel's store reads the key status again. */
  onReady?: (() => void) | undefined;
}) {
  const ai = props.ai ?? bridgeAi();
  const model = useAiPanelStore((state) => state.settings?.model ?? DEFAULT_AI_SETTINGS.model);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const ready = (): void => {
    const go =
      props.onReady ??
      (() => {
        if (ai === undefined) return;
        void ai.keyStatus().then(
          (keyStatus) => useAiPanelStore.setState({ keyStatus }),
          () => {},
        );
      });
    timer.current = setTimeout(go, READY_PAUSE_MS);
  };
  return (
    <div className="flex flex-col gap-2 p-3 text-sm" data-testid="ai-key-missing">
      <AiKeySetup ai={ai} model={model} onReady={ready} />
      <div>
        <Button data-testid="ai-open-settings" onClick={props.onOpenSettings}>
          {SETUP_WORDS.moreSettings}
        </Button>
      </div>
    </div>
  );
}
