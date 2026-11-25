/**
 * The "Export Fabric mod jar" dialog (ADR 0026): renders the exporter's declared options
 * generically (ADR 0027 D2; booleans as checkboxes with their label and description) and
 * hands the chosen values to the host, which runs the export and asks where to save the jar.
 * Presentational: the host owns the session and the export.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ExporterOption, Project } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { Modal } from './NewElementDialog';
import { MoreOptions } from './ui/MoreOptions';

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
  /**
   * Whether the jar nests GeckoLib (ADR 0072 D5, {@link projectNeedsGeckolib}). `false` with
   * entities shows {@link FABRIC_JAR_VANILLA_RENDERER_NOTE} instead of the GeckoLib note;
   * absent keeps the GeckoLib note for any entity.
   */
  needsGeckolib?: boolean;
  /** Runs the export with the chosen values (every declared option is present). */
  onExport(values: Record<string, Json>): void;
  onClose(): void;
}

/** The dialog's title. */
export const FABRIC_JAR_DIALOG_TITLE = 'Save the mod as a file';

/** The dialog's first line: what it does, in the user's words (ADR 0130 D2). */
export const FABRIC_JAR_DIALOG_INTRO =
  'Saves your whole mod as one file (a .jar). Put it in the mods folder of a Minecraft that has Fabric, or give it to friends.';

/** Explains what the jar holds and needs in game, in plain words. */
export const FABRIC_JAR_DIALOG_NOTE =
  'The file holds your mod’s blocks, items, mobs, pictures and rules. Players need Minecraft with Fabric to use it.';

/** The same, by the mods' own names (under More options). */
export const FABRIC_JAR_REQUIREMENTS =
  'Players need Fabric Loader and Fabric API in their mods folder.';

/** Shown when the mod has mobs (ADR 0029 D4). */
export const FABRIC_JAR_GECKOLIB_NOTE =
  'Your mod has mobs, so the file also holds GeckoLib, which draws their models and animations. MCSuperMods downloads GeckoLib once from Modrinth and keeps it for later.';

/** Shown when the mod has mobs but none needs GeckoLib on this version (ADR 0072 D5). */
export const FABRIC_JAR_VANILLA_RENDERER_NOTE =
  'Your mod’s mobs are drawn by MCSuperMods’ own renderer on this Minecraft version, so the file needs no GeckoLib.';

/**
 * Whether exporting `project` for a target nests GeckoLib, from the entity elements'
 * `msm:animated_model.renderer` (ADR 0072 D5, as `needsGeckolib` of `@msm/exporters` reads the
 * lowered files): `geckolib` always, `auto` (or absent) when the target has GeckoLib, `vanilla`
 * never.
 */
export function projectNeedsGeckolib(
  project: Project | null | undefined,
  target: { readonly geckolib?: unknown } | null | undefined,
): boolean {
  if (project === null || project === undefined) return false;
  const hasGeckolib = target?.geckolib !== undefined && target?.geckolib !== null;
  return project.namespaces.some((namespace) =>
    namespace.elements.some((element) => {
      if (element.kind !== 'msm:entity') return false;
      const data = element.data;
      const components =
        typeof data === 'object' && data !== null && !Array.isArray(data) ? data.components : null;
      const model =
        typeof components === 'object' && components !== null && !Array.isArray(components)
          ? components['msm:animated_model']
          : null;
      const renderer =
        typeof model === 'object' && model !== null && !Array.isArray(model)
          ? model.renderer
          : undefined;
      if (renderer === 'geckolib') return true;
      if (renderer === 'vanilla') return false;
      return hasGeckolib;
    }),
  );
}

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
  needsGeckolib,
  onExport,
  onClose,
}: ExportFabricJarDialogProps) {
  const [values, setValues] = useState<Record<string, Json>>(() => defaultOptionValues(options));
  return (
    <Modal
      title={FABRIC_JAR_DIALOG_TITLE}
      error={null}
      wide
      testId="fabric-jar-dialog"
      submitLabel="Export…"
      onCancel={onClose}
      onSubmit={() => onExport({ ...defaultOptionValues(options), ...values })}
    >
      <p className="text-sm" data-testid="fabric-jar-dialog-intro">
        {FABRIC_JAR_DIALOG_INTRO}
      </p>
      <p className="text-muted text-sm">{FABRIC_JAR_DIALOG_NOTE}</p>
      {hasEntities === true && needsGeckolib !== false && (
        <p className="text-muted text-sm" data-testid="fabric-jar-geckolib-note">
          {FABRIC_JAR_GECKOLIB_NOTE}
        </p>
      )}
      {hasEntities === true && needsGeckolib === false && (
        <p className="text-muted text-sm" data-testid="fabric-jar-vanilla-renderer-note">
          {FABRIC_JAR_VANILLA_RENDERER_NOTE}
        </p>
      )}
      <MoreOptions storageKey="dialog-fabric-jar">
        <p className="text-muted text-sm" data-testid="fabric-jar-requirements">
          {FABRIC_JAR_REQUIREMENTS}
        </p>
        {options.length > 0 && (
          <ExporterOptionFields
            options={options}
            values={values}
            onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
          />
        )}
      </MoreOptions>
    </Modal>
  );
}
