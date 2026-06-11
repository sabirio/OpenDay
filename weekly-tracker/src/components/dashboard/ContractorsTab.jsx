export default function ContractorsTab({ contractorPerf }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight:700,fontSize:15,color:"#111827",marginBottom:4 }}>Contractor Performance</div>
      <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Grouped by general contractor · sorted by risk indicators</div>
      {contractorPerf.length===0?<div style={{ textAlign:"center",color:"#9ca3af",padding:"48px 0" }}>No contractor data.</div>:(
        <div style={{ overflowX:"auto" }}>
          <table className="dashboard-table" style={{ minWidth:760 }}>
            <thead><tr><th>Contractor</th><th>Projects</th><th>Avg Progress</th><th>At Risk</th><th>Blockers</th><th>Support</th><th>Missing Reports</th><th>Total Reports</th></tr></thead>
            <tbody>{contractorPerf.map(c=>{
              const hasIssue=c.atRisk>0||c.blockers>0;
              return (
                <tr key={c.name} style={{ background:hasIssue?"#fffbeb":undefined }}>
                  <td><div style={{ fontWeight:700,color:"#111827" }}>{c.name}</div><div style={{ fontSize:11,color:"#9ca3af" }}>{c.projects.join(", ")}</div></td>
                  <td style={{ fontSize:13,fontWeight:700 }}>{c.n}</td>
                  <td>
                    <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                      <div style={{ width:48,background:"#e5e7eb",borderRadius:3,height:6,overflow:"hidden" }}><div style={{ width:`${c.avgProg}%`,height:"100%",background:c.avgProg>=75?"#22c55e":c.avgProg>=40?"#3b82f6":"#f59e0b",borderRadius:3 }}/></div>
                      <span style={{ fontSize:12,fontWeight:700 }}>{c.avgProg}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize:13,fontWeight:700,color:c.atRisk>0?"#d97706":"#22c55e" }}>{c.atRisk}/{c.n}</td>
                  <td style={{ fontSize:13,fontWeight:700,color:c.blockers>0?"#dc2626":"#22c55e" }}>{c.blockers}/{c.n}</td>
                  <td style={{ fontSize:13,fontWeight:700,color:c.support>0?"#7c3aed":"#22c55e" }}>{c.support}/{c.n}</td>
                  <td style={{ fontSize:13,fontWeight:700,color:c.missing>0?"#dc2626":"#22c55e" }}>{c.missing}/{c.n}</td>
                  <td style={{ fontSize:13,color:"#374151" }}>{c.reportCount}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
