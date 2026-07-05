// ── SPI sparkline (SVG, no external library) ──────────────────────────────────

function SPISparkline({ points, width = 140, height = 44 }) {
  const valid = (points || []).filter(p => p.spi !== null);
  if (valid.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No trend</span>;

  const minV  = Math.min(0.5, ...valid.map(p => p.spi));
  const maxV  = Math.max(1.5, ...valid.map(p => p.spi));
  const range = maxV - minV || 1;
  const xStep = width / (valid.length - 1);
  const toX   = i => (i * xStep).toFixed(1);
  const toY   = v => (height - ((v - minV) / range) * height).toFixed(1);

  const d     = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.spi)}`).join(' ');
  const last  = valid[valid.length - 1].spi;
  const color = last >= 0.95 ? 'var(--status-done)' : last >= 0.80 ? 'var(--status-warn)' : 'var(--status-alert)';
  const refY  = toY(1.0);

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <line x1="0" y1={refY} x2={width} y2={refY} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={toX(valid.length - 1)} cy={toY(last)} r="3" fill={color}/>
    </svg>
  );
}

export default SPISparkline;
