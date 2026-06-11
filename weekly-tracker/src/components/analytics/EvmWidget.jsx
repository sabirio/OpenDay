// EVM Widget — compact Earned Value Management display.
// Shows SPI gauge, TCPI warning, and weekly SPI sparkline.

function spiColor(spi) {
  if (spi >= 1.0) return '#22c55e';
  if (spi >= 0.95) return '#f59e0b';
  if (spi >= 0.85) return '#ea580c';
  return '#ef4444';
}

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
      {/* SPI = 1.0 reference line */}
      <line
        x1={0} y1={H - ((1.0 - minSpi) / range) * H}
        x2={W} y2={H - ((1.0 - minSpi) / range) * H}
        stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3,3"
      />
      <polyline points={pts.join(' ')} fill="none" stroke="#3b82f6" strokeWidth={2} />
      {(() => {
        const last = pts[pts.length - 1].split(',');
        const c    = spiColor(spis[spis.length - 1]);
        return <circle cx={last[0]} cy={last[1]} r={4} fill={c} />;
      })()}
    </svg>
  );
}

/**
 * Compact EVM widget for embedding in risk dashboard rows.
 *
 * @param {{ evm: object }} props — result from computeEVM()
 */
export default function EvmWidget({ evm }) {
  if (!evm) {
    return (
      <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
        No schedule data
      </div>
    );
  }

  const c      = spiColor(evm.SPI);
  const gaugeW = 64;
  const gauge  = Math.round(Math.min(1, Math.max(0, evm.SPI)) * gaugeW);

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      {/* Header */}
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        EVM — Schedule Performance
      </div>

      {/* SPI gauge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }}>
            {evm.SPI.toFixed(2)}
          </span>
          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>SPI</div>
        </div>
        <div style={{ flex: 1 }}>
          {/* Gauge bar */}
          <div style={{ background: '#e5e7eb', borderRadius: 3, height: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${(gauge / gaugeW) * 100}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>
            EV {evm.EV}% · PV {evm.PV}%
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: c + '18', color: c, border: `1px solid ${c}44`,
        }}>
          {evm.spiStatus === 'on_track'          ? 'On Track'
           : evm.spiStatus === 'minor_delay'      ? 'Minor Delay'
           : evm.spiStatus === 'significant_delay' ? 'Significant'
           : 'Critical'}
        </span>
      </div>

      {/* TCPI warning */}
      {evm.tcpiWarning && (
        <div style={{ fontSize: 11, color: evm.tcpiStatus === 'unrealistic' ? '#dc2626' : '#d97706', background: evm.tcpiStatus === 'unrealistic' ? '#fef2f2' : '#fffbeb', border: `1px solid ${evm.tcpiStatus === 'unrealistic' ? '#fecaca' : '#fde68a'}`, borderRadius: 6, padding: '5px 8px', marginBottom: 8 }}>
          ⚡ {evm.tcpiWarning} (TCPI {evm.TCPI?.toFixed(2)})
        </div>
      )}

      {/* EAC delay */}
      {evm.EACdays > 0 && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Forecast delay: <strong style={{ color: '#dc2626' }}>+{evm.EACdays}d</strong>
        </div>
      )}

      {/* SPI sparkline */}
      {evm.spiHistory?.length >= 2 && (
        <div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>Weekly SPI</div>
          <Sparkline history={evm.spiHistory} />
        </div>
      )}
    </div>
  );
}
