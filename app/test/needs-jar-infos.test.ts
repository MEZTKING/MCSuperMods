/**
 * The `controls.needs-jar` and `vehicles.needs-jar` infos on vanilla pack exports
 * (ADR 0088 D10, ADR 0090 D14; B415): one each, only when the project has the kinds.
 */

import type { Element, Project } from '@msm/core';
import type { ExportReport } from '@msm/exporters';
import { describe, expect, it } from 'vitest';
import {
  CONTROLS_NEEDS_JAR_CODE,
  VEHICLES_NEEDS_JAR_CODE,
  withControlsNeedJar,
  withVehicleNeedsJar,
} from '../src/renderer/src/session/project-session';

const element = (id: string, kind: string): Element =>
  ({ id, kind, data: {}, meta: {} }) as unknown as Element;
const project = (elements: Element[]): Project =>
  ({ name: 'Ruby', namespaces: [{ name: 'demo', elements, assets: [] }] }) as unknown as Project;
const report: ExportReport = { ok: true, files: [], problems: [] };

describe('needs-jar infos', () => {
  it('adds one controls info for key binds and HUD elements together', () => {
    const out = withControlsNeedJar(
      report,
      project([element('demo:a', 'msm:key_bind'), element('demo:b', 'msm:hud')]),
    );
    expect(out.problems.map((p) => [p.severity, p.code])).toEqual([
      ['info', CONTROLS_NEEDS_JAR_CODE],
    ]);
    expect(out.ok).toBe(true);
  });

  it('adds one vehicles info', () => {
    const out = withVehicleNeedsJar(
      report,
      project([element('demo:a', 'msm:vehicle'), element('demo:b', 'msm:vehicle')]),
    );
    expect(out.problems.map((p) => p.code)).toEqual([VEHICLES_NEEDS_JAR_CODE]);
  });

  it('adds nothing without the kinds', () => {
    const plain = project([element('demo:a', 'msm:item')]);
    expect(withControlsNeedJar(report, plain)).toBe(report);
    expect(withVehicleNeedsJar(report, plain)).toBe(report);
  });
});
