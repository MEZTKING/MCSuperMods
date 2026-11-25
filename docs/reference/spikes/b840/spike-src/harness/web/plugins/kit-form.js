// B840 S1 plugin: a form whose tree has about `n` nodes; one text field and an echo of it.
defineMsmPlugin({
  id: 'spike.kitform',
  apiVersion: '^1.0.0',
  contributes: {
    views: [
      {
        id: 'form',
        state: { name: '', n: 50, toggles: {} },
        on(event, state) {
          if (event.type === 'init') { state.n = event.n; state.name = ''; }
          else if (event.type === 'change' && event.node === 'name') state.name = event.value;
          else if (event.type === 'change') state.toggles[event.node] = event.value;
        },
        render(state) {
          const filler = [];
          const groups = Math.max(0, Math.ceil((state.n - 4) / 7));
          for (let g = 0; g < groups; g++) {
            filler.push({
              t: 'Section', id: `s${g}`, title: `Group ${g + 1}`,
              c: [
                { t: 'Heading', text: `Settings for part ${g + 1}` },
                { t: 'Row', c: [
                  { t: 'Text', text: `Part ${g + 1} is ready to use in your mod.`, tone: 'muted' },
                  { t: 'Toggle', id: `tg${g}`, label: 'On', value: state.toggles[`tg${g}`] === true },
                  { t: 'Button', id: `b${g}`, label: 'Use it' },
                ] },
                { t: 'Text', text: `More about part ${g + 1}.` },
              ],
            });
          }
          return {
            t: 'Column',
            c: [
              { t: 'Section', id: 'main', title: 'Your greeting', c: [
                { t: 'TextField', id: 'name', label: 'Name', value: state.name },
                { t: 'Text', id: 'echo', text: `Hello, ${state.name}` },
              ] },
              ...filler,
            ],
          };
        },
      },
    ],
  },
});
