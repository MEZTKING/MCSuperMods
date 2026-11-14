/**
 * Behaviour of `compileRuleBook` (ADR 0082 D3, D4, D6; B365): plain rules compile to actions
 * only, a condition turns its subject and trigger into a `run_script` bridge, script-only
 * triggers use `msm.events.on`, hand-made events run first, trigger options merge (R16), patches
 * never touch the same path twice, and hand-edited books get `rules.*` problems.
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { compileRuleBook, RULES_COMPILE_CODES, ruleEventId, ruleHandlerId } from '../src/compile';
import { applyPatches, blockingProblems, book, element, indexesFor, PROJECT } from './support';

const target = (builtInTargets[0]?.target ?? {}) as TargetFacts;

const rule = (
  key: string,
  when: JsonObject,
  steps: Json[],
  extra: JsonObject = {},
): JsonObject => ({
  do: steps,
  key,
  when,
  ...extra,
});

const CHIME = { sound: 'minecraft:block.note_block.chime', step: 'play_sound' };
const GIVE = { count: 2, item: 'demo:ruby', step: 'give_item' };
const SNEAKING = { conditions: [{ condition: 'player_sneaking' }], match: 'all' };

const compile = (rules: Json[], counters: Json[] = [], elements = PROJECT) =>
  compileRuleBook(book(rules, counters), elements, target);

const patched = (rules: Json[]) => {
  const result = compile(rules);
  return { result, elements: applyPatches(PROJECT, result.patches) };
};

const dataOf = (elements: readonly { id: string; data: Json }[], id: string): JsonObject =>
  (elements.find((entry) => entry.id === id)?.data ?? {}) as JsonObject;

describe('compileRuleBook', () => {
  it('compiles a plain rule to actions only, in rule order, with no script', () => {
    const { result, elements } = patched([
      rule('first', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE, CHIME]),
      rule('second', { subject: 'demo:plain_block', trigger: 'block_used' }, [
        { block: 'minecraft:gold_block', step: 'place_block', where: 'above_here' },
      ]),
    ]);
    expect(result.problems).toEqual([]);
    expect(result.script).toBeNull();
    const data = dataOf(elements, 'demo:plain_block');
    expect(data.components).toEqual({
      'msm:on_interact': { event: 'demo:plain_block_rules_block_used' },
    });
    expect(data.events).toEqual({
      'demo:plain_block_rules_block_used': {
        actions: [
          { count: 2, item: 'demo:ruby', type: 'give_item' },
          { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
          { offset: [0, 1, 0], state: 'minecraft:gold_block', type: 'set_block_state' },
        ],
      },
    });
  });

  it('turns a subject and trigger into a run_script bridge when one rule has a condition', () => {
    const { result, elements } = patched([
      rule('plain', { subject: 'demo:plain_block', trigger: 'block_used' }, [CHIME]),
      rule('logic', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE], {
        only_if: SNEAKING,
      }),
    ]);
    expect(result.problems).toEqual([]);
    const handler = ruleHandlerId('demo:rules', 'demo:plain_block', 'block_used');
    expect(handler).toBe('demo:rules/rules/plain_block/block_used');
    expect(dataOf(elements, 'demo:plain_block').events).toEqual({
      'demo:plain_block_rules_block_used': { actions: [{ handler, type: 'run_script' }] },
    });
    const script = (result.script ?? []).join('\n');
    expect(script).toContain(`msm.actions.define("${handler}"`);
    expect(script).toContain('rule("plain", () => { // rule:plain');
    expect(script).toContain('rule("logic", () => { // rule:logic');
    expect(script.indexOf('rule("plain"')).toBeLessThan(script.indexOf('rule("logic"'));
  });

  it('writes msm.events.on for a script-only trigger and patches nothing', () => {
    const result = compile([
      rule('welcome', { trigger: 'player_joined' }, [{ step: 'show_message', text: ['Hi'] }]),
    ]);
    expect(result.patches).toEqual([]);
    expect((result.script ?? []).join('\n')).toContain('msm.events.on("player.join", (e) => {');
  });

  it('filters vanilla subjects of any_ triggers by id', () => {
    const script = (
      compile([rule('stone', { subject: 'minecraft:stone', trigger: 'any_block_broken' }, [GIVE])])
        .script ?? []
    ).join('\n');
    expect(script).toContain('if (e.block.id !== "minecraft:stone") return;');
  });

  it('runs the hand-made event first through trigger_event', () => {
    const { result, elements } = patched([
      rule('gift', { subject: 'demo:ruby_block', trigger: 'block_used' }, [GIVE]),
    ]);
    expect(result.problems).toEqual([]);
    const data = dataOf(elements, 'demo:ruby_block');
    const events = data.events as JsonObject;
    expect(events['demo:ruby_block_use']).toBeDefined();
    expect(events['demo:ruby_block_rules_block_used']).toEqual({
      actions: [
        { event: 'demo:ruby_block_use', type: 'trigger_event' },
        { count: 2, item: 'demo:ruby', type: 'give_item' },
      ],
    });
    expect((data.components as JsonObject)['msm:on_interact']).toEqual({
      event: 'demo:ruby_block_rules_block_used',
    });
    // The subject had `events` and `components`, so each entry is its own patch.
    expect(result.patches.map((patch) => patch.path)).toEqual([
      ['events', 'demo:ruby_block_rules_block_used'],
      ['components', 'msm:on_interact'],
    ]);
  });

  it('takes trigger options from the subject first, else from the first rule (R16)', () => {
    const own = element('msm:item', 'demo:staff', {
      components: { 'msm:on_use': { cooldown_ticks: 5, event: 'demo:staff_use' } },
      events: { 'demo:staff_use': { actions: [] } },
      format: 1,
    });
    const result = compileRuleBook(
      book([
        rule(
          'a',
          { options: { cooldown_seconds: 3 }, subject: 'demo:staff', trigger: 'item_used' },
          [GIVE],
        ),
        rule(
          'b',
          { options: { cooldown_seconds: 3 }, subject: 'demo:wand', trigger: 'item_used' },
          [GIVE],
        ),
        rule(
          'c',
          { options: { cooldown_seconds: 9 }, subject: 'demo:wand', trigger: 'item_used' },
          [CHIME],
        ),
      ]),
      [...PROJECT, own],
      target,
    );
    const elements = applyPatches([...PROJECT, own], result.patches);
    expect((dataOf(elements, 'demo:staff').components as JsonObject)['msm:on_use']).toEqual({
      cooldown_ticks: 5,
      event: 'demo:staff_rules_item_used',
    });
    expect((dataOf(elements, 'demo:wand').components as JsonObject)['msm:on_use']).toEqual({
      cooldown_ticks: 60,
      event: 'demo:wand_rules_item_used',
    });
  });

  it('merges two triggers of one component into one patch', () => {
    const { result, elements } = patched([
      rule('on', { subject: 'demo:plain_block', trigger: 'block_powered' }, [CHIME]),
      rule('off', { subject: 'demo:plain_block', trigger: 'block_unpowered' }, [CHIME]),
    ]);
    const paths = result.patches.map((patch) => JSON.stringify(patch.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect((dataOf(elements, 'demo:plain_block').components as JsonObject)['msm:redstone']).toEqual(
      {
        on_powered: ruleEventId('demo:plain_block', 'block_powered'),
        on_unpowered: ruleEventId('demo:plain_block', 'block_unpowered'),
      },
    );
  });

  it('sets the event objects of a throwable and the on_travel field of a portal', () => {
    const { elements } = patched([
      rule('hit', { subject: 'demo:dart', trigger: 'thrown_hit_mob' }, [CHIME]),
      rule('travel', { subject: 'demo:gate', trigger: 'portal_travelled' }, [CHIME]),
    ]);
    expect((dataOf(elements, 'demo:dart').components as JsonObject)['msm:throwable']).toEqual({
      on_hit_entity: { event: 'demo:dart_rules_thrown_hit_mob' },
      speed: 2,
    });
    expect(dataOf(elements, 'demo:gate').on_travel).toBe('demo:gate_rules_portal_travelled');
  });

  it('leaves disabled rules out', () => {
    const result = compile([
      rule('off', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE], {
        enabled: false,
      }),
    ]);
    expect(result).toEqual({ patches: [], problems: [], script: null });
  });

  it('never changes the elements it is given', () => {
    const before = JSON.stringify(PROJECT);
    compile([rule('gift', { subject: 'demo:ruby_block', trigger: 'block_used' }, [GIVE])]);
    expect(JSON.stringify(PROJECT)).toBe(before);
  });

  it('checks generated subjects against the element schemas', async () => {
    const bundle = builtInTargets[0];
    if (bundle === undefined) return;
    const indexes = await indexesFor(bundle);
    // A broken event is caught, so the golden test's schema check is real.
    expect(
      blockingProblems(indexes, 'msm:block', {
        events: { 'demo:x': { actions: [{ type: 'not_an_action' }] } },
        format: 1,
      }).length,
    ).toBeGreaterThan(0);
  });

  describe('problems', () => {
    const codes = (rules: Json[], elements = PROJECT) =>
      compile(rules, [], elements).problems.map((problem) => [problem.code, problem.path]);

    it('reports unknown ids from a newer MSM with a pointer', () => {
      expect(
        codes([
          rule('a', { trigger: 'block_dreamed' }, []),
          rule('b', { subject: 'demo:plain_block', trigger: 'block_used' }, [{ step: 'dance' }]),
          rule('c', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE], {
            only_if: { conditions: [{ condition: 'is_lucky' }], match: 'all' },
          }),
          rule('d', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { step: 'show_message', text: [{ value: 'moon_phase' }] },
          ]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.unknownTrigger, '/rules/0/when/trigger'],
        [RULES_COMPILE_CODES.unknownStep, '/rules/1/do/0/step'],
        [RULES_COMPILE_CODES.unknownCondition, '/rules/2/only_if/conditions/0/condition'],
        [RULES_COMPILE_CODES.unknownValue, '/rules/3/do/0/text/0/value'],
      ]);
    });

    it('reports subjects that are not project elements of the right kind', () => {
      expect(
        codes([
          rule('a', { subject: 'demo:wand', trigger: 'block_used' }, [CHIME]),
          rule('b', { subject: 'minecraft:stone', trigger: 'block_used' }, [CHIME]),
          rule('c', { trigger: 'mob_hurt' }, [CHIME]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.unknownSubject, '/rules/0/when/subject'],
        [RULES_COMPILE_CODES.unknownSubject, '/rules/1/when/subject'],
        [RULES_COMPILE_CODES.unknownSubject, '/rules/2/when/subject'],
      ]);
    });

    it('reports triggers the subject cannot have', () => {
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'container_opened' }, [CHIME]),
          rule('b', { subject: 'demo:gate', trigger: 'block_used' }, [CHIME]),
          rule('c', { subject: 'demo:plain_block', trigger: 'portal_travelled' }, [CHIME]),
          rule('d', { subject: 'demo:wand', trigger: 'item_worn' }, [CHIME]),
          rule('e', { subject: 'demo:wand', trigger: 'thrown_hit_block' }, [CHIME]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.needsComponent, '/rules/0/when/subject'],
        [RULES_COMPILE_CODES.wrongTrigger, '/rules/1/when/trigger'],
        [RULES_COMPILE_CODES.wrongTrigger, '/rules/2/when/trigger'],
        [RULES_COMPILE_CODES.needsComponent, '/rules/3/when/subject'],
        [RULES_COMPILE_CODES.needsComponent, '/rules/4/when/subject'],
      ]);
    });

    it('reports actors and places the trigger lacks', () => {
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'block_random_tick' }, [GIVE]),
          rule('b', { trigger: 'world_every' }, [CHIME]),
          rule('c', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { animation: 'wave', step: 'play_animation' },
          ]),
          rule('d', { trigger: 'world_started' }, [
            { amount: 1, counter: 'n', scope: 'player', step: 'add_to_counter' },
          ]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.noSuchActor, '/rules/0/do/0/who'],
        [RULES_COMPILE_CODES.noSuchPlace, '/rules/1/do/0/where'],
        [RULES_COMPILE_CODES.noSuchActor, '/rules/2/do/0'],
        [RULES_COMPILE_CODES.noSuchActor, '/rules/3/do/0/scope'],
      ]);
    });

    it('lets "for each player" give a player to triggers without one', () => {
      const result = compile([
        rule('a', { trigger: 'world_every' }, [{ do: [GIVE], step: 'for_each_player' }]),
      ]);
      expect(result.problems).toEqual([]);
    });

    it('reports stopping a trigger that cannot be stopped', () => {
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { step: 'stop_normal_action' },
          ]),
        ]),
      ).toEqual([[RULES_COMPILE_CODES.cannotStop, '/rules/0/do/0']]);
    });

    it('reports nesting deeper than three levels and more than 50 steps', () => {
      const deep = {
        do: [{ do: [{ do: [CHIME], step: 'repeat', times: 2 }], step: 'repeat', times: 2 }],
        step: 'repeat',
        times: 2,
      };
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [deep]),
          rule('b', { subject: 'demo:plain_block', trigger: 'block_used' }, Array(51).fill(CHIME)),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.tooDeep, '/rules/0/do/0/do/0/do/0'],
        [RULES_COMPILE_CODES.tooManySteps, '/rules/1/do'],
      ]);
    });

    it('reports bad keys, which would otherwise reach the script', () => {
      expect(
        codes([rule('Bad key\n', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE])]),
      ).toEqual([[RULES_COMPILE_CODES.badKey, '/rules/0/key']]);
    });

    it('reports a generated event id that is already taken', () => {
      const taken = element('msm:block', 'demo:taken', {
        events: { 'demo:taken_rules_block_used': { actions: [] } },
        format: 1,
      });
      expect(
        codes(
          [rule('a', { subject: 'demo:taken', trigger: 'block_used' }, [CHIME])],
          [...PROJECT, taken],
        ),
      ).toEqual([[RULES_COMPILE_CODES.eventIdClash, '/rules/0/when/subject']]);
    });

    it('reports light_portal on a trigger that needs a script, and compiles the rest', () => {
      const result = compile([
        rule('light', { subject: 'demo:plain_block', trigger: 'block_used' }, [
          { portal: 'demo:gate', step: 'light_portal' },
        ]),
        rule('logic', { subject: 'demo:plain_block', trigger: 'block_used' }, [GIVE], {
          only_if: SNEAKING,
        }),
      ]);
      expect(result.problems.map((problem) => problem.code)).toEqual([
        RULES_COMPILE_CODES.needsPlain,
      ]);
      expect((result.script ?? []).join('\n')).not.toContain('rule("light"');
    });

    it('breaks a block with or without its drops (Script API 1.4)', () => {
      const result = compile([
        rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [
          { drop_items: true, step: 'remove_block' },
          { step: 'remove_block', where: 'above_here' },
        ]),
      ]);
      expect(result.problems).toEqual([]);
      const text = (result.script ?? []).join('\n');
      expect(text).toContain('world.breakBlock(blockPos(at)));');
      expect(text).toContain('world.breakBlock(blockPos(at), { drops: false }));');
      expect(text).not.toContain('minecraft:air');
    });

    it('removes mobs without loot and never players', () => {
      const result = compile([
        rule('a', { subject: 'demo:guard', trigger: 'mob_used' }, [{ step: 'remove_mob' }]),
      ]);
      const text = (result.script ?? []).join('\n');
      expect(text).toContain('if (target.asPlayer() === undefined) target.remove();');
      expect(text).not.toContain('kill()');
    });

    it('caps drops at 64, weather at 1000000 seconds and explosions at 0..10', () => {
      const result = compile([
        rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [
          { count: 500, item: 'minecraft:emerald', step: 'drop_item' },
          {
            count: { max: 200, min: 1, value: 'random' },
            item: 'minecraft:emerald',
            step: 'drop_item',
          },
          { seconds: 5000000, step: 'set_weather', weather: 'rain' },
          { seconds: 0, step: 'set_weather', weather: 'clear' },
          { seconds: { value: 'player_level' }, step: 'set_weather', weather: 'thunder' },
          { power: 50, step: 'explode' },
          { power: { value: 'player_level' }, step: 'explode' },
        ]),
      ]);
      expect(result.problems).toEqual([]);
      const text = (result.script ?? []).join('\n');
      expect(text).toContain('count: 64 }');
      expect(text).toContain('count: Math.min(64, ');
      expect(text).toContain('world.setWeather("rain", 1000000);');
      expect(text).toContain('world.setWeather("clear");');
      expect(text).toContain('world.setWeather("thunder", Math.min(1000000, Math.max(0.05, ');
      expect(text).toContain('world.explode(at, 10, ');
      expect(text).toContain('world.explode(at, Math.min(10, Math.max(0, ');
      // Block places are block centres.
      expect(text).toContain(
        'const here = e.block !== undefined ? e.block.pos.offset(0.5, 0.5, 0.5) : e.pos;',
      );
    });

    it('reports a book that needs a script on a target without a script runtime', () => {
      const { fabric: _fabric, ...withoutFabric } = target;
      const result = compileRuleBook(
        book([rule('a', { trigger: 'player_joined' }, [GIVE])]),
        PROJECT,
        withoutFabric as TargetFacts,
      );
      expect(result.script).toBeNull();
      expect(result.problems.map((problem) => problem.code)).toEqual([
        RULES_COMPILE_CODES.noScripts,
      ]);
    });
  });

  describe('script safety', () => {
    it('writes book text only inside string literals', () => {
      const script = (
        compile([
          rule('a', { trigger: 'player_joined' }, [
            { step: 'show_message', text: ['"); msm.players().forEach((p) => p.kill()); (" '] },
          ]),
        ]).script ?? []
      ).join('\n');
      expect(script).toContain(
        'target.sendMessage("\\"); msm.players().forEach((p) => p.kill()); (\\"\\u2028")',
      );
    });
  });
});
