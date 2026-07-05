function ReportHeaderCard({ project, weekInfo, weekPct, lastReport, daysSinceLast, projectReportsCount }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #e5e7eb", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#2f855a", marginBottom: 6 }}>Weekly Construction Report</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{project.storeCode}</div>
          <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            {project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}
          </div>
        </div>
        {project.generalContractor && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 18px", textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#2f855a", marginBottom: 4 }}>General Contractor</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{project.generalContractor}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
        {project.projectManager && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Client PM</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.projectManager}</div>
          </div>
        )}
        {project.constructionStartDate && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Start</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionStartDate}</div>
          </div>
        )}
        {project.constructionEndDate && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>End</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionEndDate}</div>
          </div>
        )}
        {weekInfo && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Duration</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{weekInfo.totalWeeks} weeks</div>
          </div>
        )}
      </div>

      {weekInfo && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{weekInfo.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#2f855a" }}>{weekPct}%</span>
          </div>
          <div style={{ background: "#e7f4e8", borderRadius: 6, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${weekPct}%`, height: "100%", background: "linear-gradient(90deg, #2f855a, #4ade80)", borderRadius: 6 }} />
          </div>
        </div>
      )}

      <div style={{
        marginTop: 16, paddingTop: 14, borderTop: "1px solid #f3f4f6",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: lastReport ? (daysSinceLast > 14 ? "#f59e0b" : "#22c55e") : "#d1d5db",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: "#6b7280" }}>Last submitted report:</span>
          {lastReport ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              {new Date(lastReport.reportingDate || lastReport.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>No reports yet</span>
          )}
          {daysSinceLast !== null && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
              background: daysSinceLast > 14 ? "#fef3c7" : "#f0fdf4",
              color: daysSinceLast > 14 ? "#92400e" : "#166534",
              border: `1px solid ${daysSinceLast > 14 ? "#fde68a" : "#bbf7d0"}`,
            }}>
              {daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {projectReportsCount} report{projectReportsCount !== 1 ? "s" : ""} submitted total
        </span>
      </div>
    </div>
  );
}

export default ReportHeaderCard;
