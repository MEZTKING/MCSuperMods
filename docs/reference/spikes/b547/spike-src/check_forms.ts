// B547 spike: every command form and generated function line, checked by MSM's offline Spyglass per target.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const WT = '<scratchpad>/wt-B547';
const B = '<scratchpad>/b547';
const { createMcfunctionService } = await import(`${WT}/packages/schemas/src/mcfunction/index.ts`);
const read = async (f: string) => JSON.parse(await readFile(f, 'utf8'));
const out: Record<string, unknown> = {};
for (const [folder, v] of [['mc-26.3', '26.3'], ['mc-26.4', '26.4']]) {
  const vend = `${WT}/packages/targets/${folder}/vendor`;
  const version = (await read(`${vend}/mcmeta/version.json`)).id;
  const service = await createMcfunctionService(
    { commands: await read(`${vend}/mcmeta/commands.json`), blocks: await read(`${vend}/mcmeta/blocks.json`), registries: await read(`${vend}/mcmeta/registries.json`) },
    { mcVersion: version, mcdocSymbols: await read(`${vend}/vanilla-mcdoc/symbols.json`) },
  );
  const fnDir = `${B}/packs/${v}/main/data/b547/function`;
  const files: string[] = [];
  const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true })) { if (e.isDirectory()) await walk(join(d, e.name)); else files.push(join(d, e.name)); } };
  await walk(fnDir);
  const projectIds = {
    function: files.map((f) => 'b547:' + f.slice(fnDir.length + 1).replace(/\.mcfunction$/, '')),
    loot_table: ['b547:can_break_pick', 'b547:can_place_list'],
    predicate: Array.from({ length: 64 }, (_, i) => `b547:area/a${i}`),
    objective: ['b547.c', 'b547.ob', 'b547.joins', 'b547.spawn', 'b547.heard', 'b547.score', 'b547.kills', 'b547.mined', 'b547.hp'],
  };
  const res: Record<string, unknown> = {};
  for (const f of files.sort()) {
    const text = await readFile(f, 'utf8');
    if (text.includes('area/a1') && f.endsWith('tick_pred.mcfunction')) { /* long but checked */ }
    const problems = await service.check(text, { projectIds });
    const errs = problems.filter((p: { severity: string }) => p.severity === 'error').map((p: { line: number; message: string }) => `${p.line}: ${p.message}`);
    if (errs.length) res[f.slice(fnDir.length + 1)] = errs;
  }
  out[v] = { checkedFiles: files.length, errors: res };
}
await writeFile(`${B}/results/spyglass-forms.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
