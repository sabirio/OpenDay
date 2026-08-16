import { Link, useParams } from 'react-router-dom';
import { useResolvedProject } from '../hooks/useResolvedProject.js';
import { useCommercialFoundation } from '../hooks/useCommercialFoundation.js';
import { useToast } from '../components/shared/Toast.jsx';
import CommercialFoundationWorkspace from '../components/commercial/CommercialFoundationWorkspace.jsx';

function Workspace({ project }) {
  const editor = useCommercialFoundation(project);
  const toast = useToast();
  if (editor.status === 'loading') return <div className="boq-state">Loading commercial setup…</div>;
  if (editor.status === 'error') return <div className="boq-state boq-state-error"><h2>Commercial setup could not be loaded</h2><p>{editor.error?.code || editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  return <main className="commercial-foundation-page"><header className="boq-page-header"><div><Link to="/projects">← Portfolio</Link><span>{project.storeCode}</span><h1>Commercial Setup</h1><p>Define Cost Packages, procurement methods, Project Team ownership and capabilities.</p></div><div className="boq-header-meta"><span>{editor.view.project.currencyCode}</span><span>{editor.view.costPackageCount} packages</span></div></header><CommercialFoundationWorkspace editor={editor} onSuccess={toast.success} onError={error => toast.error(error?.message || 'Commercial setup action failed.')}/></main>;
}

export default function ProjectCommercialSetup({ projects = [] }) {
  const { projectId } = useParams();
  const project = useResolvedProject(projects, projectId);
  if (project === false) return <div className="boq-state boq-state-error">Project is unavailable.</div>;
  if (!project) return <div className="boq-state">Loading project…</div>;
  return <Workspace project={project}/>;
}
