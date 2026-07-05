import { RISK_COLORS } from "../../engines/riskEngine";
import { RiskBadge } from "../RiskGauge";
import Glyph from "./Glyph";

function EscalationsTab({ allEscalations }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>
        Risk Escalation Register
        {allEscalations.length > 0 && <span style={{ marginLeft: 8, background: "var(--status-alert)", color: "var(--text-inverse)", borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "2px 8px" }}>{allEscalations.length}</span>}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Unresolved risks · repeated blockers · open support requests · PM mismatches</div>
      {allEscalations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 0" }}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><span style={{ color: "var(--status-done)", display: "inline-flex" }}><Glyph name="check" size={40} /></span></div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-done)" }}>No escalations detected</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>No risks have been repeatedly reported without resolution</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="dashboard-table" style={{ minWidth: 780 }}>
            <thead>
              <tr><th>Project</th><th>Category</th><th>Issue</th><th>Reports / Days</th><th>Latest Owner</th><th>First Seen</th><th>Last Seen</th><th>Level</th></tr>
            </thead>
            <tbody>
              {allEscalations.map((e, i) => {
                const typeIconName = { risk: "alert", blocker: "block", support: "doc", mismatch: "search" }[e.type] || "alert";
                return (
                  <tr key={i}>
                    <td><div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.project.storeCode}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.project.shoppingMallName}</div></td>
                    <td><span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}><Glyph name={typeIconName} /></span> <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{e.type}</span></td>
                    <td><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{e.label}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.description}</div></td>
                    <td style={{ fontSize: 18, fontWeight: 800, color: RISK_COLORS[e.severity].text }}>{e.weeks}</td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.latestOwner || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.firstSeen ? new Date(e.firstSeen).toLocaleDateString("en-GB") : "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.lastSeen  ? new Date(e.lastSeen).toLocaleDateString("en-GB")  : "—"}</td>
                    <td><RiskBadge level={e.severity} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default EscalationsTab;
