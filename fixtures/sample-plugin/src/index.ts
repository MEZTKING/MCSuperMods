/**
 * `sample.greetings`: the sample external MCSuperMods plugin.
 *
 * It contributes one element kind, `sample:greeting` (`{ message, colour? }`), which lowers to
 * a data pack function that greets every player with `tellraw` and to an entry in the
 * `minecraft:load` function tag, so the greeting runs whenever the world loads. It also
 * contributes a "New element" template, an example for the Examples gallery and a validator
 * that warns about an empty message.
 *
 * Like every external plugin it imports nothing but `@msm/plugin-api`, and esbuild bundles that
 * into `dist/main.js` (see `build.ts`). The app runs the bundle in a sandboxed worker
 * (ADR 0035), so the code must stay free of Node, DOM and network APIs.
 */
import {
  definePlugin,
  type Element,
  type ElementKind,
  type ElementTemplate,
  type ExampleProject,
  type Json,
  type OutputFile,
  type Problem,
  type ProjectValidator,
  type TargetFacts,
} from '@msm/plugin-api';

/** The kind id. */
export const GREETING_KIND = 'sample:greeting';

/** The mcdoc type of the kind's data, exported to `dist/symbols.json` from `mcdoc/greeting.mcdoc`. */
export const GREETING_SCHEMA = '::sample::greeting::Greeting';

/** The data of a `sample:greeting` element. */
export interface GreetingData {
  /** The text shown to every player. */
  message: string;
  /** A text colour name such as `gold`, or `#rrggbb`; white when omitted. */
  colour?: string;
}

/** Reads the element data leniently: a missing or non-string message becomes `''`. */
function readGreeting(data: Json): GreetingData {
  const object = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
  const message = typeof object.message === 'string' ? object.message : '';
  const colour =
    typeof object.colour === 'string' && object.colour !== '' ? object.colour : undefined;
  return colour === undefined ? { message } : { message, colour };
}

/** Splits `namespace:path`; an id without a colon is in the `minecraft` namespace. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon === -1
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** The `tellraw` command for a greeting. */
export function greetingCommand(greeting: GreetingData): string {
  const parts = [`"text": ${JSON.stringify(greeting.message)}`];
  if (greeting.colour !== undefined) parts.push(`"color": ${JSON.stringify(greeting.colour)}`);
  return `tellraw @a {${parts.join(', ')}}`;
}

/**
 * Lowers a greeting to `data/<ns>/function/greet_<path>.mcfunction` and a `minecraft:load`
 * tag entry naming that function (declared `merge: 'tag'`, so several greetings share the
 * tag file). Folder names come from the target.
 */
export function lowerGreeting(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const functionFolder = target.folders.data.function;
  const functionId = `${namespace}:greet_${path}`;
  return [
    {
      path: `data/${namespace}/${functionFolder}/greet_${path}.mcfunction`,
      contents: new TextEncoder().encode(`${greetingCommand(readGreeting(element.data))}\n`),
      layer: 'datapack',
      language: 'mcfunction',
    },
    {
      path: `data/minecraft/${target.folders.data.tags}/${functionFolder}/load.json`,
      contents: { values: [functionId] },
      layer: 'datapack',
      schema: 'tag:function',
      merge: 'tag',
    },
  ];
}

const greetingKind: ElementKind = {
  id: GREETING_KIND,
  schema: GREETING_SCHEMA,
  folder: 'greeting',
  defaultData: { message: 'Hello!' },
  lower: lowerGreeting,
};

const greetingTemplate: ElementTemplate = {
  id: 'sample-greeting',
  kind: GREETING_KIND,
  title: 'Greeting',
  description: 'Greets every player in gold when the world loads.',
  category: 'Greetings',
  defaultName: 'hello',
  data: ({ path }) => ({ message: `Hello from ${path}!`, colour: 'gold' }),
};

const greetingExample: ExampleProject = {
  id: 'sample-greeting-example',
  title: 'Welcome greeting',
  description: 'A greeting that welcomes every player in aqua when the world loads.',
  kind: GREETING_KIND,
  category: 'Greetings',
  tags: ['tellraw', 'load'],
  requiresKinds: [GREETING_KIND],
  build: ({ namespace, projectName }) => ({
    elements: [
      {
        id: `${namespace}:welcome`,
        kind: GREETING_KIND,
        data: { message: `Welcome to ${projectName}!`, colour: 'aqua' },
        notes:
          'Lowers to a function that runs tellraw for every player, plus an entry in the ' +
          'minecraft:load function tag, so the message appears whenever the world loads.',
        tags: ['sample'],
      },
    ],
    assets: [],
  }),
};

/** Warns about greetings whose message is empty or only spaces. */
export const emptyMessageValidator: ProjectValidator = {
  id: 'sample.empty-message',
  kinds: [GREETING_KIND],
  validate: ({ elements }) => {
    const problems: Problem[] = [];
    for (const element of elements) {
      if (element.kind !== GREETING_KIND) continue;
      if (readGreeting(element.data).message.trim() !== '') continue;
      problems.push({
        severity: 'warning',
        code: 'sample.empty-message',
        message: `Greeting ${element.id} has an empty message, so players will see a blank line.`,
        elementId: element.id,
        path: '/message',
      });
    }
    return problems;
  },
};

export default definePlugin({
  id: 'sample.greetings',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [greetingKind],
    elementTemplates: [greetingTemplate],
    examples: [greetingExample],
    validators: [emptyMessageValidator],
  },
});
