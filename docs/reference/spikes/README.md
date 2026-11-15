# Spike evidence

Results of the throwaway spikes of vanilla parity 2, batch 2, kept so the briefs that build on them (B472–B485 in `docs/PLAN-vanilla-parity-2.md`) can read what was measured and reuse code that worked. The spike code was deleted from `engine-mod/`; these are copies. Nothing here is built, linted or shipped. Only MSM's own code and our own measurements are kept: no vanilla files, decompiled code, `javap` listings or screenshots of the game.

The decisions taken from them are in the ADR amendments, which win over anything here:

- `b469/`: traders, professions, mount storage and shoulder pets (S11–S13), measured on 26.3 and 26.4-snapshot-7. Decisions in `docs/adr/0098-traders-professions-mount-storage-and-shoulder-pets.md`, "Amendment after the spike". `spike-src/` holds the spike's Java (`spike3/`, the `SpikePoi` seam for each version) and resources; `server-*.json` are the GameTest observations by key (`S11.*`, `S12.*`, `S13.*`).
- `b470/`: custom fluids (S14), measured on both versions, with and without the 26.4 `Entity.isInWater`/`isInLava` Mixin. Decisions in `docs/adr/0099-custom-fluids.md`, "Amendment after the spike". `spike-src/` holds `spike4/` (fluids, liquid block, Mixin, client), the 26.3 `SpikeFluid` seam and resources; `server-*.json` and `client-*.json` are the observations (`client-*`: `sp.*` singleplayer, `ds.*` a dedicated server with a joined client).

The DEVLOG entries "B469" and "B470" of 2026-11-15 describe how each spike was run.
