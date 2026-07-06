function ReportHeaderCard({ project, weekInfo, weekPct, lastReport, daysSinceLast, projectReportsCount }) {
  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid var(--field-border)", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--field-accent-contractor)", marginBottom: 6 }}>Weekly Construction Report</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--field-text-heading)", lineHeight: 1.1 }}>{project.storeCode}</div>
          <div style={{ color: "var(--field-text-secondary)", fontSize: 14, marginTop: 4 }}>
            {project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}
          </div>
        </div>
        {project.generalContractor && (
          <div style={{ background: "var(--field-success-bg)", border: "1px solid var(--field-success-border)", borderRadius: 12, padding: "10px 18px", textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-accent-contractor)", marginBottom: 4 }}>General Contractor</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--field-text-heading)" }}>{project.generalContractor}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid var(--field-bg-subtle)" }}>
        {project.projectManager && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Client PM</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.projectManager}</div>
          </div>
        )}
        {project.constructionStartDate && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Start</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.constructionStartDate}</div>
          </div>
        )}
        {project.constructionEndDate && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>End</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.constructionEndDate}</div>
          </div>
        )}
        {weekInfo && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Duration</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{weekInfo.totalWeeks} weeks</div>
          </div>
        )}
      </div>

      {weekInfo && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--field-text-secondary)" }}>{weekInfo.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--field-accent-contractor)" }}>{weekPct}%</span>
          </div>
          <div style={{ background: "var(--field-success-bg)", borderRadius: 6, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${weekPct}%`, height: "100%", background: "linear-gradient(90deg, var(--field-accent-contractor), var(--field-success-fg))", borderRadius: 6 }} />
          </div>
        </div>
      )}

      <div style={{
        marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--field-bg-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: lastReport ? (daysSinceLast > 14 ? "var(--field-warning-fg)" : "var(--field-success-fg)") : "var(--field-border-strong)",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: "var(--field-text-secondary)" }}>Last submitted report:</span>
          {lastReport ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)" }}>
              {new Date(lastReport.reportingDate || lastReport.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-label)" }}>No reports yet</span>
          )}
          {daysSinceLast !== null && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
              background: daysSinceLast > 14 ? "var(--field-warning-bg)" : "var(--field-success-bg)",
              color: daysSinceLast > 14 ? "var(--field-warning-fg-dark)" : "var(--field-success-fg-dark)",
              border: `1px solid ${daysSinceLast > 14 ? "var(--field-warning-border)" : "var(--field-success-border)"}`,
            }}>
              {daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "var(--field-text-muted)" }}>
          {projectReportsCount} report{projectReportsCount !== 1 ? "s" : ""} submitted total
        </span>
      </div>
    </div>
  );
}

export default ReportHeaderCard;
