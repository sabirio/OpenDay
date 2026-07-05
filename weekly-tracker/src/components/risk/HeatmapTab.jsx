import { RISK_COLORS, RISK_DIMENSIONS } from "../../engines/riskEngine";
import { DimCell } from "../RiskGauge";

function HeatmapTab({ sortedByRisk }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>Portfolio Risk Heatmap</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Risk level by project × 14 dimensions · sorted by overall score</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: "3px 3px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 110 }}>Project</th>
              <th style={{ textAlign: "center", padding: "4px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 50 }}>Score</th>
              {RISK_DIMENSIONS.map(d => (
                <th key={d} style={{ textAlign: "center", padding: "4px 3px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", minWidth: 34, whiteSpace: "nowrap" }}>
                  {d.length > 8 ? d.substring(0, 8) + "…" : d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedByRisk.map(({ project, riskScore, dims }) => {
              const c = riskScore.color;
              return (
                <tr key={project.id}>
                  <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 3, height: 16, borderRadius: 2, background: c.text, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{project.storeCode}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{project.shoppingMallName}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center", padding: "5px 6px" }}>
                    <div style={{ width: 40, height: 26, borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 13, fontWeight: 800, color: c.text }}>{riskScore.score}</div>
                  </td>
                  {RISK_DIMENSIONS.map(d => <DimCell key={d} level={dims[d]} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(l => {
          const c = RISK_COLORS[l];
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: c.text }}>{l[0]}</div>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HeatmapTab;
