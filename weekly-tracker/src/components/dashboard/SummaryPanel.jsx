import { KpiCard } from './DashboardWidgets';

/** @param {{ kpis: object, reportsTotal: number }} props */
export default function SummaryPanel({ kpis, reportsTotal }) {
  return (
    <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:16 }}>
      <KpiCard label="Total Projects"    value={kpis.total}           color="#475569"/>
      <KpiCard label="Active"            value={kpis.active}          color="#2f855a"  sub={`${kpis.total-kpis.active} closed`}/>
      <KpiCard label="At Risk"           value={kpis.atRisk}          color={kpis.atRisk>0?"#d97706":"#22c55e"}  sub="schedule issues"/>
      <KpiCard label="Critical"          value={kpis.critical}        color={kpis.critical>0?"#dc2626":"#22c55e"} sub="immediate action"/>
      <KpiCard label="Reports This Week" value={kpis.reportsThisWeek} color="#0891b2"  sub={`${reportsTotal} total`}/>
      <KpiCard label="Opening <30 Days"  value={kpis.openingSoon}     color={kpis.openingSoon>0?"#ea580c":"#22c55e"} sub="proximity alert"/>
    </div>
  );
}
