/**
 * The mechanical translation of a game shader for WebGL 2 (ADR 0121 D8; B620 interface, B629
 * builds it). The seven rules of the B619 spike: the version line and precision; drop the
 * separate-shader-objects extension; inline `#include <ns:path>` once each; strip `binding =`;
 * strip `layout(location)` on vertex outputs and fragment inputs; map `gl_VertexIndex` and
 * `gl_InstanceIndex` to `gl_VertexID` and `gl_InstanceID`; keep every other line, with a line map
 * back to the user's lines.
 */

/** What a translation gives. */
export interface TranslatedShader {
  /** The text WebGL 2 compiles. */
  text: string;
  /** For each line of `text`, the line of the source it came from (0 for an added line). */
  lineMap: number[];
  /** One plain line per rule that changed something. */
  notes: string[];
  /** The `#include` ids the lookup could not give. */
  missingIncludes: string[];
}

/** Translates a shader. Until B629 the text is returned unchanged. */
export function translateShader(
  src: string,
  _stage: 'vertex' | 'fragment',
  _include: (id: string) => string | null,
): TranslatedShader {
  const lines = src.split('\n');
  return {
    text: src,
    lineMap: lines.map((_line, index) => index + 1),
    notes: [],
    missingIncludes: [],
  };
}
