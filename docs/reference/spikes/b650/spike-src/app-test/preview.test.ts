// B650 spike (throwaway): SQ7, the time to build each flow's bundle with default answers, plan
// it as the Creator does, and lay it over the project for the preview, on both targets.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEmptyProject } from '@msm/core';
import type { Json, Plugin, ProjectStarter } from '@msm/plugin-api';
import { targetFacts } from '@msm/targets';
import { describe, it } from 'vitest';
import { creatorValues, planCreate } from '../../src/renderer/src/changeset/creator-sets';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { bundlePreviewProject } from '../../src/renderer/src/preview/bundle-source';

const OUT = process.env.B650_OUT ?? '/tmp/b650';

describe('B650 preview cost', () => {
  it('builds every flow', async () => {
    const plugins = builtInPlugins as Plugin[];
    const kinds = new Set(plugins.flatMap((p) => (p.contributes.elementKinds ?? []).map((k) => k.id)));
    const flows: ProjectStarter[] = plugins.flatMap((p) => p.contributes.projectStarters ?? []).filter((s) => s.creator !== undefined);
    const out: Record<string, unknown> = {};
    for (const id of ['mc-26.3', 'mc-26.4']) {
      const target = targetFacts(id);
      if (target === undefined) throw new Error(id);
      const rows: { flow: string; build: number; plan: number; overlay: number; total: number; elements: number; assets: number; assetBytes: number }[] = [];
      for (const flow of flows) {
        if (flow.supports?.(target) === false) continue;
        const values = Object.fromEntries((flow.parameters ?? []).map((p) => [p.id, p.default as Json]));
        const project = createEmptyProject('Demo', { targets: [id] });
        const runs: number[][] = [];
        let shape = { elements: 0, assets: 0, assetBytes: 0 };
        for (let r = 0; r < 4; r++) {
          const t0 = performance.now();
          const bundle = await flow.build({ namespace: 'demo', projectName: 'Demo', target, values });
          const t1 = performance.now();
          planCreate(bundle, project, { flowId: flow.id, setId: 'set', values: creatorValues(values) }, (k) => kinds.has(k));
          const t2 = performance.now();
          bundlePreviewProject(project, bundle);
          const t3 = performance.now();
          runs.push([t1 - t0, t2 - t1, t3 - t2, t3 - t0]);
          shape = { elements: bundle.elements.length, assets: bundle.assets.length, assetBytes: bundle.assets.reduce((n, a) => n + a.bytes.length, 0) };
        }
        // the first run is cold (JIT, art caches); report it and the median of the warm ones
        const warm = runs.slice(1).sort((a, b) => (a[3] as number) - (b[3] as number))[1] as number[];
        const cold = runs[0] as number[];
        rows.push({ flow: flow.id, build: +(warm[0] as number).toFixed(1), plan: +(warm[1] as number).toFixed(1), overlay: +(warm[2] as number).toFixed(1), total: +(warm[3] as number).toFixed(1), cold: +(cold[3] as number).toFixed(1), ...shape } as never);
      }
      rows.sort((a, b) => b.total - a.total);
      out[id] = { flows: rows.length, over250: rows.filter((r) => r.total > 250).map((r) => r.flow), over100: rows.filter((r) => r.total > 100).map((r) => r.flow), rows };
    }
    writeFileSync(join(OUT, 'preview-cost.json'), JSON.stringify(out, null, 1));
  }, 600_000);
});
