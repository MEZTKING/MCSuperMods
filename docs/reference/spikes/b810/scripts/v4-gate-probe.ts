/**
 * B810 V4, a side finding: the mcfunction checker (Spyglass) gates mcdoc `since` attributes in
 * SNBT by its own release order, so on the snapshot target `26.4-snapshot-7` fields marked
 * `since="26.4"` are unknown, while MSM's schema index (compareGameVersions) admits them.
 *
 * node docs/reference/spikes/b810/scripts/v4-gate-probe.ts
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync } = await import('node:fs');
const mcf = await import('../../../../../packages/schemas/src/mcfunction/index.ts');
const dir = new URL('../../../../../packages/targets/mc-26.4/vendor/', import.meta.url);
const r = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
for (const v of ['26.4-snapshot-7', '26.4']) {
  const s = await mcf.createMcfunctionService(
    { commands: r('mcmeta/commands.json'), blocks: r('mcmeta/blocks.json'), registries: r('mcmeta/registries.json') },
    { mcVersion: v, mcdocSymbols: r('vanilla-mcdoc/symbols.json') },
  );
  for (const line of ['summon minecraft:zombie ~ ~ ~ {FreezingTime:20}', 'setblock ~ ~ ~ minecraft:jukebox{playlist_position:1}', 'summon minecraft:zombie ~ ~ ~ {DrownedConversionTime:20}']) {
    const p = await s.check(line);
    console.log(v, '|', line, '|', p.map((x) => `${x.severity} ${x.message.slice(0, 60)}`).join('; ') || 'clean');
  }
}
