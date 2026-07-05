/**
 * JSDoc-only type definitions for the opendayEngine orchestration layer.
 * The project checks JS via tsc with allowJs/checkJs off for runtime code
 * (see tsconfig), so these typedefs are documentation + editor hints, not
 * enforced at build time. Keep them in sync with the actual return shapes
 * in evaluateProjectState.js / evaluatePortfolioState.js / etc. — they are
 * not auto-derived.
 */

/**
 * @typedef {object} ProjectState
 * @property {object} project
 * @property {object|null} latestReport
 * @property {object} cumulativeStatuses
 * @property {object|null} wpCumulativeStatuses
 * @property {number} progress — 0-100, official weighted progress
 * @property {Array} projReports
 * @property {Array} projSiteVisits
 * @property {Array} sorted — projReports sorted oldest -> newest
 * @property {Array<{date:string, value:number}>} progressPoints
 * @property {number|null} daysSinceReport
 * @property {boolean} missingReport
 * @property {number|null} daysToOpening
 * @property {object} riskScore — computeProjectRiskScore() output
 * @property {string} riskLevel — 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'
 * @property {number} priorityScore
 * @property {object} progressComparison — calculateProgressComparison() output
 * @property {object|null} prevProgressComparison
 * @property {object} confidence — computeConfidenceLevel() output
 * @property {object} contScore — computeContractorScores() output
 * @property {object} health — computeProjectHealth() output
 * @property {object} readiness — computeOpeningReadiness() output
 */

/**
 * @typedef {object} PortfolioState
 * @property {Array<ProjectState & {gantt: object|null}>} rows
 * @property {object} kpis — computePortfolioKpis() output
 * @property {Array} alerts — computePortfolioAlerts() output
 * @property {Array} contractorPerf — computeContractorPerf() output
 */

/**
 * @typedef {object} ReportImpact
 * @property {object} progressComparison
 * @property {Array<{date:string, pct:number}>} series
 * @property {object|null} wpDeltas
 * @property {object|null} phaseChangeFlags
 * @property {Array} phases
 */

/**
 * @typedef {object} SiteVisitImpact
 * @property {object} visit
 * @property {object} project
 * @property {object|null} gcReport
 * @property {Array} items
 * @property {number} assessed
 * @property {number} matches
 * @property {number} discrepancies
 * @property {number} pmAhead
 * @property {number|null} matchRate
 * @property {object} kpis — computeSiteVisitKpis() output for this one visit
 */

export {};
