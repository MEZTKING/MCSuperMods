import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laterVersion, SCRIPT_RUNTIME_MINIMUM } from '@msm/exporters';
import { describe, expect, it } from 'vitest';

// ADR 0026 D4: the msm_runtime jar carries the app's version, so content jars depend on
// `msm_runtime >=<app version>` and the jar the app ships satisfies it.
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function appVersion(): string {
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof pkg.version !== 'string') throw new Error('app/package.json has no version.');
  return pkg.version;
}

function runtimeModVersion(): string {
  const text = readFileSync(join(appDir, '..', 'engine-mod', 'gradle.properties'), 'utf8');
  const line = text.split(/\r?\n/).find((entry) => /^\s*mod_version\s*=/.test(entry));
  if (line === undefined) throw new Error('engine-mod/gradle.properties has no mod_version.');
  return line.slice(line.indexOf('=') + 1).trim();
}

describe('runtime version', () => {
  it('engine-mod mod_version equals the app version', () => {
    expect(runtimeModVersion()).toBe(appVersion());
  });

  it('is at least the first runtime that runs scripts (ADR 0032 D4)', () => {
    expect(laterVersion(appVersion(), SCRIPT_RUNTIME_MINIMUM)).toBe(appVersion());
  });
});
