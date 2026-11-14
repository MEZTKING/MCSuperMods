import { describe, expect, it } from 'vitest';
import { floorMesh, outlineMesh } from '../../../src/renderer/src/tryit/render/TryItCanvas';

describe('Try it canvas meshes', () => {
  it('draws the floor as one tinted quad and a line on every block edge', () => {
    const mesh = floorMesh(48, 48);
    expect(mesh.quads).toHaveLength(1);
    // 47 inner lines each way and the four edges.
    expect(mesh.lines).toHaveLength(47 + 47 + 4);
    // The quad faces up, so back-face culling keeps it when seen from above.
    expect(mesh.quads[0]?.normal().y).toBeGreaterThan(0);
    for (const vertex of mesh.quads[0]?.vertices() ?? []) {
      expect(vertex.pos.y).toBe(0);
      expect(vertex.texture === undefined || vertex.texture.every((v) => v === 0)).toBe(true);
    }
  });

  it('outlines each picked box, a little outside it', () => {
    const mesh = outlineMesh({
      pos: { x: 3, y: 1, z: 5 },
      boxes: [
        [0, 0, 0, 1, 0.5, 1],
        [0, 0.5, 0, 0.5, 1, 1],
      ],
    });
    expect(mesh.lines).toHaveLength(24);
    const xs = mesh.lines.flatMap((line) => [line.v1.pos.x, line.v2.pos.x]);
    expect(Math.min(...xs)).toBeCloseTo(2.998, 6);
    expect(Math.max(...xs)).toBeCloseTo(4.002, 6);
    expect(outlineMesh({ pos: { x: 0, y: 0, z: 0 }, boxes: [] }).lines).toHaveLength(0);
  });
});
