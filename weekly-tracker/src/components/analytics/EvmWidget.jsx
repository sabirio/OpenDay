function spiColor(spi) {
  if (spi >= 1.0)  return '#10b981';
  if (spi >= 0.95) return '#f97316';
  if (spi >= 0.85) return '#f97316';
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
      <line
        x1={0} y1={H - ((1.0 - minSpi) / range) * H}
        x2={W} y2={H - ((1.0 - minSpi) / range) * H}
        stroke="#374151" strokeWidth={1} strokeDasharray="3,3"
      />
      <polyline points={pts.join(' ')} fill="none" stroke="#22d3ee" strokeWidth={2} />
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
      <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
        No schedule data
      </div>
    );
  }

  const c      = spiColor(evm.SPI);
  const gaugeW = 64;
  const gauge  = Math.round(Math.min(1, Math.max(0, evm.SPI)) * gaugeW);

  const tcpiChip = evm.tcpiStatus === 'unrealistic'
    ? { color: '#fca5a5', bg: '#7f1d1d', border: '#991b1b' }
    : { color: '#fdba74', bg: '#7c2d12', border: '#92400e' };

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        EVM — Schedule Performance
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }}>
            {evm.SPI.toFixed(2)}
          </span>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>SPI</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: '#374151', borderRadius: 3, height: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${(gauge / gaugeW) * 100}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>
            EV {evm.EV}% · PV {evm.PV}%
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: c + '22', color: c, border: `1px solid ${c}44`,
        }}>
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
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Forecast delay: <strong style={{ color: '#ef4444' }}>+{evm.EACdays}d</strong>
        </div>
      )}

      {evm.spiHistory?.length >= 2 && (
        <div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>Weekly SPI</div>
          <Sparkline history={evm.spiHistory} />
        </div>
      )}
    </div>
  );
}
