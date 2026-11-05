# @msm/plugin-api

The public plugin API of [MCSuperMods](https://github.com/MEZTKING/MCSuperMods) (MSM), the desktop mod maker for Minecraft Java. Every MSM plugin, built-in or third-party, is written against these TypeScript interfaces: element kinds and their lowering to files, templates, project starters and examples, validators, exporters, importers and the target facts of each Minecraft version. Built-in plugins have no private hooks: whatever a built-in can do, a third-party plugin can do through this package.

The package holds types plus three tiny helpers (`definePlugin`, `isProjectRelativePath`, `assertProjectRelativePath`) and the `API_VERSION` constant. It has no dependencies and no Node or DOM types, because third-party plugins run sandboxed in a Web Worker.

## Install

The package is attached to every MCSuperMods release as `msm-plugin-api-<version>.tgz`:

```sh
npm install --save-dev https://github.com/MEZTKING/MCSuperMods/releases/download/v<app version>/msm-plugin-api-<version>.tgz
```

It ships ES module and CommonJS builds with type declarations.

## A minimal plugin

```ts
import { definePlugin, type ElementKind } from '@msm/plugin-api';

const greeting: ElementKind = {
  id: 'sample:greeting',
  schema: '::sample::greeting::Greeting',
  folder: 'greeting',
  lower: (element, target) => {
    const [namespace, path] = element.id.split(':');
    const message = (element.data as { message?: string }).message ?? 'Hello';
    return [
      {
        path: `data/${namespace}/${target.folders.data.function}/${path}.mcfunction`,
        contents: new TextEncoder().encode(`say ${message}\n`),
        layer: 'datapack',
        language: 'mcfunction',
      },
    ];
  },
};

export default definePlugin({
  id: 'sample.greetings',
  apiVersion: '^1.0.0',
  contributes: { elementKinds: [greeting] },
});
```

## Compatibility policy

From 1.0.0 the API follows semver:

- 1.x releases only add optional fields and new contribution points; a plugin written for 1.0 keeps loading in every 1.x host.
- Anything that removes or narrows a member is a 2.0.0 release, with a migration note in `CHANGELOG.md`.
- A deprecated member stays for at least one minor release, marked `@deprecated` with its replacement.

A plugin declares the range it supports in `apiVersion` (for example `^1.0.0`); MSM refuses a plugin whose range excludes the host's `API_VERSION`, with a message naming both.

## Documentation

- [Writing plugins](https://meztking.github.io/MCSuperMods/plugins.html), the plugins page of the user guide.
- [`CHANGELOG.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/packages/plugin-api/CHANGELOG.md): every API change, with migration notes.
- Every exported symbol carries JSDoc, which your editor shows.

## Licence

MIT.
