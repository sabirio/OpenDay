function spiColor(spi) {
  if (spi >= 1.0)  return 'var(--status-done)';
  if (spi >= 0.85) return 'var(--status-warn)';
  return 'var(--status-alert)';
}

const SPI_BADGE = {
  on_track:          { color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
  minor_delay:       { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  significant_delay: { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
};
const SPI_BADGE_FALLBACK = { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' };

function Sparkline({ history }) {
  if (!history || history.length < 2) return null;

  const W = 160, H = 32;
  const spis   = history.map(p => p.spi);
  const minSpi = Math.min(0.5, ...spis);
  const maxSpi = Math.max(1.2, ...spis);
  const range  = maxSpi - minSpi || 1;

  const pts = spis.map((s, i) => {
    const x = (i / (spis.length - 1)) * W;
    const y = H - ((s - minSpi) / range) * H;
    return `${x},${y}`;
  });

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <line
        x1={0} y1={H - ((1.0 - minSpi) / range) * H}
        x2={W} y2={H - ((1.0 - minSpi) / range) * H}
        stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3"
      />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {(() => {
        const last = pts[pts.length - 1].split(',');
        const c    = spiColor(spis[spis.length - 1]);
        return <circle cx={last[0]} cy={last[1]} r={4} fill={c} />;
      })()}
    </svg>
  );
}

export default function EvmWidget({ evm }) {
  if (!evm) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No schedule data
      </div>
    );
  }

  const c      = spiColor(evm.SPI);
  const gaugeW = 64;
  const gauge  = Math.round(Math.min(1, Math.max(0, evm.SPI)) * gaugeW);

  const tcpiChip = evm.tcpiStatus === 'unrealistic'
    ? { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' }
    : { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' };

  const badge = SPI_BADGE[evm.spiStatus] ?? SPI_BADGE_FALLBACK;

  return (
    <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        EVM — Schedule Performance
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }}>
            {evm.SPI.toFixed(2)}
          </span>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>SPI</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${(gauge / gaugeW) * 100}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            EV {evm.EV}% · PV {evm.PV}%
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
          {evm.spiStatus === 'on_track'           ? 'On Track'
           : evm.spiStatus === 'minor_delay'       ? 'Minor Delay'
           : evm.spiStatus === 'significant_delay' ? 'Significant'
           : 'Critical'}
        </span>
      </div>

      {evm.tcpiWarning && (
        <div style={{ fontSize: 11, color: tcpiChip.color, background: tcpiChip.bg, border: `1px solid ${tcpiChip.border}`, borderRadius: 6, padding: '5px 8px', marginBottom: 8 }}>
          ⚡ {evm.tcpiWarning} (TCPI {evm.TCPI?.toFixed(2)})
        </div>
      )}

      {evm.EACdays > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Forecast delay: <strong style={{ color: 'var(--status-alert)' }}>+{evm.EACdays}d</strong>
        </div>
      )}

      {evm.spiHistory?.length >= 2 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>Weekly SPI</div>
          <Sparkline history={evm.spiHistory} />
        </div>
      )}
    </div>
  );
}
