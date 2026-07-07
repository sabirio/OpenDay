import { ScoreBar } from "../ScoreBar";
import { getScoreTier, SCORE_TIER_COLORS } from "../../config/statusColors";
import FilterBar from "./FilterBar";

function ContractorsTab({
  allStoreCodes, allContractorNames,
  filterStore, setFilterStore, filterContractor, setFilterContractor,
  contractorTabScores, contractorTabRows,
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>Contractor Performance & Reporting Reliability</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Performance</strong> = contractor-controlled items · <strong style={{ color: "var(--text-secondary)" }}>PM Alignment</strong> = PM site visit verification alignment · lowest first
        </div>

        <FilterBar
          stores={allStoreCodes}
          contractors={allContractorNames}
          filterStore={filterStore}
          setFilterStore={setFilterStore}
          filterContractor={filterContractor}
          setFilterContractor={setFilterContractor}
          showStore={false}
        />

        {contractorTabScores.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 0" }}>No contractor data for selected filters.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {contractorTabScores.map(c => (
              <div key={c.name} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.projects.join(", ")} · {c.n} project{c.n > 1 ? "s" : ""} · {c.reportCount} reports</div>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 18px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Performance</div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: c.perfColor, lineHeight: 1 }}>{c.avgPerf}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c.perfColor, marginTop: 4 }}>{c.perfLevel}</div>
                    </div>
                    <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 18px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>PM Alignment</div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: c.accColor, lineHeight: 1 }}>{c.avgAccuracy}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c.accColor, marginTop: 4 }}>{c.accLevel}</div>
                    </div>
                  </div>
                </div>
                {contractorTabRows.filter(row => row.contractorName === c.name).map(({ project, contScore }) => (
                  <div key={project.id} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{project.storeCode} — {project.shoppingMallName}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Performance breakdown</div>
                        <ScoreBar label="Reporting Discipline" pts={contScore.breakdown.reporting}     max={20} color={contScore.breakdown.reporting >= 16 ? "var(--status-done)" : contScore.breakdown.reporting >= 12 ? "var(--status-warn)" : "var(--status-alert)"} />
                        <ScoreBar label="Contractor Progress"  pts={contScore.breakdown.progress}      max={25} color={contScore.breakdown.progress >= 20 ? "var(--status-done)" : contScore.breakdown.progress >= 14 ? "var(--status-warn)" : "var(--status-alert)"} />
                        <ScoreBar label="Issue Management"     pts={contScore.breakdown.issues}        max={15} color={contScore.breakdown.issues >= 12 ? "var(--status-done)" : contScore.breakdown.issues >= 8 ? "var(--status-warn)" : "var(--status-alert)"} />
                        <ScoreBar label="Communication"        pts={contScore.breakdown.communication} max={10} color={contScore.breakdown.communication >= 8 ? "var(--status-done)" : contScore.breakdown.communication >= 5 ? "var(--status-warn)" : "var(--status-alert)"} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>PM Alignment</div>
                        <ScoreBar label="PM Verification" pts={contScore.breakdown.pmAlignment} max={30} color={contScore.breakdown.pmAlignment >= 24 ? "var(--status-done)" : contScore.breakdown.pmAlignment >= 18 ? "var(--status-warn)" : "var(--status-alert)"} />
                        {contScore.pmAlignmentDetails.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No PM site visits recorded yet</div>}
                        {contScore.pmAlignmentDetails.map((d, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                            Visit {new Date(d.visitDate).toLocaleDateString("en-GB")}: <span style={{ fontWeight: 700, color: SCORE_TIER_COLORS[getScoreTier(d.matchRate)] }}>{d.matchRate}% match</span>
                            {d.overstatements > 0 && <span style={{ color: "var(--status-alert)", marginLeft: 8 }}>· {d.overstatements} overstated</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ContractorsTab;
