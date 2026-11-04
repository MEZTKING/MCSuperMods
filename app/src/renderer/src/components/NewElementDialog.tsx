import type { ResourceLocation } from '@msm/core';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

function Modal(props: {
  title: string;
  error: string | null;
  onCancel(): void;
  onSubmit(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className="dialog-title">
          {props.title}
        </h2>
        {props.children}
        {props.error !== null && (
          <p className="error" role="alert">
            {props.error}
          </p>
        )}
        <div className="actions">
          <button type="submit">Add</button>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
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
        value={path}
        placeholder="iron_block"
        onChange={(event) => setPath(event.target.value)}
      />
      <label htmlFor={kindId}>Kind</label>
      <select id={kindId} value={kind} onChange={(event) => setKind(event.target.value)}>
        {props.kinds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </Modal>
  );
}
