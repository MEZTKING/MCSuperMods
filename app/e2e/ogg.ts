/**
 * A minimal Ogg Vorbis container for e2e fixtures (ADR 0049): the identification header page
 * and a last page whose granule position gives the length. Nothing in it is decodable; the
 * app reads only the container.
 *
 * @packageDocumentation
 */

/** `seconds` of `channels`-channel Ogg Vorbis at 44.1 kHz. */
export function oggVorbis(seconds: number, channels: number): Buffer {
  const page = (granule: number, packet: number[]): number[] => {
    const header = Buffer.alloc(27);
    header.set([0x4f, 0x67, 0x67, 0x53, 0, 2]);
    header.writeUInt32LE(granule, 6);
    header[26] = 1;
    return [...header, packet.length, ...packet];
  };
  const id = Buffer.alloc(30);
  id.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  id[11] = channels;
  id.writeUInt32LE(44_100, 12);
  return Buffer.from([...page(0, [...id]), ...page(seconds * 44_100, [0, 0, 0, 0])]);
}
