import type { MsmBridge } from '../../shared/platform';

declare global {
  interface Window {
    /** The preload bridge (see `src/preload/index.ts`). */
    msm: MsmBridge;
  }
}
