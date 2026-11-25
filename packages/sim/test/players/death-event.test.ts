/**
 * Deaths and scripts (B728, B729's note): your death in Try it fires the scripts' `entity.death`
 * (Rules' "A player dies") with the killer, a practice player standing in as a player that is
 * gone; a practice player's death is said, since scripts in Try it know only you as a player.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import { inProcessRunner, LocalWorldSource } from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';
import { compileModule, compileScripts, readApi, scriptFiles } from '../script/helpers.js';

let target: Target;
beforeAll(async () => {
  target = (await builtInTargets())[0] as Target;
});

function area() {
  const files = scriptFiles({
    deaths: `import { msm } from "msm:runtime";
msm.events.on("entity.death", (e) => {
  if (!e.entity.isPlayer) return;
  msm.log.info("died: " + e.entity.name + ", killer: " + (e.killer === undefined ? "none" : e.killer.name));
});`,
  });
  const source = new LocalWorldSource({
    files,
    target,
    seed: 1,
    logLimit: 100_000,
    scripts: { runner: inProcessRunner(compileModule), api: readApi() },
  });
  const compiled = compileScripts(files);
  source.loadScripts(compiled.scripts, compiled.problems);
  source.tick();
  const said = (): string[] => source.trace.map((entry) => entry.text);
  return { source, said };
}

describe('deaths and scripts', () => {
  it('your death by a command fires entity.death with no killer', () => {
    const { source, said } = area();
    source.chat('/kill @s');
    expect(said().some((text) => text.includes('died: Player, killer: none'))).toBe(true);
  });

  it('a knock-out of you by a practice player names them as the killer', () => {
    const { source, said } = area();
    source.practice.add('Alex');
    source.practice.act({ do: 'knock_out', who: 'Player', by: 'Alex' });
    expect(said().some((text) => text.includes('died: Player, killer: Alex'))).toBe(true);
  });

  it('a practice player’s death is said, not given to the scripts', () => {
    const { source, said } = area();
    source.practice.add('Alex');
    source.chat('/kill Alex');
    expect(said().some((text) => text.includes('died: Alex'))).toBe(false);
    expect(
      source.lines.some(
        (line) => line.onlyInMinecraft === true && line.text.includes("practice player's death"),
      ),
    ).toBe(true);
  });
});
