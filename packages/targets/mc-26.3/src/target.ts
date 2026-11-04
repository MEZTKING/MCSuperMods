/**
 * Verified facts for Minecraft Java 26.3 (checked 2026-11-04; sources in `CHANGES.md`).
 */

import type { Target } from '@msm/plugin-api';

export const target: Target = {
  id: 'mc-26.3',
  mcVersion: '26.3',
  java: 25,
  packFormats: {
    resource: { major: 97, minor: 1 },
    data: { major: 121, minor: 0 },
  },
  mcdocRef: '0ca060a4f1631f9d5eb7198cfe94c7b77a773d32',
  mcmetaRef: '26.3',
  // fabric and geckolib are not set until Phase 4/5 (verify at implementation then).
};
