/**
 * A correction to deepslate 0.27.2's surface depth (ADR 0119 D3: corrected in our own code path,
 * never by patching `node_modules`). deepslate keeps a column's surface depth (the `surface`
 * noise times 2.75, plus 3, plus a random part below 0.25) as a fraction; the game's is a whole
 * number, the fraction dropped (towards 0). It shows wherever the depth meets another fraction
 * (`stone_depth` with a `secondary_depth_range`, the preliminary surface of
 * `above_preliminary_surface`) and in `hole`. Learned by observation on the worldgen parity
 * fixture (B581): with it, `rules_depth`, `rules_preliminary` and `condition_hole` match in
 * 100 % of the top four blocks (94.7, 89.0 and 87.0 % before).
 *
 * `install()` wraps `updateXZ` of deepslate's `MaterialRuleContext` once (the extensions' index
 * calls it), so every surface pass the engine runs uses the whole number.
 */

import { MaterialRuleContext } from 'deepslate/worldgen';

interface Context {
  surfaceDepth: number;
}

let installed = false;

/** Makes `MaterialRuleContext.surfaceDepth` a whole number (once). */
export function install(): void {
  if (installed) return;
  installed = true;
  const proto = MaterialRuleContext.prototype as unknown as {
    updateXZ(this: Context, x: number, z: number): void;
  };
  const updateXZ = proto.updateXZ;
  Object.defineProperty(MaterialRuleContext.prototype, 'updateXZ', {
    configurable: true,
    writable: true,
    value: function wholeDepth(this: Context, x: number, z: number): void {
      updateXZ.call(this, x, z);
      this.surfaceDepth = Math.trunc(this.surfaceDepth);
    },
  });
}
