import { createMemoryFileSystem, type Problem } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import { MSM_RUNTIME_TYPINGS, SCRIPT_KIND } from '@msm/plugin-scripting';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createScriptingService } from '../src/main/platform/scripting';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import {
  SCRIPT_TYPINGS_FILE,
  type ScriptingChecker,
} from '../src/renderer/src/session/scripting-problems';
import { newSession } from './session-fixture';

/** The real main-process service (TypeScript in Node), as the app's IPC would serve it. */
const realScripting: ScriptingChecker = createScriptingService();

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const scriptProblems = (problems: readonly Problem[]) =>
  problems.filter((problem) => problem.code.startsWith('typescript'));

async function openSession(
  options: { scripting?: ScriptingChecker; typings?: string; plugins?: typeof builtInPlugins } = {},
) {
  const fs = createMemoryFileSystem();
  const { session, platform, calls } = newSession(
    fs,
    {},
    {
      scripting: options.scripting ?? realScripting,
      ...(options.typings === undefined ? {} : { scriptTypings: options.typings }),
      ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
      validationDelay: 0,
    },
  );
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]),
  };
  return { fs, session, platform, calls };
}

function addScript(
  session: Awaited<ReturnType<typeof openSession>>['session'],
  id: `${string}:${string}`,
  lines: string[],
) {
  session.addElement({ id, kind: SCRIPT_KIND, data: { lines } });
}

describe('script typings in .msm/ (ADR 0032 D5)', () => {
  it('writes msm-runtime.d.ts on create, keeps an equal file and rewrites a changed one', async () => {
    const { fs, session } = await openSession();
    expect(session.scriptTypings).toBe(MSM_RUNTIME_TYPINGS);
    await session.newProject();
    expect(decode(await fs.readFile(SCRIPT_TYPINGS_FILE))).toBe(MSM_RUNTIME_TYPINGS);
    await session.save();

    // Reopening with the same typings leaves the file alone.
    const writes: string[] = [];
    const writeFile = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      writes.push(path);
      return writeFile(path, data);
    };
    const opened = newSession(fs, { recent: [] }, { scripting: realScripting }).session;
    expect(await opened.openProject()).toEqual({ ok: true });
    expect(writes).not.toContain(SCRIPT_TYPINGS_FILE);

    // Newer typings are written on open.
    const newer = `${MSM_RUNTIME_TYPINGS}// next\n`;
    const updated = newSession(fs, {}, { scripting: realScripting, scriptTypings: newer }).session;
    expect(await updated.openProject()).toEqual({ ok: true });
    expect(writes.filter((path) => path === SCRIPT_TYPINGS_FILE)).toHaveLength(1);
    expect(decode(await fs.readFile(SCRIPT_TYPINGS_FILE))).toBe(newer);
  });

  it('never blocks opening when the write fails', async () => {
    const { fs, session } = await openSession();
    const writeFile = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      if (path === SCRIPT_TYPINGS_FILE) throw new Error('read-only');
      return writeFile(path, data);
    };
    expect(await session.newProject()).toEqual({ ok: true });
    expect(await fs.exists(SCRIPT_TYPINGS_FILE)).toBe(false);
  });

  it('writes nothing without the scripting plugin', async () => {
    const { fs, session } = await openSession({
      plugins: builtInPlugins.filter((plugin) => plugin.id !== 'msm.scripting'),
    });
    await session.newProject();
    expect(await fs.exists(SCRIPT_TYPINGS_FILE)).toBe(false);
  });
});

describe('live script problems', () => {
  it('reports type errors as warnings and syntax errors as errors, on their line', async () => {
    const { session } = await openSession();
    await session.newProject();
    addScript(session, 'demo:glow', ['msm.log.info("ok");', 'msm.nope();']);
    await session.flushValidation();
    const [warning] = scriptProblems(session.snapshot.problems);
    expect(warning).toMatchObject({
      severity: 'warning',
      code: 'typescript.semantic',
      elementId: 'demo:glow',
      file: 'msm/demo/script/glow.ts',
      path: '/lines/1',
      range: { start: 4, end: 8 },
    });
    expect(warning?.message).toContain('(TS2339)');

    session.setElementData('demo:glow', { lines: ['msm.log.info("ok");', 'let x = ;'] });
    await session.flushValidation();
    const problems = scriptProblems(session.snapshot.problems);
    expect(
      problems.map((problem) => [problem.severity, problem.code, problem.path]),
    ).toContainEqual(['error', 'typescript.syntax', '/lines/1']);

    session.setElementData('demo:glow', { lines: ['msm.log.info("ok");'] });
    await session.flushValidation();
    expect(scriptProblems(session.snapshot.problems)).toEqual([]);
  });

  it('accepts lib members Rhino implements', async () => {
    const { session } = await openSession();
    await session.newProject();
    addScript(session, 'demo:libs', [
      'const ok = [1, 2].includes(2) && "a".padStart(3).length === 3;',
      'for (const [k, v] of Object.entries({ a: 1 })) msm.log.info(k + v + ok);',
    ]);
    await session.flushValidation();
    expect(scriptProblems(session.snapshot.problems)).toEqual([]);
  });

  it('says once that scripts cannot be checked when the service fails', async () => {
    let fail = true;
    const flaky: ScriptingChecker = {
      transpile: (source, name) => realScripting.transpile(source, name),
      check: async (source, name, typings) => {
        if (fail) throw new Error('no compiler');
        return realScripting.check(source, name, typings);
      },
    };
    const { session } = await openSession({ scripting: flaky });
    await session.newProject();
    addScript(session, 'demo:a', ['msm.nope();']);
    addScript(session, 'demo:b', ['msm.nope();']);
    await session.flushValidation();
    const unavailable = session.snapshot.problems.filter(
      (problem) => problem.code === 'session.scripting-unavailable',
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.severity).toBe('warning');
    expect(unavailable[0]?.message).toContain('no compiler');

    fail = false;
    session.setElementData('demo:a', { lines: ['msm.nope(1);'] });
    await session.flushValidation();
    expect(
      session.snapshot.problems.some((problem) => problem.code === 'session.scripting-unavailable'),
    ).toBe(false);
  });
});

describe('script export gate and transpilation', () => {
  it('transpiles scripts into the mod jar; type warnings pass', async () => {
    const { session, calls } = await openSession();
    await session.newProject();
    addScript(session, 'demo:glow', [
      'class Glow { on(): void { msm.log.info("glow"); } }',
      'msm.events.on("player.join", () => new Glow().on());',
      'msm.nope();',
    ]);
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toContain('typescript.semantic');
    const saved = calls.saved[0];
    if (saved === undefined) throw new Error('unreachable');
    const entries = unzipSync(saved.data);
    const js = decode(entries['msm/demo/script/glow.js'] ?? new Uint8Array());
    expect(js.startsWith('"use strict";')).toBe(true);
    // TypeScript keeps its `/** @class */` marker comment; no `class` keyword or arrow is left.
    expect(js).not.toMatch(/(?<!@)\bclass\b|=>/);
    expect(Object.keys(entries).some((path) => path.endsWith('.ts'))).toBe(false);
  });

  it('blocks the jar and Test in Minecraft on a syntax error', async () => {
    const { session, calls } = await openSession();
    await session.newProject();
    addScript(session, 'demo:broken', ['let x = ;']);
    const result = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(result.ok).toBe(false);
    const syntax = result.problems.find((problem) => problem.code === 'typescript.syntax');
    expect(syntax).toMatchObject({
      severity: 'error',
      elementId: 'demo:broken',
      file: 'msm/demo/script/broken.ts',
      path: '/lines/0',
    });
    expect(calls.saved).toHaveLength(0);
    const test = await session.testInMinecraft();
    expect(test.ok).toBe(false);
  });

  it('reports export.transpiler-missing without a scripting service', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform } = newSession(fs);
    platform.exports = { ...platform.exports, runtimeJar: async () => new Uint8Array([1]) };
    await session.newProject();
    addScript(session, 'demo:glow', ['msm.log.info("x");']);
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(false);
    expect(result.problems.map((problem) => problem.code)).toContain('export.transpiler-missing');
  });

  it('maps transpiler problems to source offsets with the line in the message', async () => {
    const stub: ScriptingChecker = {
      check: async () => [],
      transpile: async () => ({
        problems: [
          {
            severity: 'error',
            code: 'typescript.syntax',
            tsCode: 1109,
            message: 'Expression expected.',
            line: 2,
            start: 3,
            end: 4,
            offset: { start: 20, end: 21 },
          },
        ],
      }),
    };
    const { session } = await openSession({ scripting: stub });
    await session.newProject();
    addScript(session, 'demo:glow', ['msm.log.info("x");']);
    const result = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(result.ok).toBe(false);
    expect(result.problems.find((problem) => problem.code === 'typescript.syntax')).toMatchObject({
      message: 'Line 3: Expression expected. (TS1109)',
      range: { start: 20, end: 21 },
      file: 'msm/demo/script/glow.ts',
      elementId: 'demo:glow',
    });
  });
});
