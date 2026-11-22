/**
 * Try it's merchant screen over a project's files (B615; spike answer 2S14): the trader state is
 * built by `merchant-model.ts` from the lowered files, 150 ms after the last change, without Try
 * it's world. A click trades in the preview only (nothing is paid, given or written); Close
 * draws the trader afresh. The screen takes focus when it opens; the wrapper gives it back to
 * whatever had it, so a Creator answer or the AI helper's chat box keeps the caret.
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/plugin-api';
import type { SimFiles } from '@msm/sim';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { MerchantScreen } from '../../tryit/traders/MerchantScreen';
import { factsOf, LIVE_VIEW_DEBOUNCE_MS } from '../frame/live-data';
import { type MerchantSource, merchantFiles, merchantSource, newMerchant } from './merchant-model';

/** The words shown for Minecraft's own trades, which the preview cannot draw. */
export function unreadableLine(ids: readonly string[]): string {
  return `Minecraft's own trades are not drawn here: ${ids.join(', ')}.`;
}

/** The screen of one source, focus handed back after it opens. */
function MerchantMount(props: { source: MerchantSource; project: Project; seed: number }) {
  const before = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  const [generation, reset] = useReducer((n: number) => n + 1, 0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // A new generation (Close) is a fresh trader.
  const merchant = useMemo(() => {
    void generation;
    return newMerchant(props.source, props.seed);
  }, [props.source, props.seed, generation]);
  useEffect(() => {
    const had = before.current;
    if (had !== null && had !== document.body && typeof had.focus === 'function') {
      had.focus({ preventScroll: true });
    }
  }, []);
  return (
    <div className="relative h-80 overflow-hidden rounded border border-border">
      <MerchantScreen
        open={{
          mobId: 0,
          displayName: props.source.trader.displayName,
          merchant,
          origin: props.source.trader.origin,
        }}
        nameOf={(id) => thingName(props.project, id)}
        onTrade={(index, all) => {
          merchant.trade(index, all, props.source.sets, props.source.trades);
          rerender();
        }}
        onClose={reset}
      />
    </div>
  );
}

/** The merchant screen of `element` over `project`, or a line when it makes no trades. */
export function MerchantPart(props: { project: Project; element: Element; testId: string }) {
  const { project, element } = props;
  const facts = factsOf(project);
  const [files, setFiles] = useState<SimFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (facts === null) return;
    let live = true;
    const timer = setTimeout(() => {
      merchantFiles(project, facts).then(
        (made) => {
          if (!live) return;
          setFiles(made);
          setError(null);
        },
        (cause: unknown) => {
          if (live) setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
    }, LIVE_VIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, facts]);
  const name = thingName(project, element.id);
  const source = useMemo(
    () => (files === null || facts === null ? null : merchantSource(element, files, facts, name)),
    [files, facts, element, name],
  );
  if (facts === null) {
    return <p className="text-sm text-muted">The project’s Minecraft version is not known.</p>;
  }
  if (error !== null) {
    return (
      <p role="alert" className="text-sm text-error">
        The trades could not be read: {error}
      </p>
    );
  }
  if (files === null) return <p className="text-sm text-muted">Reading the trades…</p>;
  if (source === null) {
    return (
      <p className="text-sm text-muted" data-testid={`${props.testId}-none`}>
        This makes no trades.
      </p>
    );
  }
  const key = `${source.trader.levels.map((level) => level.tradeSet).join('|')}`;
  return (
    <div className="flex flex-col gap-2" data-testid={props.testId}>
      <MerchantMount key={key} source={source} project={project} seed={1} />
      {source.unreadable.length > 0 && (
        <p className="text-xs text-muted" data-testid={`${props.testId}-vanilla`}>
          {unreadableLine(source.unreadable)}
        </p>
      )}
    </div>
  );
}
