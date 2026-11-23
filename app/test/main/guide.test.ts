import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGuideService,
  GUIDE_PAGE_MAX_BYTES,
  githubAnchor,
  guideAnchor,
  guideDirFor,
  guideSections,
} from '../../src/main/guide';
import { createIpcHandlers } from '../../src/main/ipc';
import type { MainPlatform } from '../../src/main/platform/node-platform';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';

/** The guide inside the app (ADR 0124 D14, B656): `guide:index` and `guide:page`. */
const REPO_GUIDE = join(import.meta.dirname, '..', '..', '..', 'docs', 'guide');

const PAGE = `# Made-up page

Intro sentence one. Intro sentence two.

## A section's name

| a | b |
|---|---|
| 1 | 2 |

The **first** sentence links [elsewhere](other.md#x) and uses \`code\`. The second.

\`\`\`
## Not a heading
\`\`\`

### Steps

1. Do this first.
2. Then that.

## A section's name
`;

let temp: string;
let dir: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-guide-'));
  dir = join(temp, 'guide');
  await mkdir(dir);
  await writeFile(join(dir, 'made-up.md'), PAGE);
  await writeFile(join(dir, 'other.md'), '# Other\n\nOther text.\n');
  await writeFile(join(dir, 'notes.txt'), 'not a page');
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('the guide service (B656)', () => {
  it('reads the packaged folder when packaged and docs/guide from source', () => {
    const location = { resourcesPath: '/r', devGuideDir: '/repo/docs/guide' };
    expect(guideDirFor({ ...location, isPackaged: true })).toBe(join('/r', 'guide'));
    expect(guideDirFor({ ...location, isPackaged: false })).toBe('/repo/docs/guide');
  });

  it('indexes headings, anchors and first sentences, once', async () => {
    const guide = createGuideService({ dir });
    const index = await guide.index();
    expect(index.pages).toEqual([
      { page: 'made-up', title: 'Made-up page' },
      { page: 'other', title: 'Other' },
    ]);
    expect(index.sections.filter((s) => s.page === 'made-up')).toEqual([
      {
        page: 'made-up',
        level: 1,
        heading: 'Made-up page',
        anchor: 'made-up-page',
        sentence: 'Intro sentence one.',
      },
      {
        page: 'made-up',
        level: 2,
        heading: "A section's name",
        anchor: 'a-section-s-name',
        alias: 'a-sections-name',
        sentence: 'The first sentence links elsewhere and uses code.',
      },
      { page: 'made-up', level: 3, heading: 'Steps', anchor: 'steps', sentence: 'Do this first.' },
      {
        page: 'made-up',
        level: 2,
        heading: "A section's name",
        anchor: 'a-section-s-name-1',
        alias: 'a-sections-name-1',
        sentence: '',
      },
    ]);
    expect(await guide.index()).toBe(index);
    expect(ipcContract[InvokeChannels.guideIndex].response.safeParse(index).success).toBe(true);
  });

  it('serves a page of the list and refuses anything else', async () => {
    const guide = createGuideService({ dir });
    expect(await guide.page('other')).toEqual({
      page: 'other',
      markdown: '# Other\n\nOther text.\n',
    });
    for (const page of ['../made-up', 'made-up.md', 'notes', 'missing', '', '/etc/passwd', '..']) {
      await expect(guide.page(page), page).rejects.toThrow(/not a page of the guide/);
    }
    const { request } = ipcContract[InvokeChannels.guidePage];
    for (const page of ['../made-up', 'a/b', 'a\\b', '.md', '']) {
      expect(request.safeParse({ page }).success, page).toBe(false);
    }
  });

  it('refuses a page linked out of the guide folder, or too large', async () => {
    await writeFile(join(temp, 'secret.md'), '# Secret\n');
    await symlink(join(temp, 'secret.md'), join(dir, 'escape.md'));
    await writeFile(join(dir, 'huge.md'), 'x'.repeat(GUIDE_PAGE_MAX_BYTES + 1));
    const guide = createGuideService({ dir });
    await expect(guide.page('escape')).rejects.toThrow(/outside the guide folder/);
    await expect(guide.page('huge')).rejects.toThrow(/too large/);
  });

  it('serves both channels through the IPC handlers', async () => {
    const handlers = createIpcHandlers(
      {} as unknown as MainPlatform,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      createGuideService({ dir }),
    );
    const context = { sendProgress() {}, sender: {} as never };
    const index = await handlers[InvokeChannels.guideIndex](undefined, context);
    expect(index.pages.map((page) => page.page)).toEqual(['made-up', 'other']);
    const page = await handlers[InvokeChannels.guidePage]({ page: 'made-up' }, context);
    expect(page.markdown).toBe(PAGE);
    await expect(handlers[InvokeChannels.guidePage]({ page: 'notes' }, context)).rejects.toThrow();
  });

  it('indexes the real guide, and its links to headings find an anchor', async () => {
    const guide = createGuideService({ dir: REPO_GUIDE });
    const index = await guide.index();
    const files = (await readdir(REPO_GUIDE)).filter((name) => name.endsWith('.md'));
    expect(index.pages).toHaveLength(files.length);
    expect(ipcContract[InvokeChannels.guideIndex].response.safeParse(index).success).toBe(true);
    const anchors = new Set(
      index.sections.flatMap((s) => [
        `${s.page}#${s.anchor}`,
        ...(s.alias === undefined ? [] : [`${s.page}#${s.alias}`]),
      ]),
    );
    const missing: string[] = [];
    let links = 0;
    for (const file of files) {
      const page = file.slice(0, -3);
      const text = await readFile(join(REPO_GUIDE, file), 'utf8');
      for (const match of text.matchAll(/\]\(([A-Za-z0-9_-]+\.md)?#([^)\s]+)\)/g)) {
        const target = match[1] === undefined ? page : match[1].slice(0, -3);
        const anchor = match[2] ?? '';
        links += 1;
        if (!anchors.has(`${target}#${anchor}`)) {
          missing.push(`${page}: ${target}#${anchor}`);
        }
      }
    }
    expect(links).toBeGreaterThan(250);
    expect(missing).toEqual([]);
  });

  it('writes anchors as the docs site and GitHub do', () => {
    expect(guideAnchor('Script API 1.6')).toBe('script-api-1-6');
    expect(githubAnchor('Script API 1.6')).toBe('script-api-16');
    expect(guideAnchor('3. Create a project')).toBe('_3-create-a-project');
    expect(githubAnchor('3. Create a project')).toBe('3-create-a-project');
    expect(guideAnchor('Événements et “sons”')).toBe('evenements-et-sons');
    const [section] = guideSections('p', '## Events and `play_animation`\n');
    expect(section).toMatchObject({
      anchor: 'events-and-play-animation',
      alias: 'events-and-play_animation',
    });
  });

  it('cuts sentences at a word and skips code fences', () => {
    const long = `# T\n\n${'word '.repeat(100)}end.\n`;
    const [section] = guideSections('p', long);
    expect(section?.sentence.length).toBeLessThanOrEqual(300);
    expect(section?.sentence.endsWith('word')).toBe(true);
    expect(guideSections('p', '```\n# Not\n```\n')).toEqual([]);
  });
});
