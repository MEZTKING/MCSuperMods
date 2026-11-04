import type { ResourceLocation } from '@msm/core';
import { Dialog } from 'radix-ui';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { Button } from './ui/Button';

const fieldClass = 'rounded border border-border bg-bg px-2 py-1';

function Modal(props: {
  title: string;
  error: string | null;
  onCancel(): void;
  onSubmit(): void;
  children: ReactNode;
}) {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <form onSubmit={submit} className="flex flex-col gap-1.5">
            <Dialog.Title className="mb-1.5 text-base font-semibold">{props.title}</Dialog.Title>
            {props.children}
            {props.error !== null && (
              <p className="whitespace-pre-line text-error" role="alert">
                {props.error}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              <Button type="submit">Add</Button>
              <Dialog.Close asChild>
                <Button>Cancel</Button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function attempt(action: () => void, setError: (error: string | null) => void): void {
  try {
    action();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

/** Asks for a namespace name. */
export function NewNamespaceDialog(props: { onCancel(): void; onSubmit(name: string): void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  return (
    <Modal
      title="Add namespace"
      error={error}
      onCancel={props.onCancel}
      onSubmit={() => attempt(() => props.onSubmit(name.trim()), setError)}
    >
      <label htmlFor={inputId}>Name</label>
      <input
        id={inputId}
        className={fieldClass}
        value={name}
        placeholder="my_mod"
        onChange={(event) => setName(event.target.value)}
      />
    </Modal>
  );
}

/** Asks for a new element's namespace, path and kind. */
export function NewElementDialog(props: {
  namespaces: readonly string[];
  kinds: readonly string[];
  onCancel(): void;
  onSubmit(input: { id: ResourceLocation; kind: string }): void;
}) {
  const [namespace, setNamespace] = useState(props.namespaces[0] ?? '');
  const [path, setPath] = useState('');
  const [kind, setKind] = useState(props.kinds[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const namespaceId = useId();
  const pathId = useId();
  const kindId = useId();
  return (
    <Modal
      title="Add element"
      error={error}
      onCancel={props.onCancel}
      onSubmit={() =>
        attempt(() => {
          const trimmed = path.trim();
          if (trimmed === '') throw new Error('Enter a path, for example "iron_block".');
          props.onSubmit({ id: `${namespace}:${trimmed}`, kind });
        }, setError)
      }
    >
      <label htmlFor={namespaceId}>Namespace</label>
      <select
        id={namespaceId}
        className={fieldClass}
        value={namespace}
        onChange={(event) => setNamespace(event.target.value)}
      >
        {props.namespaces.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <label htmlFor={pathId}>Path</label>
      <input
        id={pathId}
        className={fieldClass}
        value={path}
        placeholder="iron_block"
        onChange={(event) => setPath(event.target.value)}
      />
      <label htmlFor={kindId}>Kind</label>
      <select
        id={kindId}
        className={fieldClass}
        value={kind}
        onChange={(event) => setKind(event.target.value)}
      >
        {props.kinds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </Modal>
  );
}
