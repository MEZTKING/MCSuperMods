// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MARKDOWN_BLOCK_TYPES,
  Markdown,
  type MarkdownBlock,
  parseMarkdown,
  tableCells,
} from '../../src/renderer/src/components/Markdown';

afterEach(cleanup);

const REPO_GUIDE = join(import.meta.dirname, '..', '..', '..', 'docs', 'guide');

describe('parseMarkdown (B661 additions)', () => {
  it('parses tables, with alignment, bars in code and escaped bars', () => {
    expect(
      parseMarkdown('Intro\n| A | B |\n|:--|--:|\n| `a|b` | c \\| d |\n| short |\n\nAfter'),
    ).toEqual([
      { type: 'paragraph', text: 'Intro' },
      {
        type: 'table',
        header: ['A', 'B'],
        align: ['left', 'right'],
        rows: [
          ['`a|b`', 'c | d'],
          ['short', ''],
        ],
      },
      { type: 'paragraph', text: 'After' },
    ]);
    expect(tableCells('a | b')).toEqual(['a', 'b']);
    // A bar with no rule under it is text.
    expect(parseMarkdown('| not | a table |')).toEqual([
      { type: 'paragraph', text: '| not | a table |' },
    ]);
  });

  it('parses numbered lists with their start, across blank lines', () => {
    expect(parseMarkdown('3. three\n4. four\n\n5. five')).toEqual([
      { type: 'list', ordered: true, start: 3, items: ['three', 'four', 'five'] },
    ]);
    // A number inside a paragraph starts a list only at 1.
    expect(parseMarkdown('In\n2026. was a year')).toEqual([
      { type: 'paragraph', text: 'In 2026. was a year' },
    ]);
    expect(parseMarkdown('Steps:\n1. one')).toEqual([
      { type: 'paragraph', text: 'Steps:' },
      { type: 'list', ordered: true, start: 1, items: ['one'] },
    ]);
  });

  it('nests lists and later paragraphs under their item', () => {
    const blocks = parseMarkdown(
      [
        '1. First',
        '2. Fill in:',
        '   - **A**: a',
        '   - **B**: b',
        '3. Last',
        '',
        '- Outer',
        '  1. one',
        '  2. two',
        '  Then more.',
        '- Next',
        '',
        '  Loose paragraph.',
        'Not in the list.',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: ['First', 'Fill in:', 'Last'],
        children: [[], [{ type: 'list', items: ['**A**: a', '**B**: b'] }], []],
      },
      {
        type: 'list',
        items: ['Outer', 'Next'],
        children: [
          [
            { type: 'list', ordered: true, start: 1, items: ['one', 'two'] },
            { type: 'paragraph', text: 'Then more.' },
          ],
          [{ type: 'paragraph', text: 'Loose paragraph.' }],
        ],
      },
      { type: 'paragraph', text: 'Not in the list.' },
    ]);
  });

  it('parses block quotes and both fences', () => {
    expect(parseMarkdown('> **Note**\n> more\n\n~~~\na\n~~~')).toEqual([
      { type: 'quote', blocks: [{ type: 'paragraph', text: '**Note** more' }] },
      { type: 'code', text: 'a' },
    ]);
  });
});

describe('Markdown (B661 additions)', () => {
  it('renders tables, numbered and nested lists, quotes and italics', () => {
    const { container } = render(
      <Markdown
        source={
          '| A | B |\n|---|---|\n| *x* | [y](https://e.com) |\n\n2. two\n   - sub\n\n> quoted'
        }
      />,
    );
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelector('th')?.getAttribute('scope')).toBe('col');
    expect(container.querySelector('td em')?.textContent).toBe('x');
    expect(container.querySelector('td a')?.getAttribute('target')).toBe('_blank');
    const table = container.querySelector('section');
    expect(table?.getAttribute('aria-label')).toBe('Table');
    expect(table?.getAttribute('tabindex')).toBe('0');
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('2');
    expect(container.querySelector('ol > li > div > ul > li')?.textContent).toBe('sub');
    expect(container.querySelector('blockquote')?.textContent).toBe('quoted');
  });

  it('opens autolinks outside, and shows other links as text without a link handler', () => {
    const { container } = render(
      <Markdown
        source={
          'Go to <https://example.com/x> or [a page](other.md#top) or [here](#here) or <http://no>.'
        }
      />,
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com/x');
    expect(container.textContent).toContain('a page');
    expect(container.textContent).toContain('<http://no>');
  });

  it('follows relative links through the link handler, never scheme links', async () => {
    const followed: string[] = [];
    const linkHandler = vi.fn((href: string) =>
      href.endsWith('.png') ? null : () => followed.push(href),
    );
    const { container } = render(
      <Markdown
        source={
          '[Page](page.md#x), [same](#y), [picture](a.png), [bad](javascript:alert(1)), [file](file:///etc)'
        }
        linkHandler={linkHandler}
      />,
    );
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((link) => link.textContent)).toEqual(['Page', 'same']);
    expect(linkHandler).not.toHaveBeenCalledWith('javascript:alert(1)');
    expect(linkHandler).not.toHaveBeenCalledWith('file:///etc');
    const user = userEvent.setup();
    await user.click(links[0] as HTMLElement);
    links[1]?.focus();
    await user.keyboard('{Enter}');
    expect(followed).toEqual(['page.md#x', '#y']);
  });

  it('gives headings ids and levels under a dialog title when asked', () => {
    const { container } = render(
      <Markdown
        source={'# Title\n\n## Part\n\n#### Deep'}
        headingBase={3}
        headingIds={(texts) => texts.map((text) => `h-${text.toLowerCase()}`)}
      />,
    );
    const headings = Array.from(container.querySelectorAll('h3, h4, h5, h6'));
    expect(headings.map((heading) => [heading.tagName, heading.id])).toEqual([
      ['H3', 'h-title'],
      ['H4', 'h-part'],
      ['H6', 'h-deep'],
    ]);
    expect(headings[0]?.getAttribute('tabindex')).toBe('-1');
  });
});

describe('release notes render as before', () => {
  it('reads the bundled changelog with the blocks it always had', () => {
    const changelog = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'CHANGELOG.md'),
      'utf8',
    );
    const blocks = walk(parseMarkdown(changelog));
    expect(new Set(blocks.map((block) => block.type))).toEqual(
      new Set(['heading', 'list', 'paragraph']),
    );
    for (const block of blocks) {
      if (block.type === 'list') expect(block.ordered ?? block.children).toBeUndefined();
    }
  });

  it('ends a bullet list at a blank line, as before', () => {
    expect(parseMarkdown('- a\n\n- b')).toEqual([
      { type: 'list', items: ['a'] },
      { type: 'list', items: ['b'] },
    ]);
  });
});

/** Every block, nested ones included. */
function walk(blocks: readonly MarkdownBlock[], out: MarkdownBlock[] = []): MarkdownBlock[] {
  for (const block of blocks) {
    out.push(block);
    if (block.type === 'quote') walk(block.blocks, out);
    if (block.type === 'list') for (const nested of block.children ?? []) walk(nested, out);
  }
  return out;
}

/** The words of a Markdown source a reader must see: link targets and marks taken out. */
function wordsOf(source: string): Set<string> {
  const text = source
    .replace(/\]\([^)\s]*\)/g, ']')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    // A numbered item's number is drawn by the list, not written.
    .replace(/^(\s*)\d{1,9}[.)]\s/gm, '$1');
  return new Set(text.match(/[\p{L}\p{N}]+/gu) ?? []);
}

describe('the user guide renders without a dropped block', () => {
  const pages = new Map<string, string>();
  beforeAll(() => {
    for (const name of readdirSync(REPO_GUIDE)
      .filter((file) => file.endsWith('.md'))
      .sort()) {
      pages.set(name, readFileSync(join(REPO_GUIDE, name), 'utf8'));
    }
  });

  it('reads every page', () => {
    expect(pages.size).toBeGreaterThanOrEqual(38);
  });

  it('parses each page into known blocks, with no Markdown left in a paragraph', () => {
    for (const [name, source] of pages) {
      const blocks = walk(parseMarkdown(source));
      for (const block of blocks) {
        expect(MARKDOWN_BLOCK_TYPES, name).toContain(block.type);
        if (block.type !== 'paragraph') continue;
        // Paragraph text that starts like a block would mean a block was missed.
        expect(block.text, `${name}: ${block.text.slice(0, 60)}`).not.toMatch(
          /^(?:#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>|\||```|~~~)/,
        );
      }
      // Every table and heading of the source is a block (fences left out).
      const outside = source.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '');
      const rules = outside
        .split('\n')
        .filter((line) => /^\s*\|?\s*:?-{3,}/.test(line) && line.includes('|'));
      expect(
        blocks.filter((block) => block.type === 'table'),
        name,
      ).toHaveLength(rules.length);
      const headings = outside.split('\n').filter((line) => /^#{1,6}\s/.test(line));
      expect(
        blocks.filter((block) => block.type === 'heading'),
        name,
      ).toHaveLength(headings.length);
    }
  });

  it('shows every word of every page', () => {
    for (const [name, source] of pages) {
      const { container, unmount } = render(
        <Markdown source={source} linkHandler={() => () => {}} headingBase={3} />,
      );
      const shown = container.textContent ?? '';
      const missing = [...wordsOf(source)].filter((word) => !shown.includes(word));
      expect(missing, name).toEqual([]);
      // Lists: one item per item line of the source, outside code.
      const outside = source.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '');
      const itemLines = outside
        .split('\n')
        .filter((line) => /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/.test(line));
      expect(container.querySelectorAll('li').length, name).toBe(itemLines.length);
      unmount();
    }
  });
});
