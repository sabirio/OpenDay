import {Link,useParams} from 'react-router-dom';
import {useResolvedProject} from '../hooks/useResolvedProject.js';
import {useTenderSetup} from '../hooks/useTenderSetup.js';
import {useToast} from '../components/shared/Toast.jsx';
import TenderSetupEditor from '../components/tender/TenderSetupEditor.jsx';
import {useProjectReturnHref} from '../hooks/useProjectReturnHref.js';

function Workspace({project}){
  const editor=useTenderSetup(project);const toast=useToast();const backHref=useProjectReturnHref(project.id,'tender');
  if(editor.status==='loading')return <div className="boq-state" role="status">Loading tender setup…</div>;
  if(editor.status==='error')return <div className="boq-state boq-state-error" role="alert"><h2>Tender setup could not be loaded</h2><p>{editor.error?.code||'Please try again.'}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  return <main className="tender-page">
    <header className="boq-page-header"><div><Link to={backHref}>← Project Tender</Link><span>{project.storeCode}</span><h1>Tender setup</h1><p>Define the package issued by the procuring organization to bidding organizations.</p></div><div className="boq-header-meta"><span>{editor.context.tenders.length} tender</span><span>{editor.context.latestSetup?`Setup R${editor.context.latestSetup.revisionNumber}`:'Not saved'}</span></div></header>
    <TenderSetupEditor editor={editor} onSaved={r=>toast.success(`Tender setup revision ${r.revisionNumber} saved.`)} onInvited={r=>toast.success(`Secure tender invitation sent to ${r.email}.`)} onRoundOpened={r=>toast.success(`Bid Round ${r.roundNumber} opened.`)} onReviewed={r=>toast.success(`Bid review status: ${r.status}.`)} onClarification={message=>toast.success(message)} onAwarded={r=>toast.success(`Tender awarded to ${r.biddingOrganizationName||r.contractorName}.`)} onScopeMaterialized={r=>toast.success(`Execution Scope revision ${r.revisionNumber} is ready to schedule.`)} onError={e=>toast.error(e?.message||'Tender action could not be completed.')}/>
  </main>;
}

export default function ProjectTenderSetup({projects=[]}){
  const{projectId}=useParams();const project=useResolvedProject(projects,projectId);if(project===false)return <div className="boq-state boq-state-error">Project is unavailable.</div>;if(!project)return <div className="boq-state">Loading project…</div>;return <Workspace project={project}/>;
}
