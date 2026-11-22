/**
 * One live view at a time over a set of things, the others in a strip above it picked by display
 * name (B615): the Creator's Live tab and the AI helper's See it pane. The strip's buttons are
 * `<testId>-thing-<n>` (from 1); the chosen thing's view is `BundleLiveView`. Looking applies
 * nothing.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import { useState } from 'react';
import { pngDataUrl } from '../preview/bundle-source';
import type { VanillaAssetReader } from '../preview/model-chain';
import BundleLiveView from './BundleLiveView';
import type { LiveThing } from './live-things';

/** Props of {@link LiveThings}. */
export interface LiveThingsProps {
  readonly project: Project;
  readonly things: readonly LiveThing[];
  /** The test id prefix (`creator-live`, `ai-see-it`). */
  readonly testId: string;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly mcVersion: string | null;
  readonly projectRoot: string | null;
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
  /** A thing's small picture for the strip, when there is one at hand. */
  readonly picture?: (thing: LiveThing) => Uint8Array | undefined;
  onSetup(): void;
}

/** The strip and the chosen thing's view. */
export default function LiveThings(props: LiveThingsProps) {
  const { things, testId } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  const current = things.find((thing) => thing.element.id === chosen) ?? things[0];
  if (current === undefined) return null;
  return (
    <div className="flex flex-col gap-2">
      {things.length > 1 && (
        <ul
          aria-label="Things"
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
          data-testid={`${testId}-things`}
        >
          {things.map((thing, index) => {
            const bytes = props.picture?.(thing);
            const selected = thing.element.id === current.element.id;
            return (
              <li key={thing.element.id}>
                <button
                  type="button"
                  data-testid={`${testId}-thing-${index + 1}`}
                  data-element={thing.element.id}
                  aria-pressed={selected}
                  title={thing.element.id}
                  onClick={() => setChosen(thing.element.id)}
                  className={
                    'flex cursor-pointer items-center gap-1 rounded border px-1.5 py-1 text-xs ' +
                    (selected ? 'border-accent bg-bg' : 'border-border')
                  }
                >
                  {bytes !== undefined && (
                    <img
                      alt=""
                      src={pngDataUrl(bytes)}
                      className="size-5 [image-rendering:pixelated]"
                    />
                  )}
                  <span>{thing.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {things.length === 1 && (
        <p
          className="text-xs text-muted"
          data-testid={`${testId}-thing-1`}
          data-element={current.element.id}
        >
          {current.name}
        </p>
      )}
      <BundleLiveView
        key={`${current.element.kind} ${current.element.id}`}
        project={props.project}
        element={current.element}
        vanillaAssets={props.vanillaAssets}
        mcVersion={props.mcVersion}
        projectRoot={props.projectRoot}
        {...(props.readProject === undefined ? {} : { readProject: props.readProject })}
        onSetup={props.onSetup}
      />
    </div>
  );
}
