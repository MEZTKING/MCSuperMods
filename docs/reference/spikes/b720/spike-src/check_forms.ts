// B720 spike: every game-logic line of the spike pack, checked by MSM's offline Spyglass per target (errors and
// warnings). Lines starting with `b720 ` are the spike mod's instrumentation and are dropped first. Read-only use of
// the repository's @msm/schemas source and vendored target data; writes only into the spike's results folder.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const REPO = process.argv[2] ?? "<repo>";
const B = process.argv[3];
const { createMcfunctionService } = await import(`${REPO}/packages/schemas/src/mcfunction/index.ts`);
const read = async (f: string) => JSON.parse(await readFile(f, 'utf8'));
const out: Record<string, unknown> = {};
for (const [folder, v] of [['mc-26.3', '26.3'], ['mc-26.4', '26.4']]) {
  const vend = `${REPO}/packages/targets/${folder}/vendor`;
  const version = (await read(`${vend}/mcmeta/version.json`)).id;
  const service = await createMcfunctionService(
    { commands: await read(`${vend}/mcmeta/commands.json`), blocks: await read(`${vend}/mcmeta/blocks.json`), registries: await read(`${vend}/mcmeta/registries.json`) },
    { mcVersion: version, mcdocSymbols: await read(`${vend}/vanilla-mcdoc/symbols.json`) },
  );
  const root = `${B}/packs/${v}/b720/data/b720`;
  const fnDir = `${root}/function`;
  const files: string[] = [];
  const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true })) { if (e.isDirectory()) await walk(join(d, e.name)); else files.push(join(d, e.name)); } };
  await walk(fnDir);
  const projectIds = {
    function: files.map((f) => 'b720:' + f.slice(fnDir.length + 1).replace(/\.mcfunction$/, '')),
    loot_table: ['b720:head_of_this'],
    predicate: ['b720:below_floor'],
    item_modifier: ['b720:track'],
    advancement: ['b720:k3/killed_player', 'b720:k3/killed_by_player', 'b720:k4/ate_heart', 'b720:k4/ate_revive', 'b720:k8/dragon'],
    recipe: ['b720:heart', 'b720:revive'],
    structure: ['b720:floor32'],
    objective: ['b720.deaths', 'b720.kills', 'b720.total', 'b720.health', 'b720.trig', 'b720.kbred', 'b720.tkblue', 'b720.sdeaths', 'b720.spk',
      'b720.tsd', 'b720.leave', 'b720.hearts', 'b720.t', 'b720.on', 'b720.withdraw', 'b720.shop', 'b720.until', 'b720.gt', 'b720.id',
      'b720.round', 'b720.seen_d', 'b720.seen_k', 'b720.ls_d', 'b720.ls_k'],
    team: ['red', 'blue', 'green', 'yellow', 'hide'],
  };
  const res: Record<string, string[]> = {};
  let lines = 0;
  for (const f of files.sort()) {
    const text = (await readFile(f, 'utf8')).split('\n').map((l) => (l.startsWith('b720 ') || l.includes(' run b720 ') ? '' : l)).join('\n');
    lines += text.split('\n').filter((l) => l.trim()).length;
    let problems: { severity: string; line: number; message: string }[];
    try {
      problems = await service.check(text, { projectIds });
    } catch (e) {
      res[f.slice(fnDir.length + 1)] = [`THROWS: ${String(e).slice(0, 200)}`];
      continue;
    }
    const bad = problems.filter((p) => p.severity !== 'info').map((p) => `${p.severity} ${p.line + 1}: ${p.message} | ${text.split('\n')[p.line]?.slice(0, 160)}`);
    if (bad.length) res[f.slice(fnDir.length + 1)] = bad;
  }
  out[v] = { checkedFiles: files.length, checkedLines: lines, problems: res };
}
await writeFile(`${B}/results/spyglass-forms.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 12000));
