// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GUIDE_HOME,
  GuideDialog,
  guideLinkTarget,
  guideWebUrl,
  headingElementId,
  pageHeadings,
} from '../../src/renderer/src/components/GuideDialog';
import type { GuidePlatform, GuideSection } from '../../src/shared/platform';

afterEach(cleanup);

const REPO_GUIDE = join(import.meta.dirname, '..', '..', '..', 'docs', 'guide');

/**
 * Main's index builder (`app/src/main/guide.ts`), loaded at run time: the component tests'
 * TypeScript project does not take main's files, and the point is to compare with the real one.
 */
const MAIN_GUIDE = '../../src/main/guide';
let guideSections: (page: string, markdown: string) => GuideSection[];

describe('guide anchors and links', () => {
  const pages = new Map<string, string>();
  beforeAll(async () => {
    ({ guideSections } = (await import(/* @vite-ignore */ MAIN_GUIDE)) as {
      guideSections: typeof guideSections;
    });
    for (const file of readdirSync(REPO_GUIDE).filter((name) => name.endsWith('.md'))) {
      pages.set(file.slice(0, -3), readFileSync(join(REPO_GUIDE, file), 'utf8'));
    }
  });

  it('gives every heading the anchor and alias main puts in the index', () => {
    expect(pages.size).toBeGreaterThanOrEqual(38);
    for (const [page, markdown] of pages) {
      const index = guideSections(page, markdown).map((section) => [
        section.anchor,
        section.alias ?? section.anchor,
      ]);
      const mine = pageHeadings(markdown)
        .filter((heading) => heading.level <= 4)
        .map((heading) => [heading.anchor, heading.alias]);
      expect(mine, page).toEqual(index);
    }
  });

  it('follows every link between guide pages and to a heading to a page and heading', () => {
    let count = 0;
    for (const [page, markdown] of pages) {
      const outside = markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '');
      for (const match of outside.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = match[1] ?? '';
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
        const target = guideLinkTarget(href, page);
        expect(target, `${page}: ${href}`).not.toBeNull();
        if (target === null) continue;
        const markdownThere = pages.get(target.page);
        expect(markdownThere, `${page}: ${href}`).toBeDefined();
        if (target.anchor !== undefined) {
          const headings = pageHeadings(markdownThere ?? '');
          const found = headings.some(
            (heading) => heading.anchor === target.anchor || heading.alias === target.anchor,
          );
          expect(found, `${page}: ${href}`).toBe(true);
        }
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(250);
  });

  it('reads link forms and writes the docs site address', () => {
    expect(guideLinkTarget('vehicles.md#keys', 'boats')).toEqual({
      page: 'vehicles',
      anchor: 'keys',
    });
    expect(guideLinkTarget('./try-it.md', 'boats')).toEqual({ page: 'try-it', anchor: undefined });
    expect(guideLinkTarget('#a%20b', 'boats')).toEqual({ page: 'boats', anchor: 'a b' });
    expect(guideLinkTarget('/', 'boats')).toEqual({ page: GUIDE_HOME, anchor: undefined });
    expect(guideLinkTarget('../README.md', 'boats')).toBeNull();
    expect(guideLinkTarget('picture.png', 'boats')).toBeNull();
    expect(guideWebUrl({ page: GUIDE_HOME })).toBe('https://meztking.github.io/MCSuperMods/');
    expect(guideWebUrl({ page: 'try-it', anchor: 'limits' })).toBe(
      'https://meztking.github.io/MCSuperMods/try-it#limits',
    );
  });
});

const PAGES: Record<string, string> = {
  README:
    '# The guide\n\nStart with [Boats](boats.md) or [Script API 1.6](boats.md#script-api-16).\n',
  boats: [
    '# Boats',
    '',
    'Intro with [a section below](#make-a-boat) and [the web](https://example.com).',
    '',
    '## Make a boat',
    '',
    '1. Open **Create**.',
    '2. Pick one:',
    '   - Oak',
    '',
    '## Script API 1.6',
    '',
    '| Member | Since |',
    '|---|---|',
    '| `boat.x` | 1.6 |',
    '',
    '### Limits',
    '',
    'See [the index](README.md) or [nothing](gone.md).',
  ].join('\n'),
};

function fakeGuide(): GuidePlatform & { page: ReturnType<typeof vi.fn> } {
  return {
    index: vi.fn(async () => ({ pages: [], sections: [] })),
    page: vi.fn(async (page: string) => {
      const markdown = PAGES[page];
      if (markdown === undefined) throw new Error('not a page');
      return { page, markdown };
    }),
  };
}

describe('GuideDialog', () => {
  it('opens a page at a heading written as GitHub writes it, with its contents', async () => {
    const guide = fakeGuide();
    render(<GuideDialog guide={guide} page="boats" anchor="script-api-16" onClose={() => {}} />);
    const dialog = screen.getByTestId('guide-dialog');
    const heading = await within(dialog).findByRole('heading', { name: 'Script API 1.6' });
    expect(heading.id).toBe(headingElementId('script-api-1-6'));
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(within(dialog).getByRole('heading', { name: 'User guide: Boats' })).toBeTruthy();
    const contents = within(dialog).getByRole('navigation', { name: 'Contents' });
    expect(
      within(contents)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Make a boat', 'Script API 1.6', 'Limits']);
    expect(
      within(contents).getByRole('link', { name: 'Script API 1.6' }).getAttribute('aria-current'),
    ).toBe('location');
    expect(within(dialog).getByRole('link', { name: 'Open on the web' }).getAttribute('href')).toBe(
      'https://meztking.github.io/MCSuperMods/boats#script-api-1-6',
    );
    expect(within(dialog).getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true);
    expect(within(dialog).getByRole('table')).toBeTruthy();
    expect(dialog.querySelector('ol')).not.toBeNull();
  });

  it('moves between pages and headings inside the reader, and goes Back', async () => {
    const guide = fakeGuide();
    const user = userEvent.setup();
    render(<GuideDialog guide={guide} onClose={() => {}} />);
    const dialog = screen.getByTestId('guide-dialog');
    await user.click(await within(dialog).findByRole('link', { name: 'Script API 1.6' }));
    const heading = await within(dialog).findByRole('heading', { name: 'Script API 1.6' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(guide.page).toHaveBeenCalledWith('boats');

    // A link on the same page, then the contents list.
    await user.click(within(dialog).getByRole('link', { name: 'a section below' }));
    await waitFor(() => expect(document.activeElement?.id).toBe(headingElementId('make-a-boat')));
    const contents = within(dialog).getByRole('navigation', { name: 'Contents' });
    await user.click(within(contents).getByRole('link', { name: 'Limits' }));
    await waitFor(() => expect(document.activeElement?.id).toBe(headingElementId('limits')));
    expect(within(dialog).getByRole('link', { name: 'Open on the web' }).getAttribute('href')).toBe(
      'https://meztking.github.io/MCSuperMods/boats#limits',
    );

    // `https:` links stay outside links.
    expect(within(dialog).getByRole('link', { name: 'the web' }).getAttribute('target')).toBe(
      '_blank',
    );

    // Back by the button and by Alt+Left, to the index page.
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(document.activeElement?.id).toBe(headingElementId('make-a-boat')));
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(
      await within(dialog).findByRole('heading', { name: 'User guide: The guide' }),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true);
    expect(guide.page).toHaveBeenCalledTimes(2);
  });

  it('says when a page is not in the guide, and Back still works', async () => {
    const user = userEvent.setup();
    render(<GuideDialog guide={fakeGuide()} page="boats" anchor="limits" onClose={() => {}} />);
    const dialog = screen.getByTestId('guide-dialog');
    await user.click(await within(dialog).findByRole('link', { name: 'nothing' }));
    expect((await within(dialog).findByTestId('guide-missing')).textContent).toContain('"gone"');
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(await within(dialog).findByRole('heading', { name: 'Limits' })).toBeTruthy();
  });

  it('reaches every control by keyboard and closes with Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GuideDialog guide={fakeGuide()} page="boats" onClose={onClose} />);
    const dialog = screen.getByTestId('guide-dialog');
    await within(dialog).findByRole('heading', { name: 'Make a boat' });
    const reached = new Set<string>();
    for (let step = 0; step < 12; step += 1) {
      await user.tab();
      reached.add(document.activeElement?.textContent ?? '');
    }
    for (const name of ['Open on the web', 'Close', 'Make a boat', 'a section below']) {
      expect(reached).toContain(name);
    }
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is the default export of its lazy chunk', async () => {
    const chunk = await import('../../src/renderer/src/components/GuideDialog');
    expect(chunk.default).toBe(GuideDialog);
  });
});
