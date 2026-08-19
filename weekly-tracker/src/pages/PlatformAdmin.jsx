import { useState } from 'react';
import { usePlatformAdmin } from '../hooks/usePlatformAdmin.js';

const today=()=>new Date().toISOString().slice(0,10);
const dateValue=value=>value?String(value).slice(0,10):'';

function SubscriptionEditor({ organizationId,subscription,plans,onSave }){
  const [planId,setPlanId]=useState(subscription?.plan_id??plans[0]?.id??'');
  const [status,setStatus]=useState(subscription?.status??'ACTIVE');
  const [startsAt,setStartsAt]=useState(dateValue(subscription?.starts_at)||today());
  const [endsAt,setEndsAt]=useState(dateValue(subscription?.ends_at));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function submit(event){
    event.preventDefault();setSaving(true);setError('');
    try{await onSave({organizationId,planId,status,startsAt,endsAt,
      expectedRevision:subscription?.revision??0,requestId:crypto.randomUUID()});}
    catch(saveError){console.error('[PlatformAdmin] subscription failed',saveError);setError('Subscription could not be saved. Refresh and try again.');}
    finally{setSaving(false);}
  }
  return <form className="platform-admin-form" onSubmit={submit}>
    <div className="platform-admin-form-grid">
      <label><span>Plan</span><select className="ds-input" value={planId} onChange={event=>setPlanId(event.target.value)}>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label><span>Status</span><select className="ds-input" value={status} onChange={event=>setStatus(event.target.value)}>{['ACTIVE','TRIAL','SUSPENDED','CANCELLED'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label><span>Starts</span><input className="ds-input" type="date" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label>
      <label><span>Ends</span><input className="ds-input" type="date" value={endsAt} min={startsAt} onChange={event=>setEndsAt(event.target.value)}/></label>
    </div>
    {error&&<div className="login-error" role="alert">{error}</div>}
    <div className="platform-admin-form-actions"><span>Revision {subscription?.revision??0}</span><button className="btn btn-primary" disabled={saving||!planId||!startsAt}>{saving?'Saving…':'Save subscription'}</button></div>
  </form>;
}

function EntitlementRow({ organizationId,capability,effective,override,onSave }){
  const [mode,setMode]=useState(override?(override.enabled?'ENABLED':'DISABLED'):'PLAN');
  const [configText,setConfigText]=useState(JSON.stringify(override?.config??{},null,2));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function save(){
    let config;
    try{config=configText.trim()?JSON.parse(configText):{};}catch{setError('Configuration must be valid JSON.');return;}
    if(mode==='PLAN'){setError('Plan default does not create an override. Choose Enabled or Disabled.');return;}
    setSaving(true);setError('');
    try{await onSave({organizationId,capabilityId:capability.id,enabled:mode==='ENABLED',config,
      startsAt:today(),expiresAt:null,expectedRevision:override?.revision??0,requestId:crypto.randomUUID()});}
    catch(saveError){console.error('[PlatformAdmin] entitlement failed',saveError);setError('Override could not be saved. Refresh and try again.');}
    finally{setSaving(false);}
  }
  return <tr>
    <td><strong>{capability.label}</strong><small>{capability.id}</small></td>
    <td><span className={`platform-admin-state is-${effective?.enabled?'enabled':'disabled'}`}>{effective?.enabled?'Enabled':'Disabled'}</span><small>{effective?.source??'Not in plan'}</small></td>
    <td><select className="ds-input" value={mode} onChange={event=>setMode(event.target.value)}><option value="PLAN">Plan default</option><option value="ENABLED">Enabled override</option><option value="DISABLED">Disabled override</option></select></td>
    <td><textarea className="ds-input platform-admin-config" rows="2" value={configText} onChange={event=>setConfigText(event.target.value)} aria-label={`${capability.label} configuration`}/>{error&&<small className="platform-admin-error">{error}</small>}</td>
    <td><button type="button" className="btn btn-secondary" onClick={save} disabled={saving||mode==='PLAN'}>{saving?'Saving…':'Save'}</button></td>
  </tr>;
}

function PlatformAdmin(){
  const admin=usePlatformAdmin();
  const [tab,setTab]=useState('general');
  const [statusSaving,setStatusSaving]=useState(false);
  const [statusError,setStatusError]=useState('');
  const selected=admin.organizations.find(row=>row.organizationId===admin.selectedId);
  const detail=admin.detail;

  async function toggleOrganizationStatus(){
    if(!selected||statusSaving)return;
    setStatusSaving(true);setStatusError('');
    try{await admin.setStatus({organizationId:selected.organizationId,
      status:selected.status==='ACTIVE'?'SUSPENDED':'ACTIVE',expectedStatus:selected.status,
      requestId:crypto.randomUUID()});}
    catch(error){console.error('[PlatformAdmin] status failed',error);setStatusError('Organization status could not be changed. Refresh and try again.');}
    finally{setStatusSaving(false);}
  }

  if(admin.status==='loading')return <div className="auth-loading" style={{minHeight:320}}><div className="auth-loading-spinner"/></div>;
  return <div className="platform-admin-page">
    <div className="page-header"><div><h1 className="page-title">Platform Admin</h1><p className="page-subtitle">Organizations, subscriptions and commercial product access.</p></div><button className="btn-ghost" type="button" onClick={admin.refresh}>Refresh</button></div>
    {admin.error&&<div className="login-error" role="alert">Platform data could not be loaded. Try refreshing.</div>}
    <div className="platform-admin-layout">
      <aside className="platform-admin-organizations" aria-label="Organizations">
        <header><strong>Organizations</strong><span>{admin.organizations.length}</span></header>
        {admin.organizations.map(row=><button type="button" key={row.organizationId} className={row.organizationId===admin.selectedId?'is-selected':''} onClick={()=>admin.setSelectedId(row.organizationId)}>
          <span><strong>{row.name}</strong><small>{row.legacyCompanyId}</small></span><span><b data-status={row.status}>{row.status}</b><small>{row.planId??'No plan'}</small></span>
        </button>)}
      </aside>
      <section className="platform-admin-detail">
        {!selected?<div className="platform-admin-empty">No organizations available.</div>:<>
          <header className="platform-admin-detail-header"><div><span>{selected.legacyCompanyId}</span><h2>{selected.name}</h2><p>{selected.activeUsers} active users · {selected.projects} projects</p></div><button type="button" className={selected.status==='ACTIVE'?'btn btn-danger':'btn btn-primary'} onClick={toggleOrganizationStatus} disabled={statusSaving}>{statusSaving?'Saving…':selected.status==='ACTIVE'?'Suspend organization':'Activate organization'}</button></header>
          {statusError&&<div className="login-error" role="alert">{statusError}</div>}
          <nav className="platform-admin-tabs" aria-label="Organization detail sections">{['general','subscription','entitlements','audit'].map(value=><button type="button" key={value} className={tab===value?'is-active':''} onClick={()=>setTab(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</nav>
          {admin.detailStatus==='loading'?<div className="platform-admin-empty">Loading organization…</div>:detail&&<div className="platform-admin-tab-content">
            {tab==='general'&&<div className="platform-admin-summary-grid"><div><span>Status</span><strong>{admin.summary.status}</strong></div><div><span>Plan</span><strong>{admin.summary.plan}</strong></div><div><span>Organization admins</span><strong>{admin.summary.adminUsers}</strong></div><div><span>Effective capabilities</span><strong>{admin.summary.effectiveCapabilities}</strong></div></div>}
            {tab === 'subscription' && (
              <SubscriptionEditor
                key={`${selected.organizationId}-${detail.subscription?.revision ?? 0}`}
                organizationId={selected.organizationId}
                subscription={detail.subscription}
                plans={admin.plans}
                onSave={admin.setSubscription}
              />
            )}
            {tab==='entitlements'&&<div className="platform-admin-entitlements">{admin.grouped.map(([group,capabilities])=><section key={group}><h3>{group.replaceAll('_',' ')}</h3><div className="platform-admin-table-wrap"><table><thead><tr><th>Capability</th><th>Effective</th><th>Override</th><th>Configuration / limits</th><th></th></tr></thead><tbody>{capabilities.map(capability=><EntitlementRow key={`${capability.id}-${admin.overridesById[capability.id]?.revision??0}`} organizationId={selected.organizationId} capability={capability} effective={admin.effectiveById[capability.id]} override={admin.overridesById[capability.id]} onSave={admin.setEntitlement}/>)}</tbody></table></div></section>)}</div>}
            {tab==='audit'&&<div className="platform-admin-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Capability</th><th>Result</th></tr></thead><tbody>{admin.events.map(event=><tr key={event.id}><td>{new Date(event.changed_at).toLocaleString()}</td><td>{event.event_type.replaceAll('_',' ')}</td><td>{event.capability_id??'—'}</td><td><code>{JSON.stringify(event.new_data)}</code></td></tr>)}{admin.events.length===0&&<tr><td colSpan="4">No changes recorded.</td></tr>}</tbody></table></div>}
          </div>}
        </>}
      </section>
    </div>
  </div>;
}

export default PlatformAdmin;
