# ADR 0001: Electron desktop shell, starting on Electron 45

## Context

MSM is a desktop app with a live 3D preview (three.js and deepslate need reliable WebGL2), heavy use of Node-ecosystem libraries (Spyglass, prismarine-nbt, esbuild) and a single developer. The two realistic shells are Electron and Tauri. Tauri on Linux renders through WebKitGTK, where WebGL support is unreliable, and it would split the codebase between TypeScript and Rust. Blockbench, the main partner tool, is itself an Electron app.

DESIGN [Open Question 8](../DESIGN.md#18-open-questions) asked which stable Electron line to start on.

## Decision

We use Electron for the desktop shell, built with electron-vite and packaged with electron-builder. See [Tech Stack](../DESIGN.md#14-tech-stack).

We start on the Electron 45 line (45.2.2, released 2026-10-21; Chromium 156, Node 24.22), verified on 2026-11-04. It is the newest stable line and so has the longest support window. The exact pin lives in the pnpm catalog (ADR 0004).

All OS access goes through the `PlatformAdapter` boundary (ADR 0007), so a Tauri port stays possible later.

## Consequences

- One language end to end; Chromium guarantees WebGL2 on every desktop platform.
- Installers are larger and memory use is higher than Tauri; the 150 MB [bundle budget](../DESIGN.md#14-tech-stack) and lazy loading of Monaco and three.js keep this in check.
- Electron majors arrive roughly every eight weeks; we move lines deliberately, recording the change in the DEVLOG and, when it changes a decision, a new ADR.

## Status

Accepted (2026-11-04). Resolves DESIGN Open Question 8 together with ADR 0004.
