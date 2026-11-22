// B600 spike (throwaway): a tidy tree (Reingold-Tilford with contours) for an advancement tab, as the game's server
// showed it on MSM's fixture: x is the depth among nodes with a display, nodes without a display are skipped (their
// children hang from the nearest shown ancestor), siblings at least 1 apart at every depth, a parent at the midpoint of
// its first and last child, the whole tab shifted so its smallest y is 0.
export function layout(root, childrenOf) {
  const pos = new Map();
  // returns contour: array per depth of [min, max] relative to the subtree root's y
  function place(node) {
    const kids = childrenOf(node);
    if (kids.length === 0) { pos.set(node, 0); return { shift: 0, contour: [[0, 0]], nodes: [node] }; }
    const subs = kids.map(place);
    // stack subtrees: each placed as close as possible below the previous ones
    const offsets = [0];
    let acc = subs[0].contour.map((c) => [...c]);
    for (let i = 1; i < subs.length; i++) {
      let off = -Infinity;
      for (let d = 0; d < Math.min(acc.length, subs[i].contour.length); d++) off = Math.max(off, acc[d][1] - subs[i].contour[d][0] + 1);
      offsets.push(off);
      for (let d = 0; d < subs[i].contour.length; d++) {
        const c = [subs[i].contour[d][0] + off, subs[i].contour[d][1] + off];
        if (d < acc.length) acc[d] = [Math.min(acc[d][0], c[0]), Math.max(acc[d][1], c[1])]; else acc.push(c);
      }
    }
    const mid = (offsets[0] + offsets[offsets.length - 1]) / 2;
    const nodes = [node];
    subs.forEach((s, i) => { for (const n of s.nodes) { pos.set(n, pos.get(n) + offsets[i] - mid); nodes.push(n); } });
    pos.set(node, 0);
    return { contour: [[0, 0], ...acc.map(([a, b]) => [a - mid, b - mid])], nodes };
  }
  place(root);
  const min = Math.min(...pos.values());
  for (const [n, y] of pos) pos.set(n, y - min);
  return pos;
}
