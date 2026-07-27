import { useProjectBenchmark } from "../../hooks/useProjectBenchmark";
import BenchmarkCard from "./BenchmarkCard";

/**
 * Project Benchmark v1 — "How does this project compare with genuinely
 * similar previous projects?" Deterministic historical evidence, not AI and
 * not forecasting: exactly the 5 frozen Benchmark Engine metrics, each
 * rendered from its own independently-resolved cohort.
 */
export default function BenchmarkView({ project, projects }) {
  const cards = useProjectBenchmark(project, projects);

  return (
    <div className="benchmark-view">
      <div className="benchmark-view-header">
        <h2 className="benchmark-view-title">Benchmark</h2>
        <p className="benchmark-view-subtitle">Compare this project with similar historical projects.</p>
        <p className="benchmark-view-note">Benchmarks are based on comparable projects available in OpenDay.</p>
      </div>

      <div className="benchmark-grid">
        {cards.map(card => (
          <BenchmarkCard key={card.metric} card={card} />
        ))}
      </div>
    </div>
  );
}
