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
      <p className="text-muted text-sm">The files are written into a folder you choose next.</p>
      <ExporterOptionFields
        options={options}
        values={values}
        onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
      />
    </Modal>
  );
}
