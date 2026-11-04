# MCSuperMods

A desktop mod maker for Minecraft Java Edition that takes you from a simple texture pack to fully animated custom mobs, without forcing you to write code.

## What it is

- **Every content layer in one project:** resource packs, data packs, structures, worldgen, custom blocks and items, and Blockbench-animated entities.
- **Fabric-first, vanilla where possible:** content that vanilla can express exports as plain resource and data packs; anything beyond that ships as a single Fabric jar.
- **For beginners and power users alike:** guided "Studio" views with live 3D preview, plus a Raw JSON tab, mcfunction and TypeScript editors, and an eject-to-Java escape hatch.

## Status

- Pre-alpha: the Phase 1 code (Resource Pack Studio) is complete and awaits an in-game check. There are no releases yet: the first one waits for the licence decision. Phase 2 (Data Pack Studio) is next.
- Releases will be for Windows only to begin with; Linux builds are made in CI for testing, and macOS builds are not planned for now.
- Current Minecraft target: **Java 26.3** (with 26.2 as the previous supported release at launch).

## Try it

There is no installer yet, so you run the app from source. On Windows you need [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) 24 or later and Minecraft Java Edition 26.3. In a terminal (PowerShell or Command Prompt):

```sh
git clone https://github.com/MEZTKING/MCSuperMods.git
cd MCSuperMods
corepack enable        # provides the pinned pnpm; may need an administrator terminal
pnpm install
pnpm dev               # opens the MCSuperMods window
```

Then:

1. Open the folder `fixtures/sample-resourcepack` from the repository. It is a small sample project: a ruby block, a ruby item and their textures, all made for MCSuperMods.
2. Choose **Install to resourcepacks folder** on the toolbar. MCSuperMods writes the pack into your Minecraft `resourcepacks` folder (set the Minecraft folder in Settings if it was not found).
3. Start Minecraft Java 26.3, open **Options → Resource Packs** and move the pack named `msm-sample-resource-pack-mc-26.3.zip` (described as "MCSuperMods sample: a held stick shows a ruby") to the selected side.
4. In a world, hold a stick: the sample pack replaces the stick's look with the ruby, so you can see that the pack is active.

The sample contains no Mojang files; its two textures are drawn by `fixtures/sample-resourcepack/tools/make-textures.mjs`.

## Try the data pack

The data pack sample works the same way, with the app running from source as above. It uses vanilla items only, so it needs no resource pack.

1. Open the folder `fixtures/sample-datapack` from the repository. It holds a greeting function, a load function with its `#minecraft:load` tag, three recipes, an advancement, a loot table, a predicate, an item modifier and an item tag.
2. Choose **File → Install Data Pack…** and pick a world. MCSuperMods writes `msm-sample-data-pack-mc-26.3.zip` into that world's `datapacks` folder. Close the world in Minecraft first if it is open.
3. Start Minecraft Java 26.3 and open the world with cheats allowed (or open it to LAN with cheats on). Then run:
   - `/reload`: chat shows `[Server] MCSuperMods sample data pack loaded. Run /function msm_sample_data:greet`.
   - `/datapack list`: the enabled packs include `file/msm-sample-data-pack-mc-26.3.zip`.
   - `/function msm_sample_data:greet`: the game says hello, prints a green hint and gives you eight emeralds and a block of redstone.
4. Craft the recipe: put the block of redstone in the middle of a crafting table and the eight emeralds around it. The result is a block of redstone named **Ruby Block**.
5. Taking the Ruby Block out of the crafting table shows the advancement toast **Ruby Crafter**. Its reward is 10 experience and a roll of the sample loot table.
6. Open `.minecraft/logs/latest.log` (on Windows, `%APPDATA%\.minecraft\logs\latest.log`) and check that it has no `Failed to load`, `Couldn't parse` or other errors mentioning `msm_sample_data`.

More checks (loot table, item modifier, smelting) are listed in `fixtures/sample-datapack/README.md`.

## How it works

1. Your project is a git-friendly folder of JSON elements: a version-agnostic intermediate representation (IR).
2. Plugins define element kinds; each kind **lowers** to plain files for a specific Minecraft version (a **target**).
3. Lowered output is validated against a schema model derived from the official vanilla-mcdoc schemas before anything is written.
4. Exporters then produce vanilla packs, or a Fabric **content jar** that bundles the generic `msm_runtime` mod, or an ejected standalone Fabric Java project.
5. Version churn stays inside target packages, so moving a project to a new Minecraft release does not mean rewriting it.

Details: [Architecture Overview](docs/DESIGN.md#3-architecture-overview) and [Targets and Exporters](docs/DESIGN.md#9-targets-and-exporters).

## Roadmap

| Phase | Name | Outcome |
|---|---|---|
| 0 | Foundations | Project model, schemas and app shell; CI green |
| 1 | Resource Pack Studio (v0.1) | Make and install a custom texture and model pack without touching JSON |
| 2 | Data Pack Studio (v0.2) | Recipes, loot, advancements, tags and validated mcfunctions |
| 3 | Structures & Worldgen (v0.3) | Custom biomes with custom jigsaw structures |
| 4 | Engine Mod + Blocks/Items (v0.4) | Custom blocks and items with behaviour, from one jar |
| 5 | Entities, Models, Animation (v0.5) | Blockbench-animated custom mobs |
| 6 | Scripting & Eject (v0.6) | TypeScript scripts in-game; export as a Java project |
| 7 | 1.0 | Third-party plugins, a second Minecraft target, docs site |

Full plan with checklists: [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): the authoritative design document.
- [docs/ROADMAP.md](docs/ROADMAP.md): phased delivery plan and milestone log.
- [docs/DEVLOG.md](docs/DEVLOG.md): session-by-session development log.

## Comparison

| Tool | What it does well | How MCSuperMods differs |
|---|---|---|
| MCreator | Mature, large beginner community | Forge/NeoForge-first with generated-code lock-in; MSM keeps a version-agnostic project, exports true vanilla packs, and offers an open plugin API and real code escape hatches |
| Blockbench | Best-in-class model and animation authoring | A partner, not a competitor: MSM imports `.bbmodel` files rather than re-implementing a modeller |
| Misode generators | Fast, accurate web generators for data pack files | One file at a time with no project; MSM uses the same schema ecosystem inside a full project with export and in-game testing |

More in [Users and Personas](docs/DESIGN.md#2-users-and-personas).

## Development

Requires Node 24 or later (see `.nvmrc`) and pnpm 12.16.1 via corepack.

```sh
corepack enable                     # use the pinned pnpm
pnpm i                              # install dependencies
pnpm dev                            # run the desktop app
pnpm lint                           # Biome check plus the dependency-direction check
pnpm typecheck                      # tsc -b over all project references
pnpm test                           # unit tests (Vitest)
pnpm build                          # build the app
pnpm --filter @msm/core test        # tests for one package
pnpm --filter @msm/app e2e          # Playwright golden path (Linux CI: xvfb-run -a)
pnpm --filter @msm/app dist         # Windows installer (dist:dir for an unpacked test build)
node tools/check-size/index.ts      # size budgets, after build and dist:dir
```

Vendored Minecraft data is refreshed only by `tools/sync-mcdoc` and `tools/sync-mcmeta`; each has a README with its arguments. The `msm_runtime` engine mod (`cd engine-mod && ./gradlew build`) arrives in Phase 4.

Planned stack: Electron + TypeScript + React for the app; Fabric + Java 25 for the runtime mod. See [Tech Stack](docs/DESIGN.md#14-tech-stack) and [Repository Layout](docs/DESIGN.md#15-repository-layout).

## Contributing

Not open for contributions yet while the architecture settles. Issues with ideas, questions or use cases are welcome.

## Licence

MCSuperMods is released under the [MIT Licence](LICENSE). You may use, modify and redistribute it freely, including commercially, provided the copyright notice and licence text are kept in all copies, which credits the project. The licence covers the MCSuperMods application and source code only: packs and mods you create with it are yours.
