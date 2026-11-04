/**
 * WebGL detection, kept apart from the renderer so the panel can decide whether to load the
 * deepslate chunk at all. Headless test environments (happy-dom) and machines with WebGL
 * disabled report `false`, and the panel shows a message instead.
 */

let cached: boolean | undefined;

/** True when a WebGL context can be created in this document. Never throws. */
export function hasWebGL(): boolean {
  if (cached !== undefined) return cached;
  try {
    const gl =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('webgl');
    cached = gl !== null && gl !== undefined;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
