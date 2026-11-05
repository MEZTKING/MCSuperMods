import { API_VERSION, type ElementKind, type Json } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  lowerScript,
  SCRIPTING_PROBLEM_CODES,
  ScriptingLoweringError,
  scriptingKinds,
  scriptingTemplates,
  scriptingValidators,
  scriptKind,
  scriptPath,
  scriptText,
  splitResourceLocation,
} from '../src/index';
import { blockingProblems, element, indexesFor, syntaxErrors, typeCheck } from './support';

const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];
const firstBundle = builtInTargets[0] as TargetBundle;
const firstTarget = firstBundle.target;

describe('@msm/plugin-scripting', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.scripting');
    expect(plugin.apiVersion).toBe('^1.0.0');
    const [major, minor] = API_VERSION.split('.');
    expect(plugin.apiVersion).toBe(`^${major}.${minor}.0`);
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes msm:script with its schema and folder, without registry or preview', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(['msm:script']);
    expect(scriptingKinds).toEqual([scriptKind]);
    expect([
      scriptKind.schema,
      scriptKind.folder,
      scriptKind.registry,
      scriptKind.previewKind,
      scriptKind.hiddenPaths,
    ]).toEqual(['msm:script', 'script', undefined, undefined, undefined]);
  });

  it('has the brief default data, valid against the schema, parsing and type-checking', async () => {
    expect(scriptKind.defaultData).toEqual({
      lines: [
        'import { msm } from "msm:runtime";',
        '',
        'msm.events.on("block.interact", (e) => {',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: script source text
        '  msm.log.info(`${e.player.name} used ${e.block.id}`);',
        '});',
      ],
    });
    const indexes = await indexesFor(firstBundle);
    expect(blockingProblems(indexes, scriptKind.schema, scriptKind.defaultData as Json)).toEqual(
      [],
    );
    const text = scriptText(element('msm:script', 'demo:sample', scriptKind.defaultData as Json));
    expect(syntaxErrors(text)).toEqual([]);
    expect(typeCheck(text)).toEqual([]);
  });

  it('contributes its templates and validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      scriptingTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual(
      scriptingValidators.map((v) => v.id),
    );
    expect(SCRIPTING_PROBLEM_CODES).toEqual([
      'scripting.unknown-handler',
      'scripting.duplicate-handler',
      'scripting.empty-script',
    ]);
  });

  it('lowers to one msm-layer TypeScript file without a schema', () => {
    const files = lowerScript(
      element('msm:script', 'demo:ores/glow', { lines: ['const a = 1;', 'msm.log.info("x");'] }),
      firstTarget,
    );
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file?.path).toBe('msm/demo/script/ores/glow.ts');
    expect(file?.layer).toBe('msm');
    expect(file?.language).toBe('typescript');
    expect(file?.schema).toBeUndefined();
    expect(file?.merge).toBeUndefined();
    expect(new TextDecoder().decode(file?.contents as Uint8Array)).toBe(
      'const a = 1;\nmsm.log.info("x");\n',
    );
    expect(scriptPath('a', 'b/c')).toBe('msm/a/script/b/c.ts');
  });

  it('is the kind lowering and deterministic', () => {
    const script = element('msm:script', 'demo:x', { lines: ['é'] });
    const first = scriptKind.lower(script, firstTarget);
    expect(scriptKind.lower(script, firstTarget)).toEqual(first);
    expect(Array.from(first[0]?.contents as Uint8Array)).toEqual([0xc3, 0xa9, 0x0a]);
  });

  it('rejects malformed data and unsafe ids', () => {
    expect(() => lowerScript(element('msm:script', 'demo:x', {}), firstTarget)).toThrow(
      ScriptingLoweringError,
    );
    expect(() =>
      lowerScript(element('msm:script', 'demo:x', { lines: ['a', 1] }), firstTarget),
    ).toThrow(/"lines" must be an array of strings/);
    expect(() =>
      lowerScript(element('msm:script', 'demo:a/../b' as never, { lines: [] }), firstTarget),
    ).toThrow(ScriptingLoweringError);
    expect(() => splitResourceLocation('Demo:x')).toThrow(ScriptingLoweringError);
    expect(splitResourceLocation('demo:a/b')).toEqual({ namespace: 'demo', path: 'a/b' });
  });
});
