// portfolioEngineAlerts.test.mjs — tests for the SPI fold in computePortfolioAlerts.
// Uses the node:module register loader to handle extensionless Vite-style imports.
// Run: node src/tests/portfolioEngineAlerts.test.mjs

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computePortfolioAlerts } = await import('../engines/portfolioEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

// Minimal row fixture — covers all fields destructured by computePortfolioAlerts.
function makeRow(overrides = {}) {
  return {
    project: { id: 'p1', storeCode: 'ST01', shoppingMallName: 'Mall A' },
    latestReport: null,
    progress: 50,
    daysToOpening: 90,
    riskLevel: 'LOW',
    gantt: null,
    ...overrides,
  };
}

// ── A) Backward-compat: existing alert types still fire without gantt data ──

console.log('\nA) Backward-compat — non-SPI alerts unaffected');

{
  const row = makeRow({
    daysToOpening: 10,
    progress: 40,
    latestReport: { activitiesBlocked: 'No', projectScheduleStatus: 'On Track', riskScale: null, riskDescription: '' },
  });
  const alerts = computePortfolioAlerts([row]);
  const opening = alerts.find(a => a.reason === 'Opening approaching — low progress');
  check('A1: opening-proximity alert fires (no gantt needed)', opening != null);
  check('A1: no spurious SPI alert when gantt=null', !alerts.some(a => a.type === 'spi'));
}

// ── B) SPI fold — completion guard fires ──────────────────────────────────────

console.log('\nB) SPI fold — completion guard (progress=100 suppresses SPI alert)');

{
  const row = makeRow({
    progress: 100,
    gantt: { spi: 0.4, spiStatus: 'critical', criticalHealth: { behind: 2 } },
  });
  const alerts = computePortfolioAlerts([row]);
  check('B1: progress=100 → no SPI alert', !alerts.some(a => a.type === 'spi'));
}

// ── C) SPI fold — critical fires when progress < 100 ─────────────────────────

console.log('\nC) SPI fold — critical alert generated');

{
  const row = makeRow({
    progress: 45,
    gantt: { spi: 0.55, spiStatus: 'critical', criticalHealth: { behind: 3 } },
  });
  const alerts = computePortfolioAlerts([row]);
  const spi = alerts.find(a => a.type === 'spi');
  check('C1: SPI critical → alert present',          spi != null);
  check('C1: sev = CRITICAL',                        spi?.sev === 'CRITICAL');
  check('C1: reason = "SPI critical"',               spi?.reason === 'SPI critical');
  check('C1: spi value preserved',                   spi?.spi === 0.55);
  check('C1: spiStatus = critical',                  spi?.spiStatus === 'critical');
  check('C1: criticalTasksBehind = 3',               spi?.criticalTasksBehind === 3);
  check('C1: pid = project.id',                      spi?.pid === 'p1');
  check('C1: code = storeCode',                      spi?.code === 'ST01');
}

// ── D) SPI fold — at_risk fires with HIGH severity ───────────────────────────

console.log('\nD) SPI fold — at_risk alert');

{
  const row = makeRow({
    progress: 60,
    gantt: { spi: 0.82, spiStatus: 'at_risk', criticalHealth: { behind: 0 } },
  });
  const alerts = computePortfolioAlerts([row]);
  const spi = alerts.find(a => a.type === 'spi');
  check('D1: SPI at_risk → alert present',    spi != null);
  check('D1: sev = HIGH',                     spi?.sev === 'HIGH');
  check('D1: reason = "SPI at risk"',         spi?.reason === 'SPI at risk');
  check('D1: criticalTasksBehind = 0',        spi?.criticalTasksBehind === 0);
}

// ── E) SPI fold — no alert when gantt is null (Home before metrics load) ─────

console.log('\nE) SPI fold — no alert when no gantt data');

{
  const row = makeRow({ progress: 30, gantt: null });
  const alerts = computePortfolioAlerts([row]);
  check('E1: gantt=null → no SPI alert', !alerts.some(a => a.type === 'spi'));
}

// ── F) SPI fold — no alert when spi is null (no_schedule) ────────────────────

console.log('\nF) SPI fold — no alert when spi=null (stale/missing Gantt)');

{
  const row = makeRow({
    progress: 30,
    gantt: { spi: null, spiStatus: 'no_schedule', criticalHealth: { behind: 0 } },
  });
  const alerts = computePortfolioAlerts([row]);
  check('F1: spi=null → no SPI alert', !alerts.some(a => a.type === 'spi'));
}

// ── G) alertsToInsights still works with extra spi fields (adapter ignores them) ─

console.log('\nG) alertsToInsights handles SPI alert shape (extra fields ignored)');

import('../../../weekly-tracker/src/core/insights/adapters/portfolioAlerts.js')
  .catch(() => import('../core/insights/adapters/portfolioAlerts.js'))
  .then(({ alertsToInsights }) => {
    const row = makeRow({
      progress: 45,
      gantt: { spi: 0.55, spiStatus: 'critical', criticalHealth: { behind: 1 } },
    });
    const alerts = computePortfolioAlerts([row]);
    const spiAlert = alerts.find(a => a.type === 'spi');
    const insights = alertsToInsights([spiAlert]);
    check('G1: insight created from SPI alert',          insights.length === 1);
    check('G1: severity = critical',                     insights[0].severity === 'critical');
    check('G1: title = code — reason',                   insights[0].title === `${spiAlert.code} — SPI critical`);
    check('G1: no extra fields leaked to insight shape', !('spi' in insights[0]));

    console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
    process.exit(fail === 0 ? 0 : 1);
  });
