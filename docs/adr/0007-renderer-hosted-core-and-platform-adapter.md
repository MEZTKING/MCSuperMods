# ADR 0007: Renderer-hosted core and a PlatformAdapter over typed IPC

## Context

The Electron app has a main process (Node, OS access) and a renderer (React UI). `@msm/core` holds the project document and the command stack that every edit goes through ([Command stack and undo](../DESIGN.md#4-core-project-model-ir)). The UI reads that state on every keystroke. DESIGN requires that all OS access goes through a single `PlatformAdapter` and that packages never call Node or Electron APIs directly ([PlatformAdapter boundary](../DESIGN.md#14-tech-stack)). We need to decide where core runs and how it reaches the file system.

## Decision

- **Core runs in the renderer.** Project state, the command stack and undo/redo live in the renderer next to the UI, so edits never cross a process boundary.
- **Main implements `PlatformAdapter`.** The main process provides project-scoped file-system access (every path is project-relative and checked), native dialogs and app information. `@msm/core` sees only its injected `ProjectFileSystem` interface.
- **Typed, versioned IPC.** The preload script exposes the adapter through `contextBridge`. Channels are named `msm:v1:<domain>:<op>`, and the main process validates every request payload with zod before acting on it.
- **Renderer security.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- **Main never imports `@msm/core` at runtime.** Type-only imports are allowed, so electron-vite's default dependency externalisation for main stays untouched.

## Consequences

- Core stays pure and testable with an in-memory file system; the same code runs in tests and in the app.
- A compromised renderer can reach only the narrow, validated, project-scoped IPC surface.
- Long-running work (export, Spyglass validation from Phase 1) may later move to a worker or utility process; that is a new ADR if it changes this split.
- A Tauri port would reimplement the adapter, not core.

## Status

Accepted (2026-11-04).
