/**
 * Release notes from electron-updater's update info, as Markdown text that is safe to send
 * to the renderer. With the GitHub provider the notes are the release body as HTML (from the
 * releases Atom feed), or a list of `{ version, note }` entries when the full changelog is
 * requested. HTML is reduced to the Markdown subset the renderer shows (headings, lists,
 * bold, code, links); every other tag is dropped and entities are decoded, so no markup
 * crosses IPC.
 *
 * @packageDocumentation
 */

import { UPDATE_NOTES_MAX } from '../shared/ipc-channels';

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function percentEncode(char: string): string {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
}

/** Reduces release-note HTML to plain Markdown (headings, lists, bold, code, links). */
export function htmlToMarkdown(html: string): string {
  let text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n?/g, '\n');
  text = text
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_whole, level: string, inner: string) => {
      const heading = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return `\n\n${'#'.repeat(Number(level))} ${heading}\n\n`;
    })
    .replace(
      /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi,
      (_whole, double: string | undefined, single: string | undefined, inner: string) => {
        const label = inner.replace(/<[^>]*>/g, '').trim();
        const href = decodeEntities(double ?? single ?? '').trim();
        if (!/^https:\/\//i.test(href)) return label;
        return label === '' ? href : `[${label}](${href.replace(/[()\s]/g, percentEncode)})`;
      },
    )
    .replace(/<\/?(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/?code\b[^>]*>/gi, '`')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '')
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|pre|blockquote|table|tr)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '').replace(/^[ \t]+(?=- )/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function noteText(note: string): string {
  return /<[a-z!/][^>]*>/i.test(note) ? htmlToMarkdown(note) : note.replace(/\r\n?/g, '\n').trim();
}

/** Cuts `text` to `max` characters at a line break where possible. */
function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = max - 3;
  const cut = text.lastIndexOf('\n', room);
  return `${text.slice(0, cut > room / 2 ? cut : room).trimEnd()}\n\n…`;
}

/**
 * The release notes of an electron-updater `UpdateInfo` (its `releaseNotes`) as Markdown, at
 * most {@link UPDATE_NOTES_MAX} characters; `undefined` when there are none.
 */
export function releaseNotesOf(info: unknown, max = UPDATE_NOTES_MAX): string | undefined {
  if (typeof info !== 'object' || info === null) return undefined;
  const notes = (info as Record<string, unknown>).releaseNotes;
  let text = '';
  if (typeof notes === 'string') {
    text = noteText(notes);
  } else if (Array.isArray(notes)) {
    text = notes
      .flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const { version, note } = entry as Record<string, unknown>;
        if (typeof version !== 'string' || typeof note !== 'string') return [];
        const body = noteText(note);
        return [`## ${version.replace(/[\r\n#]/g, '')}${body === '' ? '' : `\n\n${body}`}`];
      })
      .join('\n\n');
  }
  return text === '' ? undefined : cap(text, max);
}
