/**
 * Function and function tag templates. The tick and load tags live in the `minecraft`
 * namespace and run `<project namespace>:tick` and `<project namespace>:load`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { kindDefaultOr } from './shared';

const FUNCTION = 'minecraft:function';
const FUNCTION_TAG = 'minecraft:tag/function';

/** A `minecraft` function tag (`tick` or `load`) running `<project ns>:<name>`. */
function functionTagTemplate(name: 'tick' | 'load', description: string): ElementTemplate {
  return {
    id: `function_${name}`,
    kind: FUNCTION_TAG,
    category: 'Function tags',
    title: name === 'tick' ? 'Tick function tag' : 'Load function tag',
    description,
    defaultName: name,
    defaultNamespace: 'minecraft',
    data: (context) => ({ values: [`${context.projectNamespace}:${name}`] }),
  };
}

/** A scoreboard objective name for `namespace`: `<namespace>.ticks`. */
const objective = (namespace: string): string => `${namespace}.ticks`;

export const functionTemplates: readonly ElementTemplate[] = [
  {
    id: 'function',
    kind: FUNCTION,
    category: 'Functions',
    title: 'Function',
    description: 'A list of commands, run with /function.',
    data: ({ id }) => ({ lines: [`# Run with /function ${id}`, 'say Hello'] }),
  },
  {
    id: 'function_load_body',
    kind: FUNCTION,
    category: 'Functions',
    title: 'Load function',
    description: 'Sets up a scoreboard and greets players; run it from the Load function tag.',
    defaultName: 'load',
    data: ({ id, namespace }) => ({
      lines: [
        `# ${id}: runs on every /reload through the #minecraft:load function tag.`,
        `scoreboard objectives add ${objective(namespace)} dummy`,
        'tellraw @a {"text":"Data pack loaded.","color":"green"}',
      ],
    }),
  },
  {
    id: 'function_tick_body',
    kind: FUNCTION,
    category: 'Functions',
    title: 'Tick function',
    description: 'Runs for every player each game tick; run it from the Tick function tag.',
    defaultName: 'tick',
    data: ({ id }) => ({
      lines: [
        `# ${id}: runs every game tick through the #minecraft:tick function tag.`,
        'execute as @a at @s if block ~ ~-1 ~ minecraft:gold_block run effect give @s minecraft:speed 1 0 true',
      ],
    }),
  },
  functionTagTemplate('tick', 'Runs <namespace>:tick every game tick (#minecraft:tick).'),
  functionTagTemplate('load', 'Runs <namespace>:load when the data pack loads (#minecraft:load).'),
  {
    id: 'tag_function',
    kind: FUNCTION_TAG,
    category: 'Function tags',
    title: 'Function tag',
    description: 'A named group of functions, run with /function #<namespace>:<name>.',
    data: (context) => kindDefaultOr(context, { replace: false, values: [] }),
  },
];
