// @vitest-environment happy-dom
import type { StarterParameter } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  audioSummary,
  bytesOfOggDataUrl,
  checkOggBytes,
  defaultRawValue,
  oggDataUrl,
  oggInfo,
  readAudioFile,
  toValue,
  validateParameter,
} from '../../src/renderer/src/components/wizard/wizard-model';

const SONG: StarterParameter & { type: 'audio' } = {
  id: 'song_file',
  label: 'Song file',
  type: 'audio',
  default: null,
  maxBytes: 4096,
};

/** A minimal Ogg Vorbis container: the identification header page and a last page. */
function ogg(seconds: number, channels: number): Uint8Array<ArrayBuffer> {
  const page = (granule: number, packet: number[]): number[] => {
    const header = new Uint8Array(27);
    header.set([0x4f, 0x67, 0x67, 0x53, 0, 2]);
    new DataView(header.buffer).setUint32(6, granule, true);
    header[26] = 1;
    return [...header, packet.length, ...packet];
  };
  const id = new Uint8Array(30);
  id.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  id[11] = channels;
  new DataView(id.buffer).setUint32(12, 48_000, true);
  return new Uint8Array([...page(0, [...id]), ...page(seconds * 48_000, [0, 0, 0, 0])]);
}

describe('audio parameters (ADR 0049)', () => {
  it('reads the length and channels of Ogg Vorbis bytes', () => {
    expect(oggInfo(ogg(65, 1))).toEqual({ sampleRate: 48_000, channels: 1, seconds: 65 });
    expect(oggInfo(new Uint8Array(80))).toBeNull();
  });

  it('checks the size and the format', () => {
    expect(checkOggBytes(SONG, ogg(3, 2))).toBeNull();
    expect(checkOggBytes(SONG, new Uint8Array(80))).toBe('Choose an Ogg Vorbis sound (.ogg).');
    expect(checkOggBytes(SONG, new Uint8Array(5000))).toBe('Choose a sound of at most 4 KB.');
  });

  it('round-trips the value and summarises it', () => {
    const url = oggDataUrl(ogg(125, 2));
    expect(bytesOfOggDataUrl(url)).toEqual(ogg(125, 2));
    expect(audioSummary(url)).toBe('Ogg Vorbis, 2:05, stereo');
    expect(audioSummary(null)).toBe('None');
    expect(defaultRawValue(SONG)).toBe('');
    expect(toValue(SONG, '')).toBeNull();
    expect(toValue(SONG, url)).toBe(url);
    expect(validateParameter(SONG, 'data:audio/ogg;base64,AAAA')).toBe(
      'Choose an Ogg Vorbis sound (.ogg).',
    );
  });

  it('reads a picked file', async () => {
    const good = await readAudioFile(SONG, new Blob([ogg(2, 1)]));
    expect('value' in good && good.value.startsWith('data:audio/ogg;base64,')).toBe(true);
    expect(await readAudioFile(SONG, new Blob([new Uint8Array(10)]))).toEqual({
      error: 'Choose an Ogg Vorbis sound (.ogg).',
    });
  });
});
