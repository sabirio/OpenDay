import { WORK_PACKAGES } from "../../config/workPackages";
import { FormSection } from "./FormParts";

export default function ReportingWorkPackagesSection({
  reportingDate,
  selectedPackages,
  ganttTasks,
  ganttLoading,
  onReportingDateChange,
  onTogglePackage,
}) {
  return (
    <FormSection title="Reporting Date & Active Work Packages" accentColor="var(--field-accent-contractor)">
      <div style={{ marginBottom: ganttTasks.length > 0 ? 0 : 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Reporting Date</div>
        <input
          type="date"
          data-testid="reporting-date"
          value={reportingDate}
          onChange={(e) => onReportingDateChange(e.target.value)}
          style={{ height: 42, padding: "0 14px", border: "1px solid var(--field-border-strong)", borderRadius: 10, fontSize: 14, color: "var(--field-text-heading)", background: "white", outline: "none", width: 200 }}
        />
      </div>
      {ganttTasks.length === 0 && !ganttLoading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 6 }}>Active Work Packages This Week</div>
          <div style={{ fontSize: 12, color: "var(--field-text-muted)", marginBottom: 14 }}>Select all work packages with active works this reporting period.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {WORK_PACKAGES.map((wp) => {
              const selected = selectedPackages.includes(wp.id);
              return (
                <button key={wp.id} type="button"
                  data-testid="wp-toggle"
                  data-wp-id={wp.id}
                  onClick={() => onTogglePackage(wp.id)}
                  style={{
                    padding: "12px 14px", borderRadius: 12, textAlign: "left",
                    border: `2px solid ${selected ? "var(--field-accent-orange-fg)" : "var(--field-border)"}`,
                    background: selected ? "var(--field-accent-orange-bg)" : "white",
                    color: selected ? "var(--field-accent-orange-fg)" : "var(--field-text-muted)",
                    fontWeight: selected ? 700 : 500, fontSize: 13,
                    cursor: "pointer", transition: "all 0.15s", lineHeight: 1.3,
                  }}>
                  {selected && <span style={{ marginRight: 6, fontSize: 11 }}>✓</span>}
                  {wp.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </FormSection>
  );
}
