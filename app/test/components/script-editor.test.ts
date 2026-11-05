import { describe, expect, it, vi } from 'vitest';
import {
  RUNTIME_TYPINGS_PATH,
  registerScriptTypeScript,
  SCRIPT_LIBS,
  scriptCompilerOptions,
  scriptModelUri,
  setScriptTypings,
  TYPESCRIPT_WORKER_LABELS,
  type TypeScriptNamespace,
} from '../../src/renderer/src/components/script-editor/monaco-typescript';
import {
  projectHandlers,
  summariseScript,
} from '../../src/renderer/src/studios/scripting/script-model';
import { element } from './fixtures';

/** The parts of `monaco-editor/languages/features/typescript/register` the editor uses. */
function standIn() {
  const defaults = {
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn(),
    setExtraLibs: vi.fn(),
  };
  const ts = {
    typescriptDefaults: defaults,
    ScriptTarget: { ES5: 1, ES2015: 2, ES2018: 5 },
    ModuleKind: { CommonJS: 1, ES2015: 5 },
  } as unknown as TypeScriptNamespace;
  return { ts, defaults };
}

describe('Monaco TypeScript for scripts', () => {
  it('registers the worker for the TypeScript labels and sets the options once', () => {
    const { ts, defaults } = standIn();
    const registerWorker = vi.fn();
    const worker = {} as Worker;
    const createWorker = vi.fn(() => worker);
    registerScriptTypeScript(ts, registerWorker, createWorker);
    registerScriptTypeScript(ts, registerWorker, createWorker);

    expect(registerWorker).toHaveBeenCalledOnce();
    const [labels, create] = registerWorker.mock.calls[0] as [string[], () => Worker];
    expect(labels).toEqual(['typescript', 'javascript']);
    expect(TYPESCRIPT_WORKER_LABELS).toEqual(labels);
    expect(create()).toBe(worker);

    expect(defaults.setCompilerOptions).toHaveBeenCalledExactlyOnceWith({
      target: 5,
      module: 1,
      strict: true,
      noLib: false,
      lib: ['es2015', 'es2016.array.include', 'es2017.object', 'es2017.string', 'es2018.regexp'],
      allowNonTsExtensions: true,
      noEmit: true,
    });
    expect(defaults.setDiagnosticsOptions).toHaveBeenCalledExactlyOnceWith({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  });

  it('uses the curated lib set without DOM', () => {
    const { ts } = standIn();
    expect(scriptCompilerOptions(ts).lib).toEqual([...SCRIPT_LIBS]);
    expect(SCRIPT_LIBS.some((lib) => lib.toLowerCase().includes('dom'))).toBe(false);
  });

  it('adds the runtime typings as the one extra lib, only when the text changes', () => {
    const { ts, defaults } = standIn();
    setScriptTypings(ts, 'declare const msm: unknown;');
    setScriptTypings(ts, 'declare const msm: unknown;');
    expect(defaults.setExtraLibs).toHaveBeenCalledExactlyOnceWith([
      { content: 'declare const msm: unknown;', filePath: 'file:///msm-runtime.d.ts' },
    ]);
    expect(RUNTIME_TYPINGS_PATH).toBe('file:///msm-runtime.d.ts');
    setScriptTypings(ts, 'declare const msm: number;');
    expect(defaults.setExtraLibs).toHaveBeenCalledTimes(2);
  });

  it('puts each script model at file:///<ns>/<path>.ts', () => {
    expect(scriptModelUri('mymod:ore_glow')).toBe('file:///mymod/ore_glow.ts');
    expect(scriptModelUri('mymod:ores/glow')).toBe('file:///mymod/ores/glow.ts');
    expect(scriptModelUri('glow')).toBe('file:///minecraft/glow.ts');
  });
});

describe('script summaries', () => {
  it('finds the registered events and defined handlers textually', () => {
    expect(
      summariseScript([
        'import { msm } from "msm:runtime";',
        'msm.events.on("block.interact", (e) => {});',
        "msm.events.on( 'entity.hurt', (e) => {});",
        'msm.events.on("block.interact", (e) => {});',
        'msm.actions.define("mymod:glow", (e) => {});',
      ]),
    ).toEqual({ events: ['block.interact', 'entity.hurt'], handlers: ['mymod:glow'] });
    expect(summariseScript([])).toEqual({ events: [], handlers: [] });
  });

  it('lists the handlers every script of a project defines', () => {
    const project = {
      formatVersion: 1 as const,
      name: 'Demo',
      targets: [],
      plugins: [],
      settings: {},
      namespaces: [
        {
          name: 'demo',
          assets: [],
          elements: [
            element('demo:b', 'msm:script', { lines: ['msm.actions.define("demo:z", f);'] }),
            element('demo:a', 'msm:script', {
              lines: ['msm.actions.define("demo:y", f);', 'msm.actions.define("demo:z", f);'],
            }),
            element('demo:f', 'minecraft:function', { lines: ['msm.actions.define("x", f)'] }),
          ],
        },
      ],
    };
    expect(projectHandlers(project)).toEqual(['demo:y', 'demo:z']);
    expect(projectHandlers(null)).toEqual([]);
  });
});
