// Spike plugin bundle for B150 (ADR 0035): plain ES2020, no imports. The worker bootstrap runs
// first and provides `defineMsmPlugin`. B154 replaces this file.

const encoder = new TextEncoder();

defineMsmPlugin({
  id: 'spike.plugin',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [
      {
        id: 'spike:note',
        label: 'Note',
        folder: 'note',
        schema: '::spike::note::Note',
        lower(element, target) {
          const [namespace, path] = element.id.split(':');
          return [
            {
              path: `data/${namespace}/note/${path}.json`,
              layer: 'data',
              contents: {
                text: element.data.text,
                length: element.data.text.length,
                packFormat: target.packFormats.data,
              },
            },
          ];
        },
      },
    ],
    elementTemplates: [
      {
        id: 'spike-note',
        kind: 'spike:note',
        title: 'Note',
        description: 'A short note.',
        category: 'Spike',
        data(context) {
          return { text: `Hello from ${context.id} on ${context.target.id}` };
        },
      },
    ],
    examples: [
      {
        id: 'spike-example',
        title: 'Spike example',
        description: 'One note.',
        build(context) {
          return {
            elements: [
              {
                formatVersion: 1,
                id: `${context.namespace}:hello`,
                kind: 'spike:note',
                data: { text: 'Hello' },
                meta: {},
              },
            ],
            assets: [],
          };
        },
      },
    ],
    validators: [
      {
        id: 'spike.empty-note',
        kinds: ['spike:note'],
        validate(input) {
          const problems = [];
          for (const element of input.elements) {
            if (element.kind !== 'spike:note') continue;
            if (element.data.text === '') {
              problems.push({
                severity: 'warning',
                code: 'spike.empty-note',
                message: `${element.id} is empty.`,
                elementId: element.id,
              });
            }
          }
          problems.push({
            severity: 'info',
            code: 'spike.registry',
            message: `stone:${input.registry.has('item', 'minecraft:stone')} items:${input.registry.ids('item').length}`,
          });
          return problems;
        },
      },
    ],
    exporters: [
      {
        id: 'spike.notes',
        label: 'Notes',
        async run(input) {
          const lines = input.files.map((file) => file.path).join('\n');
          await input.sink.writeFile('notes.txt', encoder.encode(lines));
          await input.sink.writeFile(
            'meta/index.json',
            encoder.encode(
              JSON.stringify({ project: input.projectName, count: input.files.length }),
            ),
          );
          input.problems.report({
            severity: 'info',
            code: 'spike.exported',
            message: 'Two files.',
          });
        },
      },
    ],
    importers: [
      {
        id: 'spike.txt',
        label: 'Text note',
        extensions: ['txt'],
        async import(file, namespace) {
          return {
            elements: [
              {
                formatVersion: 1,
                id: `${namespace}:${file.name.replace(/\.txt$/, '')}`,
                kind: 'spike:note',
                data: { text: new TextDecoder().decode(file.bytes) },
                meta: {},
              },
            ],
            assets: [],
            problems: [],
          };
        },
      },
    ],
  },
  // Spike only: a function that never returns a result in time.
  async neverAnswers() {
    return new Promise(() => undefined);
  },
  // Spike only: a function that returns something that is not JSON.
  badResult() {
    return { when: new Date(0) };
  },
});
