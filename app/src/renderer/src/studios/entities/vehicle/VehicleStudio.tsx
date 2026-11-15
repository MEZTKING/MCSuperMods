/**
 * The Vehicle Studio (B419, ADR 0091 D1) for `msm:vehicle` element data (ADR 0090 D2): a live 3D
 * preview (the turret follows the mouse, Drive spins wheels, rotors and propellers, seats and
 * muzzles show as markers), then the sections Name and size, Model and paint (with "Make a starter
 * model"), Movement, Seats (dragged on a seat plan), Engine and fuel, Health and repair, Weapons,
 * Turret, Parts, Storage, Item, Camera, Exhaust, the Rules section (ADR 0082) and the events
 * editor with the vehicle's triggers. Bone pickers read the bones of the vehicle's geometry.
 *
 * Very easy (ADR 0083 D3) shows the preview, a short "Basics" form and Rules. Everything else stays
 * behind "Advanced (all fields)". Loaded lazily (its own chunk) by `../studios.tsx`.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { lazy, Suspense, useState } from 'react';
import { eventNames, pathSetter } from '../../blocks-items/blocks-items-model';
import { EventsEditor } from '../../blocks-items/EventsEditor';
import { ProblemsAt } from '../../blocks-items/parts';
import { projectPortals } from '../../blocks-items/portal-model';
import { RulesSlot } from '../../RulesSlot';
import { projectHandlers } from '../../scripting/script-model';
import type { StudioProps } from '../../types';
import { useVeryEasyLayout } from '../../very-easy';
import { AdvancedToggle } from '../../worldgen/parts';
import { BasicsSection } from './BasicsSection';
import { ModelSection } from './ModelSection';
import { MovementSection } from './MovementSection';
import type { VehicleSectionProps } from './parts';
import { SeatsSection } from './SeatsSection';
import {
  CameraSection,
  EngineSection,
  ExhaustSection,
  HealthSection,
  IdentitySection,
  ItemSection,
  StorageSection,
  VehicleTriggers,
} from './sections';
import { VehiclePreview } from './VehiclePreview';
import { missingBones, vehicleBones } from './vehicle-model';
import { PartsSection, TurretSection, WeaponsSection } from './WeaponsSection';

/** The Rules section (ADR 0082 D7 (b)), a chunk of its own. */
const RulesSection = lazy(() => import('../../rules/RulesSection'));

/** The Vehicle Studio. */
export default function VehicleStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const [advanced, setAdvanced] = useState(false);
  const veryEasy = useVeryEasyLayout();

  if (advanced) {
    return (
      <section
        aria-label="Vehicle Studio"
        data-testid="vehicle-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="vehicle-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const data: Json = element.data;
  const bones = vehicleBones(project, data);
  const missing = missingBones(bones, data);
  const section: VehicleSectionProps = {
    project,
    target,
    elementId: element.id,
    data,
    set: pathSetter(element.data, onChange),
    replace: (next) => onChange('', next),
    problems,
    suggest,
    bones,
    events: eventNames(element.data),
  };

  return (
    <section
      aria-label="Vehicle Studio"
      data-testid="vehicle-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="vehicle-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      <VehiclePreview project={project} elementId={element.id} data={data} />
      <BasicsSection {...section} />
      {missing.length > 0 && !veryEasy && (
        <p className="text-warning text-xs" data-testid="vehicle-missing-bones">
          The model has no bone {missing.map((entry) => `“${entry.bone}”`).join(', ')}: pick another
          under Turret, Parts or Weapons, or use another model.
        </p>
      )}
      <IdentitySection {...section} />
      <ModelSection {...section} />
      <MovementSection {...section} />
      <SeatsSection {...section} />
      <EngineSection {...section} />
      <HealthSection {...section} />
      <WeaponsSection {...section} />
      <TurretSection {...section} />
      <PartsSection {...section} />
      <StorageSection {...section} />
      <ItemSection {...section} />
      <CameraSection {...section} />
      <ExhaustSection {...section} />
      <RulesSlot>
        <Suspense
          fallback={
            <p className="text-muted text-xs" data-testid="rules-section-loading">
              Loading the Rules section…
            </p>
          }
        >
          <RulesSection
            project={project}
            element={element}
            target={target}
            context={props.context}
          />
        </Suspense>
      </RulesSlot>
      <EventsEditor
        element={element}
        project={project}
        target={target}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        handlers={projectHandlers(project)}
        portals={projectPortals(project)}
        triggers={<VehicleTriggers {...section} />}
      />
    </section>
  );
}
