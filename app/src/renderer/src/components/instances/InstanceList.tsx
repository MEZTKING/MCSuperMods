/**
 * Settings' "Instances MSM made" (ADR 0133 D3, D5; B764): every launcher instance and server
 * MCSuperMods made, each with what it is for in words, **Show in folder** and **Remove** (after
 * a question, into the recycle bin), and the setting "Ask before making an instance". Folders and
 * ids show only under More options (ADR 0130). Main finds the things (`instances.list`) and is
 * the only one that removes them, and only those that hold its marker.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  AppSettingsPatch,
  AppSettingsView,
  InstanceAskSetting,
  InstanceSettings,
  InstancesPlatform,
  ManagedThing,
} from '../../../../shared/platform';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { MoreOptions } from '../ui/MoreOptions';
import {
  ASK_CHOICES,
  INSTANCE_WORDS,
  thingDetails,
  thingPurpose,
  thingState,
  thingTitle,
} from './words';

/** The defaults main uses when the settings hold none (ADR 0133 D3). */
const DEFAULT_SETTINGS: InstanceSettings = { ask: 'first-time', madeByItself: [] };

const badgeClass =
  'inline-flex items-center rounded border border-border bg-bg px-1.5 py-px text-xs leading-4';

const errorText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : String(problem);

/** Props of {@link InstanceList}. */
export interface InstanceListProps {
  instances: Pick<InstancesPlatform, 'list' | 'remove' | 'showInFolder'>;
  load(): Promise<AppSettingsView>;
  save(settings: AppSettingsPatch): Promise<void>;
}

/** The "Instances MSM made" part of Settings' Game locations. */
export function InstanceList(props: InstanceListProps) {
  const { instances, load, save } = props;
  const [things, setThings] = useState<ManagedThing[] | null>(null);
  const [settings, setSettings] = useState<InstanceSettings | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const askId = useId();
  const box = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setThings(await instances.list());
    } catch (problem) {
      setThings([]);
      setError(errorText(problem));
    }
  }, [instances]);

  useEffect(() => {
    let live = true;
    load().then(
      (view) => {
        if (live) setSettings(view.instances ?? DEFAULT_SETTINGS);
      },
      (problem: unknown) => {
        if (live) setError(errorText(problem));
      },
    );
    void refresh();
    return () => {
      live = false;
    };
  }, [load, refresh]);

  /** Focuses a control of the row `index` by its test id suffix, after the next render. */
  const focusRow = (index: number, part: string): void => {
    requestAnimationFrame(() => {
      box.current
        ?.querySelector<HTMLElement>(`[data-testid="settings-instance-${index}-${part}"]`)
        ?.focus();
    });
  };

  const store = async (next: InstanceSettings): Promise<void> => {
    const previous = settings;
    setSettings(next);
    setError(null);
    try {
      await save({ instances: next });
    } catch (problem) {
      setSettings(previous);
      setError(errorText(problem));
    }
  };

  const showInFolder = async (thing: ManagedThing): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      const result = await instances.showInFolder(thing.id);
      if (!result.ok) setError(result.message);
    } catch (problem) {
      setError(errorText(problem));
    }
  };

  const remove = async (thing: ManagedThing): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await instances.remove(thing.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAsking(null);
      setNotice(INSTANCE_WORDS.removed(thingTitle(thing)));
      await refresh();
      requestAnimationFrame(() => noticeRef.current?.focus());
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  };

  const ask = settings?.ask ?? DEFAULT_SETTINGS.ask;
  const madeByItself = settings?.madeByItself ?? [];

  return (
    <section
      ref={box}
      className="flex min-w-0 flex-col gap-1.5"
      data-testid="settings-instances"
      data-setting="instances-list"
      aria-label={INSTANCE_WORDS.listTitle}
    >
      <h4 className="mt-1 text-sm font-semibold" data-setting-label>
        {INSTANCE_WORDS.listTitle}
      </h4>
      <p className="text-xs text-muted">{INSTANCE_WORDS.listIntro}</p>
      {things === null && (
        <p className="text-sm text-muted" data-testid="settings-instances-loading">
          {INSTANCE_WORDS.listLoading}
        </p>
      )}
      {things !== null && things.length === 0 && (
        <p className="text-sm text-muted" data-testid="settings-instances-empty">
          {INSTANCE_WORDS.listEmpty}
        </p>
      )}
      {things !== null && things.length > 0 && (
        <ul
          className="m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label={INSTANCE_WORDS.listTitle}
        >
          {things.map((thing, index) => {
            const title = thingTitle(thing);
            const state = thingState(thing);
            return (
              <li
                key={thing.id}
                data-testid={`settings-instance-${index}`}
                data-kind={thing.kind}
                className="flex flex-col gap-0.5 rounded border border-border p-2"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{title}</span>
                  {thing.running && <span className={badgeClass}>{INSTANCE_WORDS.running}</span>}
                </span>
                <span className="text-sm" data-testid={`settings-instance-${index}-purpose`}>
                  {thingPurpose(thing)}
                </span>
                <span className="text-xs text-muted">{thingDetails(thing)}</span>
                {state !== null && !thing.running && (
                  <span className="text-xs text-muted">{state}</span>
                )}
                {asking === thing.id ? (
                  <fieldset
                    className="m-0 mt-1 flex min-w-0 flex-col gap-1 border-0 p-0"
                    data-testid={`settings-instance-${index}-confirm`}
                  >
                    <legend className="mb-1 p-0 text-sm">{INSTANCE_WORDS.removeAsk(title)}</legend>
                    <span className="flex flex-wrap gap-1.5">
                      <Button
                        data-testid={`settings-instance-${index}-remove-yes`}
                        disabled={busy}
                        onClick={() => void remove(thing)}
                      >
                        {INSTANCE_WORDS.removeYes}
                      </Button>
                      <Button
                        data-testid={`settings-instance-${index}-remove-no`}
                        disabled={busy}
                        onClick={() => {
                          setAsking(null);
                          focusRow(index, 'remove');
                        }}
                      >
                        {INSTANCE_WORDS.removeNo}
                      </Button>
                    </span>
                  </fieldset>
                ) : (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Button
                      data-testid={`settings-instance-${index}-show`}
                      aria-label={`${INSTANCE_WORDS.showInFolder}: ${title}`}
                      onClick={() => void showInFolder(thing)}
                    >
                      {INSTANCE_WORDS.showInFolder}
                    </Button>
                    <Button
                      data-testid={`settings-instance-${index}-remove`}
                      aria-label={`${INSTANCE_WORDS.remove}: ${title}`}
                      disabled={busy || thing.running || asking !== null}
                      onClick={() => {
                        setNotice(null);
                        setAsking(thing.id);
                        focusRow(index, 'remove-no');
                      }}
                    >
                      {INSTANCE_WORDS.remove}
                    </Button>
                    {thing.running && (
                      <span className="text-xs text-muted">{INSTANCE_WORDS.stopFirst}</span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {things !== null && things.length > 0 && (
        <MoreOptions storageKey="settings-instances">
          <dl className="m-0 flex flex-col gap-1 text-xs" data-testid="settings-instances-more">
            {things.map((thing) => (
              <div key={thing.id} className="flex flex-col">
                <dt className="font-medium">{thingTitle(thing)}</dt>
                <dd className="m-0 break-all font-mono [overflow-wrap:anywhere]">{thing.path}</dd>
                <dd className="m-0 break-all font-mono text-muted [overflow-wrap:anywhere]">
                  {thing.id}
                </dd>
              </div>
            ))}
          </dl>
        </MoreOptions>
      )}
      <div className="flex min-w-0 flex-col gap-1" data-setting="instances-ask">
        <label htmlFor={askId} className="text-sm" data-setting-label>
          {INSTANCE_WORDS.askTitle}
        </label>
        <select
          id={askId}
          data-testid="settings-instances-ask"
          className={`${fieldClass} self-start`}
          value={ask}
          disabled={settings === null}
          aria-describedby={`${askId}-hint`}
          onChange={(event) =>
            void store({
              ask: event.target.value as InstanceAskSetting,
              madeByItself,
            })
          }
        >
          {ASK_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span id={`${askId}-hint`} className="text-xs text-muted">
          {INSTANCE_WORDS.askHint}
        </span>
        {ask === 'first-time' && madeByItself.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <span data-testid="settings-instances-made-by-itself">
              {INSTANCE_WORDS.madeByItself(madeByItself)}
            </span>
            <Button
              data-testid="settings-instances-ask-again"
              onClick={() => void store({ ask, madeByItself: [] })}
            >
              {INSTANCE_WORDS.askAgain}
            </Button>
          </span>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-error" data-testid="settings-instances-error">
          {error}
        </p>
      )}
      {notice !== null && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className="text-sm"
          role="status"
          data-testid="settings-instances-notice"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
