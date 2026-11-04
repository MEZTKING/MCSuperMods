import { describe, expect, it } from 'vitest';
import {
  bindControlledModel,
  type ControlledModel,
  type ModelRange,
  minimalEdit,
} from '../../src/renderer/src/components/json-editor/controlled-model';

/**
 * A stand-in Monaco model with one caret: typing inserts at the caret, `setValue` resets it
 * to the start (as Monaco does), and edits move it like Monaco's tracked selections.
 */
class FakeModel implements ControlledModel {
  caret = 0;
  stackElements = 0;
  private listeners: (() => void)[] = [];

  text: string;

  constructor(text: string) {
    this.text = text;
  }

  getValue(): string {
    return this.text;
  }

  getPositionAt(offset: number): { lineNumber: number; column: number } {
    const before = this.text.slice(0, offset).split('\n');
    return { lineNumber: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
  }

  offsetAt(lineNumber: number, column: number): number {
    const lines = this.text.split('\n');
    let offset = 0;
    for (let index = 0; index < lineNumber - 1; index++) offset += (lines[index]?.length ?? 0) + 1;
    return offset + column - 1;
  }

  pushStackElement(): void {
    this.stackElements++;
  }

  pushEditOperations(_: null, edits: { range: ModelRange; text: string }[]): unknown {
    for (const { range, text } of edits) {
      const start = this.offsetAt(range.startLineNumber, range.startColumn);
      const end = this.offsetAt(range.endLineNumber, range.endColumn);
      this.text = this.text.slice(0, start) + text + this.text.slice(end);
      if (this.caret >= end) this.caret += text.length - (end - start);
      else if (this.caret > start) this.caret = start + text.length;
    }
    this.fire();
    return null;
  }

  onDidChangeContent(listener: () => void): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((entry) => entry !== listener);
      },
    };
  }

  /** Monaco's `setValue`: replaces the text and moves the caret to (1,1). */
  setValue(text: string): void {
    this.text = text;
    this.caret = 0;
    this.fire();
  }

  type(chars: string): void {
    for (const char of chars) {
      this.text = this.text.slice(0, this.caret) + char + this.text.slice(this.caret);
      this.caret++;
      this.fire();
    }
  }

  private fire(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Types `chunks`, delivering the host's echo of each chunk's last emitted value only after
 * the next chunk has been typed (a render committing after newer keystrokes).
 */
function typeWithLaggingEchoes(chunks: readonly string[], apply: (value: string) => void) {
  const model = new FakeModel('');
  const emitted: string[] = [];
  const echo = (value: string) => emitted.push(value);
  let lagging: string | null = null;
  return {
    model,
    echo,
    run() {
      for (const chunk of chunks) {
        model.type(chunk);
        if (lagging !== null) apply(lagging);
        lagging = emitted.at(-1) ?? null;
      }
      if (lagging !== null) apply(lagging);
    },
  };
}

const CHUNKS = ['say', ' hi', '\ngive', ' @s', ' minecraft', ':emerald', ' 3'];
const TYPED = 'say hi\ngive @s minecraft:emerald 3';

describe('controlled Monaco model', () => {
  it('reproduces the scramble when every differing value is set (the old behaviour)', () => {
    let model: FakeModel | null = null;
    const run = typeWithLaggingEchoes(CHUNKS, (value) => {
      if (model !== null && model.getValue() !== value) model.setValue(value);
    });
    model = run.model;
    model.onDidChangeContent(() => run.echo(run.model.getValue()));
    run.run();
    expect(model.getValue()).not.toBe(TYPED);
  });

  it('ignores stale echoes, so fast typing keeps every character and the caret', () => {
    const run = typeWithLaggingEchoes(CHUNKS, (value) => binding.setValue(value));
    const binding = bindControlledModel(run.model, run.echo);
    run.run();
    expect(run.model.getValue()).toBe(TYPED);
    expect(run.model.caret).toBe(TYPED.length);
    expect(run.model.stackElements).toBe(0);
  });

  it('ignores an older echo even when a value repeats', () => {
    const model = new FakeModel('');
    const seen: string[] = [];
    const binding = bindControlledModel(model, (value) => seen.push(value));
    model.type('a');
    model.pushEditOperations(null, [
      { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }, text: '' },
    ]);
    model.type('ab');
    expect(seen).toEqual(['a', '', 'a', 'ab']);
    for (const value of seen.slice(0, 3)) binding.setValue(value);
    expect(model.getValue()).toBe('ab');
    binding.setValue('ab');
    expect(model.getValue()).toBe('ab');
  });

  it('applies an external change as an edit that keeps the caret, without echoing it', () => {
    const model = new FakeModel('');
    const seen: string[] = [];
    const binding = bindControlledModel(model, (value) => seen.push(value));
    model.type('say hi\ngive @s');
    binding.setValue('say hi\ngive @s');
    model.caret = 3;
    // A rename rewrites the second line; the caret on the first line stays put.
    binding.setValue('say hi\ngive @a');
    expect(model.getValue()).toBe('say hi\ngive @a');
    expect(model.caret).toBe(3);
    expect(model.stackElements).toBe(2);
    expect(seen.at(-1)).toBe('say hi\ngive @s');
    // Undo back to a value typed earlier (but already echoed) is applied too.
    binding.setValue('say');
    expect(model.getValue()).toBe('say');
  });

  it('stops reporting once disposed', () => {
    const model = new FakeModel('');
    const seen: string[] = [];
    const binding = bindControlledModel(model, (value) => seen.push(value));
    binding.dispose();
    model.type('x');
    expect(seen).toEqual([]);
  });

  it('finds the smallest single replacement', () => {
    expect(minimalEdit('say hi', 'say ho')).toEqual({ start: 5, end: 6, text: 'o' });
    expect(minimalEdit('aaa', 'aaaa')).toEqual({ start: 3, end: 3, text: 'a' });
    expect(minimalEdit('abc', '')).toEqual({ start: 0, end: 3, text: '' });
    expect(minimalEdit('same', 'same')).toEqual({ start: 4, end: 4, text: '' });
  });
});
