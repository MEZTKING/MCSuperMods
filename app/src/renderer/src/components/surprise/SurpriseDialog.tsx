/**
 * "Surprise me" (ADR 0086 D3): shows a rolled mod before anything is made: the theme, the seed,
 * each thing with its pictures and what it makes, and the rule, with "Make it", "Roll again"
 * (a new seed), "Change theme" (the same things in another theme) and Cancel. Typing a seed
 * shows that seed's mod. Presentational: the host rolls the mod and makes it.
 *
 * Test ids: `surprise-dialog`, `surprise-seed`, `surprise-mod-name`, `surprise-thing-<n>`,
 * `surprise-rule`, `surprise-make`, `surprise-roll`, `surprise-change-theme`,
 * `surprise-theme-<id>`, `surprise-status`, `surprise-error`.
 *
 * @packageDocumentation
 */

import { Dices, Palette, Sparkles, Workflow } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import {
  isSeed,
  newSeed as randomSeed,
  SURPRISE_THEMES,
  type SurpriseMod,
} from '../../surprise/surprise';
import { Button } from '../ui/Button';
import { pngDataUrl } from '../wizard/wizard-model';

/** Props of {@link SurpriseDialog}. */
export interface SurpriseDialogProps {
  /** Rolls the mod of a seed and theme (`null`: the seed's own theme). */
  roll(seed: number, themeId: string | null): Promise<SurpriseMod>;
  /** Makes the mod; rejects with the reason it could not. */
  onMake(mod: SurpriseMod): Promise<void>;
  onClose(): void;
  /** Whether "Make it" starts a new mod (no mod is open) rather than adding to the open one. */
  newMod: boolean;
  /** The first seed (default: a random one). */
  seed?: number;
  /** Test hook: the next seed for "Roll again". */
  newSeed?(): number;
}

const MAX_MAKES = 5;

/** "A, B and C", "A, B, C and 4 more". */
export function makesPhrase(names: readonly string[]): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, MAX_MAKES);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0] as string;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The dialog. */
export function SurpriseDialog(props: SurpriseDialogProps) {
  const [seed, setSeed] = useState(() => props.seed ?? (props.newSeed ?? randomSeed)());
  const [seedText, setSeedText] = useState(String(seed));
  const [themeId, setThemeId] = useState<string | null>(null);
  const [mod, setMod] = useState<SurpriseMod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingTheme, setChoosingTheme] = useState(false);
  const [making, setMaking] = useState(false);
  const tokenRef = useRef(0);
  const seedId = useId();
  const roll = props.roll;

  useEffect(() => {
    const token = ++tokenRef.current;
    setError(null);
    roll(seed, themeId).then(
      (next) => {
        if (token === tokenRef.current) setMod(next);
      },
      (failure: unknown) => {
        if (token !== tokenRef.current) return;
        setMod(null);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  }, [roll, seed, themeId]);

  const showSeed = (next: number): void => {
    setSeed(next);
    setSeedText(String(next));
  };

  const rollAgain = (): void => {
    let next = (props.newSeed ?? randomSeed)();
    if (next === seed) next = next === 1 ? 2 : next - 1;
    setThemeId(null);
    setChoosingTheme(false);
    showSeed(next);
  };

  const make = (): void => {
    if (mod === null || making) return;
    setMaking(true);
    setError(null);
    props.onMake(mod).then(
      () => setMaking(false),
      (failure: unknown) => {
        setMaking(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };

  const ready = mod !== null && mod.seed === seed && (themeId === null || mod.theme.id === themeId);
  const empty = mod !== null && mod.things.length === 0;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !making) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="surprise-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <div className="flex items-center gap-2">
            <Dices aria-hidden size={20} className="text-accent" />
            <Dialog.Title className="font-semibold text-base">Surprise me</Dialog.Title>
            <div className="ml-auto flex items-center gap-1.5 text-sm">
              <label htmlFor={seedId} className="text-muted">
                Seed
              </label>
              <input
                id={seedId}
                data-testid="surprise-seed"
                inputMode="numeric"
                className="w-24 rounded border border-border bg-bg px-2 py-0.5 font-mono text-sm"
                value={seedText}
                onChange={(event) => {
                  setSeedText(event.target.value);
                  const next = Number(event.target.value.trim());
                  if (isSeed(next)) {
                    setThemeId(null);
                    setSeed(next);
                  }
                }}
              />
            </div>
          </div>
          <p className="text-muted text-sm">
            Not sure what to make? Here is a random mod to start from. Every part can be changed
            afterwards, and the same seed always gives the same mod.
          </p>

          {mod === null ? (
            <p className="text-muted text-sm" data-testid="surprise-status">
              {error === null ? 'Rolling…' : ''}
            </p>
          ) : (
            <div className="flex min-h-0 flex-col gap-2 overflow-auto" aria-busy={!ready}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-4 rounded-full border border-border"
                  style={{ backgroundColor: mod.theme.colours[0] }}
                />
                <h3 className="font-semibold text-base" data-testid="surprise-mod-name">
                  {mod.modName}
                </h3>
                <span className="text-muted text-xs">
                  {props.newMod ? 'a new mod' : 'added to your mod'}
                </span>
              </div>
              {empty ? (
                <p className="text-sm" data-testid="surprise-status">
                  Nothing could be made with this seed. Roll again.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {mod.things.map((thing, index) => (
                    <li
                      key={`${thing.flowId}-${thing.name}`}
                      data-testid={`surprise-thing-${index}`}
                      className="flex items-center gap-3 rounded border border-border bg-bg p-2"
                    >
                      <div className="flex w-[108px] shrink-0 gap-1">
                        {thing.pictures.length === 0 ? (
                          <Sparkles aria-hidden size={32} className="text-accent" />
                        ) : (
                          thing.pictures.map((picture) => (
                            <img
                              key={picture.path}
                              alt=""
                              src={pngDataUrl(picture.bytes)}
                              className="size-8 rounded-sm border border-border bg-panel"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ))
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-sm">
                          {thing.name}{' '}
                          <span className="font-normal text-muted text-xs">({thing.what})</span>
                        </span>
                        {thing.makes.length > 1 && (
                          <span className="text-muted text-xs">
                            Makes {makesPhrase(thing.makes)}.
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {mod.rule !== null && (
                    <li
                      data-testid="surprise-rule"
                      className="flex items-center gap-3 rounded border border-border bg-bg p-2"
                    >
                      <div className="flex w-[108px] shrink-0">
                        <Workflow aria-hidden size={32} className="text-accent" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">A rule</span>
                        <span className="text-muted text-xs">{mod.rule.sentence}</span>
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {choosingTheme && (
            <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
              <legend className="mb-1 text-muted text-xs">Pick a theme</legend>
              {SURPRISE_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`surprise-theme-${theme.id}`}
                  aria-pressed={(mod?.theme.id ?? null) === theme.id}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm hover:border-accent aria-pressed:border-accent aria-pressed:bg-bg"
                  onClick={() => {
                    setThemeId(theme.id);
                    setChoosingTheme(false);
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-full"
                    style={{ backgroundColor: theme.colours[0] }}
                  />
                  {theme.word}
                </button>
              ))}
            </fieldset>
          )}

          {error !== null && (
            <p role="alert" className="text-error text-sm" data-testid="surprise-error">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              data-testid="surprise-make"
              disabled={!ready || empty || making}
              onClick={make}
              className="border-accent font-medium"
            >
              {making ? 'Making…' : 'Make it'}
            </Button>
            <Button data-testid="surprise-roll" disabled={making} onClick={rollAgain}>
              <Dices size={14} aria-hidden />
              Roll again
            </Button>
            <Button
              data-testid="surprise-change-theme"
              disabled={making}
              aria-expanded={choosingTheme}
              onClick={() => setChoosingTheme((open) => !open)}
            >
              <Palette size={14} aria-hidden />
              Change theme
            </Button>
            <Dialog.Close asChild>
              <Button data-testid="surprise-cancel" disabled={making} className="ml-auto">
                Cancel
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
