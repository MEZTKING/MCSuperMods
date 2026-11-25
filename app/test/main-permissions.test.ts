/**
 * The app session's permission handlers (B870): only the copy buttons, the editor's Paste,
 * Try it's pointer lock and full screen, and only for the app's own page; notifications,
 * devices and the rest are refused. The real handlers in the window are checked by e2e
 * `plugins-path`.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PERMISSIONS,
  appOrigins,
  installPermissionHandlers,
  originOf,
  type PermissionSession,
  permissionAllowed,
} from '../src/main/permissions';

const origins = appOrigins(undefined);
const page = 'msm-app://app/index.html';

describe('permissions', () => {
  it('builds origins for msm-app and the dev server by hand', () => {
    expect(originOf(page)).toBe('msm-app://app');
    expect(originOf('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(originOf('blob:msm-app://app/1234')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect([...origins]).toEqual(['msm-app://app']);
    expect([...appOrigins('http://localhost:5173/')]).toEqual([
      'msm-app://app',
      'http://localhost:5173',
    ]);
  });

  it('allows what the app uses, on its own page only', () => {
    expect([...ALLOWED_PERMISSIONS].sort()).toEqual([
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'pointerLock',
    ]);
    for (const permission of ALLOWED_PERMISSIONS) {
      expect(permissionAllowed(permission, page, origins), permission).toBe(true);
      expect(permissionAllowed(permission, 'https://example.com/', origins), permission).toBe(
        false,
      );
      expect(permissionAllowed(permission, 'blob:msm-app://app/x', origins), permission).toBe(
        false,
      );
      expect(permissionAllowed(permission, undefined, origins), permission).toBe(false);
    }
  });

  it('refuses notifications, devices, media and everything else', () => {
    for (const permission of [
      'notifications',
      'media',
      'hid',
      'serial',
      'usb',
      'geolocation',
      'persistent-storage',
      'fileSystem',
      'openExternal',
      'midi',
      'midiSysex',
      'idle-detection',
      'screen-wake-lock',
      'display-capture',
      'keyboardLock',
      'storage-access',
      'deprecated-sync-clipboard-read',
      'unknown',
    ]) {
      expect(permissionAllowed(permission, page, origins), permission).toBe(false);
    }
  });

  it('installs request, check and device handlers that answer the same way', () => {
    const set: {
      request?: Parameters<PermissionSession['setPermissionRequestHandler']>[0];
      check?: Parameters<PermissionSession['setPermissionCheckHandler']>[0];
      device?: Parameters<PermissionSession['setDevicePermissionHandler']>[0];
    } = {};
    installPermissionHandlers(
      {
        setPermissionRequestHandler: (handler) => {
          set.request = handler;
        },
        setPermissionCheckHandler: (handler) => {
          set.check = handler;
        },
        setDevicePermissionHandler: (handler) => {
          set.device = handler;
        },
      },
      origins,
    );
    const { request, check, device } = set;
    if (request === undefined || check === undefined || device === undefined) {
      throw new Error('A handler was not set.');
    }
    const asked = (permission: string): boolean => {
      let granted = false;
      request(
        null,
        permission,
        (value) => {
          granted = value;
        },
        { requestingUrl: page },
      );
      return granted;
    };
    expect(asked('notifications')).toBe(false);
    expect(asked('pointerLock')).toBe(true);
    expect(asked('media')).toBe(false);
    expect(check(null, 'notifications', 'msm-app://app', { requestingUrl: page })).toBe(false);
    expect(check(null, 'clipboard-sanitized-write', 'msm-app://app', {})).toBe(true);
    expect(check(null, 'hid', 'msm-app://app', { requestingUrl: page })).toBe(false);
    expect(device({ deviceType: 'usb' })).toBe(false);
  });
});
