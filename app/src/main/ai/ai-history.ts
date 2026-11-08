/**
 * Saved AI helper conversations (ADR 0055): one file per project under
 * `<msmHome>/ai-history/<sha256 of the project root>.json`, holding the API history main keeps
 * and the transcript the panel shows. Never inside the project, so sharing a project does not
 * share its conversation. Written atomically; unreadable files read as none.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** The largest saved conversation; larger ones are trimmed (pictures first, then old turns). */
export const AI_HISTORY_MAX_BYTES = 16 * 1024 * 1024;

/** What a history file holds. */
export interface AiHistoryRecord {
  format: 1;
  root: string;
  savedAt: string;
  model: string;
  /** The API messages (`BetaMessageParam[]`), as main keeps them. */
  messages: unknown[];
  /** The panel's transcript, as the renderer serialised it. */
  transcript: string;
}

export interface AiHistoryStore {
  read(root: string): Promise<AiHistoryRecord | null>;
  write(record: AiHistoryRecord): Promise<void>;
  remove(root: string): Promise<void>;
}

/** The file name of a project's history. */
export function historyFileName(root: string): string {
  return `${createHash('sha256').update(root).digest('hex').slice(0, 40)}.json`;
}

/** Replaces picture blocks in API messages with a short text note. */
function withoutPictures(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return message;
    return {
      ...(message as object),
      content: content.map((block) =>
        (block as { type?: unknown }).type === 'image'
          ? { type: 'text', text: '[A picture was sent here; it was not kept.]' }
          : block,
      ),
    };
  });
}

/**
 * The record trimmed to {@link AI_HISTORY_MAX_BYTES}: pictures dropped first, then the oldest
 * turns (whole user and assistant pairs, so tool calls keep their results). `null` when even
 * one turn is too large.
 */
export function fitHistory(
  record: AiHistoryRecord,
  max = AI_HISTORY_MAX_BYTES,
): AiHistoryRecord | null {
  const size = (r: AiHistoryRecord): number => Buffer.byteLength(JSON.stringify(r));
  if (size(record) <= max) return record;
  let trimmed: AiHistoryRecord = { ...record, messages: withoutPictures(record.messages) };
  // Drop the oldest messages two at a time, keeping the first one a user message.
  while (size(trimmed) > max && trimmed.messages.length > 2) {
    let start = 2;
    while (
      start < trimmed.messages.length &&
      (trimmed.messages[start] as { role?: unknown }).role !== 'user'
    ) {
      start += 1;
    }
    trimmed = { ...trimmed, messages: trimmed.messages.slice(start) };
  }
  return size(trimmed) <= max ? trimmed : null;
}

/** A history store in `dir` (created on the first write). */
export function createAiHistoryStore(
  dir: string,
  writeFileAtomic: (path: string, data: Uint8Array) => Promise<void>,
): AiHistoryStore {
  return {
    async read(root) {
      try {
        const parsed = JSON.parse(
          await readFile(join(dir, historyFileName(root)), 'utf8'),
        ) as Partial<AiHistoryRecord>;
        if (
          parsed.format !== 1 ||
          parsed.root !== root ||
          !Array.isArray(parsed.messages) ||
          typeof parsed.transcript !== 'string' ||
          typeof parsed.model !== 'string'
        ) {
          return null;
        }
        return parsed as AiHistoryRecord;
      } catch {
        return null;
      }
    },
    async write(record) {
      const fitted = fitHistory(record);
      if (fitted === null) return;
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(
        join(dir, historyFileName(record.root)),
        new TextEncoder().encode(JSON.stringify(fitted)),
      );
    },
    async remove(root) {
      await rm(join(dir, historyFileName(root)), { force: true });
    },
  };
}
