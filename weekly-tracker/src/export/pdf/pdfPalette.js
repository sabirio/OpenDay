// Fixed, print-safe style constants shared by every PDF template. Deliberately
// NOT the app's CSS variables — a PDF must look the same (and stay readable
// on paper) no matter which theme the viewer's browser/OS happens to be in.
// See export/model/exportProfile.js for where the accent hex comes from.

export const PDF_COLORS = Object.freeze({
  pageBg: '#ffffff',
  textPrimary: '#3d3929',
  textMuted: '#83827d',
  border: '#dad9d4',
  borderStrong: '#c7c5be',
  accent: '#c96442',
  accentSoft: '#f3e3dc',
  statusDone: '#3d7a4f',
  statusDoneBg: '#e5f2e8',
  statusWarn: '#a8641f',
  statusWarnBg: '#f8ecdd',
  statusAlert: '#b3402f',
  statusAlertBg: '#fbe6e2',
  statusNeutral: '#83827d',
  statusNeutralBg: '#f1f0ee',
});

export const PDF_PAGE = Object.freeze({
  size: 'A4',
  // Comfortable office-print margins; keeps running header/footer clear of content.
  marginTop: 64,
  marginBottom: 48,
  marginHorizontal: 40,
});

export function statusColors(status) {
  switch (status) {
    case 'done': return { fg: PDF_COLORS.statusDone, bg: PDF_COLORS.statusDoneBg };
    case 'current': return { fg: PDF_COLORS.accent, bg: PDF_COLORS.accentSoft };
    case 'ahead': return { fg: PDF_COLORS.statusDone, bg: PDF_COLORS.statusDoneBg };
    case 'behind': return { fg: PDF_COLORS.statusAlert, bg: PDF_COLORS.statusAlertBg };
    case 'on_track': return { fg: PDF_COLORS.statusDone, bg: PDF_COLORS.statusDoneBg };
    case 'Ready': return { fg: PDF_COLORS.statusDone, bg: PDF_COLORS.statusDoneBg };
    case 'At Risk': return { fg: PDF_COLORS.statusWarn, bg: PDF_COLORS.statusWarnBg };
    case 'Critical': case 'Overdue': return { fg: PDF_COLORS.statusAlert, bg: PDF_COLORS.statusAlertBg };
    case 'LOW': return { fg: PDF_COLORS.statusDone, bg: PDF_COLORS.statusDoneBg };
    case 'MEDIUM': return { fg: PDF_COLORS.statusWarn, bg: PDF_COLORS.statusWarnBg };
    case 'HIGH': case 'CRITICAL': return { fg: PDF_COLORS.statusAlert, bg: PDF_COLORS.statusAlertBg };
    default: return { fg: PDF_COLORS.statusNeutral, bg: PDF_COLORS.statusNeutralBg };
  }
}
