// Weekly Project Report PDF template — the ONLY file in the Export Engine
// that knows how a Weekly Report should look on paper. It consumes exactly
// one WeeklyReportExportModel (see buildWeeklyReportExportModel.js) plus a
// resolved evidence array; it never touches Supabase, hooks, or the
// WeeklyReportsPage DOM.
//
// Written with React.createElement rather than JSX on purpose: this repo's
// test suite runs plain `node *.test.mjs` with no JSX/bundler transform step
// (see src/tests/runAll.mjs), and this file needs to be importable and
// exercised — with real @react-pdf/renderer output — directly from that
// suite. Vite's browser bundle doesn't care either way; createElement calls
// are exactly what JSX compiles down to.

import React from 'react';
import { Document, Page, View, Text, Image, Svg, Path, Rect, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_PAGE, statusColors } from './pdfPalette.js';

const h = React.createElement;

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE.marginTop,
    paddingBottom: PDF_PAGE.marginBottom,
    paddingHorizontal: PDF_PAGE.marginHorizontal,
    fontSize: 10,
    color: PDF_COLORS.textPrimary,
    backgroundColor: PDF_COLORS.pageBg,
  },
  header: {
    position: 'absolute', top: 24, left: PDF_PAGE.marginHorizontal, right: PDF_PAGE.marginHorizontal,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: PDF_COLORS.border, paddingBottom: 8,
  },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBrand: { fontSize: 11, fontWeight: 700, color: PDF_COLORS.textPrimary, letterSpacing: 0.5 },
  headerDocType: { fontSize: 8, color: PDF_COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  headerRight: { fontSize: 9, color: PDF_COLORS.textMuted, textAlign: 'right' },
  footer: {
    position: 'absolute', bottom: 20, left: PDF_PAGE.marginHorizontal, right: PDF_PAGE.marginHorizontal,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: PDF_COLORS.border, paddingTop: 6,
    fontSize: 8, color: PDF_COLORS.textMuted,
  },
  title: { fontSize: 20, fontWeight: 700, color: PDF_COLORS.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 11, color: PDF_COLORS.accent, fontWeight: 700, marginBottom: 14, letterSpacing: 0.5 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: PDF_COLORS.textPrimary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8, marginTop: 18,
    borderBottomWidth: 1, borderBottomColor: PDF_COLORS.border, paddingBottom: 4,
  },
  row: { flexDirection: 'row' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  metaItem: { width: '50%', marginBottom: 8 },
  metaLabel: { fontSize: 8, color: PDF_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 10.5, color: PDF_COLORS.textPrimary, fontWeight: 700 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  kpiBox: {
    flexGrow: 1, minWidth: 95, borderWidth: 1, borderColor: PDF_COLORS.border, borderRadius: 4,
    padding: 10,
  },
  kpiLabel: { fontSize: 7.5, color: PDF_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: 700, color: PDF_COLORS.textPrimary },
  badge: { fontSize: 8, fontWeight: 700, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6, alignSelf: 'flex-start' },
  bodyText: { fontSize: 10, color: PDF_COLORS.textPrimary, lineHeight: 1.5 },
  mutedText: { fontSize: 9.5, color: PDF_COLORS.textMuted, lineHeight: 1.5 },
  emptyState: {
    fontSize: 9.5, color: PDF_COLORS.textMuted, fontStyle: 'italic',
    borderWidth: 1, borderColor: PDF_COLORS.border, borderRadius: 4, padding: 10, backgroundColor: '#faf9f7',
  },
  phaseRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: PDF_COLORS.border,
  },
  phaseName: { flex: 1, fontSize: 9.5, color: PDF_COLORS.textPrimary },
  phasePct: { width: 44, fontSize: 9.5, fontWeight: 700, textAlign: 'right', color: PDF_COLORS.textPrimary },
  phaseBarTrack: { width: 80, height: 6, backgroundColor: PDF_COLORS.border, borderRadius: 3, marginHorizontal: 10 },
  phaseBarFill: { height: 6, backgroundColor: PDF_COLORS.accent, borderRadius: 3 },
  blockerRow: {
    borderWidth: 1, borderColor: PDF_COLORS.border, borderRadius: 4, padding: 8, marginBottom: 6,
    flexDirection: 'row', justifyContent: 'space-between', gap: 8,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  photoCell: { width: '47%', marginBottom: 12 },
  photoImage: { width: '100%', height: 150, objectFit: 'cover', borderRadius: 4, borderWidth: 1, borderColor: PDF_COLORS.border },
  photoCaption: { fontSize: 8.5, color: PDF_COLORS.textMuted, marginTop: 3 },
});

function formatDateLabel(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function formatPct(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

function formatSignedPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}pp` : `${rounded}pp`;
}

function Header(model) {
  const storeCode = model.project?.storeCode ?? '—';
  return h(View, { style: styles.header, fixed: true },
    h(View, { style: styles.headerBrandRow },
      h(Svg, { width: 14, height: 14, viewBox: '0 0 32 32' },
        h(Rect, { width: 32, height: 32, rx: 8, fill: PDF_COLORS.accentSoft }),
        h(Path, { d: 'M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z', stroke: PDF_COLORS.accent, strokeWidth: 2, fill: 'none' })
      ),
      h(Text, { style: styles.headerBrand }, 'OpenDay'),
      h(Text, { style: styles.headerDocType }, '  ·  Weekly Project Report')
    ),
    h(Text, { style: styles.headerRight }, storeCode)
  );
}

function Footer(model) {
  const generatedLabel = formatDateLabel(model.document?.generatedAt);
  return h(View, { style: styles.footer, fixed: true },
    h(Text, {}, `Generated ${generatedLabel} · ${model.document?.branding?.footerText ?? ''}`),
    h(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}` })
  );
}

// `value` is omitted (null/undefined) for purely-categorical KPIs (readiness,
// risk level) where the badge itself IS the value — showing both would just
// repeat the same label twice. Numeric KPIs (progress, variance) pass a
// value, optionally with a small status badge underneath.
function KpiBox(label, value, badge) {
  return h(View, { style: styles.kpiBox },
    h(Text, { style: styles.kpiLabel }, label),
    value != null ? h(Text, { style: styles.kpiValue }, value) : null,
    badge ? h(View, { style: [styles.badge, { backgroundColor: badge.bg, color: badge.fg, marginTop: value != null ? 6 : 2 }] }, h(Text, {}, badge.text)) : null
  );
}

function SectionTitle(text) {
  return h(Text, { style: styles.sectionTitle }, text);
}

function EmptyState(text) {
  return h(Text, { style: styles.emptyState }, text);
}

function MetaItem(label, value) {
  return h(View, { style: styles.metaItem },
    h(Text, { style: styles.metaLabel }, label),
    h(Text, { style: styles.metaValue }, value || '—')
  );
}

function SummaryPage(model) {
  const project = model.project;
  const health = model.health;
  const period = model.reportingPeriod;
  const readinessColors = statusColors(health.readinessStatus);
  const riskColors = statusColors(health.riskLevel);
  const scheduleColors = statusColors(health.scheduleStatus);

  const locationParts = [project?.city, project?.country].filter(Boolean);

  return h(Page, { size: PDF_PAGE.size, style: styles.page },
    Header(model),
    Footer(model),

    h(Text, { style: styles.title }, project?.storeCode
      ? `${project.storeCode}${project.shoppingMallName ? ' — ' + project.shoppingMallName : ''}`
      : 'Weekly Project Report'),
    h(Text, { style: styles.subtitle }, `WEEKLY PROJECT REPORT · Report date ${formatDateLabel(period.reportingDate || period.submittedAt)}`),

    h(View, { style: styles.metaGrid },
      locationParts.length ? MetaItem('Location', locationParts.join(', ')) : null,
      MetaItem('Project Manager', project?.projectManager),
      MetaItem('Contractor', project?.generalContractor),
      MetaItem('Target Opening', formatDateLabel(project?.targetOpeningDate)),
      MetaItem('Project Type', project?.projectType)
    ),

    SectionTitle('Project Health'),
    h(View, { style: styles.kpiRow },
      KpiBox('Actual Progress', formatPct(health.actualProgress)),
      KpiBox('Expected Progress', formatPct(health.expectedProgress)),
      KpiBox('Schedule Variance', formatSignedPct(health.variance), health.scheduleStatus ? { ...scheduleColors, text: health.scheduleStatus.replace('_', ' ') } : null),
      KpiBox('Opening Readiness', health.readinessStatus ? null : '—', health.readinessStatus ? { ...readinessColors, text: health.readinessStatus } : null),
      KpiBox('Risk Level', health.riskLevel ? null : '—', health.riskLevel ? { ...riskColors, text: health.riskLevel } : null)
    ),

    SectionTitle('Report Notes'),
    model.upcomingWork?.finalComments
      ? h(Text, { style: styles.bodyText }, model.upcomingWork.finalComments)
      : EmptyState('No comments were submitted with this report.')
  );
}

function ProgressPage(model) {
  const phases = model.phases ?? [];
  return h(Page, { size: PDF_PAGE.size, style: styles.page },
    Header(model), Footer(model),
    SectionTitle('Progress Breakdown'),
    phases.length === 0
      ? EmptyState('No scoped phase/category progress is available for this report.')
      : h(View, {}, phases.map((p) =>
          h(View, { key: p.id, style: styles.phaseRow },
            h(Text, { style: styles.phaseName }, p.name),
            h(View, { style: styles.phaseBarTrack },
              h(View, { style: [styles.phaseBarFill, { width: `${Math.max(0, Math.min(100, p.pct))}%` }] })
            ),
            h(Text, { style: styles.phasePct }, formatPct(p.pct))
          )
        ))
  );
}

function RiskRow(label, value) {
  return h(View, { style: { flexDirection: 'row', marginBottom: 4 } },
    h(Text, { style: { width: 90, fontSize: 9, color: PDF_COLORS.textMuted } }, label),
    h(Text, { style: { flex: 1, fontSize: 9.5, color: PDF_COLORS.textPrimary } }, value || '—')
  );
}

function RisksPage(model) {
  const risks = model.risks;
  const readiness = model.readiness;
  const hasAssessment = risks?.assessment && (risks.assessment.categories?.length || risks.assessment.description);
  const criticalBlockers = readiness?.criticalBlockers ?? [];
  const softBlockers = readiness?.softBlockers ?? [];
  const hasBlockers = criticalBlockers.length > 0 || softBlockers.length > 0;

  return h(Page, { size: PDF_PAGE.size, style: styles.page },
    Header(model), Footer(model),
    SectionTitle('Risk Assessment'),
    hasAssessment
      ? h(View, {},
          RiskRow('Categories', (risks.assessment.categories ?? []).join(', ')),
          RiskRow('Owners', (risks.assessment.owners ?? []).join(', ')),
          RiskRow('Severity', risks.assessment.scale),
          risks.assessment.description ? h(Text, { style: [styles.bodyText, { marginTop: 6 }] }, risks.assessment.description) : null
        )
      : EmptyState('No risks were flagged in this report.'),

    SectionTitle('Opening Blockers'),
    hasBlockers
      ? h(View, {},
          criticalBlockers.map((b, i) => h(View, { key: `c${i}`, style: styles.blockerRow },
            h(Text, { style: { fontSize: 9.5, flex: 1 } }, b.task ?? 'Unnamed item'),
            h(View, { style: [styles.badge, { backgroundColor: PDF_COLORS.statusAlertBg, color: PDF_COLORS.statusAlert }] }, h(Text, {}, 'Critical'))
          )),
          softBlockers.map((b, i) => h(View, { key: `s${i}`, style: styles.blockerRow },
            h(Text, { style: { fontSize: 9.5, flex: 1 } }, b.task ?? 'Unnamed item'),
            h(View, { style: [styles.badge, { backgroundColor: PDF_COLORS.statusWarnBg, color: PDF_COLORS.statusWarn }] }, h(Text, {}, 'Soft'))
          ))
        )
      : EmptyState('No opening blockers are currently recorded.')
  );
}

function UpcomingWorkPage(model) {
  const up = model.upcomingWork;
  if (!up) {
    return h(Page, { size: PDF_PAGE.size, style: styles.page },
      Header(model), Footer(model),
      SectionTitle('Next Period'),
      EmptyState('No report is selected for this export.')
    );
  }
  return h(Page, { size: PDF_PAGE.size, style: styles.page },
    Header(model), Footer(model),
    SectionTitle('Next Week — Top Activities'),
    up.nextWeekTop3 ? h(Text, { style: styles.bodyText }, up.nextWeekTop3) : EmptyState('Not provided.'),

    SectionTitle('Week +2 — Top Activities'),
    up.weekAfterTop3 ? h(Text, { style: styles.bodyText }, up.weekAfterTop3) : EmptyState('Not provided.'),

    SectionTitle('Blocked Activities'),
    up.activitiesBlocked === 'Yes'
      ? h(Text, { style: styles.bodyText }, up.delayReason || 'Marked as blocked; no reason provided.')
      : EmptyState('No blocked activities reported.'),

    SectionTitle('Client Support Required'),
    up.supportRequired === 'Yes'
      ? h(View, {},
          RiskRow('Support Type', (up.supportTypes ?? []).join(', ')),
          up.supportDescription ? h(Text, { style: [styles.bodyText, { marginTop: 4 }] }, up.supportDescription) : null
        )
      : EmptyState('No client support requested.')
  );
}

function EvidencePage(model, evidenceItems) {
  if (!evidenceItems || evidenceItems.length === 0) return null;
  return h(Page, { size: PDF_PAGE.size, style: styles.page },
    Header(model), Footer(model),
    SectionTitle('Evidence'),
    h(View, { style: styles.photoGrid },
      evidenceItems.map((item, i) => h(View, { key: item.path ?? i, style: styles.photoCell },
        h(Image, { style: styles.photoImage, src: item.url }),
        h(Text, { style: styles.photoCaption }, item.caption || `Photo ${i + 1}`)
      ))
    )
  );
}

/**
 * @param {object} model - WeeklyReportExportModel (see buildWeeklyReportExportModel.js)
 * @param {Array<{ path?: string, url: string, caption?: string }>} [evidenceItems] - resolved,
 *   ready-to-embed image sources; resolution (signed URLs) happens outside this file.
 */
export function WeeklyReportPdfTemplate(model, evidenceItems = []) {
  return h(Document, { title: `Weekly Report — ${model.project?.storeCode ?? 'Project'}` },
    SummaryPage(model),
    ProgressPage(model),
    RisksPage(model),
    UpcomingWorkPage(model),
    EvidencePage(model, evidenceItems)
  );
}
