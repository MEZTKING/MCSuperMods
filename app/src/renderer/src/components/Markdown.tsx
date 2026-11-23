/**
 * A minimal, safe Markdown renderer for release notes, the bundled changelog, the AI helper's
 * answers and the user guide (ADR 0124 D14): ATX headings, bullet and numbered lists (nested by
 * indentation), paragraphs, fenced code blocks, tables, block quotes, and inline code, bold,
 * italics and links. Everything becomes React text nodes, so raw HTML in the source shows as
 * text and never runs. Only `https:` links (written `[x](https://…)` or `<https://…>`) render as
 * outside links; they open in the system browser through the main window's open handler
 * (`target="_blank"`, see `main/window.ts`). Relative links (`page.md#x`, `#x`) render as links
 * only when the caller follows them itself ({@link MarkdownProps.linkHandler}, the guide
 * reader); otherwise they show as their text.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';

/** How a table column is aligned. */
export type MarkdownAlign = 'left' | 'center' | 'right' | null;

/** One block of a parsed document. */
export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | {
      type: 'list';
      items: string[];
      /** A numbered list (`1.`), starting at {@link start}. */
      ordered?: true;
      start?: number;
      /** Blocks nested under each item (a sub-list, a later paragraph), when any item has some. */
      children?: MarkdownBlock[][];
    }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string }
  | { type: 'table'; header: string[]; align: MarkdownAlign[]; rows: string[][] }
  | { type: 'quote'; blocks: MarkdownBlock[] };

/** Every block type {@link parseMarkdown} makes and {@link Markdown} renders. */
export const MARKDOWN_BLOCK_TYPES: readonly MarkdownBlock['type'][] = [
  'heading',
  'list',
  'paragraph',
  'code',
  'table',
  'quote',
];

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LINK_DEFINITION = /^\s*\[[^\]]+\]:\s*\S+/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** The indentation of a line in columns (a tab counts four). */
function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** `line` with up to `columns` columns of leading white space taken off. */
function dedent(line: string, columns: number): string {
  let width = 0;
  let index = 0;
  while (index < line.length && width < columns) {
    const char = line[index];
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
    index += 1;
  }
  return line.slice(index);
}

const isBlank = (line: string): boolean => line.trim() === '';

/** The cells of one table row: split at `|` outside inline code, `\|` kept as a bar. */
export function tableCells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (char === '\\' && text[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (char === '`') {
      inCode = !inCode;
      cell += char;
    } else if (char === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function alignOf(cell: string): MarkdownAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/** Whether lines `index` and `index + 1` open a table (a row with `|` and a rule under it). */
function opensTable(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  const rule = lines[index + 1] ?? '';
  return line.includes('|') && rule.includes('|') && TABLE_RULE.test(rule);
}

function parseLines(lines: readonly string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const fence = FENCE.exec(line);
    if (fence !== null) {
      flush();
      const mark = fence[1] ?? '```';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith(mark)) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      index += 1;
      continue;
    }
    if (isBlank(line)) {
      flush();
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({ type: 'heading', level: (heading[1] ?? '#').length, text: heading[2] ?? '' });
      index += 1;
      continue;
    }
    if (LINK_DEFINITION.test(line)) {
      flush();
      index += 1;
      continue;
    }
    if (opensTable(lines, index)) {
      flush();
      const header = tableCells(line);
      const align = tableCells(lines[index + 1] ?? '').map(alignOf);
      const rows: string[][] = [];
      index += 2;
      while (
        index < lines.length &&
        !isBlank(lines[index] ?? '') &&
        (lines[index] ?? '').includes('|')
      ) {
        const cells = tableCells(lines[index] ?? '');
        rows.push(header.map((_, column) => cells[column] ?? ''));
        index += 1;
      }
      blocks.push({ type: 'table', header, align: header.map((_, c) => align[c] ?? null), rows });
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index] ?? '');
        if (match === null) break;
        quoted.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'quote', blocks: parseLines(quoted) });
      continue;
    }
    const item = ITEM.exec(line);
    // A numbered line inside a paragraph starts a list only at 1 (as GitHub's Markdown does).
    if (
      item !== null &&
      !(paragraph.length > 0 && /^\d/.test(item[2] ?? '') && !/^0*1\D/.test(item[2] ?? ''))
    ) {
      flush();
      index = parseList(lines, index, blocks);
      continue;
    }
    paragraph.push(line.trim());
    index += 1;
  }
  flush();
  return blocks;
}

/** Parses the list that starts at `start` into `blocks`; returns the index after it. */
function parseList(lines: readonly string[], start: number, blocks: MarkdownBlock[]): number {
  const first = ITEM.exec(lines[start] ?? '');
  const base = indentOf(first?.[1] ?? '');
  const ordered = /^\d/.test(first?.[2] ?? '');
  const items: string[] = [];
  const children: MarkdownBlock[][] = [];
  const sameList = (line: string): RegExpExecArray | null => {
    const match = ITEM.exec(line);
    if (match === null) return null;
    if (indentOf(match[1] ?? '') >= base + 2) return null;
    return /^\d/.test(match[2] ?? '') === ordered ? match : null;
  };
  let index = start;
  while (index < lines.length) {
    const match = sameList(lines[index] ?? '');
    if (match === null) break;
    const indent = indentOf(match[1] ?? '');
    const gap = Math.min(indentOf(match[3] ?? ' '), 4);
    const content = indent + (match[2] ?? '').length + gap;
    const inside = Math.min(content, base + 2);
    const body: string[] = [match[4] ?? ''];
    index += 1;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      if (isBlank(line)) {
        let next = index + 1;
        while (next < lines.length && isBlank(lines[next] ?? '')) next += 1;
        if (next < lines.length && indentOf(lines[next] ?? '') >= inside) {
          for (; index < next; index += 1) body.push('');
          continue;
        }
        // A numbered list goes on after blank lines (its numbers carry on); a bullet list ends,
        // as it did for release notes.
        if (ordered && next < lines.length && sameList(lines[next] ?? '') !== null) index = next;
        break;
      }
      if (indentOf(line) < inside) break;
      body.push(dedent(line, content));
      index += 1;
    }
    const parsed = parseLines(body);
    const head = parsed[0];
    if (head?.type === 'paragraph') {
      items.push(head.text);
      children.push(parsed.slice(1));
    } else {
      items.push('');
      children.push(parsed);
    }
  }
  const startNumber = ordered ? Number.parseInt(first?.[2] ?? '1', 10) : 1;
  blocks.push({
    type: 'list',
    items,
    ...(ordered ? { ordered: true as const, start: startNumber } : {}),
    ...(children.some((nested) => nested.length > 0) ? { children } : {}),
  });
  return index;
}

/** Splits Markdown into blocks. Link reference definitions (`[x]: url`) are dropped. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  return parseLines(source.replace(/\r\n?/g, '\n').split('\n'));
}

const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w*])\*(?![\s*])([^*]+?)(?<!\s)\*(?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)|<(https:\/\/[^>\s]+)>/g;

/** Options of {@link renderInline}. */
export interface InlineOptions {
  /** See {@link MarkdownProps.linkHandler}. */
  linkHandler?: ((href: string) => (() => void) | null) | undefined;
}

function outsideLink(key: string, href: string, label: ReactNode): ReactNode {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline"
    >
      {label}
    </a>
  );
}

/** Inline code, bold, italics and links as React nodes; everything else is text. */
export function renderInline(
  text: string,
  keyPrefix = 'i',
  options: InlineOptions = {},
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let count = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${count}`;
    count += 1;
    const [whole, code, bold, italic, label, href, autolink] = match;
    if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em]">
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(<strong key={key}>{renderInline(bold, key, options)}</strong>);
    } else if (italic !== undefined) {
      out.push(<em key={key}>{renderInline(italic, key, options)}</em>);
    } else if (autolink !== undefined) {
      out.push(outsideLink(key, autolink, autolink));
    } else if (label !== undefined && href !== undefined && /^https:\/\//i.test(href)) {
      out.push(outsideLink(key, href, renderInline(label, key, options)));
    } else if (label !== undefined && href !== undefined && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      const follow = options.linkHandler?.(href) ?? null;
      if (follow === null) {
        out.push(...renderInline(label, key, options));
      } else {
        out.push(
          <a
            key={key}
            href={href}
            data-internal-link=""
            className="text-accent underline"
            onClick={(event) => {
              event.preventDefault();
              follow();
            }}
          >
            {renderInline(label, key, options)}
          </a>,
        );
      }
    } else {
      out.push(label === undefined ? whole : renderInline(label, key, options));
    }
    last = start + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASS: Readonly<Record<number, string>> = {
  1: 'text-lg font-semibold',
  2: 'text-base font-semibold',
  3: 'text-sm font-semibold',
};

/** Props of {@link Markdown}. */
export interface MarkdownProps {
  source: string;
  /**
   * Follows a relative link (`page.md#x`, `#x`, `/`): returns what clicking it does, or `null`
   * to show the link as text. Without it every relative link shows as text.
   */
  linkHandler?: ((href: string) => (() => void) | null) | undefined;
  /**
   * The `id` of each heading, given the headings' Markdown text in document order (the guide's
   * anchors); a heading with an id can take focus. Without it headings have no id.
   */
  headingIds?: ((headings: readonly string[]) => readonly (string | undefined)[]) | undefined;
  /**
   * The HTML level of a `#` heading (`##` is one more, up to 6), for a document under a dialog
   * title. Without it `#` and `##` render as `h3` and the rest as `h4`, as release notes do.
   */
  headingBase?: number | undefined;
}

function collectHeadings(blocks: readonly MarkdownBlock[], out: string[]): string[] {
  for (const block of blocks) {
    if (block.type === 'heading') out.push(block.text);
    else if (block.type === 'quote') collectHeadings(block.blocks, out);
    else if (block.type === 'list')
      for (const nested of block.children ?? []) collectHeadings(nested, out);
  }
  return out;
}

const ALIGN_CLASS: Readonly<Record<string, string>> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Renders Markdown safely (see the module comment). */
export function Markdown({ source, linkHandler, headingIds, headingBase }: MarkdownProps) {
  const blocks = parseMarkdown(source);
  const ids = headingIds?.(collectHeadings(blocks, [])) ?? [];
  let headingCount = 0;
  const options: InlineOptions = { linkHandler };

  const renderBlocks = (list: readonly MarkdownBlock[], prefix: string): ReactNode[] =>
    list.map((block, index) => {
      const key = `${prefix}${index}`;
      switch (block.type) {
        case 'heading': {
          const id = ids[headingCount];
          headingCount += 1;
          const className = HEADING_CLASS[block.level] ?? 'text-sm font-semibold';
          const content = renderInline(block.text, key, options);
          const level =
            headingBase === undefined
              ? block.level <= 2
                ? 3
                : 4
              : Math.min(6, headingBase + block.level - 1);
          const Tag = `h${level}` as 'h3';
          return (
            <Tag
              key={key}
              className={className}
              {...(id === undefined ? {} : { id, tabIndex: -1 })}
            >
              {content}
            </Tag>
          );
        }
        case 'list': {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              {renderInline(item, `${key}-${itemIndex}`, options)}
              {(block.children?.[itemIndex]?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {renderBlocks(block.children?.[itemIndex] ?? [], `${key}-${itemIndex}-`)}
                </div>
              )}
            </li>
          ));
          if (block.ordered === true) {
            return (
              <ol
                key={key}
                start={block.start === undefined || block.start === 1 ? undefined : block.start}
                className="ml-5 list-decimal space-y-1"
              >
                {items}
              </ol>
            );
          }
          return (
            <ul key={key} className="ml-5 list-disc space-y-1">
              {items}
            </ul>
          );
        }
        case 'code':
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded bg-black/10 p-2 font-mono text-xs whitespace-pre"
            >
              {block.text}
            </pre>
          );
        case 'paragraph':
          return <p key={key}>{renderInline(block.text, key, options)}</p>;
        case 'table':
          return (
            <section
              key={key}
              className="overflow-x-auto"
              aria-label="Table"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a wide table scrolls by keyboard.
              tabIndex={0}
            >
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {block.header.map((cell, column) => (
                      <th
                        key={column}
                        scope="col"
                        className={`border border-border px-2 py-1 align-top font-semibold ${ALIGN_CLASS[block.align[column] ?? ''] ?? ''}`}
                      >
                        {renderInline(cell, `${key}-h${column}`, options)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, column) => (
                        <td
                          key={column}
                          className={`border border-border px-2 py-1 align-top ${ALIGN_CLASS[block.align[column] ?? ''] ?? ''}`}
                        >
                          {renderInline(cell, `${key}-${rowIndex}-${column}`, options)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        case 'quote':
          return (
            <blockquote
              key={key}
              className="flex flex-col gap-2 border-l-2 border-border pl-3 text-muted"
            >
              {renderBlocks(block.blocks, `${key}-`)}
            </blockquote>
          );
      }
      return null;
    });

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="markdown">
      {renderBlocks(blocks, 'b')}
    </div>
  );
}
