import { RISK_COLORS } from "../config/riskConfig";
import { riskLevelToCanonicalTone } from "../config/statusColors";
import { MAX_RISK_SCORE } from "../hooks/useRiskLevelPresentation";
import { computeGaugeArc } from "../hooks/useChartMathPresentation";
import StatusBadge from "./shared/StatusBadge.jsx";

export function RiskGauge({ score, level, color }) {
  const R = 45;
  const { circumference: C, dash } = computeGaugeArc(score, MAX_RISK_SCORE, R);
  return (
    <svg width={110} height={110} viewBox="0 0 110 110">
      <circle cx={55} cy={55} r={R} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle cx={55} cy={55} r={R} fill="none" stroke={color.border}
        strokeWidth={10} strokeDasharray={`${dash} ${C - dash}`}
        strokeLinecap="round" transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dasharray 0.5s ease" }} />
      <text x={55} y={50} textAnchor="middle" fontSize={24} fontWeight={800} fill={color.text}>{score}</text>
      <text x={55} y={67} textAnchor="middle" fontSize={10} fontWeight={700} fill={color.text}>{level}</text>
    </svg>
  );
}

export function RiskBadge({ level }) {
  return <StatusBadge tone={riskLevelToCanonicalTone(level)}>{level}</StatusBadge>;
}

export function HealthBadge({ score, level, color, bg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${color}44`, borderRadius: 8, padding: "1px 7px", textTransform: "uppercase" }}>{level}</div>
    </div>
  );
}

export function DimCell({ level }) {
  const c = RISK_COLORS[level] || RISK_COLORS.LOW;
  const lbl = { LOW: "L", MEDIUM: "M", HIGH: "H", CRITICAL: "C" }[level] || "?";
  return (
    <td style={{ padding: "5px 4px", textAlign: "center" }}>
      <div style={{ width: 28, height: 24, borderRadius: 5, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 11, fontWeight: 800, color: c.text }}>
        {lbl}
      </div>
    </td>
  );
}
