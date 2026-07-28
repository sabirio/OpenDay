// Audited, intentional legacy-fallback import — tracked in
// src/tests/architectureGuard.test.mjs's ALLOWED_LEGACY_IMPORTERS.
// Migrating would rewrite live legacy-report compatibility behavior;
// out of scope here and hard-constraint-protected (no business-semantics
// changes).
// eslint-disable-next-line no-restricted-imports
import { WORK_PACKAGES } from "../../config/workPackages";
import { FormSection } from "./FormParts";
import { PhaseSection } from "./GanttWPSection";
import { WPSection } from "./LegacyWPSection";
import { isZonedTemplate, groupGanttTasksByZone } from "../../hooks/useWPGrouping";

function ZoneBlock({ zoneId, zoneLabel, categories, ganttWpProgress, onUpdateProgress, projectId }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{
        fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--field-text-secondary)", margin: "0 0 8px 4px",
      }}>
        {zoneLabel}
      </h2>
      {[...categories.entries()].map(([categoryId, { categoryLabel, tasks }]) => (
        <PhaseSection
          key={`${zoneId}.${categoryId}`}
          phaseKey={categoryLabel}
          tasks={tasks}
          ganttWpProgress={ganttWpProgress}
          onUpdateProgress={onUpdateProgress}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

export default function WorkPackageProgressSection({
  ganttLoading,
  ganttTasks,
  ganttWpProgress,
  onUpdateProgress,
  projectId,
  form,
  prevReport,
  onLegacyChange,
  templateType = null,
  project = null,
}) {
  if (ganttLoading) {
    return (
      <FormSection title="Work Package Progress" accentColor="var(--field-accent-contractor)">
        <div style={{ textAlign: "center", padding: "20px", color: "var(--field-text-muted)", fontSize: 13 }}>Loading schedule...</div>
      </FormSection>
    );
  }

  if (ganttTasks.length > 0 && isZonedTemplate(templateType)) {
    const zones = groupGanttTasksByZone(ganttTasks, templateType, project);
    return [...zones.entries()].map(([zoneId, zone]) => (
      <ZoneBlock
        key={zoneId}
        zoneId={zoneId}
        zoneLabel={zone.zoneLabel}
        categories={zone.categories}
        ganttWpProgress={ganttWpProgress}
        onUpdateProgress={onUpdateProgress}
        projectId={projectId}
      />
    ));
  }

  if (ganttTasks.length > 0) {
    const byPhase = {};
    for (const task of ganttTasks) {
      const key = task.phaseLabel || task.phaseId || "Other";
      if (!byPhase[key]) byPhase[key] = [];
      byPhase[key].push(task);
    }

    return Object.entries(byPhase).map(([phase, tasks]) => (
      <PhaseSection
        key={phase}
        phaseKey={phase}
        tasks={tasks}
        ganttWpProgress={ganttWpProgress}
        onUpdateProgress={onUpdateProgress}
        projectId={projectId}
      />
    ));
  }

  const activePackages = (form.currentPackages || [])
    .map((id) => WORK_PACKAGES.find((wp) => wp.id === id))
    .filter(Boolean);

  return activePackages.map((wp) => (
    <WPSection
      key={wp.id}
      wp={wp}
      pkgStatuses={form.workPackageStatuses?.[wp.id] || {}}
      prevPkgStatuses={prevReport?.workPackageStatuses?.[wp.id] ?? null}
      prevDate={prevReport?.reportingDate || null}
      onChange={(pkgStatuses) => onLegacyChange(wp.id, pkgStatuses)}
    />
  ));
}
