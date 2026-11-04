import { describe, expect, it } from 'vitest';
import {
  EventChannels,
  type InvokeChannel,
  InvokeChannels,
  ipcContract,
  isMenuCommand,
} from '../src/shared/ipc-contract';

const bytes = new Uint8Array([1, 2, 3]);

/** One valid and one invalid request and response per channel. */
const samples: Record<
  InvokeChannel,
  { request: [unknown, unknown]; response: [unknown, unknown] }
> = {
  [InvokeChannels.projectPickDirectory]: {
    request: [{ title: 'Pick', mustBeEmpty: true }, { title: 3 }],
    response: [null, 42],
  },
  [InvokeChannels.projectOpenRoot]: {
    request: [{ path: '/tmp/p' }, { path: '' }],
    response: [{ ok: false, reason: 'missing' }, { ok: false }],
  },
  [InvokeChannels.projectCreateRoot]: {
    request: [{ path: '/tmp/p' }, {}],
    response: [{ ok: true }, { ok: 'yes' }],
  },
  [InvokeChannels.projectCloseRoot]: {
    request: [undefined, { path: 'x' }],
    response: [undefined, null],
  },
  [InvokeChannels.projectCurrentRoot]: {
    request: [undefined, 'x'],
    response: ['/tmp/p', 1],
  },
  [InvokeChannels.fsReadFile]: {
    request: [{ path: 'msm.project.json' }, { path: 1 }],
    response: [bytes, 'text'],
  },
  [InvokeChannels.fsWriteFile]: {
    request: [
      { path: 'a.json', data: bytes },
      { path: 'a.json', data: [1, 2] },
    ],
    response: [undefined, true],
  },
  [InvokeChannels.fsReadDir]: {
    request: [{ path: 'content' }, null],
    response: [[{ name: 'a', kind: 'file' }], [{ name: 'a', kind: 'link' }]],
  },
  [InvokeChannels.fsExists]: {
    request: [{ path: 'content' }, { path: 'a', extra: 1 }],
    response: [false, 'no'],
  },
  [InvokeChannels.fsMkdirp]: {
    request: [{ path: 'assets/x' }, undefined],
    response: [undefined, 0],
  },
  [InvokeChannels.fsRemove]: {
    request: [{ path: 'content/x' }, 'content/x'],
    response: [undefined, {}],
  },
  [InvokeChannels.appInfo]: {
    request: [undefined, {}],
    response: [
      { version: '0.0.0', electron: '1', platform: 'linux' },
      { version: '0.0.0', electron: '1' },
    ],
  },
  [InvokeChannels.dialogConfirmDiscard]: {
    request: [{ message: 'Discard?' }, { text: 'Discard?' }],
    response: [true, 'true'],
  },
};

describe('IPC contract', () => {
  for (const channel of Object.values(InvokeChannels)) {
    it(`${channel} accepts valid and rejects invalid payloads`, () => {
      const schema = ipcContract[channel];
      const sample = samples[channel];
      expect(schema.request.safeParse(sample.request[0]).success).toBe(true);
      expect(schema.request.safeParse(sample.request[1]).success).toBe(false);
      expect(schema.response.safeParse(sample.response[0]).success).toBe(true);
      expect(schema.response.safeParse(sample.response[1]).success).toBe(false);
    });
  }

  it('has unique channel names prefixed msm:v1:', () => {
    const names = [...Object.values(InvokeChannels), ...Object.values(EventChannels)];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.startsWith('msm:v1:')).toBe(true);
  });

  it('has a schema for every invoke channel and nothing else', () => {
    expect(Object.keys(ipcContract).sort()).toEqual(Object.values(InvokeChannels).sort());
  });

  it('recognises menu commands', () => {
    expect(isMenuCommand('save')).toBe(true);
    expect(isMenuCommand('format-disk')).toBe(false);
    expect(isMenuCommand(1)).toBe(false);
  });
});
