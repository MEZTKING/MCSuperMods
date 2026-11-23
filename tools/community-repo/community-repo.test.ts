import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, kindExamples } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { afterAll, describe, expect, it } from 'vitest';
import { buildExamples, exampleInfo, exampleReadme, examplesIndex } from './examples.ts';
import { decodePng, enlarge, examplePicture, PICTURE_SIZE, pictureRank } from './picture.ts';
import { DEFAULT_MIRROR, diffTrees, readTree, syncExamples } from './run.ts';

const temps: string[] = [];
async function temp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'msm-community-'));
  temps.push(root);
  return root;
}

afterAll(async () => {
  for (const root of temps) await rm(root, { recursive: true, force: true });
});

const ownTarget = builtInTargets[builtInTargets.length - 1]?.target.id as string;
const header = { name: 'Demo', targets: [ownTarget] };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('exampleInfo', () => {
  it('describes a popular example, a world example, a flow example and a starter from the library', () => {
    const popular = exampleInfo('popular/glowshard', header);
    expect(popular.title).toMatch(/^Glowshard/);
    expect(popular.category).toBe('Popular ideas');
    expect(popular.targetId).toBe(ownTarget);
    expect(popular.members).toEqual([]);
    expect(exampleInfo('worlds/frost_peaks', header).title).toBe('Frost Peaks');
    const flow = exampleInfo('flows/frost_wolf', header);
    expect([flow.title, flow.category]).toEqual(['Frost wolf', 'Entities']);
    const starter = exampleInfo('starters/simple-block', header);
    expect([starter.title, starter.category]).toEqual(['Simple block', 'Starters']);
  });

  it('lists every example of a grouped project', () => {
    const info = exampleInfo('all-kinds', { ...header, name: 'MSM Examples' });
    expect(info.title).toBe('MSM Examples');
    expect(info.members.map((entry) => entry.title)).toEqual(
      kindExamples.map((entry) => entry.title),
    );
  });

  it('refuses a folder it does not know and a target that is not built in', () => {
    expect(() => exampleInfo('gadgets/thing', header)).toThrow('no library example or starter');
    expect(() => exampleInfo('starters/simple-block', { targets: ['mc-0'] })).toThrow(
      'not built in',
    );
  });
});

describe('the READMEs', () => {
  it('give the title, picture, description, category, target and how to open it', () => {
    const readme = exampleReadme(exampleInfo('starters/simple-block', header));
    expect(readme).toMatch(/^# Simple block\n\n!\[Picture\]\(picture\.png\)\n/);
    expect(readme).toContain('- **Category:** Starters');
    expect(readme).toContain(`MSM target \`${ownTarget}\``);
    expect(readme).toContain('**File > Open Project…**');
  });

  it('index every example by category with a link to its folder', () => {
    const index = examplesIndex([
      exampleInfo('starters/simple-block', header),
      exampleInfo('popular/glowshard', header),
    ]);
    expect(index).toContain('The 2 example projects');
    expect(index.indexOf('## Popular ideas')).toBeLessThan(index.indexOf('## Starters'));
    expect(index).toContain('| [Simple block](starters/simple-block/) |');
  });
});

describe('pictures', () => {
  const pixels = (width: number, height: number): Uint8Array => {
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      data.set([index % 256, 40, 200, 255], index * 4);
    }
    return data;
  };

  it('reads back what encodePng writes', () => {
    const data = pixels(16, 8);
    expect(decodePng(encodePng(data, 16, 8))).toEqual({ width: 16, height: 8, data });
    expect(decodePng(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('enlarges without smoothing and keeps the first frame of a strip', () => {
    const big = enlarge({ width: 16, height: 16, data: pixels(16, 16) });
    expect([big.width, big.height]).toEqual([PICTURE_SIZE, PICTURE_SIZE]);
    expect([...big.data.subarray(0, 4)]).toEqual([0, 40, 200, 255]);
    expect([...big.data.subarray(7 * 4, 8 * 4)]).toEqual([0, 40, 200, 255]);
    expect([...big.data.subarray(8 * 4, 9 * 4)]).toEqual([1, 40, 200, 255]);
    const strip = enlarge({ width: 16, height: 64, data: pixels(16, 64) });
    expect([strip.width, strip.height]).toEqual([PICTURE_SIZE, PICTURE_SIZE]);
  });

  it('prefers item pictures, then block pictures, and draws one when there are none', () => {
    expect(pictureRank('assets/a/textures/item/x.png')).toBeLessThan(
      pictureRank('assets/a/textures/block/x.png'),
    );
    const item = encodePng(pixels(16, 16), 16, 16);
    const block = encodePng(new Uint8Array(16 * 16 * 4).fill(255), 16, 16);
    const chosen = decodePng(
      examplePicture(
        new Map([
          ['assets/a/textures/block/b.png', block],
          ['assets/a/textures/item/i.png', item],
        ]),
        false,
      ),
    );
    expect([...(chosen?.data.subarray(0, 4) ?? [])]).toEqual([0, 40, 200, 255]);
    const drawn = decodePng(examplePicture(new Map(), true));
    expect(drawn?.width).toBe(PICTURE_SIZE);
  });
});

// Heavy: reads and rebuilds the whole examples mirror (about 2,000 files); 5 s on CI's shared runner
// (2026-11-22). An explicit timeout, never a retry.
describe('buildExamples', { timeout: 60_000 }, () => {
  it('copies each project with a picture and README, and indexes them', () => {
    const project = encoder.encode(JSON.stringify(header));
    const { files, infos } = buildExamples([
      { path: 'README.md', bytes: encoder.encode('mirror readme') },
      { path: 'biome.json', bytes: encoder.encode('{}') },
      { path: 'starters/simple-block/msm.project.json', bytes: project },
      { path: 'starters/simple-block/content/a/b.json', bytes: encoder.encode('{}') },
      { path: 'starters/simple-block/notes.txt', bytes: encoder.encode('left out') },
    ]);
    expect(infos.map((info) => info.folder)).toEqual(['starters/simple-block']);
    expect(files.map((file) => file.path)).toEqual([
      'examples/README.md',
      'examples/starters/simple-block/README.md',
      'examples/starters/simple-block/content/a/b.json',
      'examples/starters/simple-block/msm.project.json',
      'examples/starters/simple-block/picture.png',
    ]);
  });

  it('knows every folder of the real mirror', async () => {
    const mirror = await readTree(DEFAULT_MIRROR);
    const projects = mirror.filter((file) => file.path.endsWith('/msm.project.json')).length;
    const { infos } = buildExamples(mirror);
    expect(infos).toHaveLength(projects);
    expect(projects).toBeGreaterThan(50);
  });
});

describe('syncExamples', { timeout: 60_000 }, () => {
  it('writes, checks, finds changes and stray files, and writes again', async () => {
    const mirror = await temp();
    const repo = await temp();
    await cp(
      join(DEFAULT_MIRROR, 'starters', 'simple-block'),
      join(mirror, 'starters', 'simple-block'),
      {
        recursive: true,
      },
    );
    await cp(join(DEFAULT_MIRROR, 'popular', 'glowshard'), join(mirror, 'popular', 'glowshard'), {
      recursive: true,
    });
    const first = await syncExamples(mirror, repo);
    expect(first.examples).toBe(2);
    expect(first.changed).toEqual([]);
    expect(await syncExamples(mirror, repo, { check: true })).toEqual({
      added: [],
      changed: [],
      removed: [],
      examples: 2,
    });
    const readme = join(repo, 'examples', 'popular', 'glowshard', 'README.md');
    expect(decoder.decode(await readFile(readme))).toMatch(/^# Glowshard/);

    await writeFile(readme, 'edited by hand');
    await mkdir(join(repo, 'examples', 'old'), { recursive: true });
    await writeFile(join(repo, 'examples', 'old', 'msm.project.json'), '{}');
    const stale = await syncExamples(mirror, repo, { check: true });
    expect(stale.changed).toEqual(['examples/popular/glowshard/README.md']);
    expect(stale.removed).toEqual(['examples/old/msm.project.json']);
    expect(decoder.decode(await readFile(readme))).toBe('edited by hand');

    await syncExamples(mirror, repo);
    expect(await syncExamples(mirror, repo, { check: true })).toMatchObject({
      added: [],
      changed: [],
      removed: [],
    });
    expect(
      (await readTree(join(repo, 'examples'))).some((file) => file.path.startsWith('old/')),
    ).toBe(false);
  }, 60_000);

  it('diffs trees by path and bytes', () => {
    const a = { path: 'examples/a', bytes: encoder.encode('a') };
    const b = { path: 'examples/b', bytes: encoder.encode('b') };
    expect(
      diffTrees(
        [a, b],
        [
          { ...a, bytes: encoder.encode('x') },
          { path: 'examples/c', bytes: a.bytes },
        ],
      ),
    ).toEqual({
      added: ['examples/b'],
      changed: ['examples/a'],
      removed: ['examples/c'],
    });
  });
});
