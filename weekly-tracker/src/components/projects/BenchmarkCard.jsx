import { useId, useState } from "react";

/**
 * One reusable card for all 5 Benchmark metrics and all 3 Benchmark Engine
 * statuses. Renders only strings/booleans already computed by
 * core/presentation/projectBenchmarkModel.js — no calculation here.
 */
export default function BenchmarkCard({ card }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  if (card.status === "TARGET_NOT_ELIGIBLE") {
    return (
      <div className="benchmark-card benchmark-card--unavailable">
        <div className="benchmark-card-title">{card.title}</div>
        <div className="benchmark-unavailable-heading">Benchmark unavailable</div>
        <div className="benchmark-unavailable-text">{card.reasonText}</div>
      </div>
    );
  }

  if (card.status === "INSUFFICIENT_EVIDENCE") {
    const found = card.bestAvailableSampleSize ?? 0;
    return (
      <div className="benchmark-card benchmark-card--unavailable">
        <div className="benchmark-card-title">{card.title}</div>
        <div className="benchmark-unavailable-heading">Not enough comparable history</div>
        <div className="benchmark-unavailable-text">
          {found} comparable project{found === 1 ? "" : "s"} found. At least {card.minimumSampleSize} are required for a benchmark.
        </div>
      </div>
    );
  }

  // AVAILABLE
  return (
    <div className="benchmark-card">
      <div className="benchmark-card-title">{card.title}</div>

      <div className="benchmark-stat-label">Median</div>
      <div className="benchmark-stat-value">{card.median}</div>

      <div className="benchmark-stat-label">Typical range</div>
      <div className="benchmark-stat-secondary">{card.typicalRange}</div>

      <div className="benchmark-sample-size">
        {card.sampleSize} comparable project{card.sampleSize === 1 ? "" : "s"}
      </div>

      <div className="benchmark-your-project">
        <div className="benchmark-stat-label">Your project</div>
        {card.comparisonAvailable ? (
          <>
            <div className="benchmark-stat-value">{card.yourValue}</div>
            <div className="benchmark-comparison">
              <span className="benchmark-comparison-label">vs median</span> {card.comparisonText}
            </div>
          </>
        ) : (
          <div className="benchmark-not-available-yet">{card.notAvailableYetText}</div>
        )}
      </div>

      {card.hint && <div className="benchmark-hint">{card.hint}</div>}

      <button
        type="button"
        className="benchmark-disclosure-toggle"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen(open => !open)}
      >
        Comparison basis {detailsOpen ? "▲" : "▼"}
      </button>

      {detailsOpen && (
        <div id={detailsId} className="benchmark-disclosure-panel">
          <div className="benchmark-criteria-row">
            <span>Match</span>
            <span>{card.tierLabel}</span>
          </div>
          {card.criteria.map(c => (
            <div key={c.label} className="benchmark-criteria-row">
              <span>{c.label}</span>
              <span>{c.value}</span>
            </div>
          ))}
          <div className="benchmark-criteria-row">
            <span>Comparable projects</span>
            <span>{card.sampleSize}</span>
          </div>
          <div className="benchmark-criteria-row">
            <span>Mean</span>
            <span>{card.mean}</span>
          </div>
          <div className="benchmark-criteria-row">
            <span>Full range</span>
            <span>{card.fullRange}</span>
          </div>
        </div>
      )}
    </div>
  );
}
