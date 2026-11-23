import { describe, expect, it } from 'vitest';
import {
  applyServerProperties,
  DEFAULT_SERVER_PORT,
  eulaAccepted,
  eulaText,
  isEulaAcceptance,
  parseProperties,
  propertyLine,
  readEula,
  ServerError,
  serverPropertyValues,
  setProperties,
  writeEulaAcceptance,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';
import { text } from './helpers';

/** A file as the server writes it at its first start (sorted keys, `:` escaped; B760 N11). */
const AS_WRITTEN = [
  '#Minecraft server properties',
  '#Mon Nov 23 17:54:25 UTC 2026',
  'difficulty=easy',
  'level-name=world',
  'level-type=minecraft\\:normal',
  'max-players=20',
  'motd=A Minecraft Server',
  'online-mode=true',
  'server-port=25565',
  'spawn-protection=16',
  'white-list=true',
  '',
].join('\n');

describe('reading and writing properties as java.util.Properties does', () => {
  it('reads escapes, separators, comments, continuations and duplicates', () => {
    const map = parseProperties(
      [
        '# a comment',
        '! another',
        'level-type=minecraft\\:normal',
        'motd = Hello\\u0021  ',
        'key\\ with\\ spaces:value',
        'long=one \\',
        '    two',
        'motd=Second wins',
        'empty=',
        'bare',
      ].join('\r\n'),
    );
    expect(map.get('level-type')).toBe('minecraft:normal');
    expect(map.get('key with spaces')).toBe('value');
    expect(map.get('long')).toBe('one two');
    expect(map.get('motd')).toBe('Second wins');
    expect(map.get('empty')).toBe('');
    expect(map.get('bare')).toBe('');
    expect(map.has('# a comment')).toBe(false);
  });

  it('writes keys and values the server reads back the same', () => {
    expect(propertyLine('level-type', 'gem_hunt:sky')).toBe('level-type=gem_hunt\\:sky');
    expect(propertyLine('motd', ' Hi = #1 !')).toBe('motd=\\ Hi \\= \\#1 \\!');
    for (const value of ['a:b', ' lead', 'x\\y', 'tab\there', 'é ü']) {
      expect(parseProperties(`${propertyLine('k', value)}\n`).get('k')).toBe(value);
    }
  });

  it('sets keys one by one and keeps every other line, CRLF included', () => {
    const before = '#mine\r\nmotd=Mine\r\nmax-players=5\r\nmotd=Later\r\n';
    const after = setProperties(before, { motd: 'New', 'server-port': '25570' });
    expect(after).toBe('#mine\r\nmotd=Mine\r\nmax-players=5\r\nmotd=New\r\nserver-port=25570\r\n');
    expect(setProperties(null, { 'white-list': 'false' })).toBe('white-list=false\n');
  });
});

describe('MSM keys in server.properties', () => {
  it('has the defaults of ADR 0133 D7: online mode on, the white list off, no spawn protection', () => {
    expect(serverPropertyValues({})).toEqual({
      'level-name': 'world',
      'online-mode': 'true',
      'server-port': String(DEFAULT_SERVER_PORT),
      'spawn-protection': '0',
      'white-list': 'false',
    });
    expect(
      serverPropertyValues({ levelType: 'gem_hunt:sky', motd: 'Gem hunt', port: 25570 }),
    ).toMatchObject({
      'level-type': 'gem_hunt:sky',
      motd: 'Gem hunt',
      'server-port': '25570',
    });
    expect(() => serverPropertyValues({ port: 70000 })).toThrow();
    expect(() => serverPropertyValues({ levelType: 'not an id' })).toThrow();
    expect(() => serverPropertyValues({ motd: 'two\nlines' })).toThrow();
  });

  it('writes a new file with MSM keys only', () => {
    const applied = applyServerProperties(null, serverPropertyValues({}), {});
    expect(parseProperties(applied.text)).toEqual(
      new Map([
        ['level-name', 'world'],
        ['online-mode', 'true'],
        ['server-port', '25565'],
        ['spawn-protection', '0'],
        ['white-list', 'false'],
      ]),
    );
    expect(applied.keptUserValues).toEqual([]);
  });

  it("replaces the game's defaults, and keeps the user's own keys and the user's own values", () => {
    // The server wrote its defaults; the user then set their own keys and changed MSM's port.
    const first = applyServerProperties(AS_WRITTEN, serverPropertyValues({}), {});
    expect(parseProperties(first.text).get('white-list')).toBe('false');
    expect(parseProperties(first.text).get('spawn-protection')).toBe('0');
    const edited = setProperties(first.text, {
      difficulty: 'hard',
      'max-players': '4',
      'server-port': '25599',
      'view-distance': '6',
    });
    const second = applyServerProperties(
      edited,
      serverPropertyValues({ motd: 'Gem hunt' }),
      first.written,
    );
    const map = parseProperties(second.text);
    expect(map.get('difficulty')).toBe('hard');
    expect(map.get('max-players')).toBe('4');
    expect(map.get('view-distance')).toBe('6');
    expect(map.get('server-port')).toBe('25599');
    expect(map.get('motd')).toBe('Gem hunt');
    expect(map.get('level-type')).toBe('minecraft:normal');
    expect(second.keptUserValues).toEqual(['server-port']);
    expect(second.effective['server-port']).toBe('25599');
    expect(second.text.split('\n').slice(0, 2)).toEqual(AS_WRITTEN.split('\n').slice(0, 2));
  });

  it('keeps a value the user set back to the game default after MSM wrote its own', () => {
    const first = applyServerProperties(null, serverPropertyValues({}), {});
    const edited = setProperties(first.text, { 'white-list': 'true' });
    const again = applyServerProperties(edited, serverPropertyValues({}), first.written);
    expect(parseProperties(again.text).get('white-list')).toBe('true');
    expect(again.keptUserValues).toEqual(['white-list']);
    // And on every later run too.
    const third = applyServerProperties(again.text, serverPropertyValues({}), again.written);
    expect(parseProperties(third.text).get('white-list')).toBe('true');
    expect(third.text).toBe(again.text);
  });

  it('writes a forced key over the user value (a port found taken)', () => {
    const edited = setProperties(AS_WRITTEN, { 'server-port': '25599' });
    const applied = applyServerProperties(
      edited,
      serverPropertyValues({ port: 25601 }),
      {},
      new Set(['server-port']),
    );
    expect(parseProperties(applied.text).get('server-port')).toBe('25601');
  });

  it('changes nothing when everything is already as wanted', () => {
    const first = applyServerProperties(AS_WRITTEN, serverPropertyValues({}), {});
    const again = applyServerProperties(first.text, serverPropertyValues({}), first.written);
    expect(again.text).toBe(first.text);
  });

  it('refuses keys that are not MSM keys', () => {
    expect(() => applyServerProperties(null, { 'enable-rcon': 'true' } as never, {})).toThrow(
      /not a server setting/,
    );
  });
});

describe('the EULA', () => {
  const at = '2026-11-23T18:00:00Z';

  it('reads the file as the server does', () => {
    expect(eulaAccepted('eula=true\n')).toBe(true);
    expect(eulaAccepted('#c\neula=TRUE\n')).toBe(true);
    expect(eulaAccepted('eula=false\n')).toBe(false);
    expect(eulaAccepted('')).toBe(false);
    expect(eulaAccepted('eula=yes')).toBe(false);
  });

  it('is written only with the acceptance flag', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed('/srv/a/marker', 'x');
    expect(await readEula(fs, '/srv/a')).toBe('missing');
    for (const bad of [
      undefined,
      null,
      {},
      { accepted: false, at },
      { accepted: 'true', at },
      { accepted: true },
      { accepted: true, at: 'now' },
    ]) {
      expect(isEulaAcceptance(bad)).toBe(false);
      await expect(writeEulaAcceptance(fs, '/srv/a', bad as never)).rejects.toBeInstanceOf(
        ServerError,
      );
    }
    expect(fs.files.has('/srv/a/eula.txt')).toBe(false);
    await writeEulaAcceptance(fs, '/srv/a', { accepted: true, at });
    expect(text(fs.files.get('/srv/a/eula.txt') as Uint8Array)).toBe(
      eulaText({ accepted: true, at }),
    );
    expect(text(fs.files.get('/srv/a/eula.txt') as Uint8Array)).toContain(
      'https://aka.ms/MinecraftEULA',
    );
    expect(await readEula(fs, '/srv/a')).toBe('accepted');
    fs.seed('/srv/a/eula.txt', '#By changing the setting below to TRUE...\neula=false\n');
    expect(await readEula(fs, '/srv/a')).toBe('not-accepted');
  });
});
