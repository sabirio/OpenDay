import { Link, useParams } from 'react-router-dom';
import { useProjectVariations } from '../hooks/useProjectVariations.js';
import { useToast } from '../components/shared/Toast.jsx';
import { CommercialReview } from '../components/variations/VariationWorkspace.jsx';
import CostPackageFinancialOverview from '../components/variations/CostPackageFinancialOverview.jsx';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

export default function ProjectCostForecast() {
  const { projectId } = useParams();
  const editor = useProjectVariations(projectId);
  const toast = useToast();
  const backHref = useProjectReturnHref(projectId, 'commercial');

  if (editor.status === 'loading') return <main className="variation-page" role="status">Loading Cost Packages and Forecast…</main>;
  if (editor.status === 'error') {
    const setupRequired = editor.error?.message === 'FINANCIAL_OVERVIEW_FORBIDDEN';
    return <main className="variation-page commercial-flow-page"><header className="variation-page-header commercial-page-header"><div><Link to={backHref}>← Back to Commercial</Link><h1>{setupRequired ? 'Cost Package forecast is not available yet' : 'Cost Packages and Forecast could not be loaded'}</h1><p>{setupRequired ? 'Configure the project Procurement Strategy and confirm commercial access before opening package forecasts. Additional Works remains available on its own page.' : editor.error?.message}</p></div></header><div className="variation-empty"><div className="variation-form-actions">{setupRequired && <Link className="btn btn-primary" to={`/projects/${projectId}/cost-packages`}>Open Procurement Strategy</Link>}<button className="btn" onClick={editor.retry}>Retry</button></div></div></main>;
  }

  const workspace = editor.workspace;
  const onError = error => toast.error(error?.message || 'Commercial action failed.');

  return <main className="variation-page commercial-flow-page">
    <header className="variation-page-header commercial-page-header">
      <div><Link to={backHref}>← Back to Commercial</Link><span>{workspace.projectCode}</span><h1>Cost Packages and Forecast</h1><p>Budget, commitments, approved additional works and forecast remain together as the commercial source of truth.</p></div>
      <strong>{workspace.currencyCode}</strong>
    </header>
    <div className="commercial-flow">
      <CostPackageFinancialOverview overview={workspace.costPackageFinancials} editor={editor} onSuccess={toast.success} onError={onError}/>
      <CommercialReview review={workspace.commercialReview} editor={editor} currency={workspace.currencyCode} onSuccess={toast.success} onError={onError}/>
    </div>
  </main>;
}
