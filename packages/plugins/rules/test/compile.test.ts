/**
 * Behaviour of `compileRuleBook` (ADR 0082 D3, D4, D6; B365): plain rules compile to actions
 * only, a condition turns its subject and trigger into a `run_script` bridge, script-only
 * triggers use `msm.events.on`, hand-made events run first, trigger options merge (R16), patches
 * never touch the same path twice, and hand-edited books get `rules.*` problems.
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  compileRuleBook,
  compileRuleBooks,
  RULES_COMPILE_CODES,
  ruleEventId,
  ruleHandlerId,
} from '../src/compile';
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

const asActions = (data: JsonObject, eventId: string): Json =>
  ((data.events as JsonObject | undefined)?.[eventId] as JsonObject | undefined)?.actions ?? null;

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

  describe('keys and vehicles (B424)', () => {
    const TANK = 'demo:tank';
    const DASH = 'demo:dash';
    /** The project with `data` merged into the tank and the dash key. */
    const withData = (data: JsonObject) =>
      PROJECT.map((entry) =>
        entry.id === TANK || entry.id === DASH
          ? { ...entry, data: { ...(entry.data as JsonObject), ...data } }
          : entry,
      );

    it('compiles plain key rules into the key bind, its own cooldown winning, clamped to a minute', () => {
      const { result, elements } = patched([
        rule('a', { options: { cooldown_seconds: 90 }, subject: DASH, trigger: 'key_pressed' }, [
          { hud: 'demo:mana', step: 'show_hud' },
          { power: 2, step: 'explode' },
        ]),
        rule('b', { options: { interval_seconds: 0.1 }, subject: DASH, trigger: 'key_held' }, [
          CHIME,
        ]),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.script).toBeNull();
      const data = dataOf(elements, DASH);
      expect(data['msm:on_press']).toBe(ruleEventId(DASH, 'key_pressed'));
      expect(data['msm:while_held']).toBe(ruleEventId(DASH, 'key_held'));
      expect(data.cooldown_ticks).toBe(1200);
      expect(data.hold_interval_ticks).toBe(2);
      expect(asActions(data, ruleEventId(DASH, 'key_pressed'))).toEqual([
        { hud: 'demo:mana', type: 'show_hud' },
        { breaks_blocks: true, power: 2, type: 'explode' },
      ]);
      const own = compile(
        [
          rule('a', { options: { cooldown_seconds: 5 }, subject: DASH, trigger: 'key_pressed' }, [
            CHIME,
          ]),
        ],
        [],
        withData({ cooldown_ticks: 7 }),
      );
      expect(own.patches.map((patch) => patch.path.join('/'))).toEqual(['events', 'msm:on_press']);
    });

    it('writes an explosion that keeps blocks as the action default, and one elsewhere as script', () => {
      const plain = compile([
        rule('a', { subject: TANK, trigger: 'vehicle_destroyed' }, [
          { break_blocks: false, power: 4, step: 'explode' },
        ]),
      ]);
      expect(plain.script).toBeNull();
      expect(plain.patches[0]?.value).toEqual({
        [ruleEventId(TANK, 'vehicle_destroyed')]: {
          actions: [{ breaks_blocks: false, power: 4, type: 'explode' }],
        },
      });
      const script = compile([
        rule('a', { subject: TANK, trigger: 'vehicle_destroyed' }, [
          { power: 4, step: 'explode', where: 'player' },
        ]),
      ]);
      expect(script.patches).toEqual([]);
      expect((script.script ?? []).join('\n')).toContain('msm.events.on("vehicle.destroyed"');
    });

    it('puts a plain book in the event and a scripted book in a listener after it', () => {
      const plainBook = book(
        [rule('a', { subject: TANK, trigger: 'vehicle_mounted' }, [CHIME])],
        [],
        'demo:a',
      );
      const scriptBook = book(
        [rule('b', { subject: TANK, trigger: 'vehicle_mounted' }, [GIVE], { only_if: SNEAKING })],
        [],
        'demo:b',
      );
      const projectWithOwn = withData({
        events: { 'demo:honk': { actions: [] } },
        on_mount: 'demo:honk',
      });
      const result = compileRuleBooks([plainBook, scriptBook], projectWithOwn, target);
      expect(result.problems).toEqual([]);
      const events = result.patches.find(
        (patch) => patch.path.join('/') === `events/${ruleEventId(TANK, 'vehicle_mounted')}`,
      );
      expect(events?.value).toEqual({
        actions: [
          { event: 'demo:honk', type: 'trigger_event' },
          { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
        ],
      });
      expect(result.scripts.has('demo:a' as never)).toBe(false);
      const text = (result.scripts.get('demo:b' as never) ?? []).join('\n');
      expect(text).toContain('msm.events.on("vehicle.mounted", (e) => {');
      expect(text).toContain('if (e.vehicle.type !== "demo:tank") return;');
      expect(text).not.toContain('run_script');
    });

    it('needs weapons for "fires", and one shared event of the weapons', () => {
      const none = compile(
        [rule('a', { subject: TANK, trigger: 'vehicle_fired' }, [CHIME])],
        [],
        withData({ weapons: [] }),
      );
      expect(none.problems.map((problem) => problem.code)).toEqual([
        RULES_COMPILE_CODES.needsComponent,
      ]);
      const split = compile(
        [rule('a', { subject: TANK, trigger: 'vehicle_fired' }, [CHIME])],
        [],
        withData({
          events: { 'demo:x': { actions: [] }, 'demo:y': { actions: [] } },
          weapons: [
            { id: 'cannon', on_fire: 'demo:x', projectile: 'minecraft:fire_charge' },
            { id: 'gun', on_fire: 'demo:y', projectile: 'minecraft:arrow' },
          ],
        }),
      );
      expect(split.problems.map((problem) => problem.code)).toEqual([
        RULES_COMPILE_CODES.eventIdClash,
      ]);
      const shared = compile(
        [rule('a', { subject: TANK, trigger: 'vehicle_fired' }, [CHIME])],
        [],
        withData({
          events: { 'demo:x': { actions: [] } },
          weapons: [
            { id: 'cannon', on_fire: 'demo:x', projectile: 'minecraft:fire_charge' },
            { id: 'gun', projectile: 'minecraft:arrow' },
          ],
        }),
      );
      expect(shared.problems).toEqual([]);
      const weapons = shared.patches.find((patch) => patch.path.join('/') === 'weapons');
      expect(((weapons?.value ?? []) as JsonObject[]).map((weapon) => weapon.on_fire)).toEqual([
        ruleEventId(TANK, 'vehicle_fired'),
        ruleEventId(TANK, 'vehicle_fired'),
      ]);
    });

    it('reads the trigger vehicle on vehicle triggers and the ridden one elsewhere', () => {
      const fuel = { step: 'show_message', text: [{ value: 'vehicle_fuel' }] };
      const onVehicle = (
        compile([rule('a', { subject: TANK, trigger: 'vehicle_mounted' }, [fuel])]).script ?? []
      ).join('\n');
      expect(onVehicle).toContain('vehicleFuel(vehicle)');
      const onFoot = (compile([rule('a', { trigger: 'player_joined' }, [fuel])]).script ?? []).join(
        '\n',
      );
      expect(onFoot).toContain('vehicleFuel(riddenBy(player))');
      const nobody = compile([
        rule('a', { trigger: 'world_every' }, [
          { seconds: 1, step: 'set_weather', weather: 'clear' },
          {
            amount: { value: 'vehicle_damage' },
            counter: 'hits',
            scope: 'world',
            step: 'set_counter',
          },
        ]),
      ]);
      expect(nobody.problems.map((problem) => problem.code)).toEqual([
        RULES_COMPILE_CODES.noSuchActor,
      ]);
    });
  });

  describe('placing, explosions, commands, riding and facing (B458)', () => {
    const codes = (rules: Json[]) => compile(rules).problems.map((problem) => problem.code);

    it("puts plain command rules into the command's own event", () => {
      const { result, elements } = patched([
        rule('greet', { subject: 'demo:hello', trigger: 'command_used' }, [GIVE]),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.script).toBeNull();
      const data = dataOf(elements, 'demo:hello');
      const eventId = ruleEventId('demo:hello', 'command_used');
      expect(data.event).toBe(eventId);
      expect(asActions(data, eventId)).toEqual([
        { count: 2, item: 'demo:ruby', type: 'give_item' },
      ]);
    });

    it("keeps the command's event for rules that are not plain (run_script)", () => {
      const { result, elements } = patched([
        rule('greet', { subject: 'demo:hello', trigger: 'command_used' }, [GIVE], {
          only_if: SNEAKING,
        }),
      ]);
      expect(result.problems).toEqual([]);
      const data = dataOf(elements, 'demo:hello');
      expect(asActions(data, ruleEventId('demo:hello', 'command_used'))).toEqual([
        { handler: ruleHandlerId('demo:rules', 'demo:hello', 'command_used'), type: 'run_script' },
      ]);
      expect(result.script?.join('\n')).toContain('msm.actions.define(');
    });

    it('sends every rule of a command that runs a function to the command event', () => {
      const result = compile([
        rule('warp', { subject: 'demo:warp', trigger: 'command_used' }, [GIVE]),
      ]);
      expect(result.problems).toEqual([]);
      expect(result.patches).toEqual([]);
      const script = result.script?.join('\n') ?? '';
      expect(script).toContain('msm.events.on("command", (e) => {');
      expect(script).toContain('if (e.id !== "demo:warp") return;');
    });

    it('reports stops and "caused by" on other triggers', () => {
      expect(
        codes([rule('a', { trigger: 'any_block_broken' }, [{ step: 'stop_placing' }])]),
      ).toEqual([RULES_COMPILE_CODES.notForTrigger]);
      expect(
        codes([rule('a', { trigger: 'any_block_placed' }, [{ step: 'keep_blocks_safe' }])]),
      ).toEqual([RULES_COMPILE_CODES.notForTrigger]);
      expect(
        codes([
          rule('a', { trigger: 'world_every' }, [{ step: 'stop_normal_action' }], {
            only_if: { conditions: [{ cause: 'block', condition: 'caused_by' }], match: 'all' },
          }),
        ]),
      ).toEqual([RULES_COMPILE_CODES.notForTrigger, RULES_COMPILE_CODES.cannotStop]);
      // "Stop the normal action" also stops an explosion and a placing.
      expect(
        codes([rule('a', { trigger: 'explosion' }, [{ step: 'stop_normal_action' }])]),
      ).toEqual([]);
    });

    it('keeps the way something faces out of numbers', () => {
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { amount: { value: 'facing' }, step: 'heal' },
          ]),
        ]),
      ).toEqual([RULES_COMPILE_CODES.notANumber]);
      expect(
        codes([
          rule('a', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { step: 'show_message', text: [{ of: 'mob', value: 'facing' }] },
          ]),
        ]),
      ).toEqual([RULES_COMPILE_CODES.noSuchActor]);
    });

    it('needs a place for the block here and one thing to ride', () => {
      expect(
        codes([
          rule('a', { trigger: 'world_every' }, [{ step: 'stop_normal_action' }], {
            only_if: { conditions: [{ condition: 'is_facing', direction: 'up' }], match: 'all' },
          }),
        ]).includes(RULES_COMPILE_CODES.noSuchPlace),
      ).toBe(true);
      expect(
        codes([
          rule('a', { subject: 'demo:guard', trigger: 'mob_used' }, [
            { mount: 'every_player', step: 'ride' },
          ]),
        ]),
      ).toContain(RULES_COMPILE_CODES.noSuchActor);
      expect(
        codes([
          rule('a', { trigger: 'explosion' }, [CHIME], {
            only_if: { conditions: [{ condition: 'is_riding', who: 'player' }], match: 'all' },
          }),
        ]),
      ).toEqual([RULES_COMPILE_CODES.noSuchActor]);
    });

    it('looks at riders every quarter second for getting on and off', () => {
      const script = (
        compile([rule('a', { trigger: 'player_dismounted' }, [{ step: 'dismount' }])]).script ?? []
      ).join('\n');
      expect(script).toContain('rideChange("player_dismounted", e.player, false)');
      expect(script).toContain('}, { interval: 5 });');
    });
  });

  // B534 (ADR 0111 D1, D3–D6): the command's arguments, the new events, game rules and stats.
  describe('vanilla parity 3, batch 2', () => {
    const GIFT = { subject: 'demo:gift', trigger: 'command_used' };
    const typed = (name: string, extra: JsonObject = {}): JsonObject => ({
      name,
      value: 'command_argument',
      ...extra,
    });
    const problems = (rules: Json[]) =>
      compile(rules).problems.map((problem) => [problem.code, problem.path]);

    it("reads only the command's own arguments, of the types Rules reads", () => {
      expect(
        problems([
          rule('a', GIFT, [{ step: 'show_message', text: [typed('nobody')] }]),
          rule('b', GIFT, [{ step: 'show_message', text: [typed('data')] }]),
          rule('c', { subject: 'demo:plain_block', trigger: 'block_used' }, [
            { step: 'show_message', text: [typed('friend')] },
          ]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.unknownValue, '/rules/0/do/0/text/0/name'],
        [RULES_COMPILE_CODES.unknownValue, '/rules/1/do/0/text/0/name'],
        [RULES_COMPILE_CODES.notForTrigger, '/rules/2/do/0/text/0'],
      ]);
    });

    it('keeps words and whole positions out of numbers', () => {
      expect(
        problems([
          rule('a', GIFT, [{ amount: typed('friend'), step: 'heal' }]),
          rule('b', GIFT, [{ amount: typed('spot'), step: 'heal' }]),
          rule('c', GIFT, [{ amount: typed('spot', { axis: 'x' }), step: 'heal' }]),
          rule('d', GIFT, [{ amount: typed('amount'), step: 'heal' }]),
        ]),
      ).toEqual([
        [RULES_COMPILE_CODES.notANumber, '/rules/0/do/0/amount'],
        [RULES_COMPILE_CODES.notANumber, '/rules/1/do/0/amount'],
      ]);
    });

    it('reads the arguments from the event context of either route', () => {
      const script = (
        compile([
          rule('a', GIFT, [{ amount: typed('amount'), step: 'heal' }]),
          rule('b', { subject: 'demo:roll', trigger: 'command_used' }, [
            { amount: typed('sides'), step: 'heal' },
          ]),
        ]).script ?? []
      ).join('\n');
      expect(script).toContain('msm.actions.define("demo:rules/rules/gift/command_used"');
      expect(script).toContain('msm.events.on("command"');
      expect(script.match(/const args = commandArgs\(e\);/g)).toHaveLength(2);
      expect(script).toContain('argNumber(args, "sides", 0)');
    });

    it('declares the arguments only where a rule reads them', () => {
      const script = (compile([rule('a', GIFT, [{ amount: 1, step: 'heal' }])]).script ?? []).join(
        '\n',
      );
      expect(script).not.toContain('commandArgs');
    });

    it('matches true or false and numbers to the kind of a project game rule', () => {
      const set = (game_rule: string, value: Json) =>
        rule('r', { trigger: 'player_joined' }, [{ game_rule, step: 'set_game_rule', value }]);
      expect(problems([set('demo:mana_regen', 3)])).toEqual([
        [RULES_COMPILE_CODES.notANumber, '/rules/0/do/0/value'],
      ]);
      expect(problems([set('demo:max_mana', false)])).toEqual([
        [RULES_COMPILE_CODES.notANumber, '/rules/0/do/0/value'],
      ]);
      expect(problems([set('demo:mana_regen', false), set('minecraft:mob_griefing', 2)])).toEqual(
        [],
      );
      expect(
        problems([
          rule('r', { trigger: 'player_joined' }, [CHIME], {
            only_if: {
              conditions: [
                {
                  compare: 'at_least',
                  condition: 'game_rule',
                  game_rule: 'minecraft:keep_inventory',
                  value: true,
                },
              ],
              match: 'all',
            },
          }),
        ]),
      ).toEqual([[RULES_COMPILE_CODES.notANumber, '/rules/0/only_if/conditions/0/compare']]);
    });

    it('compares a true or false game rule exactly', () => {
      const script = (
        compile([
          rule('r', { trigger: 'player_woke' }, [GIVE], {
            only_if: {
              conditions: [{ condition: 'game_rule', game_rule: 'demo:mana_regen', value: true }],
              match: 'all',
            },
          }),
        ]).script ?? []
      ).join('\n');
      expect(script).toContain('msm.events.on("player.woke"');
      expect(script).toContain('world.gameRule("demo:mana_regen") === true');
    });

    it('listens to the Script API 1.7 events, filtered by the subject when there is one', () => {
      const script = (
        compile([
          rule('a', { subject: 'minecraft:bread', trigger: 'player_ate' }, [GIVE]),
          rule('b', { trigger: 'player_picked_up' }, [GIVE]),
          rule('c', { subject: 'minecraft:story/root', trigger: 'player_advancement' }, [
            { dialog: 'minecraft:server_links', step: 'open_dialog', who: 'every_player' },
          ]),
          rule('d', { trigger: 'player_slept' }, [
            { amount: 2, stat: 'minecraft:jump', step: 'add_to_stat' },
          ]),
        ]).script ?? []
      ).join('\n');
      expect(script).toContain('if (e.item.id !== "minecraft:bread") return;');
      expect(script).toContain('msm.events.on("item.picked_up"');
      expect(script).toContain('if (e.advancement !== "minecraft:story/root") return;');
      expect(script).toContain('target.openDialog("minecraft:server_links")');
      expect(script).toContain('target.addStat("minecraft:jump", 2)');
      expect(script).toContain('msm.events.on("player.slept"');
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
