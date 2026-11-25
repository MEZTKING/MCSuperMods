// B840 S4: the smallest plugin (one kind), idle after start.
defineMsmPlugin({ id: 'spike.idle', apiVersion: '^1.0.0', contributes: { elementKinds: [{ id: 'spike:idle', lower: () => [] }] } });
