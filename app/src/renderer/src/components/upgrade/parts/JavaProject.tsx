/**
 * The upgrade report's part **If you exported a Java project** (ADR 0136 D8, brief B822).
 * MCSuperMods does not own an ejected project's Java, so a move only advises: the user says
 * whether they changed the Java by hand, picks the project's folder (nothing records where a
 * project was ejected), the folder is read and never written, and **Save upgrade notes…**
 * writes one Markdown file where the user chooses. The notes come from `@msm/exporters`'
 * `upgradeNotes` over both targets' facts and the move's change sets; whether MCSuperMods can
 * export a Java project for the newer version is the newer target's own fact (`javaProject` or
 * `loadJavaProject`).
 *
 * Presentational: the host gives the two targets, the change sets of the move's hops and the
 * platform's scan and save. Plain words first; files, lines and ids under More options. No
 * sentence names a version: versions come from the targets.
 *
 * @packageDocumentation
 */

import {
  type JavaEditedByHand,
  type JavaProjectScan,
  type UpgradeNotes,
  upgradeAdviceSentences,
  upgradeNotes,
  upgradeNotesMarkdown,
} from '@msm/exporters';
import type { Target, TargetChangeSet } from '@msm/plugin-api';
import { useId, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { MoreOptions } from '../../ui/MoreOptions';
import { Part } from './shared';

/** The default name of the saved notes. */
export const UPGRADE_NOTES_FILE_NAME = 'UPGRADE-NOTES.md';

/** Saves a file where the user chooses (the platform's `dialogs.saveFile`). */
export type SaveNotesFile = (opts: {
  title: string;
  defaultName: string;
  filters?: { name: string; extensions: string[] }[];
  data: Uint8Array;
}) => Promise<string | null>;

/** Props of {@link JavaProject}. */
export interface JavaProjectProps {
  /** The target the mod moves (or moved) from. */
  from: Target;
  /** The target the mod moves (or moved) to. */
  to: Target;
  /** The change sets of the move's hops, in order (`changeSetsOf(dry.chain.steps)`). */
  changeSets: readonly TargetChangeSet[];
  /** The platform's read-only scan (`platform.exports.scanJavaProject`); without it no button. */
  scanJavaProject?: ((title: string) => Promise<JavaProjectScan | null>) | undefined;
  /** The platform's save dialog (`platform.dialogs.saveFile`). */
  saveFile: SaveNotesFile;
}

/** Whether MCSuperMods can export a Java project for `target` (its own fact). */
export function canEjectFor(target: Target): boolean {
  return target.javaProject !== undefined || target.loadJavaProject !== undefined;
}

/** The plain summary of what the notes found. */
export function javaProjectSummary(notes: UpgradeNotes): string {
  const lines = notes.buildLines.length;
  const places = notes.found.length;
  const lineWords =
    lines === 0 ? 'no build line' : lines === 1 ? '1 build line' : `${lines} build lines`;
  const placeWords =
    places === 0
      ? 'nothing in its data and assets'
      : places === 1
        ? '1 place in its data and assets'
        : `${places} places in its data and assets`;
  return `In this project, ${lineWords} and ${placeWords} need changing.`;
}

const EDITED_CHOICES: readonly { id: JavaEditedByHand; label: string }[] = [
  { id: 'unknown', label: 'Not sure' },
  { id: 'no', label: 'No' },
  { id: 'yes', label: 'Yes' },
];

type ScanState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'ready'; scan: JavaProjectScan }
  | { status: 'failed'; message: string };

/** The part. */
export function JavaProject(props: JavaProjectProps) {
  const { from, to, changeSets } = props;
  const [edited, setEdited] = useState<JavaEditedByHand>('unknown');
  const [state, setState] = useState<ScanState>({ status: 'idle' });
  const [saved, setSaved] = useState<{ path: string } | { error: string } | null>(null);
  const questionId = useId();
  const canEject = canEjectFor(to);
  const scan = state.status === 'ready' ? state.scan : undefined;
  const notes = useMemo(
    () =>
      scan === undefined
        ? undefined
        : upgradeNotes({ scan, from, to, canEject, changeSets, javaEdited: edited }),
    [scan, from, to, canEject, changeSets, edited],
  );

  const look = async (): Promise<void> => {
    if (props.scanJavaProject === undefined) return;
    setState({ status: 'reading' });
    setSaved(null);
    try {
      const result = await props.scanJavaProject('Choose the folder of your Java project');
      setState(result === null ? { status: 'idle' } : { status: 'ready', scan: result });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const save = async (): Promise<void> => {
    if (notes === undefined) return;
    try {
      const path = await props.saveFile({
        title: 'Save upgrade notes',
        defaultName: UPGRADE_NOTES_FILE_NAME,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        data: new TextEncoder().encode(upgradeNotesMarkdown(notes)),
      });
      if (path !== null) setSaved({ path });
    } catch (error) {
      setSaved({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Part id="java-project" title="If you exported a Java project">
      <p className="text-sm" data-testid="upgrade-java-intro">
        MCSuperMods never changes a Java project you exported. It can read the project’s folder and
        write notes on what to change there.
      </p>
      <p className="text-sm" data-testid="upgrade-java-eject">
        {canEject
          ? `MCSuperMods can export a Java project for Minecraft ${to.mcVersion}.`
          : `MCSuperMods cannot export a Java project for Minecraft ${to.mcVersion} yet.`}
      </p>
      <fieldset className="flex flex-col gap-1" aria-labelledby={questionId}>
        <legend id={questionId} className="text-sm">
          Have you changed the project’s Java by hand?
        </legend>
        <div className="flex gap-3">
          {EDITED_CHOICES.map((choice) => (
            <label key={choice.id} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`${questionId}-edited`}
                value={choice.id}
                data-testid={`upgrade-java-edited-${choice.id}`}
                checked={edited === choice.id}
                onChange={() => setEdited(choice.id)}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        {props.scanJavaProject !== undefined && (
          <Button
            data-testid="upgrade-java-look"
            disabled={state.status === 'reading'}
            onClick={() => void look()}
          >
            {notes === undefined ? 'Look at my Java project…' : 'Look at another folder…'}
          </Button>
        )}
        {notes !== undefined && (
          <Button data-testid="upgrade-java-save" onClick={() => void save()}>
            Save upgrade notes…
          </Button>
        )}
      </div>
      {state.status === 'reading' && (
        <p className="text-muted text-sm" data-testid="upgrade-java-reading">
          Reading the folder…
        </p>
      )}
      {state.status === 'failed' && (
        <p className="text-sm" role="alert" data-testid="upgrade-java-failed">
          The folder could not be read: {state.message}
        </p>
      )}
      {notes !== undefined && scan !== undefined && (
        <div className="flex flex-col gap-1" data-testid="upgrade-java-notes">
          {!notes.looksEjected && (
            <p className="text-sm" data-testid="upgrade-java-not-ejected">
              This folder does not look like a Java project MCSuperMods exported.
            </p>
          )}
          <p className="text-sm" data-testid="upgrade-java-summary">
            {javaProjectSummary(notes)}
          </p>
          {upgradeAdviceSentences(notes).map((sentence) => (
            <p key={sentence} className="text-sm" data-testid="upgrade-java-advice">
              {sentence}
            </p>
          ))}
          {notes.truncated && (
            <p className="text-muted text-sm" data-testid="upgrade-java-truncated">
              The folder is large, so not every file was read.
            </p>
          )}
          <MoreOptions storageKey="upgrade-java-project">
            <div className="flex flex-col gap-1 text-xs" data-testid="upgrade-java-details">
              <p>
                <code>{scan.folder}</code>
              </p>
              <ul className="flex flex-col gap-0.5">
                {notes.buildLines.map((line) => (
                  <li key={`${line.file} ${line.line}`} data-testid="upgrade-java-line">
                    <code>
                      {line.file}:{line.line}
                    </code>{' '}
                    <code>{line.now.trim()}</code>
                    {line.next !== undefined && (
                      <>
                        {' '}
                        becomes <code>{line.next.trim()}</code>
                      </>
                    )}
                  </li>
                ))}
                {notes.found.map((place) => (
                  <li
                    key={`${place.file} ${place.line} ${place.changeId} ${place.written ?? ''}`}
                    data-testid="upgrade-java-place"
                  >
                    <code>
                      {place.file}:{place.line}
                    </code>
                    {place.written !== undefined && (
                      <>
                        {' '}
                        <code>{place.written}</code>
                      </>
                    )}{' '}
                    {place.sentence}
                  </li>
                ))}
              </ul>
            </div>
          </MoreOptions>
        </div>
      )}
      {saved !== null && 'path' in saved && (
        <p className="text-sm" role="status" data-testid="upgrade-java-saved">
          Saved the upgrade notes.
        </p>
      )}
      {saved !== null && 'error' in saved && (
        <p className="text-sm" role="alert" data-testid="upgrade-java-save-failed">
          The notes could not be saved: {saved.error}
        </p>
      )}
    </Part>
  );
}
