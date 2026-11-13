# ADR 0062: Persistent script data

## Context

Scripts have no storage: `ScriptHost` drops schedules and scopes on `/reload` and on stop, and nothing is saved ([ADR 0032](0032-script-api-v1-and-typings.md), limitation L4; coverage audit backlog B6, reserve brief B144). A counter or a flag kept by a script is lost when the world closes. Facts read on 2026-11-13 (`docs/PLAN-vanilla-additions.md`, V12 and V13):

- Fabric's data attachment API (`fabric-data-attachment-api-v1`, identical on the 26.3 and 26.4 builds) offers `AttachmentRegistry.create(Identifier, b -> b.persistent(Codec).copyOnDeath()...)`; `AttachmentTarget` is mixed into entities, levels, chunks and block entities, and `GlobalAttachments` is reached through `GlobalAttachmentsProvider.globalAttachments()` (which class provides it: verify at implementation). The vanilla route is `SavedDataType` with `MinecraftServer.getDataStorage()`. The runtime uses neither today.
- `ScriptApiContractTest` fails as soon as `script-api-v1.json` and `ScriptApi` differ, so a contract change and its runtime land in one CI push.

## Decision

- **D1 API, additive.** A type `DataStore`: `get(key): unknown`, `set(key, value): void`, `remove(key): boolean`, `has(key): boolean`, `keys(): string[]`. `Entity.data: DataStore` (so `Player.data`) and `msm.storage: DataStore`. Values are JSON values (string, finite number, boolean, null, arrays, plain objects), copied in and out; anything else is a `TypeError`.
- **D2 Scope.** Both stores are per script namespace: a script sees only its own namespace's keys, so two mods never clash.
- **D3 Storage.** Fabric data attachments: one persistent attachment `msm_runtime:script_data` of type `Map<namespace, JSON text>`, `copyOnDeath()`, on entities; world storage is the same type as a global attachment (or on the overworld level if the server does not provide one: the executor's finding goes into this ADR). JSON text gives an exact round trip and is readable with `/data get`. Nothing is synced to clients.
- **D4 Limits.** A key is at most 64 characters; 16 KiB per namespace per entity and 1 MiB per namespace for `msm.storage` (default, vetoable); over the limit is a script error and the old value stays.
- **D5 Lifetime.** Data survives `/reload`, restart, death and dimension change. `msm.schedule` stays unsaved; the guide shows rebuilding timers from storage in `server.started`.
- **D6 Tests and parity.** Scripts are not ejected, so parity is content-jar only (`SampleScriptParityTest`, ADR 0058 D4). A real restart is tested by running `tools/run-fabric-server` twice on one world folder.
- **D7 Deferred:** no-code conditions on stored data (actions have no conditions yet), block or chunk data, client sync, data on items (the vanilla `custom_data` passthrough covers it).

## Consequences

- Script API v1 grows additively (the JSON contract, the typings and the runtime in one push); this amends ADR 0032 and closes limitation L4.
- Saved worlds gain an attachment; removing the runtime leaves unreadable but harmless attachment data.
- Scripts must keep stored values small; the limits fail loudly rather than silently.
- No change to the Java eject, which has no scripts.

## Status

Proposed (2026-11-13). Defaults the user may veto: 16 KiB per entity and 1 MiB per world, per namespace. The finding on global attachment versus overworld storage is added here by the runtime brief. Accepted on close.
