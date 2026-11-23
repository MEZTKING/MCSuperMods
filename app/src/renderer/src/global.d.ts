import type { MsmBridge } from '../../shared/platform';

declare global {
  interface Window {
    /** The preload bridge (see `src/preload/index.ts`). */
    msm: MsmBridge;
    /** When `true`, the Raw JSON editor uses a `<textarea>` instead of Monaco (tests, smoke). */
    msmNoMonaco?: boolean;
    /**
     * When `true`, every More options never opened or closed starts open (end-to-end runs with
     * `MSM_E2E_MORE_OPTIONS=open`, ADR 0130).
     */
    msmMoreOptionsOpen?: boolean;
  }
}
