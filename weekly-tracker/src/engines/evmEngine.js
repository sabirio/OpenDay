// Earned Value Management engine — pure functions, no React.
// Normalizes BAC = 100 (progress % as the unit — no monetary budget available).
import { computeScheduleDeviation } from './riskEngine';
import {
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
} from '../utils/reportUtils';
import { computeProjectProgressFromWP } from '../config/workPackages';

// ─── Internal ─────────────────────────────────────────────────────────────────

function progressAtIndex(sortedReports, index) {
  const slice = sortedReports.slice(0, index + 1);
  const wpCum = computeWPCumulativeStatuses(slice);
  if (wpCum?.workPackageStatuses) {
    return computeProjectProgressFromWP(wpCum.workPackageStatuses);
  }
  return estimateProgressFromStatuses(computeCumulativeStatuses(slice));
}

function pvAtDate(project, date) {
  const start = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const end   = project.constructionEndDate
    ? new Date(project.constructionEndDate)
    : project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  if (!start || !end || end <= start) return 0;
  const totalDays   = Math.ceil((end - start) / 86400000);
  const elapsedDays = Math.max(0, Math.ceil((date - start) / 86400000));
  return Math.min(100, Math.round((elapsedDays / totalDays) * 100));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute Earned Value Management metrics for a project.
 *
 * Uses progress % as the normalised unit (BAC = 100).
 * EV = actual progress, PV = planned progress by today (from computeScheduleDeviation).
 *
 * @param {object}   project        — project row (constructionStartDate, targetOpeningDate …)
 * @param {object[]} sortedReports  — reports sorted oldest-first
 * @param {number}   progress       — current overall progress %
 * @returns EVM metrics object, or null when insufficient schedule data exists.
 */
export function computeEVM(project, sortedReports, progress) {
  const schedDev = computeScheduleDeviation(project, progress);
  if (!schedDev) return null;

  const BAC = 100;
  const EV  = progress;
  const PV  = schedDev.expectedPct;

  // SPI — schedule performance index
  const SPI = PV > 0 ? Math.round((EV / PV) * 100) / 100 : (EV > 0 ? 1 : 0);

  // EAC forecast delay in days: project takes totalDays/SPI instead of totalDays
  let EACdays = 0;
  if (SPI > 0 && SPI < 1 && schedDev.totalDays > 0) {
    EACdays = Math.max(0, Math.round(schedDev.totalDays * (1 / SPI) - schedDev.totalDays));
  }

  // EAC as a Date (forecast opening)
  let EAC = null;
  if (project.targetOpeningDate) {
    const base = new Date(project.targetOpeningDate);
    EAC = EACdays > 0 ? new Date(base.getTime() + EACdays * 86400000) : base;
  }

  // TCPI — to-complete performance index: work remaining / time remaining (normalised)
  const remainingWork = BAC - EV;
  const remainingTime = BAC - PV;  // how much "planned time" is left
  const TCPI = remainingTime > 0 ? Math.round((remainingWork / remainingTime) * 100) / 100 : null;

  // Interpretation
  let spiStatus;
  if (SPI >= 1.0)       spiStatus = 'on_track';
  else if (SPI >= 0.95) spiStatus = 'minor_delay';
  else if (SPI >= 0.85) spiStatus = 'significant_delay';
  else                  spiStatus = 'critical';

  let tcpiStatus   = 'achievable';
  let tcpiWarning  = null;
  if (TCPI !== null) {
    if (TCPI > 1.2) {
      tcpiStatus  = 'unrealistic';
      tcpiWarning = `Need to accelerate by ${Math.round((TCPI - 1) * 100)}% — unrealistic`;
    } else if (TCPI > 1.1) {
      tcpiStatus  = 'challenging';
      tcpiWarning = `Need to accelerate by ${Math.round((TCPI - 1) * 100)}%`;
    }
  }

  // Weekly SPI history — one data point per report
  const spiHistory = sortedReports.map((report, i) => {
    const ev = progressAtIndex(sortedReports, i);
    const pv = pvAtDate(project, new Date(report.reportingDate || report.submittedAt));
    const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : (ev > 0 ? 1 : 0);
    return { date: report.reportingDate || report.submittedAt, spi, ev, pv };
  });

  return { BAC, EV, PV, SPI, EAC, EACdays, TCPI, spiStatus, tcpiStatus, tcpiWarning, spiHistory };
}
