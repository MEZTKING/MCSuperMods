import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkModrinthUpdates,
  fetchJsonPoster,
  MODRINTH_UPDATE_URL,
  MODRINTH_USER_AGENT,
  ModrinthLookupError,
} from '../src/index';

const recorded = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/modrinth/version-files-update.json'), 'utf8'),
) as { request: { hashes: string[] }; answer: unknown };

const [withBuild, without] = recorded.request.hashes as [string, string];

function recordedPoster(answer: unknown = recorded.answer) {
  const asked: { url: string; body: unknown }[] = [];
  const post = async (url: string, body: string): Promise<Uint8Array> => {
    asked.push({ url, body: JSON.parse(body) });
    return new TextEncoder().encode(JSON.stringify(answer));
  };
  return { post, asked };
}

describe('Modrinth update check (one batched call)', () => {
  it('sends every pinned SHA-1 in one call and reads the recorded answer', async () => {
    const { post, asked } = recordedPoster();
    const updates = await checkModrinthUpdates(post, [withBuild, without, withBuild], '99.2');
    expect(asked).toEqual([{ url: MODRINTH_UPDATE_URL, body: recorded.request }]);
    expect(updates).toEqual([
      {
        from: withBuild,
        versionNumber: '0.200.1+99.2',
        file: {
          projectId: 'P7dR8mSH',
          versionId: 'APIV0002',
          fileName: 'fabric-api-0.200.1+99.2.jar',
          url: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/APIV0002/fabric-api-0.200.1+99.2.jar',
          sha1: '3'.repeat(40),
          sha512: '4'.repeat(128),
          size: 2_100_000,
        },
      },
    ]);
  });

  it('asks nothing for no mods', async () => {
    const { post, asked } = recordedPoster();
    expect(await checkModrinthUpdates(post, [], '99.2')).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('refuses unusable hashes and versions before asking', async () => {
    const { post, asked } = recordedPoster();
    await expect(checkModrinthUpdates(post, ['nothex'], '99.2')).rejects.toThrow(
      ModrinthLookupError,
    );
    await expect(checkModrinthUpdates(post, [withBuild], '99 2; drop')).rejects.toThrow(
      ModrinthLookupError,
    );
    expect(asked).toEqual([]);
  });

  it('says plainly when Modrinth cannot be reached or is busy', async () => {
    const offline = async (): Promise<Uint8Array> => {
      throw new Error('getaddrinfo ENOTFOUND api.modrinth.com');
    };
    await expect(checkModrinthUpdates(offline, [withBuild], '99.2')).rejects.toThrow(
      /Modrinth could not be reached/,
    );
    const busy = async (): Promise<Uint8Array> => {
      throw new Error(`POST ${MODRINTH_UPDATE_URL} returned HTTP 429.`);
    };
    await expect(checkModrinthUpdates(busy, [withBuild], '99.2')).rejects.toThrow(
      /Modrinth is busy/,
    );
    const garbled = async (): Promise<Uint8Array> => new TextEncoder().encode('<html>');
    await expect(checkModrinthUpdates(garbled, [withBuild], '99.2')).rejects.toThrow(/not JSON/);
  });

  it('posts JSON over HTTPS with a User-Agent naming only the app and its repository', async () => {
    const calls: { url: string; init: { headers: Record<string, string>; method: string } }[] = [];
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = async (
      url: string,
      init: { headers: Record<string, string>; method: string },
    ) => {
      calls.push({ url, init });
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(2) };
    };
    try {
      await fetchJsonPoster(MODRINTH_UPDATE_URL, '{}');
      await expect(fetchJsonPoster('http://api.modrinth.com/v2', '{}')).rejects.toThrow(
        /not HTTPS/,
      );
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers['User-Agent']).toBe(MODRINTH_USER_AGENT);
    expect(MODRINTH_USER_AGENT).toBe('MCSuperMods (github.com/MEZTKING/MCSuperMods)');
  });
});
