/**
 * Presentation-facing explain-progress helpers — thin core facade over
 * engines/explainProgressEngine.js so pages/components/hooks (which must not
 * import engines/ directly) can reach these pure, render-time-safe
 * calculations via UI -> hooks -> core -> engines.
 */
export {
  isExplainDriftSignificant,
  EXPLAIN_DRIFT_THRESHOLD_PP,
} from '../../engines/explainProgressEngine';
