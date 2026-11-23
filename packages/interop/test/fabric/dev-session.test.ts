import { describe, expect, it } from 'vitest';
import {
  checkedGame,
  DEV_RESOURCE_PACK_ID,
  type DevStatus,
  devDataPackPath,
  devFileText,
  devInfo,
  devPaths,
  devWorldFolder,
  GAME_RUNNING_STALE_MS,
  gameWorldFolder,
  installedDevRecord,
  isGameRunning,
  isGameWorldFolder,
  isHandled,
  isPresetId,
  nextPlayRequest,
  nextRequest,
  oldWorldFolder,
  parseDevInfo,
  parseDevRequest,
  parseDevStatus,
  parseInstalledDevRecord,
  parsePlayRequest,
  playWorldFolder,
} from '../../src/index';

const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);

function status(time: number, handled: DevStatus['handled'] = null): DevStatus {
  return { format: 1, state: 'world', world: 'msm-test-ruby', handled, time, runtime: '1.4.0' };
}

describe('dev file paths and names', () => {
  it('puts every file in msm-dev and the packs in their game folders', () => {
    const paths = devPaths('/games/inst/.minecraft');
    expect(paths).toEqual({
      dir: '/games/inst/.minecraft/msm-dev',
      info: '/games/inst/.minecraft/msm-dev/dev.json',
      play: '/games/inst/.minecraft/msm-dev/play.json',
      request: '/games/inst/.minecraft/msm-dev/request.json',
      status: '/games/inst/.minecraft/msm-dev/status.json',
      installed: '/games/inst/.minecraft/msm-dev/installed.json',
      setup: '/games/inst/.minecraft/msm-dev/setup.mcfunction',
      overlay: '/games/inst/.minecraft/msm-dev/overlay',
      resourcePack: '/games/inst/.minecraft/resourcepacks/msm-dev',
    });
    expect(devDataPackPath('C:\\g', 'msm-test-ruby')).toBe(
      'C:\\g/saves/msm-test-ruby/datapacks/msm-dev',
    );
    expect(DEV_RESOURCE_PACK_ID).toBe('file/msm-dev');
  });

  it('names the test world and its renamed copies without reusing a name', () => {
    expect(devWorldFolder('ruby_mod')).toBe('msm-test-ruby_mod');
    expect(() => devWorldFolder('Bad NS')).toThrow();
    expect(oldWorldFolder('msm-test-ruby', [])).toBe('msm-test-ruby-old-1');
    expect(oldWorldFolder('msm-test-ruby', ['msm-test-ruby-old-1', 'msm-test-ruby-old-2'])).toBe(
      'msm-test-ruby-old-3',
    );
    expect(() => oldWorldFolder('../x', [])).toThrow();
    expect(() => devDataPackPath('/g', '..')).toThrow();
  });
});

describe('isGameRunning', () => {
  it('counts a status fresher than ten seconds as running', () => {
    const now = 1_000_000;
    expect(isGameRunning(null, now)).toBe(false);
    expect(isGameRunning(status(now), now)).toBe(true);
    expect(isGameRunning(status(now - GAME_RUNNING_STALE_MS + 1), now)).toBe(true);
    expect(isGameRunning(status(now - GAME_RUNNING_STALE_MS), now)).toBe(false);
    expect(isGameRunning(status(now - 60_000), now)).toBe(false);
    expect(isGameRunning(status(now + 500), now)).toBe(true);
  });
});

describe('requests', () => {
  it('continues one sequence across play requests, requests and the status', () => {
    expect(nextRequest({}, 'reload', { assets: true, changes: 3 })).toEqual({
      format: 1,
      seq: 1,
      action: 'reload',
      assets: true,
      changes: 3,
    });
    const play = nextPlayRequest({}, 'msm-test-ruby');
    expect(play).toEqual({ format: 1, seq: 1, world: 'msm-test-ruby' });
    const request = nextRequest({ play }, 'quit');
    expect(request.seq).toBe(2);
    expect(request).toMatchObject({ action: 'quit', assets: false, changes: 0 });
    expect(
      nextRequest({ play, request, status: status(0, { seq: 7, ok: true }) }, 'reopen').seq,
    ).toBe(8);
    expect(nextPlayRequest({ request }, 'msm-test-ruby').seq).toBe(3);
    expect(() => nextRequest({}, 'reload', { changes: -1 })).toThrow();
  });

  it('says whether a request was handled', () => {
    expect(isHandled(null, 1)).toBe(false);
    expect(isHandled(status(0), 1)).toBe(false);
    expect(isHandled(status(0, { seq: 3, ok: true }), 3)).toBe(true);
    expect(isHandled(status(0, { seq: 3, ok: false, message: 'x' }), 2)).toBe(true);
    expect(isHandled(status(0, { seq: 3, ok: true }), 4)).toBe(false);
  });
});

describe('stable JSON and parsing', () => {
  it('writes sorted keys and reads every file back', () => {
    const info = devInfo({
      namespaces: ['ruby', 'ruby_extra'],
      target: 'mc-9.1',
      world: 'msm-test-ruby',
      appVersion: '1.5.0',
    });
    const text = devFileText(info);
    expect(text).toBe(
      '{\n  "appVersion": "1.5.0",\n  "format": 1,\n  "namespaces": [\n    "ruby",\n    "ruby_extra"\n  ],\n  "target": "mc-9.1",\n  "world": "msm-test-ruby"\n}\n',
    );
    expect(parseDevInfo(text)).toEqual(info);

    const play = nextPlayRequest({}, 'msm-test-ruby');
    expect(parsePlayRequest(devFileText(play))).toEqual(play);

    const request = nextRequest({}, 'reload', { assets: true, changes: 2 });
    expect(parseDevRequest(devFileText(request))).toEqual(request);

    const s = status(123, { seq: 4, ok: false, message: 'The world could not be opened.' });
    expect(parseDevStatus(devFileText(s))).toEqual(s);
    expect(
      parseDevStatus(devFileText({ ...s, state: 'title', world: null, handled: null })),
    ).toEqual({
      ...s,
      state: 'title',
      world: null,
      handled: null,
    });

    const installed = installedDevRecord(
      { modId: 'ruby', runtime: '1.4.0', fabricApi: '0.140.0+9.1', modJson: HASH },
      {
        'msm/ruby/block/lamp.json': { sha256: HASH, frozen: HASH2, element: 'ruby:lamp' },
        'data/ruby/function/a.mcfunction': { sha256: HASH2 },
      },
    );
    expect(installed.overlay).toEqual({});
    expect(parseInstalledDevRecord(devFileText(installed))).toEqual(installed);
    const withOverlay = { ...installed, overlay: { 'data/ruby/function/a.mcfunction': HASH } };
    expect(parseInstalledDevRecord(devFileText(withOverlay))).toEqual(withOverlay);
  });

  it('returns null for missing, unreadable, other-format or invalid files', () => {
    expect(parseDevInfo(null)).toBeNull();
    expect(parseDevInfo('{')).toBeNull();
    expect(parseDevInfo('[]')).toBeNull();
    expect(
      parseDevInfo('{"format":2,"namespaces":["a"],"target":"t","world":"w","appVersion":"1"}'),
    ).toBeNull();
    expect(
      parseDevInfo('{"format":1,"namespaces":[],"target":"t","world":"w","appVersion":"1"}'),
    ).toBeNull();
    expect(parsePlayRequest('{"format":1,"seq":0,"world":"w"}')).toBeNull();
    expect(parsePlayRequest('{"format":1,"seq":1,"world":"../w"}')).toBeNull();
    expect(
      parseDevRequest('{"format":1,"seq":1,"action":"explode","assets":false,"changes":0}'),
    ).toBeNull();
    expect(parseDevRequest('{"format":1,"seq":1,"action":"reload","changes":0}')).toBeNull();
    expect(
      parseDevStatus(
        '{"format":1,"state":"menu","world":null,"handled":null,"time":1,"runtime":"1"}',
      ),
    ).toBeNull();
    expect(
      parseDevStatus(
        '{"format":1,"state":"world","world":null,"handled":{"seq":1},"time":1,"runtime":"1"}',
      ),
    ).toBeNull();
    expect(
      parseDevStatus('{"format":1,"state":"world","world":null,"time":1,"runtime":"1"}'),
    ).toBeNull();
    const jar = { modId: 'ruby', runtime: '1', fabricApi: '1', modJson: HASH };
    expect(
      parseInstalledDevRecord(
        JSON.stringify({ format: 1, jar, files: { '../x': { sha256: HASH } }, overlay: {} }),
      ),
    ).toBeNull();
    expect(
      parseInstalledDevRecord(
        JSON.stringify({ format: 1, jar, files: { 'a/b': { sha256: 'xyz' } }, overlay: {} }),
      ),
    ).toBeNull();
    expect(
      parseInstalledDevRecord(
        JSON.stringify({ format: 1, jar, files: {}, overlay: { 'a/b': 'no' } }),
      ),
    ).toBeNull();
    expect(
      parseInstalledDevRecord(
        JSON.stringify({ format: 1, jar: { ...jar, modJson: 1 }, files: {}, overlay: {} }),
      ),
    ).toBeNull();
    expect(() => devInfo({ namespaces: [], target: 't', world: 'w', appVersion: '1' })).toThrow();
  });
});

describe('Play my game (ADR 0116 D1)', () => {
  const game = { preset: 'ruby:sky_block', gameMode: 'adventure', difficulty: 'hard' } as const;

  it('names the game world beside the test world', () => {
    expect(gameWorldFolder('ruby')).toBe('msm-game-ruby');
    expect(playWorldFolder('game', 'ruby')).toBe('msm-game-ruby');
    expect(playWorldFolder('test', 'ruby')).toBe('msm-test-ruby');
    expect(() => gameWorldFolder('Ruby')).toThrow();
    expect(isGameWorldFolder('msm-game-ruby')).toBe(true);
    expect(isGameWorldFolder('msm-game-')).toBe(false);
    expect(isGameWorldFolder('msm-test-ruby')).toBe(false);
    expect(oldWorldFolder('msm-game-ruby', ['msm-game-ruby-old-1'])).toBe('msm-game-ruby-old-2');
  });

  it('writes a game play request and reads it back', () => {
    const request = nextPlayRequest({}, 'msm-game-ruby', game);
    expect(request).toEqual({
      format: 1,
      seq: 1,
      world: 'msm-game-ruby',
      kind: 'game',
      preset: 'ruby:sky_block',
      gameMode: 'adventure',
      difficulty: 'hard',
    });
    const text = devFileText(request);
    expect(text).toBe(
      '{\n  "difficulty": "hard",\n  "format": 1,\n  "gameMode": "adventure",\n  "kind": "game",\n' +
        '  "preset": "ruby:sky_block",\n  "seq": 1,\n  "world": "msm-game-ruby"\n}\n',
    );
    expect(parsePlayRequest(text)).toEqual(request);
    // A test request stays as before (no kind), so older runtimes read it.
    expect(nextPlayRequest({}, 'msm-test-ruby')).toEqual({
      format: 1,
      seq: 1,
      world: 'msm-test-ruby',
    });
    expect(parsePlayRequest('{"format":1,"kind":"test","seq":2,"world":"msm-test-ruby"}')).toEqual({
      format: 1,
      seq: 2,
      world: 'msm-test-ruby',
    });
  });

  it('refuses a game request that the runtime would refuse', () => {
    expect(() => nextPlayRequest({}, 'msm-test-ruby', game)).toThrow(/game world/);
    expect(() => nextPlayRequest({}, 'msm-game-ruby', { ...game, preset: 'sky' })).toThrow();
    expect(() =>
      nextPlayRequest({}, 'msm-game-ruby', { ...game, gameMode: 'hardcore' as never }),
    ).toThrow();
    expect(() =>
      nextPlayRequest({}, 'msm-game-ruby', { ...game, difficulty: 'extreme' as never }),
    ).toThrow();
    const good = devFileText(nextPlayRequest({}, 'msm-game-ruby', game));
    for (const bad of [
      good.replace('"game"', '"other"'),
      good.replace('adventure', 'hardcore'),
      good.replace('"hard"', '"extreme"'),
      good.replace('ruby:sky_block', 'ruby:sky/'),
      good.replace('msm-game-ruby', 'msm-test-ruby'),
      good.replace('  "preset": "ruby:sky_block",\n', ''),
    ]) {
      expect(parsePlayRequest(bad)).toBeNull();
    }
    expect(isPresetId('minecraft:normal')).toBe(true);
    expect(isPresetId('a:b//c')).toBe(false);
    expect(checkedGame(game)).toEqual(game);
  });

  it('reads the seed the runtime reports', () => {
    const withSeed = { ...status(5), world: 'msm-game-ruby', seed: '-4172144997902289642' };
    expect(parseDevStatus(devFileText(withSeed))).toEqual(withSeed);
    expect(parseDevStatus(devFileText(status(5)))).toEqual(status(5));
    expect(parseDevStatus(devFileText({ ...status(5), seed: 'x' } as DevStatus))).toBeNull();
  });
});
