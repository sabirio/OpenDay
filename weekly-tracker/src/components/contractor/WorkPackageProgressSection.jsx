import { WORK_PACKAGES } from "../../config/workPackages";
import { FormSection } from "./FormParts";
import { PhaseSection } from "./GanttWPSection";
import { WPSection } from "./LegacyWPSection";

export default function WorkPackageProgressSection({
  ganttLoading,
  ganttTasks,
  ganttWpProgress,
  onUpdateProgress,
  projectId,
  form,
  prevReport,
  onLegacyChange,
}) {
  if (ganttLoading) {
    return (
      <FormSection title="Work Package Progress" accentColor="#2f855a">
        <div style={{ textAlign: "center", padding: "20px", color: "#9ca3af", fontSize: 13 }}>Loading schedule...</div>
      </FormSection>
    );
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
