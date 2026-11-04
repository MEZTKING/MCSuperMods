import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Reads a fixture directory into a path-to-bytes record with POSIX relative paths. */
export function readFixture(directory: string): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else
        result[relative(directory, full).split(sep).join('/')] = new Uint8Array(readFileSync(full));
    }
  };
  visit(directory);
  return result;
}

export function fixturePath(name: string): string {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname;
}
