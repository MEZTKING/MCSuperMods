/**
 * The Block Studio's 3D preview of a typed block's models (B272, ADR 0069 D5): the model of one
 * slot (the made models from `textures`, own models or the Model field), drawn over the
 * project with the generated models laid over it in memory (`typePreviewProject`, nothing is
 * applied). A crop shows a stage slider instead of the slot picker: each age shows the stage
 * model the game would. A portal (ADR 0078 D1) shows its pane for either axis ("Along x" or
 * "Along z"), the frame standing either way. The host gives the folders, the project's assets and the vanilla cache
 * (`modelPreview`); without it the section is not shown. deepslate loads lazily, only with
 * WebGL.
 *
 * B452 (ADR 0101 D1): the new types draw their made models the same way (crosses, cube parts
 * and vanilla's templates for each type, slot names in words); when there is no model to draw or
 * no WebGL, the block's main picture is shown flat instead; a sign or hanging sign also shows
 * its writing screen picture (the asset at `signGuiTextureId`).
 *
 * B516 (ADR 0112 D1): the growing plants and flower pot of ADR 0103 draw their made models the
 * same way (tip and strand, stalks, leaves, the empty pot), with a line on what shows in game only.
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/core';
import { signGuiTextureId } from '@msm/plugin-blocks-items';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { inputClass } from '../../forms';
import { hasWebGL } from '../../preview/webgl';
import { Section } from '../worldgen/parts';
import {
  appearanceTexture,
  type BlockTypeName,
  blockTypeOfData,
  isSignType,
  modelSlotLabel,
  slotModelRows,
  typePreviewProject,
} from './block-type-model';
import { useBlocksItemsStudioHost } from './host';
import { cropMaxAge, cropStageModel } from './plant-model';
import { TextureThumbnail } from './TexturesSection';

/** What the preview says about a look the game draws but the preview cannot. */
const IN_GAME_ONLY: Readonly<Partial<Record<BlockTypeName, string>>> = {
  leaves: 'The leaf tint shows in game only.',
  portal: 'The pane fills the frame; the surface moves in game.',
  stem: "The stem's colour by age shows in game only.",
  torch: 'The flame particle shows in game only.',
  bed: 'In game the head and foot are two blocks side by side.',
  tall_plant: 'In game the upper half stands on the lower half.',
  // ADR 0103 (B516).
  growing_plant: 'In game the strand grows behind its tip, one block at a time.',
  column_plant: 'In game the stalk stacks up block by block.',
  multiface: 'In game it covers each side of a block it is placed on.',
  dripleaf: 'In game the leaf stands on its stem and tips under whoever stands on it.',
  flower_pot: 'In game each plant it takes shows in the pot.',
};

/** The block's main picture, flat, with words (no model to draw, or no WebGL). */
function FlatPicture(props: { texture: string | undefined; reason: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="block-preview-picture">
      {props.texture !== undefined && (
        <TextureThumbnail texture={props.texture} testId="block-preview-picture-image" />
      )}
      <span className="text-muted">{props.reason}</span>
    </div>
  );
}

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
  const picture = appearanceTexture(project, element.data);
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
                  {modelSlotLabel(entry.slot, type)}
                </option>
              ))}
            </select>
          </div>
        )
      )}
      {isSignType(type) && (
        <div className="flex items-center gap-2 text-xs" data-testid="block-preview-sign-gui">
          <TextureThumbnail
            texture={signGuiTextureId(element.id, type)}
            testId="block-preview-sign-gui-image"
          />
          <span className="text-muted">
            Writing screen picture ({signGuiTextureId(element.id, type)})
          </span>
        </div>
      )}
      {model === undefined ? (
        picture === undefined ? (
          <p className="text-muted text-xs" data-testid="block-preview-empty">
            Nothing to show yet: set a texture or a model.
          </p>
        ) : (
          <FlatPicture texture={picture} reason="No model to draw yet; this is its picture." />
        )
      ) : (
        <>
          <p className="text-muted text-xs" data-testid="block-preview-model">
            Shows <span className="font-mono">{model}</span>.
            {IN_GAME_ONLY[type] === undefined ? '' : ` ${IN_GAME_ONLY[type]}`}
          </p>
          {!webgl ? (
            <>
              <p role="status" className="text-muted text-xs">
                3D preview unavailable: WebGL is disabled.
              </p>
              {picture !== undefined && <FlatPicture texture={picture} reason="Its picture." />}
            </>
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
