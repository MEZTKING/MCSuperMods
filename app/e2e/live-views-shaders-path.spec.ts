/**
 * Shaders and post effects in the live views (ADR 0121 D8; plan brief B629), on the app's real
 * WebGL 2 (SwiftShader, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader`, as the
 * entities path launches it). The unit tests have no WebGL; this spec is where the shader worker
 * compiles and runs for real.
 *
 * The project is written here: MSM's own shaders (a full-screen vertex shader in the 26.x shape,
 * a sepia fragment shader with a uniform block, and a fragment shader using the desktop-only
 * `texture2D`), two shader programs and two post effects naming them. No Minecraft folder is set
 * up, so nothing of Minecraft's is read.
 *
 * 1. A self-written shader program compiles and changes MSM's test picture (about right).
 * 2. A program with a failing construct shows the compiler's line against the user's own line and
 *    the limit, and draws nothing.
 * 3. A self-written post effect runs its two passes on the still frame; a broken one shows the
 *    diagram, the compiler's line once and the limit, and draws nothing.
 * 4. Without WebGL (`--disable-gpu`, `--disable-software-rasterizer`) the post effect is the
 *    diagram alone, and says the effect is only in the game.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, type LaunchOptions, launchApp } from './fixtures';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const NO_WEBGL_ARGS = ['--disable-gpu', '--disable-software-rasterizer'] as const;

const NS = 'shader_demo';

const QUAD_VSH = `#version 330
#extension GL_ARB_separate_shader_objects : require

layout(location = 0) out vec2 texCoord;

void main() {
    vec2 uv = vec2((gl_VertexIndex << 1) & 2, gl_VertexIndex & 2);
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    texCoord = uv;
}
`;

const SEPIA_FSH = `#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

layout(std140) uniform SepiaConfig {
    float Amount;
};

void main() {
    vec3 c = texture(InSampler, texCoord).rgb;
    vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
    fragColor = vec4(mix(c, s, Amount), 1.0);
}
`;

/** Line 9 is the desktop-only `texture2D` (B619 3S8: fails under WebGL 2 and in the game's core profile). */
const OLD_FSH = `#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

void main() { vec4 c = texture2D(InSampler, texCoord);
    fragColor = c.bgra;
}
`;

const element = (id: string, kind: string, data: unknown) => ({
  data,
  formatVersion: 1,
  id: `${NS}:${id}`,
  kind,
  meta: { createdAt: '2026-11-23T00:00:00.000Z' },
});

const passOf = (fragment: string, input: string, output: string, amount?: number) => ({
  fragment_shader: `${NS}:post/${fragment}`,
  inputs: [{ sampler_name: 'In', target: input }],
  output,
  ...(amount === undefined
    ? {}
    : { uniforms: { SepiaConfig: [{ name: 'Amount', type: 'float', value: amount }] } }),
  vertex_shader: `${NS}:core/quad`,
});

const FILES: Record<string, unknown> = {
  'msm.project.json': {
    formatVersion: 1,
    name: 'Shader Path',
    namespaces: ['minecraft', NS],
    plugins: ['msm.resourcepack'],
    settings: {},
    targets: ['mc-26.3'],
  },
  [`content/${NS}/shader/sepia.json`]: element('sepia', 'minecraft:shader', {
    fragment: `${NS}:post/sepia`,
    uniforms: [{ count: 1, name: 'Amount', type: 'float', values: [1] }],
    vertex: `${NS}:core/quad`,
  }),
  [`content/${NS}/shader/broken.json`]: element('broken', 'minecraft:shader', {
    fragment: `${NS}:post/old`,
    uniforms: [],
    vertex: `${NS}:core/quad`,
  }),
  [`content/${NS}/post_effect/warm.json`]: element('warm', 'minecraft:post_effect', {
    passes: [
      passOf('sepia', 'minecraft:main', `${NS}:swap`, 1),
      passOf('sepia', `${NS}:swap`, 'minecraft:main', 0),
    ],
    targets: { [`${NS}:swap`]: {} },
  }),
  [`content/${NS}/post_effect/old.json`]: element('old', 'minecraft:post_effect', {
    passes: [
      passOf('old', 'minecraft:main', `${NS}:swap`),
      passOf('old', `${NS}:swap`, 'minecraft:main'),
    ],
    targets: { [`${NS}:swap`]: {} },
  }),
  [`assets/${NS}/shaders/core/quad.vsh`]: QUAD_VSH,
  [`assets/${NS}/shaders/post/sepia.fsh`]: SEPIA_FSH,
  [`assets/${NS}/shaders/post/old.fsh`]: OLD_FSH,
};

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Launches the app over a fresh copy of the project and opens it. */
async function launchProject(options: LaunchOptions): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), 'msm-shaders-'));
  const folders = {
    projectDir: join(base, NS),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  for (const [path, contents] of Object.entries(FILES)) {
    const file = join(folders.projectDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`,
    );
  }
  const launched = await launchApp({ ...options, reuse: folders });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  await launched.window.getByTestId('toolbar-open-project').click();
  await expect(launched.window.getByTestId(`element-row-${NS}:sepia`)).toBeVisible();
  return launched;
}

/** Opens an element and returns its live view in the editor's preview. */
async function openView(window: Page, id: string): Promise<Locator> {
  const row = window.getByTestId(`element-row-${NS}:${id}`);
  await expect(async () => {
    await row.click();
    await expect(row).toHaveAttribute('aria-current', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const view = window.getByTestId('editor-preview').getByTestId('live-view').first();
  // The first view of a launch loads its chunk and starts the shader worker.
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view.getByTestId('live-view-tag').first()).toHaveText('Preview');
  await expect(view.getByTestId('live-view-not-yet')).toHaveCount(0);
  return view;
}

test('a self-written shader and post effect run on the test picture; a failing one shows its line', async () => {
  test.setTimeout(150_000);
  const { window } = await launchProject({ args: WEBGL_ARGS });

  // 1. The program compiles and changes the picture.
  let view = await openView(window, 'sepia');
  await expect(view).toHaveAttribute('aria-label', 'Shader program');
  // A compile and one run under SwiftShader (B619 3S9: tens of milliseconds; the worker's first
  // start and its WebGL context are the slow part on a loaded test machine).
  const run = view.getByTestId('shader-run');
  await expect(run).toBeVisible({ timeout: 30_000 });
  expect(Number(await run.getAttribute('data-changed'))).toBeGreaterThan(0.3);
  await expect(view.getByTestId('live-view-fidelity')).toHaveAttribute(
    'data-fidelity',
    'about_right',
  );
  await expect(view.getByTestId('shader-stage-vertex')).toHaveAttribute('data-ok', 'true');
  await expect(view.getByTestId('shader-stage-fragment')).toHaveAttribute('data-ok', 'true');
  console.log(`shader program run: ${await run.getAttribute('data-ms')} ms`);

  // 2. texture2D: the compiler's line on the user's line 9, the limit, no picture.
  view = await openView(window, 'broken');
  const fragment = view.getByTestId('shader-stage-fragment');
  await expect(fragment).toHaveAttribute('data-ok', 'false', { timeout: 30_000 });
  const line = fragment.getByTestId('compiler-line').first();
  await expect(line).toHaveAttribute('data-line', '9');
  await expect(line.getByTestId('compiler-line-code')).toContainText(
    'texture2D(InSampler, texCoord)',
  );
  await expect(view.getByTestId('shader-limit')).toContainText('only in the game');
  await expect(view.getByTestId('shader-run')).toHaveCount(0);
  await expect(view.getByTestId('live-view-fidelity')).toHaveAttribute(
    'data-fidelity',
    'only_in_game',
  );

  // 3. The post effect: two passes run on the still frame.
  view = await openView(window, 'warm');
  await expect(view).toHaveAttribute('aria-label', 'Post effect');
  await expect(view.getByTestId('post-diagram')).toBeVisible();
  const postRun = view.getByTestId('shader-run');
  await expect(postRun).toBeVisible({ timeout: 30_000 });
  expect(Number(await postRun.getAttribute('data-changed'))).toBeGreaterThan(0.3);
  await expect(view.getByTestId('post-pass-0')).toHaveAttribute('data-status', 'compiles');
  await expect(view.getByTestId('post-pass-1')).toHaveAttribute('data-status', 'compiles');
  console.log(`post effect run: ${await postRun.getAttribute('data-ms')} ms`);

  // The broken chain: the diagram, the line once, the limit, no picture.
  view = await openView(window, 'old');
  await expect(view.getByTestId('post-pass-0')).toHaveAttribute('data-status', 'fails', {
    timeout: 30_000,
  });
  // Both passes use one file: its lines are shown once, grouped on the user's line 9.
  await expect(view.getByTestId('post-compile-0-fragment')).toHaveCount(1);
  await expect(view.getByTestId('post-compile-1-fragment')).toHaveCount(0);
  await expect(view.getByTestId('compiler-line')).toHaveCount(1);
  await expect(view.getByTestId('compiler-line')).toHaveAttribute('data-line', '9');
  await expect(view.getByTestId('compiler-message').first()).toContainText('texture2D');
  await expect(view.getByTestId('post-limit')).toBeVisible();
  await expect(view.getByTestId('shader-run')).toHaveCount(0);
});

test('without WebGL the post effect is its diagram alone', async () => {
  test.setTimeout(90_000);
  const { window } = await launchProject({ args: NO_WEBGL_ARGS });
  const view = await openView(window, 'warm');
  await expect(view.getByTestId('post-no-webgl')).toBeVisible({ timeout: 30_000 });
  await expect(view.getByTestId('post-no-webgl')).toContainText('only in the game');
  await expect(view.getByTestId('post-diagram')).toBeVisible();
  await expect(view.getByTestId('post-pass-0')).toHaveAttribute('data-status', 'not_checked');
  await expect(view.getByTestId('shader-run')).toHaveCount(0);
  await expect(view.getByTestId('live-view-fidelity')).toHaveAttribute(
    'data-fidelity',
    'only_in_game',
  );
});
