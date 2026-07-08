import { isSevereScheduleStatus } from "../../utils/reportUtils";
import { computePmAlignmentItems, summarizeAlignmentItems } from "../../hooks/usePmAlignmentPresentation";
import { RISK_LEVEL_COLORS, getScoreTier, SCORE_TIER_COLORS } from "../../config/statusColors";
import FilterBar from "./FilterBar";
import Glyph from "./Glyph";

const SEV_COLORS = RISK_LEVEL_COLORS;

function PmAlignmentTab({
  allStoreCodes, allContractorNames,
  filterStore, setFilterStore, filterContractor, setFilterContractor,
  filterReport, setFilterReport,
  pmAlignReportOptions, pmAlignRows, allRows,
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>PM Site Visit Verification</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Contractor-reported statuses vs PM observations · overstatements show where GC claimed more progress than PM verified</div>

        <FilterBar
          stores={allStoreCodes}
          contractors={allContractorNames}
          filterStore={filterStore}
          setFilterStore={v => { setFilterStore(v); setFilterReport(""); }}
          filterContractor={filterContractor}
          setFilterContractor={setFilterContractor}
          showContractor={false}
        />

        {pmAlignReportOptions.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
            <select
              value={filterReport}
              onChange={e => setFilterReport(e.target.value)}
              style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-input)", cursor: "pointer", outline: "none", minWidth: 220 }}
            >
              <option value="">All GC reports</option>
              {pmAlignReportOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {filterReport && (
              <button
                type="button"
                onClick={() => setFilterReport("")}
                style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-muted)", background: "var(--accent-subtle)", cursor: "pointer" }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {pmAlignRows.filter(r => r.projSiteVisits.length > 0).length === 0 && (
        <div className="dashboard-summary-card" style={{ margin: 0, textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
          {allRows.filter(r => r.projSiteVisits.length > 0).length === 0
            ? "No PM site visits recorded yet. Complete a PM Site Visit Report to see comparison data here."
            : "No projects match the selected filters."}
        </div>
      )}

      {pmAlignRows.filter(r => r.projSiteVisits.length > 0).map(({ project, projSiteVisits, sorted, contScore }) => {
        const visitsSorted = [...projSiteVisits]
          .sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))
          .filter(visit => {
            if (!filterReport) return true;
            const visitDate = new Date(visit.visitDate || visit.submittedAt);
            const gc = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
            return gc && String(gc.id) === filterReport;
          });
        if (visitsSorted.length === 0) return null;
        return (
          <div key={project.id} className="dashboard-summary-card" style={{ margin: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 2 }}>{project.storeCode} — {project.shoppingMallName}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              {project.generalContractor && <span style={{ marginRight: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{project.generalContractor}</span>}
              PM Alignment Score: <span style={{ fontWeight: 700, color: SCORE_TIER_COLORS[getScoreTier(contScore.pmAlignmentScore)] }}>{contScore.pmAlignmentScore} / 100</span>
              {" · "}{visitsSorted.length} site visit{visitsSorted.length !== 1 ? "s" : ""}
            </div>
            {visitsSorted.map((visit, vi) => {
              const visitDate = new Date(visit.visitDate || visit.submittedAt);
              const gcAtVisit = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
              const items = computePmAlignmentItems(gcAtVisit, visit);
              const { matchRate, overstatements, matches } = summarizeAlignmentItems(items);
              const matchColor = SCORE_TIER_COLORS[getScoreTier(matchRate)];
              return (
                <div key={vi} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)" }}>Visit {visitDate.toLocaleDateString("en-GB")}</div>
                      {gcAtVisit && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>vs GC report {new Date(gcAtVisit.reportingDate || gcAtVisit.submittedAt).toLocaleDateString("en-GB")}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: matchColor }}>{matchRate}%</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Match rate</div></div>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: overstatements.length > 0 ? "var(--status-alert)" : "var(--status-done)" }}>{overstatements.length}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Overstated</div></div>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "var(--status-done)" }}>{matches.length}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Matches</div></div>
                    </div>
                  </div>
                  {items.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid var(--border)` }}>
                            {["Work Item", "Contractor Status", "PM Observed", "Mismatch Type", "Severity"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...items].sort((a, b) => {
                            const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
                            return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                          }).map((item, ii) => {
                            const isMatch   = item.mismatchType === "Match";
                            const isPmAhead = item.mismatchType === "PM ahead";
                            const sev = SEV_COLORS[item.severity];
                            const rowBg     = item.severity === "CRITICAL" ? 'var(--status-alert-bg)' : item.severity === "HIGH" ? 'var(--status-warn-bg)' : item.severity === "MEDIUM" ? 'var(--status-warn-bg)' : isPmAhead ? 'var(--status-done-bg)' : 'transparent';
                            const typeColor = item.severity === "CRITICAL" ? "var(--status-alert)" : item.severity === "HIGH" ? "var(--status-warn)" : item.severity === "MEDIUM" ? "var(--status-warn)" : isPmAhead ? "var(--status-done)" : "var(--text-muted)";
                            return (
                              <tr key={ii} style={{ borderBottom: "1px solid var(--border)", background: rowBg, opacity: isMatch ? 0.6 : 1 }}>
                                <td style={{ padding: "7px 10px", fontSize: 12, color: "var(--text-secondary)", maxWidth: 220 }}>{item.name}</td>
                                <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: item.overstate ? 700 : 400, color: item.overstate ? "var(--status-alert)" : "var(--text-secondary)" }}>{item.gcStatus}</span></td>
                                <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: isPmAhead ? 700 : 400, color: isPmAhead ? "var(--status-done)" : "var(--text-secondary)" }}>{item.pmStatus}</span></td>
                                <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: typeColor }}>{item.mismatchType}</td>
                                <td style={{ padding: "7px 10px" }}>
                                  {sev ? (
                                    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 9, fontSize: 11, fontWeight: 700, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}` }}>{item.severity}</span>
                                  ) : isMatch ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--status-done)", fontWeight: 600 }}><Glyph name="check" /> Match</span>
                                  ) : (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--status-done)" }}><Glyph name="arrowUp" /> PM ahead</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {visit.pmScheduleAssessment && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                      PM schedule assessment: <span style={{ fontWeight: 700, color: isSevereScheduleStatus(visit.pmScheduleAssessment) ? "var(--status-alert)" : visit.pmScheduleAssessment === "At Risk" ? "var(--status-warn)" : "var(--status-done)" }}>{visit.pmScheduleAssessment}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default PmAlignmentTab;
