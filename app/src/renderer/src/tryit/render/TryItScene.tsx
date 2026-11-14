/**
 * The lazy boundary of Try it's view (ADR 0085 D12): checks for WebGL, then loads the
 * `TryItCanvas` chunk (deepslate, gl-matrix) with `lazy()`, as the preview panel loads
 * `PreviewCanvas`. Without WebGL it shows the preview's "WebGL is disabled" message and its
 * `children` (the view puts the Play button there); importing this module loads no renderer.
 */

import { lazy, type ReactNode, Suspense, useState } from 'react';
import { hasWebGL } from '../../preview/webgl';
import type { TryItCanvasProps } from './TryItCanvas';

export type {
  CameraPose,
  PerFrame,
  PickedOutline,
  TryItCanvasProps,
  TryItFrameStats,
  TryItGrid,
  TryItResourceInfo,
} from './TryItCanvas';

const TryItCanvas = lazy(() => import('./TryItCanvas'));

/** The message shown without WebGL, the same words as the preview panel's. */
export const NO_WEBGL_MESSAGE = 'Preview unavailable: WebGL is disabled.';

/** Props of {@link TryItScene}: the canvas's, plus what to show without WebGL. */
export type TryItSceneProps = TryItCanvasProps & {
  /** Shown under the message when there is no WebGL, for example the Play button. */
  children?: ReactNode;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
};

/** Try it's view of the test area, or the no-WebGL message. */
export function TryItScene({ children, webgl, ...props }: TryItSceneProps) {
  const [lost, setLost] = useState(false);
  const available = (webgl ?? hasWebGL()) && !lost;
  if (!available) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p role="alert" className="text-sm text-muted">
          {NO_WEBGL_MESSAGE}
        </p>
        {children}
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <p className="grid size-full place-items-center text-sm text-muted">
          Loading the test area…
        </p>
      }
    >
      <TryItCanvas
        {...props}
        onWebGLUnavailable={() => {
          setLost(true);
          props.onWebGLUnavailable?.();
        }}
      />
    </Suspense>
  );
}
