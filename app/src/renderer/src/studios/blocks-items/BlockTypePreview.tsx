/**
 * The Block Studio's 3D preview of a typed block's models (B272, ADR 0069 D5): the model of one
 * slot (the made models from `textures`, own models or the Model field), drawn over the
 * project with the generated models laid over it in memory (`typePreviewProject`, nothing is
 * applied). A crop shows a stage slider instead of the slot picker: each age shows the stage
 * model the game would. The host gives the folders, the project's assets and the vanilla cache
 * (`modelPreview`); without it the section is not shown. deepslate loads lazily, only with
 * WebGL.
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/core';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { inputClass } from '../../forms';
import { hasWebGL } from '../../preview/webgl';
import { Section } from '../worldgen/parts';
import {
  blockTypeOfData,
  modelSlotLabel,
  slotModelRows,
  typePreviewProject,
} from './block-type-model';
import { useBlocksItemsStudioHost } from './host';
import { cropMaxAge, cropStageModel } from './plant-model';

const PreviewCanvas = lazy(() => import('../../preview/PreviewCanvas'));

/** Props of {@link BlockTypePreview}. */
export interface BlockTypePreviewProps {
  project: Project;
  element: Element;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
}

export function BlockTypePreview(props: BlockTypePreviewProps) {
  const { project, element } = props;
  const host = useBlocksItemsStudioHost();
  const preview = host?.modelPreview;
  const type = blockTypeOfData(element.data);
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const slotId = useId();
  const ageId = useId();
  const previewProject = useMemo(() => typePreviewProject(project, element), [project, element]);
  if (preview === undefined || type === undefined || type === 'block') return null;
  const rows = slotModelRows(element).filter(
    (row) => row.model !== undefined && row.slot !== 'item',
  );
  const crop = type === 'crop';
  const maxAge = cropMaxAge(element.data);
  const shownAge = Math.min(age ?? maxAge, maxAge);
  const row = rows.find((entry) => entry.slot === chosenSlot) ?? rows[0];
  const model = crop ? cropStageModel(element, shownAge) : row?.model;
  const webgl = props.webgl ?? hasWebGL();
  return (
    <Section title="Preview" testId="block-type-preview">
      {crop ? (
        <div className="flex flex-col gap-0.5 text-xs">
          <label htmlFor={ageId} className="text-muted">
            Stage (age {shownAge} of {maxAge})
          </label>
          <input
            id={ageId}
            type="range"
            min={0}
            max={maxAge}
            step={1}
            value={shownAge}
            data-testid="block-preview-stage"
            onChange={(event) => setAge(Number(event.target.value))}
          />
        </div>
      ) : (
        rows.length > 1 && (
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={slotId} className="text-muted">
              Model shown
            </label>
            <select
              id={slotId}
              className={inputClass}
              data-testid="block-preview-slot"
              value={row?.slot ?? ''}
              onChange={(event) => setChosenSlot(event.target.value)}
            >
              {rows.map((entry) => (
                <option key={entry.slot} value={entry.slot}>
                  {modelSlotLabel(entry.slot)}
                </option>
              ))}
            </select>
          </div>
        )
      )}
      {model === undefined ? (
        <p className="text-muted text-xs" data-testid="block-preview-empty">
          Nothing to show yet: set a texture or a model.
        </p>
      ) : (
        <>
          <p className="text-muted text-xs" data-testid="block-preview-model">
            Shows <span className="font-mono">{model}</span>
            {type === 'leaves' ? '. The leaf tint shows in game only.' : '.'}
          </p>
          {!webgl ? (
            <p role="status" className="text-muted text-xs">
              3D preview unavailable: WebGL is disabled.
            </p>
          ) : (
            <div className="w-56 max-w-full" data-testid="block-preview-canvas">
              <Suspense fallback={<p className="text-muted text-xs">Loading preview…</p>}>
                <PreviewCanvas
                  key={`${model}-${host?.revision ?? 0}`}
                  project={previewProject}
                  folders={preview.folders}
                  subject={{
                    previewKind: 'block_definition',
                    id: element.id,
                    data: { variants: { '': { model } } },
                  }}
                  readProjectAsset={preview.readProjectAsset}
                  vanilla={preview.vanilla}
                />
              </Suspense>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
