import type { Element, OutputFile } from '@msm/plugin-api';
import { describe, expect, it, vi } from 'vitest';
import { createRenderLowering } from '../src/renderer/src/session/render-lowering';

const file: OutputFile = {
  path: 'data/x/function/a.mcfunction',
  layer: 'datapack',
  contents: 'say hi',
};
const element = (): Element =>
  ({ id: 'x:a', kind: 'sample:greeting', data: {} }) as unknown as Element;

describe('createRenderLowering', () => {
  it('returns synchronous results each time', () => {
    const lowering = createRenderLowering(() => {});
    const lower = vi.fn(() => [file]);
    const el = element();
    expect(lowering(el, lower)).toEqual([file]);
    expect(lowering(el, lower)).toEqual([file]);
    expect(lower).toHaveBeenCalledTimes(2);
  });

  it('starts an asynchronous lowering once per element and keeps the files', async () => {
    const onSettled = vi.fn();
    const lowering = createRenderLowering(onSettled);
    const lower = vi.fn(async () => [file]);
    const el = element();
    expect(lowering(el, lower)).toEqual([]);
    expect(lowering(el, lower)).toEqual([]);
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(lowering(el, lower)).toEqual([file]);
    expect(lower).toHaveBeenCalledTimes(1);
    // A replaced element (an edit) is lowered again.
    expect(lowering(element(), lower)).toEqual([]);
    expect(lower).toHaveBeenCalledTimes(2);
  });

  it('throws a failed asynchronous lowering on later calls, with no unhandled rejection', async () => {
    const onSettled = vi.fn();
    const lowering = createRenderLowering(onSettled);
    const el = element();
    expect(lowering(el, () => Promise.reject(new Error('plugin.timeout')))).toEqual([]);
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(() => lowering(el, () => [file])).toThrow('plugin.timeout');
  });
});
