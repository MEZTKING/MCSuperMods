/**
 * The controls Studios (B420, ADR 0091 D1), discovered by `studios/studio-registry.ts`: the Key
 * bind Studio for `msm:key_bind` and the HUD Studio for `msm:hud`, each loaded with
 * `React.lazy` as a chunk of its own (ADR 0091 D5). Their Very easy lists are here, as the
 * Vehicle Studio's are in `../entities/studios.tsx`.
 *
 * @packageDocumentation
 */

import { lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import { RULES_SECTION_ID } from '../very-easy';

/** The Key bind Studio, a chunk of its own. */
const KeyBindStudio = lazy(() => import('./KeyBindStudio'));
/** The HUD Studio, a chunk of its own. */
const HudStudio = lazy(() => import('./HudStudio'));

/** The Key bind Studio behind its loading fallback. */
function LazyKeyBindStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-sm" data-testid="key-bind-studio-loading">
          Loading the Key bind Studio…
        </p>
      }
    >
      <KeyBindStudio {...props} />
    </Suspense>
  );
}

/** The HUD Studio behind its loading fallback. */
function LazyHudStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-sm" data-testid="hud-studio-loading">
          Loading the HUD Studio…
        </p>
      }
    >
      <HudStudio {...props} />
    </Suspense>
  );
}

/** The key bind kind (`@msm/plugin-controls`). */
const KEY_BIND_KIND = 'msm:key_bind';
/** The HUD element kind (`@msm/plugin-controls`). */
const HUD_KIND = 'msm:hud';

/**
 * The Key bind Studio's sections in Very easy: the name, the key, when it works, and Rules once
 * the rules catalogue has key triggers.
 */
export const KEY_BIND_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'key-bind-name',
  'key-bind-key',
  'key-bind-when',
];

/** The HUD Studio's sections in Very easy: the preview, the look, the value, the place, colours. */
export const HUD_VERY_EASY_SECTIONS: readonly string[] = [
  'hud-preview',
  'hud-look',
  'hud-value',
  'hud-where',
  'hud-style',
];

/** The controls area's Studio entries. */
export const studios: StudioEntry[] = [
  {
    id: 'msm.controls.key-bind',
    kindId: KEY_BIND_KIND,
    component: LazyKeyBindStudio,
    veryEasy: KEY_BIND_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.controls.hud',
    kindId: HUD_KIND,
    component: LazyHudStudio,
    veryEasy: HUD_VERY_EASY_SECTIONS,
  },
];
