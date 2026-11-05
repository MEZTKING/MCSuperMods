/**
 * The `msm-app` scheme the renderer is served from (ADR 0035 D1a): path containment on POSIX
 * and Windows paths, content types and the request handler.
 */

import { posix, win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
}));

const { APP_INDEX_URL, contentTypeFor, handleAppSchemeRequest, resolveAppSchemePath } =
  await import('../src/main/app-scheme');

const posixPath = { ...posix, sep: posix.sep };
const winPath = { ...win32, sep: win32.sep };

describe('resolveAppSchemePath', () => {
  const root = '/opt/msm/resources/app.asar/out/renderer';
  it('serves files inside the renderer folder', () => {
    expect(APP_INDEX_URL).toBe('msm-app://app/index.html');
    expect(resolveAppSchemePath(root, 'msm-app://app/index.html', posixPath)).toBe(
      `${root}/index.html`,
    );
    expect(resolveAppSchemePath(root, 'msm-app://app/', posixPath)).toBe(`${root}/index.html`);
    expect(resolveAppSchemePath(root, 'msm-app://app/assets/ts.worker-x.js?v=1', posixPath)).toBe(
      `${root}/assets/ts.worker-x.js`,
    );
    expect(resolveAppSchemePath(root, 'msm-app://app/assets/a%20b.png', posixPath)).toBe(
      `${root}/assets/a b.png`,
    );
  });

  it('refuses other hosts, schemes and escapes', () => {
    // The URL parser already folds literal dot segments, so they stay inside the folder.
    expect(resolveAppSchemePath(root, 'msm-app://app/../../etc/hostname', posixPath)).toBe(
      `${root}/etc/hostname`,
    );
    for (const url of [
      'msm-app://other/index.html',
      'file:///etc/hostname',
      'msm-app://app/assets/..%2f..%2fsecret',
      'msm-app://app/a%5c..%5csecret',
      'msm-app://app/%00',
      'msm-app://app/%E0%A4%A',
      'not a url',
    ]) {
      expect(resolveAppSchemePath(root, url, posixPath), url).toBeNull();
    }
  });

  it('contains Windows paths', () => {
    const winRoot =
      'C:\\Users\\a\\AppData\\Local\\Programs\\MCSuperMods\\resources\\app.asar\\out\\renderer';
    expect(resolveAppSchemePath(winRoot, 'msm-app://app/assets/index-x.js', winPath)).toBe(
      `${winRoot}\\assets\\index-x.js`,
    );
    expect(resolveAppSchemePath(winRoot, 'msm-app://app/C:/Windows/win.ini', winPath)).toBeNull();
    expect(resolveAppSchemePath(winRoot, 'msm-app://app/a%5Cb.js', winPath)).toBeNull();
    expect(resolveAppSchemePath(winRoot, 'msm-app://app/x/..%2f..%2fsecret', winPath)).toBeNull();
  });
});

describe('handleAppSchemeRequest', () => {
  it('answers with the file and its content type, or 404', async () => {
    const read = vi.fn(async (path: string) => {
      if (path.endsWith('index.html')) return new TextEncoder().encode('<!doctype html>');
      throw new Error('ENOENT');
    });
    const ok = await handleAppSchemeRequest('/r', 'msm-app://app/index.html', read);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await ok.text()).toBe('<!doctype html>');
    expect((await handleAppSchemeRequest('/r', 'msm-app://app/missing.js', read)).status).toBe(404);
    expect((await handleAppSchemeRequest('/r', 'msm-app://app/a/..%2f..%2fx', read)).status).toBe(
      404,
    );
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('knows the renderer content types', () => {
    expect(contentTypeFor('a/b.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('a/b.CSS')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('font.woff2')).toBe('font/woff2');
    expect(contentTypeFor('x.wasm')).toBe('application/wasm');
    expect(contentTypeFor('dir.v1/file')).toBe('application/octet-stream');
  });
});
