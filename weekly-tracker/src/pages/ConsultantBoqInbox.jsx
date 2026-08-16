import { Link } from 'react-router-dom';
import { useConsultantBoqAssignments } from '../hooks/useConsultantBoqAssignments.js';

export default function ConsultantBoqInbox() {
  const model = useConsultantBoqAssignments();
  if (model.status === 'loading') return <div className="page-loading">Loading Consultant BOQs...</div>;
  if (model.status === 'error') return <div className="page-error"><h2>Consultant BOQs could not be loaded</h2><button type="button" className="btn btn-primary" onClick={model.retry}>Retry</button></div>;
  return (
    <main className="consultant-boq-inbox">
      <header><p className="eyebrow">Commercial</p><h1>Consultant BOQs</h1><p>Prepare measured quantities or review submitted revisions.</p></header>
      {model.assignments.length === 0 ? <div className="empty-state">No Consultant Measured Tender Packages are assigned to you.</div> : (
        <div className="consultant-boq-assignment-list">
          {model.assignments.map(item => (
            <Link key={item.tenderId} to={`/tenders/${item.tenderId}/consultant-boq`} className="consultant-boq-assignment">
              <div><strong>{item.tenderNumber}</strong><span>{item.projectLabel}</span></div>
              <div><span>{item.statusLabel}</span><small>{item.revisionLabel}</small></div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
