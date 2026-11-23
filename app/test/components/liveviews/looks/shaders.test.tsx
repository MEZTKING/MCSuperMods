// @vitest-environment happy-dom
/**
 * B629's shaders and post effects (ADR 0121 D8): the seven translation rules of B619 3S8 with
 * their line map, the compiler's lines read back to the user's lines, the post effect's fields
 * (3S9), the shader worker's client, and both views over a fake worker (this test environment
 * has no WebGL; the real compile and run under SwiftShader is in `e2e/live-views-shaders-path`).
 * Every shader text here is MSM's own, written in the game's shapes; no file of Minecraft's is in
 * the repository.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  gameTargetsOf,
  MAIN_TARGET,
  parsePostEffect,
} from '../../../../src/renderer/src/liveviews/looks/post/chain';
import PostEffectView from '../../../../src/renderer/src/liveviews/looks/post/PostEffectView';
import {
  compileShader,
  parseCompilerLog,
  type ShaderCompilerGl,
} from '../../../../src/renderer/src/liveviews/looks/shader/compile';
import {
  GlClient,
  type GlWorkerLike,
  setSharedGlClient,
} from '../../../../src/renderer/src/liveviews/looks/shader/gl-client';
import {
  createGlHost,
  type GlAnswer,
  type GlJob,
} from '../../../../src/renderer/src/liveviews/looks/shader/gl-jobs';
import {
  blockMembersOf,
  flatValues,
  standInValue,
} from '../../../../src/renderer/src/liveviews/looks/shader/program';
import ShaderView, {
  programOf,
} from '../../../../src/renderer/src/liveviews/looks/shader/ShaderView';
import {
  includePath,
  shaderPath,
} from '../../../../src/renderer/src/liveviews/looks/shader/sources';
import {
  pictureDifference,
  type RgbaPicture,
  testPicture,
} from '../../../../src/renderer/src/liveviews/looks/shader/test-picture';
import {
  gatherIncludes,
  includeIdsOf,
  SHADER_HEADER,
  translateShader,
} from '../../../../src/renderer/src/liveviews/looks/shader/translate';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import type { VanillaAssetReader } from '../../../../src/renderer/src/preview/model-chain';

afterEach(() => {
  cleanup();
  setSharedGlClient(null);
});

const encode = (text: string) => new TextEncoder().encode(text);

/** MSM's own post fragment shader in the 26.x shape (version, extension, include, locations). */
const TINT_FSH = [
  '#version 330',
  '#extension GL_ARB_separate_shader_objects : require',
  '',
  '#include <demo:tint_values.glsl>',
  '',
  'uniform sampler2D InSampler;',
  '',
  'layout(location = 0) in vec2 texCoord;',
  'layout(location = 0) out vec4 fragColor;',
  '',
  'void main() {',
  '    fragColor = texture(InSampler, texCoord) * Tint;',
  '}',
].join('\n');

const TINT_INCLUDE = [
  '#ifndef DEMO_TINT',
  '#define DEMO_TINT',
  '#include <demo:tint_values.glsl>',
  'layout(std140, binding = 2) uniform TintConfig {',
  '    vec4 Tint;',
  '};',
  '#endif',
].join('\n');

/** MSM's own full-screen vertex shader in the 26.x shape. */
const QUAD_VSH = [
  '#version 330',
  '#extension GL_ARB_separate_shader_objects : require',
  'layout(location = 0) out vec2 texCoord;',
  'void main() {',
  '    vec2 uv = vec2((gl_VertexIndex << 1) & 2, gl_VertexIndex & 2);',
  '    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);',
  '    texCoord = uv;',
  '}',
].join('\n');

/** A desktop-only construct (B619: `texture2D` fails under WebGL 2 and in the game's core profile). */
const OLD_FSH = [
  '#version 330',
  'uniform sampler2D InSampler;',
  'layout(location = 0) in vec2 texCoord;',
  'layout(location = 0) out vec4 fragColor;',
  'void main() {',
  '    fragColor = texture2D(InSampler, texCoord).bgra;',
  '}',
].join('\n');

describe('translateShader (the seven rules of B619 3S8)', () => {
  const includes: Record<string, string> = { 'demo:tint_values.glsl': TINT_INCLUDE };
  const lookup = (id: string) => includes[id] ?? null;

  it('applies every rule and keeps a line map back to the user’s lines', () => {
    const out = translateShader(TINT_FSH, 'fragment', lookup);
    const lines = out.text.split('\n');
    // Rule 1: the header, then the version line kept as a comment so lines stay put.
    expect(lines.slice(0, SHADER_HEADER.length)).toEqual([...SHADER_HEADER]);
    expect(lines[0]).toBe('#version 300 es');
    expect(out.lineMap.slice(0, SHADER_HEADER.length).every((line) => line === 0)).toBe(true);
    const at = (source: number) => out.lineMap.indexOf(source);
    expect(lines[at(1)]).toBe('// #version 330');
    // Rule 2: the extension line is out.
    expect(lines[at(2)]).toMatch(/^\/\/ #extension/);
    expect(out.text).not.toMatch(/^\s*#extension/m);
    // Rule 3: the include inlined once (its own nested include of itself is skipped).
    expect(out.includes).toEqual(['demo:tint_values.glsl']);
    expect(out.text.match(/uniform TintConfig/g)).toHaveLength(1);
    expect(out.text).toContain('(already included)');
    const blockLine = lines.findIndex((line) => line.includes('uniform TintConfig'));
    expect(out.lineMap[blockLine]).toBe(4);
    expect(out.origins[blockLine]).toEqual({ include: 'demo:tint_values.glsl', line: 4 });
    // Rule 4: binding stripped, std140 kept.
    expect(lines[blockLine]).toBe('layout(std140) uniform TintConfig {');
    // Rule 5: location stripped from the fragment input, kept on the output.
    expect(lines[at(8)]).toBe('in vec2 texCoord;');
    expect(lines[at(9)]).toBe('layout(location = 0) out vec4 fragColor;');
    // Rule 7: every other line as written, on its own line.
    expect(lines[at(12)]).toBe('    fragColor = texture(InSampler, texCoord) * Tint;');
    expect(out.missingIncludes).toEqual([]);
    expect(out.notes).toHaveLength(5);
  });

  it('strips vertex output locations and maps the Vulkan built-ins (rules 5 and 6)', () => {
    const out = translateShader(QUAD_VSH, 'vertex', () => null);
    expect(out.text).toContain('\nout vec2 texCoord;');
    expect(out.text).toContain('vec2((gl_VertexID << 1) & 2, gl_VertexID & 2)');
    expect(out.text).not.toContain('gl_VertexIndex');
    expect(out.notes.some((note) => note.includes('gl_VertexID'))).toBe(true);
  });

  it('names a missing include and never rewrites a desktop-only line', () => {
    const missing = translateShader(TINT_FSH, 'fragment', () => null);
    expect(missing.missingIncludes).toEqual(['demo:tint_values.glsl']);
    expect(missing.text).toContain('(not found)');
    const old = translateShader(OLD_FSH, 'fragment', () => null);
    expect(old.text).toContain('texture2D(InSampler, texCoord).bgra');
  });

  it('adds a program’s defines after the header and reads the older #moj_import', () => {
    const out = translateShader(
      '#moj_import <fog.glsl>\nvoid main() {}',
      'fragment',
      (id) => (id === 'minecraft:fog.glsl' ? 'float demoFog;' : null),
      { defines: { values: { B: '2', A: '1.0' }, flags: ['ALPHA_CUTOUT'] } },
    );
    const lines = out.text.split('\n');
    expect(lines.slice(SHADER_HEADER.length, SHADER_HEADER.length + 3)).toEqual([
      '#define A 1.0',
      '#define B 2',
      '#define ALPHA_CUTOUT',
    ]);
    expect(out.text).toContain('float demoFog;');
    expect(includeIdsOf('#include <x.glsl>\n#include "demo:y.glsl"')).toEqual([
      'minecraft:x.glsl',
      'demo:y.glsl',
    ]);
  });

  it('gathers includes of includes, each read once', async () => {
    const reads: string[] = [];
    const files: Record<string, string> = {
      'demo:a.glsl': '#include <demo:b.glsl>\n#include <demo:c.glsl>',
      'demo:b.glsl': '#include <demo:c.glsl>',
      'demo:c.glsl': 'float c;',
    };
    const found = await gatherIncludes(['#include <demo:a.glsl>'], async (id) => {
      reads.push(id);
      return files[id] ?? null;
    });
    expect([...found.keys()].sort()).toEqual(['demo:a.glsl', 'demo:b.glsl', 'demo:c.glsl']);
    expect(reads.sort()).toEqual(['demo:a.glsl', 'demo:b.glsl', 'demo:c.glsl']);
  });

  it('builds the file paths of stages and includes', () => {
    expect(shaderPath('demo:post/tint', 'fragment')).toBe('assets/demo/shaders/post/tint.fsh');
    expect(shaderPath('core/screenquad', 'vertex')).toBe(
      'assets/minecraft/shaders/core/screenquad.vsh',
    );
    expect(includePath('minecraft:globals.glsl')).toBe(
      'assets/minecraft/shaders/include/globals.glsl',
    );
  });
});

describe('the compiler’s lines', () => {
  it('reads an ANGLE log back to the user’s lines and includes', () => {
    const out = translateShader(TINT_FSH, 'fragment', (id) =>
      id === 'demo:tint_values.glsl' ? TINT_INCLUDE : null,
    );
    const textLine = (source: number) => out.lineMap.indexOf(source) + 1;
    const blockLine = out.text.split('\n').findIndex((l) => l.includes('vec4 Tint;')) + 1;
    const log = [
      `ERROR: 0:${textLine(12)}: 'Tint' : undeclared identifier`,
      `ERROR: 0:${blockLine}: 'vec4' : wrong`,
      `WARNING: 0:${textLine(6)}: unused`,
      'ERROR: 2 compilation errors.  No code generated.',
      '',
    ].join('\n');
    const lines = parseCompilerLog(log, out.lineMap, out.origins);
    expect(lines).toEqual([
      { line: 12, message: "'Tint' : undeclared identifier", severity: 'error' },
      {
        line: 4,
        message: "'vec4' : wrong",
        severity: 'error',
        include: { id: 'demo:tint_values.glsl', line: 5 },
      },
      { line: 6, message: 'unused', severity: 'warning' },
    ]);
  });

  it('compiles through a WebGL-shaped context and deletes the shader', () => {
    const deleted: unknown[] = [];
    const gl: ShaderCompilerGl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: () => ({}) as WebGLShader,
      shaderSource() {},
      compileShader() {},
      getShaderParameter: () => false,
      getShaderInfoLog: () => "ERROR: 0:15: 'texture2D' : no matching overloaded function found",
      deleteShader: (shader) => deleted.push(shader),
    };
    const out = translateShader(OLD_FSH, 'fragment', () => null);
    const result = compileShader(gl, out.text, 'fragment', out.lineMap, out.origins);
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toMatchObject({
      line: 6,
      message: expect.stringContaining('texture2D'),
    });
    expect(deleted).toHaveLength(1);
  });
});

describe('post effect fields (B619 3S9)', () => {
  const effect: Json = {
    targets: {
      swap: {},
      half: { width: 64, height: 32, persistent: true, clear_color: [1, 0, 0, 1] },
    },
    passes: [
      {
        vertex_shader: 'minecraft:core/screenquad',
        fragment_shader: 'demo:post/tint',
        inputs: [
          { sampler_name: 'In', target: 'minecraft:main' },
          { sampler_name: 'Outline', target: 'minecraft:entity_outline', bilinear: true },
          { sampler_name: 'Noise', location: 'demo:noise', width: 8, height: 8 },
        ],
        output: 'swap',
        uniforms: { TintConfig: [{ type: 'vec4', value: [1, 0.5, 0.5, 1] }] },
      },
      {
        vertex_shader: 'minecraft:core/screenquad',
        fragment_shader: 'minecraft:post/blit',
        inputs: [{ sampler_name: 'In', target: 'swap', use_depth_buffer: true }],
        output: 'minecraft:main',
      },
    ],
  };

  it('reads targets, passes, both input kinds and uniforms by position', () => {
    const chain = parsePostEffect(effect);
    expect(chain.problems).toEqual([]);
    expect(chain.targets).toEqual([
      { name: 'minecraft:swap', persistent: false },
      {
        name: 'minecraft:half',
        width: 64,
        height: 32,
        persistent: true,
        clearColor: [1, 0, 0, 1],
      },
    ]);
    expect(chain.passes[0]?.inputs).toEqual([
      { type: 'target', name: MAIN_TARGET, samplerName: 'In', bilinear: false },
      { type: 'target', name: 'minecraft:entity_outline', samplerName: 'Outline', bilinear: true },
      {
        type: 'texture',
        name: 'demo:noise',
        samplerName: 'Noise',
        bilinear: false,
        width: 8,
        height: 8,
      },
    ]);
    expect(chain.passes[0]?.uniforms).toEqual([
      { block: 'TintConfig', name: null, type: 'vec4', value: [1, 0.5, 0.5, 1] },
    ]);
    expect(chain.passes[0]?.output).toBe('minecraft:swap');
    expect(chain.passes[1]?.inputs[0]?.useDepth).toBe(true);
    expect(gameTargetsOf(chain)).toEqual(['minecraft:entity_outline']);
  });

  it('names what it cannot read', () => {
    expect(parsePostEffect({ passes: [] }).problems).toContain('The effect has no passes.');
    expect(parsePostEffect([] as Json).problems).toEqual(['The effect is not a JSON object.']);
    expect(parsePostEffect({ passes: [{ inputs: [{}] }] }).problems).toHaveLength(2);
  });
});

describe('uniform helpers and the test picture', () => {
  it('reads block members in written order', () => {
    const members = blockMembersOf([
      'layout(std140) uniform SamplerInfo {\n  vec2 OutSize;\n  vec2 InSize;\n};\n// uniform Old { float x; };',
      'layout(std140) uniform Spider { vec4 Scissor; highp vec4 Vignette, Extra; };',
    ]);
    expect(members.get('SamplerInfo')).toEqual(['OutSize', 'InSize']);
    expect(members.get('Spider')).toEqual(['Scissor', 'Vignette', 'Extra']);
    expect(members.has('Old')).toBe(false);
  });

  it('gives stand-ins only for the values the game fills', () => {
    const sizes = { out: [10, 20], input: [30, 40], screen: [50, 60] } as const;
    expect(standInValue('OutSize', sizes)).toEqual([10, 20]);
    expect(standInValue('InSize', sizes)).toEqual([30, 40]);
    expect(standInValue('ProjMat', sizes)).toHaveLength(16);
    expect(standInValue('Tint', sizes)).toBeUndefined();
    expect(
      flatValues([
        [1, 2],
        [3, true],
      ]),
    ).toEqual([1, 2, 3, 1]);
  });

  it('draws MSM’s own test picture and measures a change', () => {
    const picture = testPicture(96, 54);
    expect(picture.data).toHaveLength(96 * 54 * 4);
    const inverted: RgbaPicture = {
      ...picture,
      data: picture.data.map((value, index) => (index % 4 === 3 ? value : 255 - value)),
    };
    expect(pictureDifference(picture, picture)).toBe(0);
    expect(pictureDifference(picture, inverted)).toBeGreaterThan(0.9);
  });

  it('answers webgl: false without a context', async () => {
    const host = createGlHost(() => null);
    const answer = await host(
      {
        token: 3,
        kind: 'post',
        chain: { targets: [], passes: [], problems: [] },
        passes: [],
        textures: {},
      },
      { cancelled: false },
    );
    expect(answer).toMatchObject({ token: 3, webgl: false });
  });
});

/** A fake shader worker: answers each job with `answer(job)`, when `release` is called. */
function fakeWorker(answer: (job: GlJob) => GlAnswer) {
  const jobs: GlJob[] = [];
  const worker: GlWorkerLike = {
    onmessage: null,
    postMessage(job) {
      jobs.push(job);
      queueMicrotask(() => worker.onmessage?.({ data: answer(job) }));
    },
    terminate() {},
  };
  return { worker, jobs };
}

describe('GlClient', () => {
  it('keeps only the newest waiting job while one runs', async () => {
    const jobs: GlJob[] = [];
    let reply: ((answer: GlAnswer) => void) | null = null;
    const worker: GlWorkerLike = {
      onmessage: null,
      postMessage(job) {
        jobs.push(job);
        reply = (answer) => worker.onmessage?.({ data: answer });
      },
      terminate() {},
    };
    const client = new GlClient(() => worker);
    const empty = {
      kind: 'post' as const,
      chain: { targets: [], passes: [], problems: [] },
      passes: [],
      textures: {},
    };
    const first = client.run(empty);
    await waitFor(() => expect(jobs).toHaveLength(1));
    const second = client.run(empty);
    const third = client.run(empty);
    expect(await second).toBeNull();
    (reply as unknown as (a: GlAnswer) => void)({
      token: jobs[0]?.token ?? 0,
      webgl: false,
      reason: 'x',
    });
    expect(await first).toMatchObject({ webgl: false });
    await waitFor(() => expect(jobs).toHaveLength(2));
    (reply as unknown as (a: GlAnswer) => void)({
      token: jobs[1]?.token ?? 0,
      webgl: false,
      reason: 'y',
    });
    expect(await third).toMatchObject({ reason: 'y' });
    expect(client.sent).toBe(2);
  });

  it('answers webgl: false when the worker cannot start', async () => {
    const client = new GlClient(() => {
      throw new Error('no workers');
    });
    const answer = await client.run({
      kind: 'post',
      chain: { targets: [], passes: [], problems: [] },
      passes: [],
      textures: {},
    });
    expect(answer).toMatchObject({ webgl: false });
  });
});

function projectOf(targets: string[] = ['mc-26.3']): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', elements: [], assets: [] }],
    targets,
    plugins: [],
    settings: {},
  } as unknown as Project;
}

const el = (id: string, kind: string, data: Json): Element =>
  ({ id, kind, data }) as unknown as Element;

function propsOf(
  element: Element,
  files: Record<string, string>,
  jar: Record<string, string> | null,
  targets?: string[],
): LiveViewProps {
  const vanillaAssets: VanillaAssetReader | null =
    jar === null
      ? null
      : { readAsset: async (path) => (jar[path] === undefined ? null : encode(jar[path])) };
  return {
    project: projectOf(targets),
    element,
    vanilla: {} as never,
    vanillaAssets,
    readProject: async (path) => (files[path] === undefined ? null : encode(files[path])),
    preferences: {} as never,
    onPreferences() {},
    onSetup() {},
  };
}

const PROJECT_FILES: Record<string, string> = {
  'assets/demo/shaders/post/tint.fsh': TINT_FSH,
  'assets/demo/shaders/include/tint_values.glsl': TINT_INCLUDE,
  'assets/demo/shaders/post/old.fsh': OLD_FSH,
  'assets/demo/shaders/core/quad.vsh': QUAD_VSH,
};

const ok = { ok: true, lines: [] };

describe('ShaderView', () => {
  let jobs: GlJob[];
  let answerOf: (job: GlJob) => GlAnswer;

  beforeEach(() => {
    const fake = fakeWorker((job) => answerOf(job));
    jobs = fake.jobs;
    setSharedGlClient(new GlClient(() => fake.worker));
  });

  it('reads a program file’s names, values and defines', () => {
    expect(
      programOf({
        vertex: 'demo:core/quad',
        fragment: 'post/tint',
        uniforms: [{ name: 'Tint', type: 'float', count: 4, values: [1, 1, 1, 1] }],
        defines: { values: { A: '1' }, flags: ['F'] },
      }),
    ).toEqual({
      vertex: 'demo:core/quad',
      fragment: 'minecraft:post/tint',
      uniforms: { Tint: [1, 1, 1, 1] },
      defines: { values: { A: '1' }, flags: ['F'] },
    });
  });

  it('shows a run on the test picture, about right, for a self-written shader', async () => {
    const before = testPicture(8, 8);
    const after = { ...before, data: before.data.map((v) => 255 - v) };
    answerOf = (job) => ({
      token: job.token,
      webgl: true,
      kind: 'program',
      stages: { vertex: ok, fragment: ok, link: null },
      run: {
        ran: true,
        before,
        after,
        standIns: ['OutSize'],
        gameTargets: [],
        readsDepth: false,
        blankTextures: [],
        ms: 4,
      },
    });
    const element = el('demo:tint', 'minecraft:shader', {
      vertex: 'demo:core/quad',
      fragment: 'demo:post/tint',
      uniforms: [{ name: 'Tint', type: 'float', count: 4, values: [1, 0.5, 0.5, 1] }],
    });
    render(<ShaderView {...propsOf(element, PROJECT_FILES, null)} />);
    const run = await screen.findByTestId('shader-run');
    expect(Number(run.getAttribute('data-changed'))).toBeGreaterThan(0.5);
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
    expect(screen.getByTestId('shader-stage-fragment').getAttribute('data-ok')).toBe('true');
    // The job carried the translated text and the file's values; the include came from the project.
    const job = jobs[0];
    expect(job?.kind).toBe('program');
    if (job?.kind !== 'program') return;
    expect(job.fragment.text).toContain('uniform TintConfig');
    expect(job.vertex.text).toContain('gl_VertexID');
    expect(job.uniforms).toEqual({ Tint: [1, 0.5, 0.5, 1] });
    expect(job.compileOnly).toBeNull();
    expect(screen.getByTestId('live-view-notes').textContent).toContain('OutSize');
    // No set-up banner: everything is the project's.
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
  });

  it('shows the compiler’s lines against the user’s code and the limit, and draws nothing', async () => {
    answerOf = (job) => ({
      token: job.token,
      webgl: true,
      kind: 'program',
      stages: {
        vertex: ok,
        fragment: {
          ok: false,
          lines: [
            {
              line: 6,
              message: "'texture2D' : no matching overloaded function found",
              severity: 'error',
            },
          ],
        },
        link: null,
      },
      run: { ran: false, reason: 'It did not compile.' },
    });
    const element = el('demo:old', 'minecraft:shader', {
      vertex: 'demo:core/quad',
      fragment: 'demo:post/old',
      uniforms: [],
    });
    render(<ShaderView {...propsOf(element, PROJECT_FILES, null)} />);
    const line = await screen.findByTestId('compiler-line');
    expect(line.getAttribute('data-line')).toBe('6');
    expect(within(line).getByTestId('compiler-line-code').textContent).toBe(
      'fragColor = texture2D(InSampler, texCoord).bgra;',
    );
    expect(line.textContent).toContain('no matching overloaded function');
    expect(screen.getByTestId('shader-limit').textContent).toContain('only in the game');
    expect(screen.queryByTestId('shader-run')).toBeNull();
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
  });

  it('compile-checks a core shader of the game without drawing it', async () => {
    answerOf = (job) => ({
      token: job.token,
      webgl: true,
      kind: 'program',
      stages: { vertex: ok, fragment: ok, link: null },
      run: { ran: false, reason: job.kind === 'program' ? (job.compileOnly ?? '') : '' },
    });
    const jar = {
      'assets/minecraft/shaders/core/position.vsh': QUAD_VSH,
      'assets/minecraft/shaders/core/position.fsh': TINT_FSH,
    };
    const element = el('demo:p', 'minecraft:shader', {
      vertex: 'minecraft:core/position',
      fragment: 'minecraft:core/position',
      uniforms: [],
    });
    render(<ShaderView {...propsOf(element, {}, jar)} />);
    const notRun = await screen.findByTestId('shader-not-run');
    expect(notRun.textContent).toContain('core shaders');
    const job = jobs[0];
    expect(job?.kind === 'program' && job.compileOnly).toBeTruthy();
    expect(screen.getByTestId('shader-stage-vertex').getAttribute('data-from')).toBe('vanilla');
    // The include the jar's file names is neither the project's nor the jar's: named, left out.
    expect(screen.getByTestId('shader-missing-includes').textContent).toContain(
      'demo:tint_values.glsl',
    );
  });

  it('asks for the Minecraft folder for a vanilla shader, and says without WebGL', async () => {
    answerOf = (job) => ({ token: job.token, webgl: false, reason: 'No WebGL 2 here.' });
    const vanilla = el('demo:v', 'minecraft:shader', {
      vertex: 'minecraft:core/position',
      fragment: 'demo:post/tint',
      uniforms: [],
    });
    const { unmount } = render(<ShaderView {...propsOf(vanilla, PROJECT_FILES, null)} />);
    expect(await screen.findByTestId('live-view-set-up')).toBeTruthy();
    expect(screen.getByTestId('shader-missing').textContent).toContain('Minecraft folder');
    expect(jobs).toHaveLength(0);
    unmount();
    const own = el('demo:o', 'minecraft:shader', {
      vertex: 'demo:core/quad',
      fragment: 'demo:post/tint',
      uniforms: [],
    });
    render(<ShaderView {...propsOf(own, PROJECT_FILES, null)} />);
    expect((await screen.findByTestId('shader-no-webgl')).textContent).toContain(
      'only in the game',
    );
    expect(screen.queryByTestId('shader-run')).toBeNull();
  });
});

describe('PostEffectView', () => {
  let jobs: GlJob[];
  let answerOf: (job: GlJob) => GlAnswer;

  beforeEach(() => {
    const fake = fakeWorker((job) => answerOf(job));
    jobs = fake.jobs;
    setSharedGlClient(new GlClient(() => fake.worker));
  });

  const chain = (vertex: string, fragment: string): Json => ({
    targets: { swap: {} },
    passes: [
      {
        vertex_shader: vertex,
        fragment_shader: fragment,
        inputs: [{ sampler_name: 'In', target: 'minecraft:main' }],
        output: 'swap',
      },
      {
        vertex_shader: vertex,
        fragment_shader: fragment,
        inputs: [{ sampler_name: 'In', target: 'swap' }],
        output: 'minecraft:main',
      },
    ],
  });

  it('shows the diagram alone without WebGL', async () => {
    answerOf = (job) => ({ token: job.token, webgl: false, reason: 'No WebGL 2 here.' });
    const element = el(
      'demo:fx',
      'minecraft:post_effect',
      chain('demo:core/quad', 'demo:post/tint'),
    );
    render(<PostEffectView {...propsOf(element, PROJECT_FILES, null)} />);
    const diagram = screen.getByTestId('post-diagram');
    expect(within(diagram).getByTestId('post-pass-0').textContent).toContain(
      'the screen (minecraft:main)',
    );
    expect(within(diagram).getByTestId('post-pass-1').textContent).toContain('minecraft:swap');
    expect((await screen.findByTestId('post-no-webgl')).textContent).toContain('diagram');
    expect(screen.getByTestId('post-pass-0').getAttribute('data-status')).toBe('not_checked');
    expect(screen.queryByTestId('shader-run')).toBeNull();
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
  });

  it('runs a compiling chain and shows a failing one’s lines once', async () => {
    const before = testPicture(8, 8);
    answerOf = (job) =>
      job.kind === 'post' && job.passes[0]?.fragment.id === 'demo:post/old'
        ? {
            token: job.token,
            webgl: true,
            kind: 'post',
            passes: job.passes.map(() => ({
              vertex: ok,
              fragment: {
                ok: false,
                lines: [{ line: 6, message: 'bad', severity: 'error' as const }],
              },
              link: null,
            })),
            run: { ran: false, reason: 'Not every pass compiled, so nothing is drawn.' },
          }
        : {
            token: job.token,
            webgl: true,
            kind: 'post',
            passes: [
              { vertex: ok, fragment: ok, link: null },
              { vertex: ok, fragment: ok, link: null },
            ],
            run: {
              ran: true,
              before,
              after: { ...before, data: before.data.map((v) => v >> 1) },
              standIns: ['InSize', 'OutSize'],
              gameTargets: [],
              readsDepth: false,
              blankTextures: [],
              ms: 12,
            },
          };
    const good = el('demo:fx', 'minecraft:post_effect', chain('demo:core/quad', 'demo:post/tint'));
    const { unmount } = render(<PostEffectView {...propsOf(good, PROJECT_FILES, null)} />);
    expect(await screen.findByTestId('shader-run')).toBeTruthy();
    expect(screen.getByTestId('post-pass-1').getAttribute('data-status')).toBe('compiles');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
    const job = jobs[0];
    expect(job?.kind === 'post' && job.passes).toHaveLength(2);
    unmount();

    const bad = el('demo:fx2', 'minecraft:post_effect', chain('demo:core/quad', 'demo:post/old'));
    render(<PostEffectView {...propsOf(bad, PROJECT_FILES, null)} />);
    expect(await screen.findByTestId('post-limit')).toBeTruthy();
    // Both passes use one file: its lines are shown once.
    expect(screen.getAllByTestId('compiler-line')).toHaveLength(1);
    expect(screen.getByTestId('compiler-line-code').textContent).toContain('texture2D');
    expect(screen.getByTestId('post-pass-0').getAttribute('data-status')).toBe('fails');
    expect(screen.queryByTestId('shader-run')).toBeNull();
  });

  it('names a full-screen shader this version lacks, with the one it has', async () => {
    answerOf = (job) => ({
      token: job.token,
      webgl: true,
      kind: 'post',
      passes: job.kind === 'post' ? job.passes.map(() => null) : [],
      run: { ran: false, reason: 'A shader file of a pass is missing, so nothing is drawn.' },
    });
    const jar = { 'assets/minecraft/shaders/core/screentriangle.vsh': QUAD_VSH };
    const element = el(
      'demo:fx',
      'minecraft:post_effect',
      chain('minecraft:core/screenquad', 'demo:post/tint'),
    );
    render(<PostEffectView {...propsOf(element, PROJECT_FILES, jar, ['mc-26.4-snapshot-7'])} />);
    const missing = await screen.findAllByTestId('post-missing');
    expect(missing[0]?.textContent).toContain('Minecraft 26.4-snapshot-7');
    expect(missing[0]?.textContent).toContain('minecraft:core/screentriangle');
    expect(screen.getByTestId('post-pass-0').getAttribute('data-status')).toBe('missing');
  });
});
