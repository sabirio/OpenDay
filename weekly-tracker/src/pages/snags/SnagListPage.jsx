import {useMemo,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthContext.jsx';
import {useCaptureCatalog,useProjectSnags,useSnagProductCommand} from '../../hooks/snags/useSnagController.js';
import {buildSnagListModel,SNAG_QUICK_VIEWS,formatPublishNoticeMessage} from '../../hooks/snags/useSnagPresentation.js';
import SnagCard from '../../components/snags/SnagCard.jsx';
import SnagFilters from '../../components/snags/SnagFilters.jsx';
import CaptureSetup from '../../components/snags/CaptureSetup.jsx';
import SnagFieldShell from '../../components/snags/mobile/SnagFieldShell.jsx';
import {useIsMobile} from '../../hooks/shared/useViewport.js';

export default function SnagListPage({projects=[]}){
  const{projectId}=useParams();const{user,role}=useAuth();const{status,items,reload}=useProjectSnags(projectId);const[filters,setFilters]=useState({});const[selected,setSelected]=useState([]);const[publishNotice,setPublishNotice]=useState(null);
  const isMobile=useIsMobile();
  const catalog=useCaptureCatalog(projectId);
  const publish=useSnagProductCommand(async result=>{setSelected([]);await reload();setPublishNotice(formatPublishNoticeMessage(result))});const actor=useMemo(()=>({id:user?.id,role}),[user?.id,role]);const model=buildSnagListModel(items,filters,actor);
  const searched=model.rows.filter(row=>!filters.search||`${row.title} ${row.locationLabel}`.toLowerCase().includes(filters.search.toLowerCase()));const captured=searched.filter(row=>row.publicationState==='CAPTURED');const project=projects.find(item=>String(item.id)===String(projectId));
  const selectQuickView=view=>setFilters(Object.fromEntries(Object.entries(view.filters).map(([key,value])=>[key,value==='$ACTOR'?user?.id:value])));

  if(isMobile){
    return <SnagFieldShell projectId={projectId} project={project} status={status} reload={reload} model={model} filters={filters} setFilters={setFilters} selected={selected} setSelected={setSelected} publish={publish} publishNotice={publishNotice} catalog={catalog}/>;
  }

  return <div className="snag-page"><header className="snag-page-header"><div><Link className="snag-back" to="/snags">All project observations</Link><h1>Observations</h1><p>{project?.storeCode||`Project ${projectId}`} · {model.total} items</p></div><div className="plan-version-actions"><Link className="btn" to={`/projects/${projectId}/plans`}>Drawings</Link>{model.canCreate?<Link className="btn btn-primary snag-primary-action" to={`/projects/${projectId}/plans`}>Capture on drawing</Link>:null}</div></header>
    {model.canCreate?<CaptureSetup projectId={projectId}/>:null}{captured.length&&model.canCreate?<section className="capture-review-bar" aria-label="Captured observations"><div><strong>{captured.length} Captured</strong><span>Review responsibility and details before publishing.</span></div><button className="btn btn-primary" disabled={!selected.length||publish.pending} onClick={()=>publish.execute({type:'batchPublish',projectId,snagIds:selected})}>Publish selected ({selected.length})</button>{publishNotice?<p className="snag-publish-notice" role="alert">{publishNotice}</p>:null}</section>:null}
    <nav className="snag-quick-views" aria-label="Quick views"><button type="button" onClick={()=>setFilters({publicationState:'CAPTURED'})}>Captured</button>{SNAG_QUICK_VIEWS.map(view=><button type="button" key={view.label} onClick={()=>selectQuickView(view)}>{view.label}</button>)}</nav><SnagFilters filters={filters} onChange={setFilters} onReset={()=>setFilters({})}/>
    {status==='loading'?<div className="snag-skeleton-list" role="status" aria-live="polite">Loading observations…</div>:null}{status==='error'?<div className="snag-error" role="alert"><p>Observations could not be loaded.</p><button className="btn" onClick={reload}>Retry</button></div>:null}{status==='ready'&&searched.length===0?<div className="empty-state"><h2>No matching observations</h2><p>Open a drawing to capture the first field observation.</p></div>:null}
    <div className="snag-list">{searched.map(snag=><div key={snag.id} className="observation-list-row">{snag.publicationState==='CAPTURED'&&model.canCreate?<label className="observation-select"><input type="checkbox" checked={selected.includes(snag.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,snag.id]:current.filter(id=>id!==snag.id))}/><span>Select Observation #{snag.snagNumber}</span></label>:null}<SnagCard snag={snag}/></div>)}</div>
  </div>;
}
