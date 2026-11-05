import { describe, expect, it } from 'vitest';
import {
  analyseLog,
  fabricApiUrl,
  latestStableInstaller,
  parseArgs,
  serverLauncherUrl,
  serverProperties,
} from './index.ts';

const MODS = [
  '[10:03:50] [main/INFO]: Loading 44 mods:',
  '\t- fabric-api 0.165.2+1.0',
  '\t- msm_sample_mod 1.0.0',
  '\t   \\-- msm_runtime 0.0.1',
];
const REGISTERED =
  '[10:04:02] [main/INFO]: [msm_runtime] registered 3 block(s) and 6 item(s) from 7 definition file(s); 0 error(s), 0 warning(s)';
const DONE = '[10:04:06] [Server thread/INFO]: Done (0.787s)! For help, type "help"';
const OFFLINE = '[10:04:05] [Server thread/WARN]: **** SERVER IS RUNNING IN OFFLINE/INSECURE MODE!';
const expect3 = { expectBlocks: 3, expectItems: 6, allowWarnings: false };

describe('analyseLog', () => {
  it('passes a clean start and keeps the key lines', () => {
    const analysis = analyseLog([...MODS, REGISTERED, OFFLINE, DONE], expect3);
    expect(analysis.failures).toEqual([]);
    expect(analysis.ok).toBe(true);
    expect([analysis.blocks, analysis.items, analysis.files, analysis.errors]).toEqual([
      3, 6, 7, 0,
    ]);
    expect(analysis.keyLines).toEqual([...MODS, REGISTERED, DONE]);
  });

  it('fails on wrong counts, runtime errors and a missing Done', () => {
    const line = REGISTERED.replace('3 block(s)', '2 block(s)').replace('0 error(s)', '1 error(s)');
    const analysis = analyseLog(
      [line, '[10:04:02] [main/ERROR]: [msm_runtime] msm/x/block/a.json: bad'],
      expect3,
    );
    expect(analysis.ok).toBe(false);
    expect(analysis.failures).toEqual([
      'runtime error: [10:04:02] [main/ERROR]: [msm_runtime] msm/x/block/a.json: bad',
      'the server never logged "Done (" (it did not finish starting)',
      'the runtime reported 1 error(s)',
      'expected 3 block(s), the runtime registered 2',
    ]);
  });

  it('fails without the registration line', () => {
    expect(analyseLog([DONE], expect3).failures).toEqual([
      'no "[msm_runtime] registered ..." line: the runtime did not load or scan',
    ]);
  });

  it('fails on late runtime warnings unless they are allowed', () => {
    const warning =
      '[10:04:55] [Server thread/WARN]: [msm_runtime] msm/a/block/b.json (mod a): unknown run_function function a:c';
    const lines = [REGISTERED, DONE, warning];
    expect(analyseLog(lines, expect3).ok).toBe(false);
    expect(analyseLog(lines, { ...expect3, allowWarnings: true }).ok).toBe(true);
  });

  it('fails on load failures and runtime stack frames', () => {
    const analysis = analyseLog(
      [
        REGISTERED,
        DONE,
        '[main/ERROR]: Failed to load something',
        '\tat dev.mcsupermods.runtime.registry.MsmRegistrar.registerAll(MsmRegistrar.java:80)',
        'net.fabricmc.loader.impl.FormattedException: Mod resolution failed',
      ],
      { expectBlocks: undefined, expectItems: undefined, allowWarnings: false },
    );
    expect(analysis.failures.map((failure) => failure.split(':')[0])).toEqual([
      'load failure',
      'exception in msm_runtime',
      'load failure',
    ]);
  });
});

describe('parseArgs', () => {
  const facts = { minecraft: '1.0', loader: '0.1.0', fabricApi: '0.2.0+1.0', expectBlocks: 3 };

  it('takes versions from the facts file and flags over them', () => {
    const options = parseArgs(
      ['--jar', 'a.jar', '--loader', '0.9.0', '--extra', 'r.jar', '--allow-warnings'],
      facts,
      { JAVA_HOME: '/jdk' },
    );
    expect(options).toMatchObject({
      jar: 'a.jar',
      extra: ['r.jar'],
      minecraft: '1.0',
      loader: '0.9.0',
      fabricApi: '0.2.0+1.0',
      expectBlocks: 3,
      expectItems: undefined,
      allowWarnings: true,
      timeoutSeconds: 900,
    });
    expect(options.java.replaceAll('\\', '/')).toBe('/jdk/bin/java');
  });

  it('rejects missing and unknown options', () => {
    expect(() => parseArgs([], facts)).toThrow(/--jar is required/);
    expect(() => parseArgs(['--jar', 'a.jar'])).toThrow(/--minecraft is required/);
    expect(() => parseArgs(['--jar', 'a.jar', '--colour', 'red'], facts)).toThrow(/Unknown option/);
    expect(() => parseArgs(['--jar', 'a.jar', '--expect-items', 'x'], facts)).toThrow(/whole/);
  });
});

describe('URLs and files', () => {
  it('builds the meta and maven URLs', () => {
    expect(serverLauncherUrl('1.0', '0.1.0', '1.1.2')).toBe(
      'https://meta.fabricmc.net/v2/versions/loader/1.0/0.1.0/1.1.2/server/jar',
    );
    expect(fabricApiUrl('0.2.0+1.0')).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.2.0+1.0/fabric-api-0.2.0+1.0.jar',
    );
  });

  it('picks the first stable installer', () => {
    expect(
      latestStableInstaller([
        { version: '2.0.0-beta', stable: false },
        { version: '1.1.2', stable: true },
        { version: '1.1.1', stable: true },
      ]),
    ).toBe('1.1.2');
    expect(() => latestStableInstaller([])).toThrow(/no stable/);
  });

  it('writes an offline server.properties on the given port', () => {
    const text = serverProperties(41234);
    expect(text).toContain('online-mode=false\n');
    expect(text).toContain('server-port=41234\n');
  });
});
