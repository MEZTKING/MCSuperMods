/**
 * MSM's own font test files (B624): the glyph sheet of the B619 spike (`make_fixture.py`, 3S7:
 * an 8 by 8 cell per letter with known opaque columns), a tiny PNG writer and a project to hold
 * fonts. No Mojang file.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { strToU8, zipSync, zlibSync } from 'fflate';
import {
  createUnihexHost,
  type UnihexRequest,
} from '../../../../../src/renderer/src/liveviews/looks/font/unihex';
import type { UnihexWorkerLike } from '../../../../../src/renderer/src/liveviews/looks/font/unihex-client';

/** Encodes RGBA pixels as an 8-bit RGBA PNG (no filter; the CRCs are not checked by the reader). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return pngOf(width, height, 8, 6, zlibSync(raw));
}

/** A PNG of the given header and compressed data. */
export function pngOf(
  width: number,
  height: number,
  depth: number,
  colourType: number,
  idat: Uint8Array,
  extra: ReadonlyArray<[string, Uint8Array]> = [],
): Uint8Array {
  const chunks: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    chunks.push(out);
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = depth;
  header[9] = colourType;
  chunk('IHDR', header);
  for (const [type, body] of extra) chunk(type, body);
  chunk('IDAT', idat);
  chunk('IEND', new Uint8Array());
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The spike's opaque columns per letter (G has only its top row). */
const COLUMNS: Readonly<Record<string, readonly number[]>> = {
  A: [0, 1, 2, 3, 4, 5, 6, 7],
  B: [0, 1, 2, 3, 4],
  C: [0],
  D: [],
  E: [0, 1, 2, 5],
  F: [2, 3],
  G: [0, 1, 2, 3, 4, 5, 6, 7],
  H: [7],
};

/** The spike's 32 by 16 glyph sheet, rows `ABCD` and `EFGH`. */
export function spikeSheet(): Uint8Array {
  const width = 32;
  const height = 16;
  const rgba = new Uint8Array(width * height * 4);
  [...'ABCDEFGH'].forEach((char, index) => {
    const cx = (index % 4) * 8;
    const cy = Math.floor(index / 4) * 8;
    const rows = char === 'G' ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (const x of COLUMNS[char] ?? []) {
      for (const y of rows) rgba.set([255, 255, 255, 255], ((cy + y) * width + cx + x) * 4);
    }
  });
  return encodePng(width, height, rgba);
}

const BITMAP = { type: 'bitmap', file: 'msm_b619:font/glyphs.png', chars: ['ABCD', 'EFGH'] };

/** The spike's fonts, as project elements' data by id. */
export const SPIKE_FONTS: Readonly<Record<string, Json>> = {
  'msm_b619:bitmap8': { providers: [{ ...BITMAP, ascent: 7, height: 8 }] },
  'msm_b619:bitmap16': { providers: [{ ...BITMAP, ascent: 14, height: 16 }] },
  'msm_b619:bitmap4': { providers: [{ ...BITMAP, ascent: 3, height: 4 }] },
  'msm_b619:space': { providers: [{ type: 'space', advances: { ' ': 7, a: 12.5, b: -3 } }] },
  'msm_b619:ref': {
    providers: [
      { type: 'reference', id: 'msm_b619:bitmap8' },
      { type: 'space', advances: { ' ': 9 } },
    ],
  },
};

/** A font element. */
export function fontElement(id: string, data: Json): Element {
  return {
    formatVersion: 1,
    id,
    kind: 'minecraft:font',
    data,
    meta: {},
  } as unknown as Element;
}

/** A project holding the given font elements. */
export function projectOf(elements: readonly Element[]): Project {
  const byNamespace = new Map<string, Element[]>();
  for (const element of elements) {
    const namespace = element.id.slice(0, element.id.indexOf(':'));
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), element]);
  }
  return {
    formatVersion: 1,
    name: 'Fonts',
    namespaces: [...byNamespace].map(([name, list]) => ({ name, assets: [], elements: list })),
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

/** A project reader over a map of paths. */
export function readerOf(files: Readonly<Record<string, Uint8Array>>) {
  return async (path: string): Promise<Uint8Array | null> => files[path] ?? null;
}

/** 16 rows of 16 columns: columns 1 to 14 set on every row. */
export const WIDE = '7FFE'.repeat(16);
/** 16 rows of 8 columns: column 2 set on row 3 only. */
export const DOT = `${'00'.repeat(3)}20${'00'.repeat(12)}`;

export function hexZip(): Uint8Array {
  return zipSync({
    'font/test.hex': strToU8(`4E2D:${WIDE}\n0041:${DOT}\nbroken line\n`),
    'font/readme.txt': strToU8('not read'),
  });
}

/** A worker running the host in this thread. */
export function hostWorker(): UnihexWorkerLike {
  const answer = createUnihexHost();
  const worker: UnihexWorkerLike = {
    onmessage: null,
    postMessage(message: UnihexRequest) {
      queueMicrotask(() => worker.onmessage?.({ data: answer(message) }));
    },
    terminate() {},
  };
  return worker;
}
