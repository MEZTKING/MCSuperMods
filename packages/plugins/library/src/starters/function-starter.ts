/**
 * The Function starter: load and tick functions wired to the vanilla function tags, a
 * function the player runs, and a function tag of the pack's own.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';

export function functionStarterBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const load = rl(namespace, 'load');
  const tick = rl(namespace, 'tick');
  const greet = rl(namespace, 'greet');
  return {
    elements: [
      packElement(namespace, `${projectName}: functions`),
      element(
        load,
        KINDS.function,
        {
          lines: [
            '# Runs on every /reload through the #minecraft:load function tag.',
            'scoreboard objectives add jumps minecraft.custom:minecraft.jump "Jumps"',
            'scoreboard objectives setdisplay sidebar jumps',
            `tellraw @a {"text":"${namespace} loaded. Run /function ${greet}","color":"green"}`,
          ],
        },
        'Runs when the pack loads: creates a scoreboard objective that counts jumps and shows it in the sidebar.',
      ),
      element(
        tick,
        KINDS.function,
        {
          lines: [
            '# Runs every game tick (20 times a second) through #minecraft:tick. Keep it cheap.',
            'execute as @a at @s if block ~ ~-1 ~ minecraft:gold_block run effect give @s minecraft:speed 1 1 true',
          ],
        },
        'Runs every tick. The execute line finds every player standing on a gold block and gives them a short burst of speed.',
      ),
      element(
        greet,
        KINDS.function,
        {
          lines: [
            `# Run with /function ${greet}, or with /function #${rl(namespace, 'all')}`,
            'say Hello!',
            'title @s actionbar {"text":"Stand on a gold block to run faster","color":"gold"}',
          ],
        },
        'A function you run yourself; it shows a hint above the hotbar.',
      ),
      element(
        'minecraft:load',
        KINDS.tagFunction,
        { values: [load] },
        'The game runs every function in #minecraft:load when the data pack loads.',
      ),
      element(
        'minecraft:tick',
        KINDS.tagFunction,
        { values: [tick] },
        'The game runs every function in #minecraft:tick once per tick.',
      ),
      element(
        rl(namespace, 'all'),
        KINDS.tagFunction,
        { values: [greet] },
        `A function tag of your own: /function #${rl(namespace, 'all')} runs every function it lists.`,
      ),
    ],
    assets: [],
  };
}
