/** A JSON parse error with a 1-based line and column. */
export interface JsonErrorLocation {
  message: string;
  line: number;
  column: number;
}

function positionToLineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(position, text.length)));
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

/**
 * Locates a `JSON.parse` error in `text` from its message. V8 reports
 * `... (line L column C)` (removed from the returned message, which the caller shows with
 * its own location) or `... at position N`; anything else points at the end of the text.
 */
export function locateJsonError(text: string, message: string): JsonErrorLocation {
  const lineColumn = /\s*\(line (\d+) column (\d+)\)/.exec(message);
  if (lineColumn !== null) {
    return {
      message: message.replace(lineColumn[0], ''),
      line: Number(lineColumn[1]),
      column: Number(lineColumn[2]),
    };
  }
  const position = /at position (\d+)/.exec(message);
  const at = position === null ? text.length : Number(position[1]);
  return { message, ...positionToLineColumn(text, at) };
}
