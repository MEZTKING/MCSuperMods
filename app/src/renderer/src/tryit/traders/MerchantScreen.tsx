/**
 * The merchant mock-up (B483, ADR 0098 D1, ADR 0101 D5): what the game's trading screen shows
 * for a trader mob, as plain rows of MSM's own labelled "Mock-up" (no Mojang GUI art). Each offer
 * shows its price, its second price when it has one and its product; an offer used `max_uses`
 * times is crossed out until the trader restocks. With `levels` the trader's level name (Novice
 * to Master) and its XP bar show above the offers. A click trades once, Shift and click trades
 * until the offer runs out; no item moves (the line under the offers says so). Close, Esc or E
 * closes it.
 *
 * B540: the first price is the merchant's price for the player now (`Merchant.price`: demand
 * and, with `reputation`, the player's standing); a changed price shows the base crossed out
 * beside it, as the game's screen does, and a trader that remembers the player shows the
 * standing above the offers.
 *
 * Part of the lazy Try it chunk.
 */

import {
  maxLevelOf,
  type OfferStack,
  type OpenMerchant,
  outOfStock,
  TRADE_LEVEL_NAMES,
} from '@msm/sim';
import { ArrowRight, X } from 'lucide-react';
import { type MouseEvent, useEffect, useRef } from 'react';

/** The line under the offers. */
export const MERCHANT_NOTE =
  'Click an offer to trade once; Shift and click trades until it runs out. In the preview nothing is paid and nothing is given.';

/** Props of {@link MerchantScreen}. */
export interface MerchantScreenProps {
  readonly open: OpenMerchant;
  /** An item's name in plain words. */
  nameOf(id: string): string;
  /** Trades offer `index` once, or with `all` until it runs out. */
  onTrade(index: number, all: boolean): void;
  onClose(): void;
}

function Stack({
  stack,
  nameOf,
  price,
}: {
  stack: OfferStack;
  nameOf: (id: string) => string;
  /** The count the player pays now, when it differs from the stack's. */
  price?: number;
}) {
  const changed = price !== undefined && price !== stack.count;
  return (
    <span className="inline-flex items-center gap-1" data-testid="tryit-merchant-stack">
      {changed && (
        <span className="text-muted tabular-nums line-through" data-testid="tryit-merchant-base">
          {stack.count}
        </span>
      )}
      <span
        className={`font-medium tabular-nums ${changed ? (price > stack.count ? 'text-error' : 'text-accent') : ''}`}
        data-testid="tryit-merchant-price"
      >
        {changed ? price : stack.count}
      </span>
      <span>{nameOf(stack.item)}</span>
    </span>
  );
}

/** The screen; see the module comment. */
export function MerchantScreen({ open, nameOf, onTrade, onClose }: MerchantScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const { merchant } = open;
  const trader = merchant.trader;
  const levelName = TRADE_LEVEL_NAMES[merchant.level - 1] ?? `Level ${merchant.level}`;
  const progress = merchant.progress;
  const lastLevel = merchant.level >= maxLevelOf(trader);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${open.displayName}: Mock-up`}
      data-testid="tryit-merchant"
      data-level={merchant.level}
      data-xp={merchant.xp}
      tabIndex={-1}
      className="absolute top-1/2 left-1/2 z-30 flex max-h-[90%] w-[26rem] max-w-[95%] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded border border-border bg-panel p-3 text-sm shadow-lg outline-none"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.code === 'KeyE') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <strong data-testid="tryit-merchant-title">{open.displayName}</strong>
        {trader.usesLevels && (
          <span className="text-muted" data-testid="tryit-merchant-level">
            {levelName}
          </span>
        )}
        <span className="rounded border border-warning px-1 text-xs text-warning">Mock-up</span>
        <span className="ml-auto" />
        <button
          type="button"
          aria-label="Close"
          data-testid="tryit-merchant-close"
          className="cursor-pointer text-muted hover:text-text"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {trader.usesLevels && (
        <div className="flex flex-col gap-0.5">
          <div
            role="progressbar"
            aria-label="Trading experience"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            data-testid="tryit-merchant-xp"
            data-progress={progress.toFixed(2)}
            className="h-2 w-full overflow-hidden rounded-sm bg-black/30"
          >
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="text-xs text-muted">
            {lastLevel
              ? `${trader.displayName} has reached its last level.`
              : `${merchant.xp} trading XP. Trading unlocks ${TRADE_LEVEL_NAMES[merchant.level] ?? 'the next level'}.`}
          </p>
        </div>
      )}
      {trader.reputation !== undefined && (
        <p className="text-xs text-muted" data-testid="tryit-merchant-standing">
          {`Your standing with ${trader.displayName}: ${merchant.standing}. Trades${trader.reputation.giftItem === undefined ? '' : ' and gifts'} raise it, hits lower it.`}
        </p>
      )}
      <ol className="flex flex-col gap-1" data-testid="tryit-merchant-offers">
        {merchant.offers.map((offer, index) => {
          const used = outOfStock(offer);
          return (
            <li key={`${offer.trade}-${index}`}>
              <button
                type="button"
                data-testid={`tryit-merchant-offer-${index + 1}`}
                data-out-of-stock={used}
                data-uses={offer.uses}
                data-max-uses={offer.maxUses}
                title={
                  used
                    ? 'Out of stock until the trader restocks'
                    : `${offer.maxUses - offer.uses} of ${offer.maxUses} left`
                }
                className={`relative flex w-full cursor-pointer flex-wrap items-center gap-2 rounded border border-border bg-bg px-2 py-1 text-left hover:border-accent ${used ? 'opacity-60' : ''}`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => onTrade(index, event.shiftKey)}
              >
                <Stack stack={offer.cost} nameOf={nameOf} price={merchant.price(offer)} />
                {offer.secondCost !== undefined && (
                  <>
                    <span className="text-muted">and</span>
                    <Stack stack={offer.secondCost} nameOf={nameOf} />
                  </>
                )}
                <ArrowRight size={14} aria-hidden className="text-muted" />
                <Stack stack={offer.result} nameOf={nameOf} />
                {used && (
                  <span
                    className="ml-auto inline-flex items-center gap-0.5 text-error"
                    data-testid="tryit-merchant-sold-out"
                  >
                    <X size={14} aria-hidden />
                    Out of stock
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">{MERCHANT_NOTE}</p>
    </div>
  );
}
