import {useMemo,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthContext.jsx';
import {useProjectSnags} from '../../hooks/snags/useSnagController.js';
import {buildSnagListModel,SNAG_QUICK_VIEWS} from '../../hooks/snags/useSnagPresentation.js';
import SnagCard from '../../components/snags/SnagCard.jsx';
import SnagFilters from '../../components/snags/SnagFilters.jsx';

export default function SnagListPage({projects=[]}) {
  const {projectId}=useParams();
  const {user,role}=useAuth();
  const {status,items,reload}=useProjectSnags(projectId);
  const [filters,setFilters]=useState({});
  const actor=useMemo(()=>({id:user?.id,role}),[user?.id,role]);
  const model=buildSnagListModel(items,filters,actor);
  const searched=model.rows.filter(row=>!filters.search||`${row.title} ${row.locationLabel}`.toLowerCase().includes(filters.search.toLowerCase()));
  const project=projects.find(item=>String(item.id)===String(projectId));
  const selectQuickView=view=>setFilters(Object.fromEntries(Object.entries(view.filters).map(([key,value])=>[key,value==='$ACTOR'?user?.id:value])));
  return <div className="snag-page"><header className="snag-page-header"><div><Link className="snag-back" to="/snags">All project snag lists</Link><h1>Snag list</h1><p>{project?.storeCode||`Project ${projectId}`} · {model.total} items</p></div>{model.canCreate?<Link className="btn btn-primary snag-primary-action" to={`/projects/${projectId}/snags/new`}>Create snag</Link>:null}</header><nav className="snag-quick-views" aria-label="Quick views">{SNAG_QUICK_VIEWS.map(view=><button type="button" key={view.label} onClick={()=>selectQuickView(view)}>{view.label}</button>)}</nav><SnagFilters filters={filters} onChange={setFilters} onReset={()=>setFilters({})}/>{status==='loading'?<div className="snag-skeleton-list" role="status" aria-live="polite">Loading project snags…</div>:null}{status==='error'?<div className="snag-error" role="alert"><p>Snags could not be loaded.</p><button className="btn" onClick={reload}>Retry</button></div>:null}{status==='ready'&&searched.length===0?<div className="empty-state"><h2>No matching snags</h2><p>Create the first field issue or reset the current filters.</p></div>:null}<div className="snag-list">{searched.map(snag=><SnagCard key={snag.id} snag={snag}/>)}</div></div>;
}
