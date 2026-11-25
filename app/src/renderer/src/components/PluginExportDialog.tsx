/**
 * The options dialog of a plugin exporter that declares options (Export menu "More exports"):
 * the exporter's options rendered generically, as in the Fabric mod jar dialog, then the host
 * runs the export and asks for a folder. Presentational: the host owns the session.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ExporterOption } from '@msm/plugin-api';
import { useState } from 'react';
import { defaultOptionValues, ExporterOptionFields } from './ExportFabricJarDialog';
import { Modal } from './NewElementDialog';

/** The dialog's first line: what it does, in the user's words (ADR 0130 D2). */
export function pluginExportIntro(displayName: string): string {
  return `Saves your mod as “${displayName}”, made by a plugin. The files go into a folder you choose next.`;
}

export interface PluginExportDialogProps {
  /** The exporter's display name, for the title. */
  displayName: string;
  /** The exporter's declared options. */
  options: readonly ExporterOption[];
  /** Runs the export with the chosen values (every declared option is present). */
  onExport(values: Record<string, Json>): void;
  onClose(): void;
}

export function PluginExportDialog({
  displayName,
  options,
  onExport,
  onClose,
}: PluginExportDialogProps) {
  const [values, setValues] = useState<Record<string, Json>>(() => defaultOptionValues(options));
  return (
    <Modal
      title={`Export ${displayName}`}
      error={null}
      testId="plugin-export-dialog"
      submitLabel="Export…"
      onCancel={onClose}
      onSubmit={() => onExport({ ...defaultOptionValues(options), ...values })}
    >
      <p className="text-sm" data-testid="plugin-export-dialog-intro">
        {pluginExportIntro(displayName)}
      </p>
      <ExporterOptionFields
        options={options}
        values={values}
        onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
      />
    </Modal>
  );
}
