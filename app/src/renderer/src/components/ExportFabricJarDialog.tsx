/**
 * The "Export Fabric mod jar" dialog (ADR 0026): renders the exporter's declared options
 * generically (ADR 0027 D2; booleans as checkboxes with their label and description) and
 * hands the chosen values to the host, which runs the export and asks where to save the jar.
 * Presentational: the host owns the session and the export.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ExporterOption } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { Modal } from './NewElementDialog';

/** Each option's default value, keyed by option id. */
export function defaultOptionValues(options: readonly ExporterOption[]): Record<string, Json> {
  const values: Record<string, Json> = {};
  for (const option of options) values[option.id] = option.default;
  return values;
}

export interface ExporterOptionFieldsProps {
  options: readonly ExporterOption[];
  values: Readonly<Record<string, Json>>;
  onChange(id: string, value: Json): void;
}

/** One labelled control per declared exporter option. */
export function ExporterOptionFields({ options, values, onChange }: ExporterOptionFieldsProps) {
  const base = useId();
  return (
    <div className="flex flex-col gap-2" data-testid="exporter-options">
      {options.map((option) => {
        const inputId = `${base}-${option.id}`;
        const descriptionId = `${inputId}-description`;
        // Only booleans exist in plugin API 0.6.0; `type` is checked so a later type is not
        // shown as a checkbox by mistake.
        if (option.type !== 'boolean') return null;
        return (
          <div key={option.id} className="flex items-start gap-2">
            <input
              id={inputId}
              type="checkbox"
              className="mt-1"
              data-testid={`exporter-option-${option.id}`}
              checked={values[option.id] === true}
              aria-describedby={option.description === undefined ? undefined : descriptionId}
              onChange={(event) => onChange(option.id, event.target.checked)}
            />
            <span className="flex flex-col">
              <label htmlFor={inputId}>{option.label}</label>
              {option.description !== undefined && (
                <span id={descriptionId} className="text-muted text-xs">
                  {option.description}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface ExportFabricJarDialogProps {
  /** The content-jar exporter's declared options. */
  options: readonly ExporterOption[];
  /**
   * Whether the project has entities: the jar then also nests GeckoLib, which needs a one-off
   * download, and the dialog says so.
   */
  hasEntities?: boolean;
  /** Runs the export with the chosen values (every declared option is present). */
  onExport(values: Record<string, Json>): void;
  onClose(): void;
}

/** Explains what the jar needs in game. */
export const FABRIC_JAR_DIALOG_NOTE =
  'The jar holds the project’s blocks, items, resources and data. Players need Fabric Loader and Fabric API.';

/** Shown when the project has entities (ADR 0029 D4). */
export const FABRIC_JAR_GECKOLIB_NOTE =
  'This project has entities, so the jar also nests GeckoLib, which draws their models and animations. MCSuperMods downloads GeckoLib once from Modrinth and keeps it for later exports.';

/** The problem code of a GeckoLib jar that is neither cached nor downloadable. */
export const GECKOLIB_MISSING_CODE = 'export.geckolib-missing';

/** What the host says when an export is blocked by {@link GECKOLIB_MISSING_CODE}. */
export const GECKOLIB_DOWNLOAD_MESSAGE =
  'GeckoLib could not be downloaded. A mod with entities needs a one-off download of GeckoLib: connect to the internet and try again, or choose "Separate runtime and GeckoLib (for modpacks)".';

/** What Test in Minecraft says when it is blocked by {@link GECKOLIB_MISSING_CODE}. */
export const GECKOLIB_TEST_DOWNLOAD_MESSAGE =
  'GeckoLib could not be downloaded. Testing a mod with entities needs a one-off download of GeckoLib: connect to the internet and try again.';

export function ExportFabricJarDialog({
  options,
  hasEntities,
  onExport,
  onClose,
}: ExportFabricJarDialogProps) {
  const [values, setValues] = useState<Record<string, Json>>(() => defaultOptionValues(options));
  return (
    <Modal
      title="Export Fabric mod jar"
      error={null}
      wide
      testId="fabric-jar-dialog"
      submitLabel="Export…"
      onCancel={onClose}
      onSubmit={() => onExport({ ...defaultOptionValues(options), ...values })}
    >
      <p className="text-muted text-sm">{FABRIC_JAR_DIALOG_NOTE}</p>
      {hasEntities === true && (
        <p className="text-muted text-sm" data-testid="fabric-jar-geckolib-note">
          {FABRIC_JAR_GECKOLIB_NOTE}
        </p>
      )}
      {options.length > 0 && (
        <ExporterOptionFields
          options={options}
          values={values}
          onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
        />
      )}
    </Modal>
  );
}
