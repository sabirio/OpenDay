import { useEffect, useMemo } from 'react';
import { computeProjectSummary } from '../../engines/projectSummaryEngine';
import { computeConfidenceLevel } from '../../engines/pmAlignmentEngine';
import { formatDate } from '../../utils/reportUtils';
import { RISK_LEVEL_COLORS } from '../../config/statusColors';
import { SchedBadge } from './DashboardWidgets';
import PhaseProgress from './PhaseProgress';
import TimelineFlag from './TimelineFlag';

const RL = RISK_LEVEL_COLORS;

function ReportAgeBadge({ daysSince }) {
  if (daysSince === null) return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-alert)' }}>Never reported</span>;
  if (daysSince === 0)    return <span style={{ fontSize: 11, color: 'var(--status-done)' }}>Today</span>;
  if (daysSince <= 7)     return <span style={{ fontSize: 11, color: 'var(--status-done)' }}>{daysSince}d ago</span>;
  if (daysSince <= 14)    return <span style={{ fontSize: 11, color: 'var(--status-warn)' }}>{daysSince}d ago</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-alert)' }}>Overdue {daysSince}d</span>;
}

function StatusDot({ ok, critical }) {
  const c = ok ? 'var(--status-done)' : critical ? 'var(--status-alert)' : 'var(--status-warn)';
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />;
}

export default function ProjectDetailDrawer({ row, projSiteVisits, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const { project, progress, projReports, wpCumulativeStatuses, color } = row || {};

  const summary = useMemo(() => {
    if (!row) return null;
    return computeProjectSummary(project, projReports, projSiteVisits, progress, wpCumulativeStatuses);
  }, [row, project, projReports, projSiteVisits, progress, wpCumulativeStatuses]);

  if (!row || !summary) return null;

  const { contractor, pmVisit, risk, opening } = summary;
  const riskStyle = RL[risk.level] || RL.UNKNOWN;

  const latestReport = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  ).slice(-1)[0] || null;
  const confidence = computeConfidenceLevel(projReports, projSiteVisits, latestReport);

  const matchRateColor = pmVisit.matchRate >= 80 ? 'var(--status-done)' : pmVisit.matchRate >= 50 ? 'var(--status-warn)' : 'var(--status-alert)';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000 }} />
      <div data-testid="project-detail-drawer" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 920, maxWidth: '97vw', maxHeight: '90vh', background: 'var(--bg-surface)', zIndex: 1001, overflowY: 'auto', boxShadow: 'var(--shadow-lg)', borderRadius: 16, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid var(--border)', borderTop: `4px solid ${color}`, flexShrink: 0, background: 'rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{project.storeCode}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{project.shoppingMallName}</div>
              {(project.city || project.country) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {[project.city, project.country].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button"
                onClick={() => navigator.clipboard.writeText(window.location.origin + '/contractor-report/' + project.id).catch(() => {})}
                style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                title="Copy contractor report link">
                Copy link
              </button>
              <button type="button" onClick={onClose}
                style={{ padding: '5px 13px', borderRadius: 8, border: 'none', background: 'var(--border)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Close ×
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
            {[{ l: 'PM', v: project.projectManager }, { l: 'GC', v: project.generalContractor }, { l: 'Type', v: project.projectType }, { l: 'Status', v: project.projectStatus }]
              .filter(x => x.v).map(({ l, v }) => (
                <div key={l}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{l} </span>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
          </div>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

            {/* Block 1 — Contractor Report */}
            <div data-testid="contractor-status-summary" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Contractor Report</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 38, fontWeight: 800, color, lineHeight: 1 }}>{contractor.overallProgress}%</div>
                <div style={{ flex: 1 }}>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: `${contractor.overallProgress}%`, height: '100%', background: color, borderRadius: 4 }} />
                  </div>
                  {contractor.scheduleStatus && <SchedBadge status={contractor.scheduleStatus} />}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Last report</span>
                  <ReportAgeBadge daysSince={contractor.daysSinceReport} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total reports</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{contractor.reportCount}</span>
                </div>
                {contractor.blocked && (
                  <div style={{ marginTop: 4, padding: '5px 10px', background: 'var(--status-alert-bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 700, color: 'var(--status-alert)' }}>
                    ⛔ Activities Blocked
                  </div>
                )}
              </div>
            </div>

            {/* Block 2 — PM Site Visit */}
            <div data-testid="pm-site-visit-summary" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>PM Site Visit</div>
              {!pmVisit.hasVisit ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginTop: 22, textAlign: 'center' }}>No site visits recorded</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 10 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Latest visit</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(pmVisit.latestVisitDate)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                    {[
                      { l: 'Matches',       v: pmVisit.matches,       c: 'var(--status-done)',  testId: null },
                      { l: 'Discrepancies', v: pmVisit.discrepancies,  c: pmVisit.discrepancies > 0 ? 'var(--status-alert)' : 'var(--status-done)', testId: 'discrepancy-count' },
                      { l: 'PM Ahead',      v: pmVisit.pmAhead,        c: 'var(--status-warn)',  testId: null },
                    ].map(({ l, v, c, testId }) => (
                      <div key={l} data-testid={testId || undefined} style={{ background: 'var(--accent-subtle)', borderRadius: 8, padding: '7px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {pmVisit.matchRate !== null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Match rate</span>
                        <span style={{ fontWeight: 700, color: matchRateColor }}>{pmVisit.matchRate}%</span>
                      </div>
                      <div style={{ background: 'var(--border)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${pmVisit.matchRate}%`, height: '100%', background: matchRateColor, borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  {pmVisit.pmScheduleAssessment && (
                    <div style={{ marginTop: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>PM schedule</span>
                      <SchedBadge status={pmVisit.pmScheduleAssessment} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Block 3 — Risk Summary */}
            <div data-testid="risk-status-summary" style={{ background: 'var(--accent-subtle)', border: `1px solid ${riskStyle.border}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Risk Summary</div>
                <span data-testid="risk-level-badge" style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: riskStyle.bg, color: riskStyle.text, border: `1px solid ${riskStyle.border}` }}>{risk.level}</span>
              </div>
              <div style={{ display: 'grid', gap: 7 }}>
                {[
                  { l: 'Schedule',   ok: risk.scheduleRisk === 'OK',    crit: risk.scheduleRisk === 'CRITICAL' || risk.scheduleRisk === 'HIGH',       v: risk.scheduleRisk === 'OK' ? 'On Track' : risk.scheduleRisk === 'AT_RISK' ? 'At Risk' : risk.scheduleRisk === 'HIGH' ? 'Delayed' : 'Critical', testId: null },
                  { l: 'Opening',    ok: risk.openingStatus === 'Ready', crit: risk.openingStatus === 'Critical' || risk.openingStatus === 'Overdue',  v: risk.openingStatus, testId: null },
                  { l: 'PM vs GC',   ok: risk.discrepancyStatus === 'OK', crit: risk.discrepancyStatus === 'HAS_DISCREPANCIES',                       v: risk.discrepancyStatus === 'OK' ? 'Match' : risk.discrepancyStatus === 'HAS_DISCREPANCIES' ? 'Discrepancies' : risk.discrepancyStatus === 'NO_VISIT' ? 'No Visit' : '—', testId: null },
                  { l: 'Reports',    ok: !risk.missingReport,  crit: risk.missingReport,    v: risk.missingReport ? 'Missing/Overdue' : 'Up to date', testId: 'missing-report-status' },
                  { l: 'Blocked',    ok: !risk.blocked,        crit: risk.blocked,          v: risk.blocked ? 'Yes' : 'No',                           testId: null },
                  { l: 'Support',    ok: !risk.supportRequired, crit: false,                v: risk.supportRequired ? 'Required' : 'None',            testId: 'client-support-status' },
                  { l: 'Add. Works', ok: !risk.additionalWorks, crit: false,               v: risk.additionalWorks ? 'Yes' : 'No',                   testId: 'additional-works-status' },
                ].map(({ l, ok, crit, v, testId }) => (
                  <div key={l} data-testid={testId || undefined} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StatusDot ok={ok} critical={crit} />
                      <span style={{ color: ok ? 'var(--text-primary)' : crit ? 'var(--status-alert)' : 'var(--status-warn)', fontWeight: ok ? 400 : 600 }}>{v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Block 4 — Opening Readiness */}
            <TimelineFlag opening={opening} />
          </div>

          {/* Block 5 — Data Confidence */}
          <div data-testid="data-confidence-block" style={{ background: 'var(--accent-subtle)', border: `1px solid ${confidence.colorBg}`, borderRadius: 12, padding: '14px 16px', gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Data Confidence</div>
              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: confidence.colorBg, color: confidence.color, border: '1px solid var(--border)' }}>{confidence.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {Array.from({ length: confidence.maxPts }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < confidence.pts ? confidence.color : 'var(--border)' }} />
              ))}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 4 }}>{confidence.pts}/{confidence.maxPts}</span>
            </div>
          </div>

          {/* WP Phase progress bars */}
          <PhaseProgress bars={contractor.phaseProgress} color={color} />
        </div>
      </div>
    </>
  );
}
