import type { MsmBridge } from '../../shared/platform';

declare global {
  interface Window {
    /** The preload bridge (see `src/preload/index.ts`). */
    msm: MsmBridge;
    /** When `true`, the Raw JSON editor uses a `<textarea>` instead of Monaco (tests, smoke). */
    msmNoMonaco?: boolean;
  }
}
