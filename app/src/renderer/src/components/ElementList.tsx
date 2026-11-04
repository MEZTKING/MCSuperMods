import type { Project, ResourceLocation } from '@msm/core';

/** Props of {@link ElementList}. */
export interface ElementListProps {
  project: Project | null;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
}

/** The project's elements, grouped by namespace. */
export function ElementList({ project, selectedId, onSelect, onRemove }: ElementListProps) {
  return (
    <nav className="element-list" aria-label="Elements">
      {project === null ? (
        <p className="empty">No project is open. Use New or Open.</p>
      ) : project.namespaces.length === 0 ? (
        <p className="empty">No namespaces yet. Use Add namespace.</p>
      ) : (
        project.namespaces.map((namespace) => (
          <section key={namespace.name} aria-label={`Namespace ${namespace.name}`}>
            <h2>{namespace.name}</h2>
            {namespace.elements.length === 0 ? (
              <p className="empty">No elements.</p>
            ) : (
              <ul>
                {namespace.elements.map((element) => (
                  <li key={element.id}>
                    <button
                      type="button"
                      className="element-button"
                      aria-current={element.id === selectedId ? 'true' : undefined}
                      onClick={() => onSelect(element.id)}
                    >
                      <span>{element.id}</span>
                      <span className="kind">{element.kind}</span>
                    </button>
                    <button
                      type="button"
                      className="remove-button"
                      aria-label={`Remove ${element.id}`}
                      title={`Remove ${element.id}`}
                      onClick={() => onRemove(element.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </nav>
  );
}
