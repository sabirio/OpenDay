import { useState } from 'react';
import Modal from '../shared/Modal.jsx';

function Empty({ children }) { return <p className="commercial-foundation-empty">{children}</p>; }

function ProcurementStrategyRow({ section, routes, onChange }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`procurement-strategy-row${expanded ? ' is-expanded' : ''}`}>
    <div className="procurement-strategy-main">
      <button type="button" className="procurement-strategy-toggle" aria-expanded={expanded} onClick={() => setExpanded(current => !current)}>
        <span className="procurement-strategy-chevron" aria-hidden="true">›</span>
        <span><strong>{section.label}</strong><small>{section.disciplineCountDisplay} · {section.workGroupCountDisplay}</small></span>
      </button>
      <label className="procurement-strategy-route"><span>Procurement route</span><select className="ds-input" value={section.selectedMethod} onChange={event => onChange(section.code, event.target.value)}>{routes.map(route => <option key={route.value} value={route.value}>{route.label}</option>)}</select></label>
      <span className={`procurement-strategy-status${section.pendingSelection ? ' is-pending' : ''}`}>{section.selectedMethodLabel}</span>
    </div>
    {expanded && <div className="procurement-strategy-scope"><p>Canonical scope is fixed by the project Work Ontology.</p><div>{section.disciplines.map(discipline => <section key={discipline.id}><header><strong>{discipline.code}</strong><span>{discipline.label}</span><small>{discipline.workGroups.length} Work Groups</small></header><ul>{discipline.workGroups.map(group => <li key={group.id}><strong>{group.code}</strong><span>{group.label}</span></li>)}</ul></section>)}</div></div>}
  </article>;
}

function ProcurementStrategy({ editor, onSuccess, onError }) {
  const save = async () => { const result = await editor.saveProcurementStrategyDraft(); if (result.ok) onSuccess('Procurement Strategy saved.'); else onError(result.error); };
  return <section className="card procurement-strategy">
    <header><div><span>Project sourcing plan</span><h2>Procurement Strategy</h2><p>Select how the contractor or supplier will be appointed for each main section. Expand a section to review its fixed canonical scope.</p></div><div className="procurement-strategy-summary"><strong>{editor.procurementStrategyPresentation.configuredCount} / 6</strong><span>configured</span></div></header>
    <div className="procurement-strategy-columns" aria-hidden="true"><span>Section and canonical scope</span><span>Procurement route</span><span>Status</span></div>
    <div className="procurement-strategy-list">{editor.procurementStrategyPresentation.rows.map(section => <ProcurementStrategyRow key={section.code} section={section} routes={editor.view.procurementRoutes} onChange={editor.patchProcurementStrategy}/>)}</div>
    <footer><div><strong>One strategy for the whole project</strong><span>Selections do not change or duplicate canonical Work Groups.</span></div><button className="btn btn-primary" disabled={!editor.procurementStrategyAssessment.canSave || editor.busy === 'procurement-strategy'} onClick={save}>{editor.busy === 'procurement-strategy' ? 'Saving…' : 'Save Procurement Strategy'}</button></footer>
  </section>;
}

function TeamEditor({ editor, onSuccess, onError }) {
  const draft = editor.membershipDraft;
  const [query, setQuery] = useState('');
  if (!draft) return null;
  const existing = editor.editingMembership;
  const candidates = existing ? [] : editor.findAvailableUsers(query);
  const save = async () => {
    const result = await editor.saveMembershipDraft();
    if (result.ok) onSuccess(existing ? 'Project department updated.' : 'Person added to the Project Team.');
    else onError(result.error);
  };
  return <Modal onClose={editor.cancelMembership} titleId="project-team-add-title" className="modal project-team-modal">
    <div className="modal-header">
      <div><h2 id="project-team-add-title">{existing ? 'Edit project assignment' : 'Add colleague'}</h2><p>Choose the colleague&apos;s department for this project. Their access role remains managed in Users.</p></div>
      <button type="button" className="close-button" onClick={editor.cancelMembership} aria-label="Close">×</button>
    </div>
    <div className="project-team-modal-body">
      {existing ? <div className="project-team-selected-colleague">
        <span className="project-team-avatar" aria-hidden="true">{existing.initials}</span>
        <span><strong>{existing.name}</strong><small>{existing.email}</small></span>
        <span className="project-team-role">{existing.role}</span>
      </div> : <>
        <label className="project-team-search">
          <span>Find colleague</span>
          <input className="ds-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, email, or role" autoFocus/>
        </label>
        <div className="project-team-candidates" role="radiogroup" aria-label="Available colleagues">
          {candidates.map(user => <label className={`project-team-candidate${draft.userId === user.userId ? ' is-selected' : ''}`} key={user.userId}>
            <input type="radio" name="project-team-user" value={user.userId} checked={draft.userId === user.userId} onChange={() => editor.patchMembership({ userId: user.userId })}/>
            <span className="project-team-avatar" aria-hidden="true">{user.initials}</span>
            <span className="project-team-candidate-person"><strong>{user.name}</strong><small>{user.email}</small></span>
            <span className="project-team-role">{user.role}</span>
          </label>)}
          {candidates.length === 0 && <Empty>No colleagues match this search.</Empty>}
        </div>
      </>}
      <label className="project-team-department">
        <span>Project department</span>
        <select className="ds-input" value={draft.departmentCode} onChange={event => editor.patchMembership({ departmentCode: event.target.value })}>
          {editor.view.departments.map(department => <option key={department.code} value={department.code}>{department.label}</option>)}
        </select>
        <small>This assignment describes responsibility only. The colleague keeps full project access.</small>
      </label>
      {editor.membershipAssessment.hasIssues && draft.userId && <p className="commercial-foundation-validation">Select a valid colleague and project department.</p>}
    </div>
    <div className="project-team-modal-footer"><button className="btn btn-secondary" onClick={editor.cancelMembership}>Cancel</button><button className="btn btn-primary" disabled={!editor.membershipAssessment.canSave || editor.busy === 'membership'} onClick={save}>{editor.busy === 'membership' ? 'Saving…' : existing ? 'Save department' : 'Add to project'}</button></div>
  </Modal>;
}

function ProjectTeam({ editor, onSuccess, onError }) {
  const view = editor.view;
  return <>
    <section className="card commercial-foundation-list project-team-list">
      <header>
        <div><span>Internal colleagues</span><h2>Project Team</h2><p>Everyone listed here has full project access. Assign their project department here; system access remains in Users.</p></div>
        <button className="btn btn-primary" disabled={view.availableUsers.length === 0 || Boolean(editor.membershipDraft)} onClick={editor.newMembership}>Add colleague</button>
      </header>
      {!view.hasMemberships ? <Empty>No colleagues have been added to this project.</Empty> : <div className="commercial-foundation-table-wrap project-team-table-wrap"><table className="project-team-table"><thead><tr><th>Colleague</th><th>Email</th><th>Project department</th><th>Role in Users</th><th>Project access</th><th aria-label="Actions"></th></tr></thead><tbody>{view.memberships.map(item => <tr key={item.membershipId}><td><span className="project-team-person"><span className="project-team-avatar" aria-hidden="true">{item.initials}</span><strong>{item.name}</strong></span></td><td>{item.email}</td><td><span className="project-team-department-badge">{item.departmentLabel || 'Not assigned'}</span></td><td><span className="project-team-role">{item.role}</span></td><td><span className="project-team-access">Full access</span></td><td className="project-team-actions"><button className="btn-ghost-sm" disabled={Boolean(editor.membershipDraft)} onClick={() => editor.editMembership(item.membershipId)}>Edit</button><button className="btn-ghost-sm" disabled={editor.busy === `remove-membership-${item.membershipId}`} onClick={async () => { const result = await editor.removeTeamMember(item.membershipId); if (result.ok) onSuccess('Person removed from the Project Team.'); else onError(result.error); }}>{editor.busy === `remove-membership-${item.membershipId}` ? 'Removing…' : 'Remove'}</button></td></tr>)}</tbody></table></div>}
      {view.availableUsers.length === 0 && <p className="commercial-foundation-team-note">All eligible internal users are already in this Project Team.</p>}
    </section>
    <TeamEditor editor={editor} onSuccess={onSuccess} onError={onError}/>
  </>;
}

function TenderPackageEditor({ editor, onSuccess, onError }) {
  const draft = editor.tenderPackageDraft;
  if (!draft) return null;
  const save = async () => { const result = await editor.saveTenderPackageDraft(); if (result.ok) onSuccess('Tender Package saved.'); else onError(result.error); };
  return <section className="card commercial-foundation-editor"><header><div><span>Tender Package</span><h2>{draft.expectedRevision ? `Edit ${draft.tenderNumber}` : 'New Tender Package'}</h2></div></header>
    <div className="commercial-foundation-form-grid">
      <label>Tender number<input className="ds-input" value={draft.tenderNumber} disabled={draft.expectedRevision > 0} onChange={event => editor.patchTenderPackage({ tenderNumber: event.target.value })}/></label>
      <label>Procurement Method<select className="ds-input" value={draft.procurementMethod} onChange={event => editor.patchTenderPackage({ procurementMethod: event.target.value })}>{editor.view.procurementMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
      <label>BOQ Mode<select className="ds-input" value={draft.boqMode} onChange={event => editor.patchTenderPackage({ boqMode: event.target.value })}>{editor.view.boqModes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
    </div>
    <div className="commercial-foundation-scope"><h3>Cost Packages</h3><div className="commercial-foundation-check-grid">{editor.view.costPackages.map(item => <label key={item.costPackageId}><input type="checkbox" checked={draft.costPackageIds.includes(item.costPackageId)} onChange={() => editor.toggleTenderPackageScope(item.costPackageId)}/><span><strong>{item.code}</strong> {item.name} · {item.procurementMethodLabel}</span></label>)}</div></div>
    {editor.tenderPackageAssessment.hasIssues && <p className="commercial-foundation-validation">Select compatible Cost Packages and one BOQ mode.</p>}
    <footer><button className="btn btn-secondary" onClick={editor.cancelTenderPackage}>Cancel</button><button className="btn btn-primary" disabled={!editor.tenderPackageAssessment.canSave || editor.busy === 'tender-package'} onClick={save}>Save Tender Package</button></footer>
  </section>;
}

export default function CommercialFoundationWorkspace({ editor, onSuccess, onError, section = 'cost-packages' }) {
  const view = editor.view;
  return <div className="commercial-foundation-workspace">
    {section === 'cost-packages' && <ProcurementStrategy editor={editor} onSuccess={onSuccess} onError={onError}/>}
    {section === 'tender-packages' && <><section className="card commercial-foundation-list"><header><div><span>Procurement</span><h2>Tender Packages</h2><p>Create the commercial identity before Tender Setup. Consultant Measured tenders can now prepare and freeze a BOQ first.</p></div><button className="btn btn-primary" disabled={!view.hasCostPackages} onClick={editor.newTenderPackage}>Add Tender Package</button></header>
      {!view.hasTenderPackages ? <Empty>No Tender Packages yet.</Empty> : <div className="commercial-foundation-table-wrap"><table><thead><tr><th>Tender</th><th>Cost Packages</th><th>Procurement Method</th><th>BOQ Mode</th><th>Status</th><th></th></tr></thead><tbody>{view.tenderPackages.map(item => <tr key={item.tenderId}><td><strong>{item.tenderNumber}</strong></td><td>{item.packageCount}</td><td>{item.procurementMethodLabel}</td><td>{item.boqModeLabel}</td><td>{item.status}</td><td><button className="btn-ghost-sm" disabled={!item.canEdit} onClick={() => editor.editTenderPackage(item.tenderId)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    <TenderPackageEditor editor={editor} onSuccess={onSuccess} onError={onError}/></>}
    {section === 'project-team' && <ProjectTeam editor={editor} onSuccess={onSuccess} onError={onError}/>}
  </div>;
}
