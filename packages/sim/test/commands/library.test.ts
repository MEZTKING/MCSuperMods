/**
 * The library's and the fixtures' functions in Try it (B606): how many of their command lines
 * run (B600 counted 74 lines and expected 66 with B606's list; the 8 left are `spreadplayers`),
 * and fixture functions run on both built-in targets with the world they should leave.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { LocalWorldSource, lineSupport } from '../../src/index.js';
import { builtInTargets, lowerFixture, lowerProjectAt, REPO_ROOT } from '../lower-fixture.js';

const targets = await builtInTargets();

/** Every command line of the functions in `examples/` and `fixtures/`, as B600's spike read them. */
function libraryLines(): { readonly file: string; readonly line: string }[] {
  const out: { file: string; line: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === 'node_modules') continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.json')) {
        try {
          const json = JSON.parse(readFileSync(path, 'utf8')) as {
            kind?: string;
            data?: { lines?: unknown };
          };
          if (json.kind !== 'minecraft:function' || !Array.isArray(json.data?.lines)) continue;
          for (const raw of json.data.lines) {
            const line = String(raw).trim();
            if (line !== '' && !line.startsWith('#')) {
              out.push({ file: relative(REPO_ROOT, path), line });
            }
          }
        } catch {
          // Not a project file.
        }
      }
    }
  };
  for (const root of ['examples', 'fixtures']) walk(join(REPO_ROOT, root));
  return out;
}

function source(files: ReadonlyMap<string, string | Uint8Array>, target: Target): LocalWorldSource {
  return new LocalWorldSource({ files, target, seed: 5, logLimit: 10_000 });
}

describe("the library's function lines", () => {
  it('runs at least the share B600 expected and names the rest', () => {
    const lines = libraryLines();
    const runs = lines.filter(({ line }) => lineSupport(line).runs);
    const not = lines.filter(({ line }) => !lineSupport(line).runs);
    // B600 counted 74 lines with four of the built-in templates' (66 run, 89 %); the mirror and
    // the fixtures alone hold 70. Every line runs except the 8 that need /spreadplayers.
    expect(lines.length).toBeGreaterThanOrEqual(70);
    expect(not.length).toBe(lines.filter(({ line }) => line.includes('spreadplayers')).length);
    for (const { line } of not) expect(lineSupport(line).why).toBe('/spreadplayers');
    console.info(
      `B606: ${runs.length} of ${lines.length} function lines of the library and fixtures run in Try it (${Math.round((runs.length / lines.length) * 100)} %).`,
    );
  });
});

describe.each(targets.map((target) => [target.id, target] as const))(
  'fixtures on %s',
  (_id, target) => {
    it('runs sample-datapack: the load tag, then greet', async () => {
      const { files } = await lowerFixture('sample-datapack', target);
      const area = source(files, target);
      area.tick();
      const said = () =>
        area.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text);
      expect(said()).toContain(
        '[Server] MCSuperMods sample data pack loaded. Run /function msm_sample_data:greet',
      );
      const greet = area.chat('/function msm_sample_data:greet');
      expect(greet.result).toBe('ran');
      expect(greet.answer).toContain('[Player] Hello from the MCSuperMods sample data pack!');
      expect(said()).toContain(
        'Craft eight emeralds around a block of redstone to make a Ruby Block.',
      );
      expect(area.inventory.count('minecraft:emerald')).toBe(8);
      expect(area.inventory.count('minecraft:redstone_block')).toBe(1);
    });

    it('runs the function starter: the load and tick tags and greet', async () => {
      const { files } = await lowerProjectAt(
        join(REPO_ROOT, 'examples', 'starters', 'function_starter'),
        target,
      );
      const area = source(files, target);
      area.tick();
      const state = area.functions.state;
      expect(state.objectives.get('jumps')?.displayName).toBe('Jumps');
      expect(state.display.get('sidebar')).toBe('jumps');
      // The tick tag: standing on a gold block gives Speed II each tick.
      area.chat('/setblock 24 0 24 minecraft:gold_block');
      area.chat('/tp 24 1 24');
      const chips: string[] = [];
      area.subscribe((event) => {
        if (event.type === 'effect' && event.effect.kind === 'chip') chips.push(event.effect.id);
      });
      area.tick();
      area.tick();
      expect(
        chips.filter((chip) => chip === 'Speed II for 1 second').length,
      ).toBeGreaterThanOrEqual(2);
      const greet = area.runFunction('msm_starter:greet');
      expect(greet.answer).toContain('[Player] Hello!');
      expect(greet.answer).toContain('You have jumped  times.');
      area.chat('/scoreboard players set @s jumps 120');
      expect(area.runFunction('msm_starter:greet').answer).toContain(
        '[Player] I have jumped at least 100 times!',
      );
    });

    it('runs the all-kinds example: heal_if_low and check_sky', async () => {
      const { files } = await lowerProjectAt(join(REPO_ROOT, 'examples', 'all-kinds'), target);
      const area = source(files, target);
      area.tick();
      expect(area.runFunction('msm_examples:heal_if_low').answer).toContain('You look fine.');
      expect(area.runFunction('msm_examples:check_sky').answer).toContain('[Player] Calm skies.');
      area.chat('/time set 18000');
      expect(area.runFunction('msm_examples:check_sky').answer).toContain('[Player] Spooky skies!');
    });
  },
);
