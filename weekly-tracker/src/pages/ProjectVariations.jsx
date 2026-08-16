import { Link, useParams } from 'react-router-dom';
import { useProjectVariations } from '../hooks/useProjectVariations.js';
import { useToast } from '../components/shared/Toast.jsx';
import VariationWorkspace, { CommercialReview } from '../components/variations/VariationWorkspace.jsx';
import CostPackageFinancialOverview from '../components/variations/CostPackageFinancialOverview.jsx';

export default function ProjectVariations() {
  const { projectId } = useParams();
  const editor = useProjectVariations(projectId);
  const toast = useToast();
  if (editor.status === 'loading') return <div className="variation-state">Loading variations…</div>;
  if (editor.status === 'error') return <div className="variation-state"><h2>Variations could not be loaded</h2><p>{editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  const workspace = editor.workspace;
  const onError = error => toast.error(error?.message || 'Variation action failed.');
  return <main className="variation-page">
    <header className="variation-page-header"><div><Link to={workspace.backHref}>← Back</Link><span>{workspace.projectCode}</span><h1>Additional Works / Variations</h1><p>Dedicated commercial workflow for proposed additional cost and approved variations.</p></div><strong>{workspace.currencyCode}</strong></header>
    <CostPackageFinancialOverview overview={workspace.costPackageFinancials} editor={editor} onSuccess={toast.success} onError={onError}/>
    <CommercialReview review={workspace.commercialReview} editor={editor} currency={workspace.currencyCode} onSuccess={toast.success} onError={onError}/>
    <VariationWorkspace editor={editor} onSuccess={toast.success} onError={onError}/>
  </main>;
}
