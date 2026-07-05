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
    <FormSection title="Reporting Date & Active Work Packages" accentColor="#2f855a">
      <div style={{ marginBottom: ganttTasks.length > 0 ? 0 : 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Reporting Date</div>
        <input
          type="date"
          data-testid="reporting-date"
          value={reportingDate}
          onChange={(e) => onReportingDateChange(e.target.value)}
          style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, color: "#1f2937", background: "white", outline: "none", width: 200 }}
        />
      </div>
      {ganttTasks.length === 0 && !ganttLoading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Active Work Packages This Week</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>Select all work packages with active works this reporting period.</div>
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
                    border: `2px solid ${selected ? "#f97316" : "#e5e7eb"}`,
                    background: selected ? "#fff7ed" : "white",
                    color: selected ? "#f97316" : "#9ca3af",
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
