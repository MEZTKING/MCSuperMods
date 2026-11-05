/**
 * A minimal, safe Markdown renderer for release notes and the bundled changelog: ATX
 * headings, bullet lists, paragraphs, fenced code blocks, and inline code, bold and links.
 * Everything becomes React text nodes, so raw HTML in the source shows as text and never
 * runs. Only `https:` links render as links; they open in the system browser through the
 * main window's open handler (`target="_blank"`, see `main/window.ts`).
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';

/** One block of a parsed document. */
export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string };

/** Splits Markdown into blocks. Link reference definitions (`[x]: url`) are dropped. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
    if (list !== null) blocks.push({ type: 'list', items: list });
    list = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '#').length,
        text: heading[2] ?? '',
      });
      continue;
    }
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)) {
      flush();
      continue;
    }
    const item = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (item !== null) {
      if (paragraph.length > 0) {
        blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
      }
      list ??= [];
      list.push(item[1] ?? '');
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    // A continuation line of a list item, else paragraph text.
    if (list !== null && /^\s+\S/.test(line)) {
      list[list.length - 1] = `${list[list.length - 1] ?? ''} ${line.trim()}`;
    } else {
      if (list !== null) {
        blocks.push({ type: 'list', items: list });
        list = null;
      }
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Inline code, bold and links as React nodes; everything else is text. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let count = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${count}`;
    count += 1;
    const [whole, code, bold, label, href] = match;
    if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em]">
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(<strong key={key}>{renderInline(bold, key)}</strong>);
    } else if (label !== undefined && href !== undefined && /^https:\/\//i.test(href)) {
      out.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline"
        >
          {renderInline(label, key)}
        </a>,
      );
    } else {
      out.push(label === undefined ? whole : renderInline(label, key));
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

/** Renders Markdown safely (see the module comment). */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="markdown">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case 'heading': {
            const className = HEADING_CLASS[block.level] ?? 'text-sm font-semibold';
            const content = renderInline(block.text, key);
            if (block.level <= 2) {
              return (
                <h3 key={key} className={className}>
                  {content}
                </h3>
              );
            }
            return (
              <h4 key={key} className={className}>
                {content}
              </h4>
            );
          }
          case 'list':
            return (
              <ul key={key} className="ml-5 list-disc space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
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
            return <p key={key}>{renderInline(block.text, key)}</p>;
        }
        return null;
      })}
    </div>
  );
}
