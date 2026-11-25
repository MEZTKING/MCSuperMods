/**
 * B810 V4: does `@msm/schemas/mcfunction` on the newer target report each command and id change
 * that matters to a function's text, with line and column?
 *
 * node docs/reference/spikes/b810/scripts/v4-mcfunction.ts <older target folder> <older version>
 *   <newer target folder> <newer version> [<third folder> <third version>]
 * Each folder holds vendor/mcmeta/{commands,blocks,registries}.json and
 * vendor/vanilla-mcdoc/symbols.json. Prints one JSON report.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const mcf = await import('../../../../../packages/schemas/src/mcfunction/index.ts');

const args = process.argv.slice(2);
const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, 'vendor', f), 'utf8'));

/** Lines a 26.3 project could hold that 26.4's changes touch, and controls that must stay clean. */
const PROBES: { id: string; line: string; why: string }[] = [
  { id: 'effect-tag', line: 'effect give @s #minecraft:harmful', why: 'effect accepts tags on 26.4 (relaxed): an error before, none after' },
  { id: 'test-rotation', line: 'test run minecraft:always_pass 1 false 5', why: 'rotationSteps limited to 0..3 on 26.4 (tightened)' },
  { id: 'particle-removed', line: 'particle minecraft:item_snowball ~ ~ ~', why: 'particle type item_snowball removed' },
  { id: 'particle-added', line: 'particle minecraft:freezing ~ ~ ~', why: 'particle type freezing added' },
  { id: 'tag-removed', line: 'kill @e[type=#minecraft:freeze_immune_entity_types]', why: 'entity type tag removed (renamed immune_to_freezing)' },
  { id: 'tag-renamed', line: 'kill @e[type=#minecraft:immune_to_freezing]', why: 'its new name' },
  { id: 'sound-removed', line: 'playsound minecraft:intentionally_empty master @a', why: 'sound event removed' },
  { id: 'fluid-state', line: 'execute if block ~ ~ ~ minecraft:water[level=0] run say hi', why: 'control: block states unchanged for water' },
  { id: 'jukebox-state', line: 'setblock ~ ~ ~ minecraft:jukebox[playlist_mode=true]', why: 'block state property added on 26.4' },
  { id: 'feature-place', line: 'place feature minecraft:large_dripstone ~ ~ ~', why: 'the configured feature still exists on both (control)' },
  { id: 'block-added', line: 'setblock ~ ~ ~ minecraft:icicle', why: 'block added on 26.4' },
  { id: 'item-nbt-control', line: 'give @s minecraft:stone 1', why: 'control' },
  { id: 'summon-new-nbt', line: 'summon minecraft:zombie ~ ~ ~ {FreezingTime:20}', why: 'NBT field added on 26.4 (mcdoc)' },
  { id: 'time-huge', line: 'time add 3000000000t', why: '26.4-snapshot-7: time arguments over 2147483647 fail' },
  { id: 'local-2d', line: 'forceload add ^1 ^2', why: '26.4-snapshot-9: local 2D coordinates accepted' },
];

const out: Record<string, unknown> = {};
for (let i = 0; i + 1 < args.length; i += 2) {
  const dir = args[i] as string;
  const version = args[i + 1] as string;
  const t0 = performance.now();
  let service: Awaited<ReturnType<typeof mcf.createMcfunctionService>>;
  try {
    service = await mcf.createMcfunctionService(
      { commands: read(dir, 'mcmeta/commands.json'), blocks: read(dir, 'mcmeta/blocks.json'), registries: read(dir, 'mcmeta/registries.json') },
      { mcVersion: version, mcdocSymbols: read(dir, 'vanilla-mcdoc/symbols.json') },
    );
  } catch (e) {
    out[version] = { initError: String(e).slice(0, 300) };
    continue;
  }
  const initMs = Math.round(performance.now() - t0);
  const results: Record<string, unknown> = {};
  for (const p of PROBES) {
    let problems: Awaited<ReturnType<typeof service.check>> = [];
    try {
      problems = await service.check(p.line);
    } catch (e) {
      results[p.id] = { throws: String(e).slice(0, 200) };
      continue;
    }
    const errors = problems.filter((x) => x.severity === 'error');
    results[p.id] = {
      errors: errors.length,
      warnings: problems.length - errors.length,
      first: problems[0] ? { severity: problems[0].severity, line: problems[0].line, start: problems[0].start, message: problems[0].message.slice(0, 140) } : null,
    };
  }
  out[version] = { initMs, results };
}
console.log(JSON.stringify({ probes: PROBES, out }, null, 1));
