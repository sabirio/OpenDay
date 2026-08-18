import { Link, useParams } from 'react-router-dom';
import { useProjectVariations } from '../hooks/useProjectVariations.js';
import { useToast } from '../components/shared/Toast.jsx';
import VariationWorkspace from '../components/variations/VariationWorkspace.jsx';
import { resolveWorkspaceReturnHref, useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

export default function ProjectVariations() {
  const { projectId } = useParams();
  const editor = useProjectVariations(projectId, { includeCommercial: false });
  const toast = useToast();
  const projectBackHref = useProjectReturnHref(projectId, 'additional-works');
  if (editor.status === 'loading') return <div className="variation-state">Loading variations…</div>;
  if (editor.status === 'error') return <div className="variation-state"><h2>Variations could not be loaded</h2><p>{editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  const workspace = editor.workspace;
  const backHref = resolveWorkspaceReturnHref(workspace.backHref, projectBackHref);
  const onError = error => toast.error(error?.message || 'Variation action failed.');
  return <main className="variation-page">
    <header className="variation-page-header commercial-page-header"><div><Link to={backHref}>← Back to Additional Works</Link><span>{workspace.projectCode}</span><h1>Additional Works / Variations</h1><p>Dedicated commercial workflow showing each additional work, its explanation and its amount.</p></div><strong>{workspace.currencyCode}</strong></header>
    <VariationWorkspace editor={editor} onSuccess={toast.success} onError={onError}/>
  </main>;
}
