/**
 * The offer card (ADR 0133 D3, B764): before MCSuperMods makes a launcher instance or a server,
 * it says in plain words what will be made (main's `describeRecipe` sentences), then waits for
 * one of three choices: the make button, "Use one of mine instead…" (the user's own instances,
 * each with how ready it is) or Cancel, with "Do this by itself next time" beside them. The card
 * is its own live view: it shows the recipe before anything is written. Names, files and folders
 * of the recipe show only under More options (ADR 0130).
 *
 * {@link OfferCard} is the card itself (presentational); {@link OfferCardHost} shows it as a
 * dialog whenever `useInstancesStore` has one open. The host is mounted by the screens that
 * offer (Play, Test in Minecraft: B765 onward).
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { type ActiveOffer, useInstancesStore } from '../../store/instances-store';
import { installTargetName } from '../install-target';
import { Button } from '../ui/Button';
import { DialogContent, DialogRoot } from '../ui/DialogContent';
import { MoreOptions } from '../ui/MoreOptions';
import { INSTANCE_WORDS, loaderWords, makeLabel, plainSentence, readinessOf } from './words';

/** Props of {@link OfferCard}. */
export interface OfferCardProps {
  card: ActiveOffer;
  onRemember(remember: boolean): void;
  onMake(): void;
  onPick(): void;
  onBack(): void;
  onUseMine(locationId: string): void;
  onCancel(): void;
  /** Draws the heading (a dialog's title in {@link OfferCardHost}); an `h2` by default. */
  heading?: (text: string) => ReactNode;
}

const primaryClass = 'border-accent font-medium';

/** The recipe's details for More options: names, versions and files (ids allowed there). */
function RecipeDetails(props: { card: ActiveOffer }) {
  const { plan } = props.card.input;
  const recipe = plan.recipe;
  const rows: [string, string][] = [
    [recipe.place.kind === 'server' ? 'Server name' : 'Instance name', recipe.place.name],
    ['Minecraft', `${recipe.mcVersion}${recipe.channel === 'snapshot' ? ' (snapshot)' : ''}`],
    ['Mod loader', loaderWords(recipe.loader)],
    ['Java', String(recipe.java)],
  ];
  if (recipe.mods.length > 0) {
    rows.push(['Mod files', recipe.mods.map((mod) => mod.fileName).join(', ')]);
  }
  if (recipe.resourcePacks.length > 0) {
    rows.push(['Resource packs', recipe.resourcePacks.join(', ')]);
  }
  if (recipe.world !== null) {
    rows.push(['World folder', `${recipe.world.folder}${recipe.world.copied ? ' (a copy)' : ''}`]);
  }
  if (recipe.join !== null) rows.push(['Joins', `${recipe.join.host}:${recipe.join.port}`]);
  if (plan.existing !== null) rows.push(['Already made', plan.existing.id]);
  return (
    <dl
      className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"
      data-testid="instance-offer-details"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0 break-all font-mono [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Use one of mine instead…": the user's own instances, each with how ready it is. */
function OwnInstancePicker(props: {
  card: ActiveOffer;
  onBack(): void;
  onUseMine(locationId: string): void;
}) {
  const locations = props.card.input.locations ?? [];
  const recipe = props.card.input.plan.recipe;
  const rated = locations.map((option) => ({ option, readiness: readinessOf(option, recipe) }));
  const firstUsable =
    rated.find((entry) => entry.readiness.ready) ?? rated.find((entry) => entry.readiness.usable);
  const [chosen, setChosen] = useState<string | null>(firstUsable?.option.id ?? null);
  const baseId = useId();
  const box = useRef<HTMLDivElement>(null);
  // The button that opened the list is gone: the focus goes to the chosen instance, else Back.
  useEffect(() => {
    const first =
      box.current?.querySelector<HTMLElement>('input:checked') ??
      box.current?.querySelector<HTMLElement>('[data-testid="instance-offer-back"]');
    first?.focus();
  }, []);
  return (
    <div ref={box} className="flex flex-col gap-2" data-testid="instance-offer-picker">
      <h3 className="m-0 text-sm font-semibold">{INSTANCE_WORDS.pickTitle}</h3>
      <p className="m-0 text-sm text-muted">{INSTANCE_WORDS.pickIntro}</p>
      {rated.length === 0 ? (
        <p className="m-0 text-sm" data-testid="instance-offer-picker-empty">
          {INSTANCE_WORDS.pickNone}
        </p>
      ) : (
        <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
          <legend className="sr-only">{INSTANCE_WORDS.pickTitle}</legend>
          {rated.map(({ option, readiness }, index) => {
            const detailsId = `${baseId}-${index}`;
            const checked = chosen === option.id;
            return (
              <label
                key={option.id}
                data-testid={`instance-offer-own-${index}`}
                className={
                  'flex items-start gap-2 rounded border px-2 py-1.5 ' +
                  (readiness.usable ? 'cursor-pointer ' : 'opacity-60 ') +
                  (checked ? 'border-accent bg-bg' : 'border-border')
                }
              >
                <input
                  type="radio"
                  name={`${baseId}-own`}
                  className="mt-1"
                  value={option.id}
                  checked={checked}
                  disabled={!readiness.usable}
                  aria-describedby={detailsId}
                  onChange={() => setChosen(option.id)}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium [overflow-wrap:anywhere]">
                    {installTargetName(option)}
                  </span>
                  <span
                    id={detailsId}
                    className={`text-xs ${readiness.ready ? '' : 'text-muted'}`}
                    data-testid={`instance-offer-own-${index}-readiness`}
                  >
                    {readiness.text}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button
          className={primaryClass}
          data-testid="instance-offer-use"
          disabled={chosen === null}
          onClick={() => {
            if (chosen !== null) props.onUseMine(chosen);
          }}
        >
          {INSTANCE_WORDS.useThis}
        </Button>
        <Button data-testid="instance-offer-back" onClick={props.onBack}>
          {INSTANCE_WORDS.back}
        </Button>
      </div>
    </div>
  );
}

/** The offer card: what will be made, the three choices, progress and a failure. */
export function OfferCard(props: OfferCardProps) {
  const { card } = props;
  const { plan } = card.input;
  const rememberId = useId();
  const making = card.phase === 'making';
  const canUseMine = card.input.locations !== undefined && plan.recipe.place.kind === 'instance';
  const mine = useRef<HTMLButtonElement>(null);
  const make = useRef<HTMLButtonElement>(null);
  const lastPhase = useRef(card.phase);
  // Back from the list, the focus returns to the button that opened it; after a failure it goes
  // to Try again (the buttons were off while making, which drops the focus).
  useEffect(() => {
    if (lastPhase.current === 'picking' && card.phase === 'asking') mine.current?.focus();
    if (lastPhase.current === 'making' && card.phase === 'failed') make.current?.focus();
    lastPhase.current = card.phase;
  }, [card.phase]);
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      data-testid="instance-offer"
      data-phase={card.phase}
      aria-busy={making}
    >
      {props.heading === undefined ? (
        <h2 className="m-0 text-base font-semibold">{plan.title}</h2>
      ) : (
        props.heading(plan.title)
      )}
      {card.phase === 'picking' ? (
        <OwnInstancePicker card={card} onBack={props.onBack} onUseMine={props.onUseMine} />
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm" data-testid="instance-offer-sentences">
            {plan.sentences.map((sentence) => (
              <p key={sentence} className="m-0">
                {plainSentence(sentence)}
              </p>
            ))}
          </div>
          <MoreOptions storageKey="instance-offer">
            <RecipeDetails card={card} />
          </MoreOptions>
          <div className="flex items-start gap-1.5">
            <input
              id={rememberId}
              type="checkbox"
              className="mt-1"
              data-testid="instance-offer-remember"
              checked={card.remember}
              disabled={making}
              aria-describedby={`${rememberId}-hint`}
              onChange={(event) => props.onRemember(event.target.checked)}
            />
            <span className="flex flex-col">
              <label htmlFor={rememberId} className="text-sm">
                {INSTANCE_WORDS.remember}
              </label>
              <span id={`${rememberId}-hint`} className="text-xs text-muted">
                {INSTANCE_WORDS.rememberHint}
              </span>
            </span>
          </div>
          {making && (
            <div className="flex flex-col gap-0.5" data-testid="instance-offer-progress">
              <p className="m-0 text-sm" role="status">
                {card.step ?? INSTANCE_WORDS.making(plan.recipe.place.name)}
              </p>
              <progress className="w-full" aria-label={card.step ?? plan.title} />
            </div>
          )}
          {card.phase === 'failed' && card.error !== null && (
            <p
              className="m-0 whitespace-pre-line text-sm text-error"
              role="alert"
              data-testid="instance-offer-error"
            >
              {card.error}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button
              ref={make}
              className={primaryClass}
              data-testid="instance-offer-make"
              disabled={making}
              onClick={props.onMake}
            >
              {card.phase === 'failed'
                ? INSTANCE_WORDS.tryAgain
                : (card.input.makeLabel ?? makeLabel(plan))}
            </Button>
            {canUseMine && (
              <Button
                ref={mine}
                data-testid="instance-offer-mine"
                disabled={making}
                onClick={props.onPick}
              >
                {INSTANCE_WORDS.useMine}
              </Button>
            )}
            <Button data-testid="instance-offer-cancel" disabled={making} onClick={props.onCancel}>
              {INSTANCE_WORDS.cancel}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Shows the open card of `useInstancesStore` as a dialog (Escape and the overlay cancel it, not
 * while making). Mount it once where cards are offered.
 */
export function OfferCardHost() {
  const card = useInstancesStore((state) => state.card);
  const content = useRef<HTMLDivElement>(null);
  if (card === null) return null;
  const store = useInstancesStore.getState();
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) store.cancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogContent
          aria-describedby={undefined}
          data-testid="instance-offer-dialog"
          ref={content}
          onOpenAutoFocus={(event) => {
            // The make button takes the focus, not More options above it.
            const make = content.current?.querySelector<HTMLElement>(
              '[data-testid="instance-offer-make"]',
            );
            if (make != null) {
              event.preventDefault();
              make.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (card.phase === 'making') event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (card.phase === 'making') event.preventDefault();
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <OfferCard
            card={card}
            heading={(text) => (
              <Dialog.Title className="m-0 text-base font-semibold">{text}</Dialog.Title>
            )}
            onRemember={(remember) => store.setRemember(remember)}
            onMake={() => void store.make()}
            onPick={() => store.pick()}
            onBack={() => store.back()}
            onUseMine={(id) => store.useMine(id)}
            onCancel={() => store.cancel()}
          />
        </DialogContent>
      </Dialog.Portal>
    </DialogRoot>
  );
}
