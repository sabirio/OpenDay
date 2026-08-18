import { Link, useParams } from 'react-router-dom';
import { useResolvedProject } from '../hooks/useResolvedProject.js';
import { useCommercialFoundation } from '../hooks/useCommercialFoundation.js';
import { useToast } from '../components/shared/Toast.jsx';
import CommercialFoundationWorkspace from '../components/commercial/CommercialFoundationWorkspace.jsx';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

const SECTION_COPY = {
  'cost-packages': { title: 'Procurement Strategy', description: 'Choose the contractor appointment route for each main project section.', meta: view => `${view.procurementStrategyConfiguredCount} of 6 configured` },
  'tender-packages': { title: 'Tender Packages', description: 'Create the package identity and BOQ mode used by Tender Setup.', meta: view => `${view.tenderPackageCount} tender packages` },
  'project-team': { title: 'Project Team', description: 'Add internal colleagues and assign their department for this project. Access roles remain managed in Users.', meta: view => `${view.memberships.length} colleagues` },
};

function Workspace({ project, section }) {
  const editor = useCommercialFoundation(project);
  const toast = useToast();
  const copy = SECTION_COPY[section] || SECTION_COPY['cost-packages'];
  const returnTab = section === 'project-team' ? 'team' : section === 'tender-packages' ? 'tender' : 'commercial';
  const backHref = useProjectReturnHref(project.id, returnTab);
  if (editor.status === 'loading') return <div className="boq-state">Loading {copy.title}…</div>;
  if (editor.status === 'error') return <div className="boq-state boq-state-error"><h2>{copy.title} could not be loaded</h2><p>{editor.error?.code || editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  return <main className={`commercial-foundation-page${section === 'project-team' ? ' project-team-page' : ''}`}><header className="boq-page-header"><div><Link to={backHref}>← Project</Link><span>{project.storeCode}</span><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="boq-header-meta">{section === 'tender-packages' && <span>{editor.view.project.currencyCode}</span>}<span>{copy.meta(editor.view)}</span></div></header><CommercialFoundationWorkspace section={section} editor={editor} onSuccess={toast.success} onError={error => toast.error(error?.message || 'Action failed.')}/></main>;
}

export default function ProjectCommercialSetup({ projects = [], section = 'cost-packages' }) {
  const { projectId } = useParams();
  const project = useResolvedProject(projects, projectId);
  if (project === false) return <div className="boq-state boq-state-error">Project is unavailable.</div>;
  if (!project) return <div className="boq-state">Loading project…</div>;
  return <Workspace project={project} section={section}/>;
}
