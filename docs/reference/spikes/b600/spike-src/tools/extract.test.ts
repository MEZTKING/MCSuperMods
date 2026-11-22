// B600 spike (throwaway, deleted before the report), 2S4: extraction time and size with batch 2's data folders.
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { extractPreviewAssets } from '../../../interop/src/minecraft-install/extract';
import { targetFacts } from '../../../targets/all/src/index';

const BATCH2 = ['advancement', 'loot_table', 'tags/item', 'tags/entity_type', 'tags/fluid', 'tags/game_event', 'tags/damage_type', 'tags/enchantment', 'tags/painting_variant', 'tags/banner_pattern', 'tags/dialog', 'tags/instrument', 'tags/point_of_interest_type', 'tags/potion', 'tags/timeline', 'enchantment', 'enchantment_provider', 'damage_type', 'chat_type', 'dialog', 'predicate', 'trial_spawner', 'block_transformer', 'context_int_provider', 'context_float_provider'];
it('times the extraction', () => {
  const out: Record<string, unknown> = { batch2Folders: BATCH2 };
  for (const [id, mc] of [['mc-26.3', '26.3'], ['mc-26.4', '26.4-snapshot-7']] as const) {
    const jar = readFileSync(`/root/.gradle/caches/fabric-loom/${mc}/minecraft-client.jar`);
    // biome-ignore lint/suspicious/noExplicitAny: throwaway
    const terrain = (targetFacts(id) as any).worldgen.terrainPreview.dataFolders as string[];
    const res: Record<string, unknown> = {};
    for (const [label, folders] of [['today', terrain], ['withBatch2', [...terrain, ...BATCH2]]] as const) {
      const times: number[] = [];
      let files = 0, bytes = 0, b2files = 0, b2bytes = 0;
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const ex = extractPreviewAssets(jar, { dataFolders: folders });
        times.push(performance.now() - t0);
        files = ex.length;
        bytes = ex.reduce((a, f) => a + f.data.length, 0);
        const b2 = ex.filter((f) => BATCH2.some((d) => f.path.startsWith(`data/minecraft/${d}/`)));
        b2files = b2.length;
        b2bytes = b2.reduce((a, f) => a + f.data.length, 0);
      }
      times.sort((a, b) => a - b);
      res[label] = { files, bytes, batch2Files: b2files, batch2Bytes: b2bytes, medianMs: Math.round(times[2] as number), worstMs: Math.round(times[4] as number) };
    }
    const ex = extractPreviewAssets(jar, { patterns: [], dataFolders: BATCH2 });
    const dec = new TextDecoder();
    for (const d of ['advancement', 'loot_table', 'tags/item', 'enchantment']) {
      const fs = ex.filter((f) => f.path.startsWith(`data/minecraft/${d}/`));
      const t0 = performance.now();
      for (const f of fs) JSON.parse(dec.decode(f.data));
      res[`parse.${d}`] = { files: fs.length, ms: Math.round((performance.now() - t0) * 10) / 10 };
    }
    out[id] = res;
  }
  writeFileSync(process.env.B600_OUT as string, JSON.stringify(out, null, 1));
}, 300_000);
