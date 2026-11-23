import { describe, expect, it } from 'vitest';
import {
  findJava,
  type JavaSearchEnv,
  javaMajor,
  parseJavaVersionOutput,
  parseReleaseFile,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';

const LINUX: JavaSearchEnv = { platform: 'linux', home: '/home/alex' };
const PRISM = '/home/alex/.local/share/PrismLauncher';
const release = (version: string): string =>
  `IMPLEMENTOR="Eclipse Adoptium"\nJAVA_VERSION="${version}"\nOS_ARCH="x86_64"\n`;

/** A Java home with `bin/<program>` and, when `version` is given, a `release` file. */
function seedJava(
  fs: MemoryInstallFileSystem,
  home: string,
  version: string | null,
  program = 'java',
): void {
  fs.seed(`${home}/bin/${program}`, 'program');
  if (version !== null) fs.seed(`${home}/release`, release(version));
}

describe('Java versions', () => {
  it('reads the feature release from release files and java -version', () => {
    expect(javaMajor('25.0.5.1')).toBe(25);
    expect(javaMajor('21.0.12.1')).toBe(21);
    expect(javaMajor('1.8.0_392')).toBe(8);
    expect(javaMajor('25')).toBe(25);
    expect(javaMajor('x')).toBeNull();
    expect(parseReleaseFile(release('25.0.5.1'))).toBe('25.0.5.1');
    expect(parseReleaseFile('IMPLEMENTOR="x"\n')).toBeNull();
    expect(
      parseJavaVersionOutput('openjdk version "25.0.5.1" 2026-10-20 LTS\nOpenJDK Runtime'),
    ).toBe('25.0.5.1');
    expect(parseJavaVersionOutput('java version "1.8.0_392"')).toBe('1.8.0_392');
  });
});

describe('findJava', () => {
  it('finds the Java Prism downloaded, from its release file, without starting it', async () => {
    const fs = new MemoryInstallFileSystem();
    seedJava(fs, `${PRISM}/java/java-runtime-epsilon`, '25.0.5.1');
    seedJava(fs, `${PRISM}/java/temurin-21/jre`, '21.0.12.1');
    let probes = 0;
    const result = await findJava(
      {
        fs,
        env: LINUX,
        probe: async () => {
          probes++;
          return null;
        },
      },
      25,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.java).toMatchObject({
      program: `${PRISM}/java/java-runtime-epsilon/bin/java`,
      home: `${PRISM}/java/java-runtime-epsilon`,
      major: 25,
      source: 'prism',
    });
    expect(result.candidates.map((c) => c.major).sort()).toEqual([21, 25]);
    expect(probes).toBe(0);
  });

  it("uses Prism's own Java setting, and never reads its account file", async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(`${PRISM}/prismlauncher.cfg`, '[General]\nJavaPath=/opt/jdk-25/bin/java\n');
    fs.seed(`${PRISM}/accounts.json`, '{"secret":"x"}');
    seedJava(fs, '/opt/jdk-25', '25.0.1');
    const reads: string[] = [];
    const readFile = fs.readFile.bind(fs);
    fs.readFile = async (path: string) => {
      reads.push(path);
      return readFile(path);
    };
    const result = await findJava({ fs, env: LINUX }, 25);
    expect(result.ok && result.java.source).toBe('prism-setting');
    expect(reads.some((path) => path.endsWith('accounts.json'))).toBe(false);
  });

  it("finds the official launcher's runtime, on Windows the Store app's too", async () => {
    const fs = new MemoryInstallFileSystem();
    const win: JavaSearchEnv = {
      platform: 'win32',
      home: '/Users/alex',
      appData: '/Users/alex/AppData/Roaming',
      localAppData: '/Users/alex/AppData/Local',
    };
    seedJava(
      fs,
      '/Users/alex/AppData/Local/Packages/Microsoft.4297127D64EC6_8wekyb3d8bbwe/LocalCache/Local/runtime/java-runtime-epsilon/windows-x64/java-runtime-epsilon',
      '25.0.1',
      'javaw.exe',
    );
    const store = await findJava({ fs, env: win }, 25);
    expect(store.ok && store.java.source).toBe('official-store');
    expect(store.ok && store.java.program.endsWith('javaw.exe')).toBe(true);

    const home =
      '/Users/alex/AppData/Roaming/.minecraft/runtime/java-runtime-epsilon/windows-x64/java-runtime-epsilon';
    seedJava(fs, home, '25.0.1', 'javaw.exe');
    fs.seed(`${home}/bin/java.exe`, 'program');
    const official = await findJava({ fs, env: win }, 25);
    expect(official.ok && official.java).toMatchObject({
      source: 'official',
      program: `${home}/bin/java.exe`,
    });
  });

  it('falls back to JAVA_HOME, then the path through its link', async () => {
    const fs = new MemoryInstallFileSystem();
    seedJava(fs, '/usr/lib/jvm/java-25', '25.0.2');
    fs.link('/usr/bin/java', '/usr/lib/jvm/java-25/bin/java');
    const viaPath = await findJava({ fs, env: { ...LINUX, path: '/usr/local/bin:/usr/bin' } }, 25);
    expect(viaPath.ok && viaPath.java).toMatchObject({
      source: 'path',
      program: '/usr/bin/java',
      home: '/usr/lib/jvm/java-25',
    });

    seedJava(fs, '/opt/java-home', '25.0.3');
    const viaHome = await findJava(
      { fs, env: { ...LINUX, javaHome: '/opt/java-home', path: '/usr/bin' } },
      25,
    );
    expect(viaHome.ok && viaHome.java.source).toBe('java-home');
  });

  it('asks the probe only for a Java without a release file', async () => {
    const fs = new MemoryInstallFileSystem();
    seedJava(fs, '/opt/bare', null);
    const asked: string[] = [];
    const result = await findJava(
      {
        fs,
        env: { ...LINUX, javaHome: '/opt/bare' },
        probe: async (program) => {
          asked.push(program);
          return 'openjdk version "25.0.1" 2026-01-20';
        },
      },
      25,
    );
    expect(result.ok && result.java.major).toBe(25);
    expect(asked).toEqual(['/opt/bare/bin/java']);
  });

  it('prefers the exact version, then the oldest newer one', async () => {
    const fs = new MemoryInstallFileSystem();
    seedJava(fs, `${PRISM}/java/a-31`, '31.0.1');
    seedJava(fs, `${PRISM}/java/b-30`, '30.0.1');
    const newer = await findJava({ fs, env: LINUX }, 25);
    expect(newer.ok && newer.java.major).toBe(30);
    seedJava(fs, '/opt/jdk25', '25.0.1');
    const exact = await findJava({ fs, env: { ...LINUX, javaHome: '/opt/jdk25' } }, 25);
    expect(exact.ok && exact.java.home).toBe('/opt/jdk25');
  });

  it('gives the plain reason when no Java is found, or none is new enough', async () => {
    const none = await findJava({ fs: new MemoryInstallFileSystem(), env: LINUX }, 25);
    expect(none).toMatchObject({ ok: false, code: 'server.no-java', candidates: [] });
    expect(!none.ok && none.message).toBe(
      'The server needs Java 25, and MCSuperMods found no Java on this computer. Start your test instance once in Prism Launcher, which downloads the Java the game needs, then try again.',
    );

    const fs = new MemoryInstallFileSystem();
    seedJava(fs, '/usr/lib/jvm/java-21', '21.0.12.1');
    const old = await findJava({ fs, env: { ...LINUX, javaHome: '/usr/lib/jvm/java-21' } }, 25);
    expect(old).toMatchObject({ ok: false, code: 'server.java-too-old' });
    expect(!old.ok && old.message).toContain('the newest Java found on this computer is Java 21');

    const unknown = new MemoryInstallFileSystem();
    seedJava(unknown, '/opt/bare', null);
    const noVersion = await findJava({ fs: unknown, env: { ...LINUX, javaHome: '/opt/bare' } }, 25);
    expect(noVersion).toMatchObject({ ok: false, code: 'server.no-java' });
    expect(!noVersion.ok && noVersion.message).toContain('could not tell the version');
  });

  it('never throws on unreadable places', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(`${PRISM}/java`, 'a file, not a folder');
    fs.seed(`${PRISM}/prismlauncher.cfg`, '\u0000\u0001');
    const result = await findJava(
      { fs, env: { ...LINUX, path: 'relative:/nope', javaHome: 'relative' } },
      25,
    );
    expect(result.ok).toBe(false);
  });
});
