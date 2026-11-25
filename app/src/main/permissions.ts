/**
 * Web permissions for the app's session (B870, after B840's spike): Electron grants every
 * permission request by default, so before this a plugin worker could show desktop
 * notifications in the app's name. Main now answers every permission request and check
 * itself, and refuses all but the few the app's own page uses:
 *
 * - `clipboard-sanitized-write`: the copy buttons (`navigator.clipboard.writeText`).
 * - `clipboard-read`: Paste in the code editor's own menu (Monaco reads the clipboard). Plugin
 *   workers have no `navigator.clipboard`, so this never reaches a plugin.
 * - `pointerLock`: looking around in Try it.
 * - `fullscreen`: an element shown full screen.
 *
 * Each is allowed only for the app's own page (`msm-app://app`, or the dev server in
 * development). Sounds need no permission (Web Audio and `<audio>` play without one), so
 * `media` (camera and microphone) is refused with everything else: notifications, devices
 * (USB, HID, serial, Bluetooth), the GPU's devices, storage persistence, file system access,
 * opening other programs through links, wake locks, sensors, MIDI and the rest. Device
 * choosers are cancelled because main never answers them.
 *
 * @packageDocumentation
 */

import { APP_INDEX_URL } from './app-scheme';

/** The permissions the app's own page may use; everything else is refused. */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-sanitized-write',
  'clipboard-read',
  'pointerLock',
  'fullscreen',
]);

/**
 * The `scheme://host` of `url`, or `null`. Node's `URL` gives the origin `null` for schemes it
 * does not know, such as `msm-app:`, so the origin is built by hand.
 */
export function originOf(url: string | undefined): string | null {
  if (url === undefined || url === '') return null;
  try {
    const parsed = new URL(url);
    if (parsed.host === '') return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * The origins of the app's own page: `msm-app://app`, and the dev server's when one is set.
 *
 * @param devUrl - `ELECTRON_RENDERER_URL` (development only).
 */
export function appOrigins(devUrl: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  const app = originOf(APP_INDEX_URL);
  if (app !== null) origins.add(app);
  const dev = originOf(devUrl);
  if (dev !== null) origins.add(dev);
  return origins;
}

/**
 * Whether `permission` is granted to a page or worker of `requestingUrl`: only the permissions
 * in {@link ALLOWED_PERMISSIONS}, and only for the app's own origins.
 *
 * @param permission - Electron's permission name.
 * @param requestingUrl - The URL (or origin) asking.
 * @param origins - The app's own origins ({@link appOrigins}).
 */
export function permissionAllowed(
  permission: string,
  requestingUrl: string | undefined,
  origins: ReadonlySet<string>,
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  const origin = originOf(requestingUrl);
  return origin !== null && origins.has(origin);
}

/** The part of Electron's `Session` the handlers are set on. */
export interface PermissionSession {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: { requestingUrl?: string },
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: { requestingUrl?: string },
    ) => boolean,
  ): void;
  setDevicePermissionHandler(handler: (details: unknown) => boolean): void;
}

/**
 * Sets the request, check and device handlers on `session` (Electron's default session).
 * Call once after `app.ready`, before the window loads.
 *
 * @param session - The session.
 * @param origins - The app's own origins ({@link appOrigins}).
 */
export function installPermissionHandlers(
  session: PermissionSession,
  origins: ReadonlySet<string>,
): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permissionAllowed(permission, details.requestingUrl, origins));
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permissionAllowed(permission, details.requestingUrl ?? requestingOrigin, origins),
  );
  // Devices granted without a chooser (USB, HID, serial): never.
  session.setDevicePermissionHandler(() => false);
}
