/**
 * The "New project" dialog (ADR 0020): the project starters the registered plugins
 * contribute, grouped by category with layer badges. Submitting hands the chosen starter
 * (or `null` for a blank project) to the host, which asks for an empty folder and creates
 * the project there.
 *
 * @packageDocumentation
 */

import type { OutputLayer, ProjectStarter } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { Modal } from './NewElementDialog';

/** Props of {@link NewProjectDialog}. */
export interface NewProjectDialogProps {
  /** The starters to offer (`session.library.starters`: already limited to registered kinds). */
  starters: readonly ProjectStarter[];
  onCancel(): void;
  /** The chosen starter, or `null` for a blank project without a starter. */
  onSubmit(starter: ProjectStarter | null): void;
}

/** The id of the host's own blank entry, offered when no plugin contributes a blank starter. */
export const HOST_BLANK_ID = 'blank';

/** Headings of the starter categories, in display order. */
export const STARTER_GROUPS: readonly { category: ProjectStarter['category']; title: string }[] = [
  { category: 'blank', title: 'Blank' },
  { category: 'pack', title: 'Packs' },
  { category: 'content', title: 'Themed content' },
];

/** The badge text of an output layer. */
export function layerLabel(layer: OutputLayer): string {
  switch (layer) {
    case 'resourcepack':
      return 'Resource pack';
    case 'datapack':
      return 'Data pack';
    default:
      return 'Mod';
  }
}

/** One option of the list: a plugin starter, or the host's blank entry (`starter: null`). */
interface StarterOption {
  id: string;
  title: string;
  description: string;
  category: ProjectStarter['category'];
  layers: readonly OutputLayer[];
  starter: ProjectStarter | null;
}

/**
 * The options in display order: the starters by category, with a host "Blank project" entry
 * first when no starter is in the `blank` category.
 */
export function starterOptions(starters: readonly ProjectStarter[]): StarterOption[] {
  const options: StarterOption[] = starters.map((starter) => ({
    id: starter.id,
    title: starter.title,
    description: starter.description,
    category: starter.category,
    layers: starter.layers,
    starter,
  }));
  if (!starters.some((starter) => starter.category === 'blank')) {
    options.unshift({
      id: HOST_BLANK_ID,
      title: 'Blank project',
      description: 'A namespace and its pack.mcmeta, nothing else.',
      category: 'blank',
      layers: [],
      starter: null,
    });
  }
  const order = STARTER_GROUPS.map((group) => group.category);
  return options
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        order.indexOf(a.option.category) - order.indexOf(b.option.category) || a.index - b.index,
    )
    .map((entry) => entry.option);
}

/** Lists the project starters; the host creates the project on submit. */
export function NewProjectDialog(props: NewProjectDialogProps) {
  const options = starterOptions(props.starters);
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? HOST_BLANK_ID);
  const selected = options.find((option) => option.id === selectedId);
  const hintId = useId();

  return (
    <Modal
      title="New project"
      error={null}
      wide
      testId="new-project-dialog"
      submitLabel="Choose folder and create"
      onCancel={props.onCancel}
      onSubmit={() => props.onSubmit(selected?.starter ?? null)}
    >
      <p id={hintId} className="text-xs text-muted">
        Pick a starting point. Next you choose an empty folder; its name becomes the project's
        namespace.
      </p>
      <div
        role="radiogroup"
        aria-label="Starter"
        aria-describedby={hintId}
        className="flex max-h-[55vh] flex-col gap-2 overflow-auto"
        data-testid="starter-picker"
      >
        {STARTER_GROUPS.map((group) => {
          const entries = options.filter((option) => option.category === group.category);
          if (entries.length === 0) return null;
          return (
            <fieldset
              key={group.category}
              data-testid={`starter-group-${group.category}`}
              className="m-0 min-w-0 border-0 p-0 flex flex-col gap-1"
            >
              <legend className="text-xs font-semibold tracking-wide text-muted uppercase">
                {group.title}
              </legend>
              {entries.map((option) => (
                <label
                  key={option.id}
                  className={
                    'flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 ' +
                    (option.id === selectedId ? 'border-accent bg-bg' : 'border-border')
                  }
                >
                  <input
                    type="radio"
                    name="starter"
                    value={option.id}
                    className="mt-1"
                    data-testid={`starter-${option.id}`}
                    checked={option.id === selectedId}
                    onChange={() => setSelectedId(option.id)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{option.title}</span>
                      {option.layers.map((layer) => (
                        <span
                          key={layer}
                          className="rounded border border-border px-1 text-[0.7rem] text-muted"
                          data-testid={`starter-${option.id}-layer-${layer}`}
                        >
                          {layerLabel(layer)}
                        </span>
                      ))}
                    </span>
                    <span className="text-xs text-muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </Modal>
  );
}
