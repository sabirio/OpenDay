function Empty({ children }) { return <p className="commercial-foundation-empty">{children}</p>; }

function CostPackageEditor({ editor, onSuccess, onError }) {
  const draft = editor.costPackageDraft;
  if (!draft) return null;
  const save = async () => { const result = await editor.saveCostPackageDraft(); if (result.ok) onSuccess('Cost Package saved.'); else onError(result.error); };
  return <section className="card commercial-foundation-editor">
    <header><div><span>Cost Package</span><h2>{draft.expectedRevision ? `Edit ${draft.code}` : 'New Cost Package'}</h2></div></header>
    <div className="commercial-foundation-form-grid">
      <label>Code<input className="ds-input" value={draft.code} onChange={event => editor.patchCostPackage({ code: event.target.value })}/></label>
      <label>Name<input className="ds-input" value={draft.name} onChange={event => editor.patchCostPackage({ name: event.target.value })}/></label>
      <label>Procurement Method<select className="ds-input" value={draft.procurementMethod} onChange={event => editor.patchCostPackage({ procurementMethod: event.target.value })}>{editor.view.procurementMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
      <label>Status<select className="ds-input" value={draft.status} onChange={event => editor.patchCostPackage({ status: event.target.value })}>{editor.view.costPackageStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
      <label className="commercial-foundation-wide">Note<textarea className="ds-input" value={draft.note} onChange={event => editor.patchCostPackage({ note: event.target.value })}/></label>
    </div>
    <div className="commercial-foundation-scope"><h3>Canonical Work Group scope</h3>{editor.view.scopeSections.map(section => <details key={section.id}><summary>{section.code} · {section.label}</summary><div className="commercial-foundation-check-grid">{section.workGroups.map(group => <label key={group.id}><input type="checkbox" checked={draft.workGroupIds.includes(group.id)} onChange={() => editor.toggleWorkGroup(group.id)}/><span><strong>{group.code}</strong> {group.label}</span></label>)}</div></details>)}</div>
    {editor.costPackageAssessment.hasIssues && <p className="commercial-foundation-validation">Complete the package identity and select at least one Work Group.</p>}
    <footer><button className="btn btn-secondary" onClick={editor.cancelCostPackage}>Cancel</button><button className="btn btn-primary" disabled={!editor.costPackageAssessment.canSave || editor.busy === 'cost-package'} onClick={save}>Save Cost Package</button></footer>
  </section>;
}

function TeamEditor({ editor, onSuccess, onError }) {
  const draft = editor.membershipDraft;
  if (!draft) return null;
  const allowedCapabilities = editor.view.capabilitiesByRole[draft.projectRole] || [];
  const save = async () => { const result = await editor.saveMembershipDraft(); if (result.ok) onSuccess('Project Team membership saved.'); else onError(result.error); };
  return <section className="card commercial-foundation-editor">
    <header><div><span>Project Team</span><h2>{draft.expectedRevision ? 'Edit membership' : 'Assign team member'}</h2></div></header>
    <div className="commercial-foundation-form-grid">
      <label>Person<select className="ds-input" value={draft.userId} onChange={event => editor.patchMembership({ userId: event.target.value })}><option value="">Select person</option>{editor.view.availableUsers.map(user => <option key={user.userId} value={user.userId}>{user.name} · {user.organizationRole}</option>)}</select></label>
      <label>Project role<select className="ds-input" value={draft.projectRole} onChange={event => editor.patchMembership({ projectRole: event.target.value })}>{editor.view.projectRoles.map(role => <option key={role}>{role}</option>)}</select></label>
      <label>Responsibility<input className="ds-input" value={draft.responsibilityLabel} placeholder="Security, IT, Finance…" onChange={event => editor.patchMembership({ responsibilityLabel: event.target.value })}/></label>
      <label>Package relationship<select className="ds-input" value={draft.responsibilityType} onChange={event => editor.patchMembership({ responsibilityType: event.target.value })}>{editor.view.responsibilityTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Starts<input className="ds-input" type="date" value={draft.startsOn} onChange={event => editor.patchMembership({ startsOn: event.target.value })}/></label>
      <label>Ends<input className="ds-input" type="date" value={draft.endsOn} onChange={event => editor.patchMembership({ endsOn: event.target.value })}/></label>
    </div>
    <div className="commercial-foundation-scope"><h3>Capabilities</h3><div className="commercial-foundation-check-grid">{allowedCapabilities.map(capability => <label key={capability.code}><input type="checkbox" checked={draft.capabilityCodes.includes(capability.code)} onChange={() => editor.toggleCapability(capability.code)}/><span>{capability.label}</span></label>)}</div></div>
    <div className="commercial-foundation-scope"><h3>Cost Package scope</h3>{!editor.view.hasCostPackages ? <Empty>Create Cost Packages before assigning package responsibility.</Empty> : <div className="commercial-foundation-check-grid">{editor.view.costPackages.map(item => <label key={item.costPackageId}><input type="checkbox" checked={draft.costPackageIds.includes(item.costPackageId)} onChange={() => editor.toggleMembershipPackage(item.costPackageId)}/><span><strong>{item.code}</strong> {item.name}</span></label>)}</div>}</div>
    <label className="commercial-foundation-notify"><input type="checkbox" checked={draft.notificationsEnabled} onChange={event => editor.patchMembership({ notificationsEnabled: event.target.checked })}/> Enable relevant project notifications</label>
    {editor.membershipAssessment.hasIssues && <p className="commercial-foundation-validation">Complete the required identity, role and capability fields.</p>}
    <footer><button className="btn btn-secondary" onClick={editor.cancelMembership}>Cancel</button><button className="btn btn-primary" disabled={!editor.membershipAssessment.canSave || editor.busy === 'membership'} onClick={save}>Save Membership</button></footer>
  </section>;
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

export default function CommercialFoundationWorkspace({ editor, onSuccess, onError }) {
  const view = editor.view;
  return <div className="commercial-foundation-workspace">
    <section className="card commercial-foundation-list"><header><div><span>Commercial structure</span><h2>Cost Packages</h2><p>One project may use different procurement methods without forcing every package through a tender.</p></div><button className="btn btn-primary" onClick={editor.newCostPackage}>Add Cost Package</button></header>
      {!view.hasCostPackages ? <Empty>No Cost Packages yet.</Empty> : <div className="commercial-foundation-table-wrap"><table><thead><tr><th>Package</th><th>Procurement Method</th><th>Scope</th><th>Status</th><th></th></tr></thead><tbody>{view.costPackages.map(item => <tr key={item.costPackageId}><td><strong>{item.code}</strong><span>{item.name}</span></td><td>{item.procurementMethodLabel}</td><td>{item.scopeCount} Work Groups</td><td><span className="status-badge">{item.status}</span></td><td><button className="btn-ghost-sm" disabled={!item.canEdit} onClick={() => editor.editCostPackage(item.costPackageId)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    <CostPackageEditor editor={editor} onSuccess={onSuccess} onError={onError}/>
    <section className="card commercial-foundation-list"><header><div><span>Procurement</span><h2>Tender Packages</h2><p>Create the commercial identity before Tender Setup. Consultant Measured tenders can now prepare and freeze a BOQ first.</p></div><button className="btn btn-primary" disabled={!view.hasCostPackages} onClick={editor.newTenderPackage}>Add Tender Package</button></header>
      {!view.hasTenderPackages ? <Empty>No Tender Packages yet.</Empty> : <div className="commercial-foundation-table-wrap"><table><thead><tr><th>Tender</th><th>Cost Packages</th><th>Procurement Method</th><th>BOQ Mode</th><th>Status</th><th></th></tr></thead><tbody>{view.tenderPackages.map(item => <tr key={item.tenderId}><td><strong>{item.tenderNumber}</strong></td><td>{item.packageCount}</td><td>{item.procurementMethodLabel}</td><td>{item.boqModeLabel}</td><td>{item.status}</td><td><button className="btn-ghost-sm" disabled={!item.canEdit} onClick={() => editor.editTenderPackage(item.tenderId)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    <TenderPackageEditor editor={editor} onSuccess={onSuccess} onError={onError}/>
    <section className="card commercial-foundation-list"><header><div><span>Access and ownership</span><h2>Project Team</h2><p>Membership, responsibility scope, capabilities and notification participation are recorded together.</p></div><button className="btn btn-primary" onClick={editor.newMembership}>Assign Member</button></header>
      {!view.hasMemberships ? <Empty>No Project Team memberships yet.</Empty> : <div className="commercial-foundation-table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Responsibility</th><th>Period</th><th>Packages</th><th></th></tr></thead><tbody>{view.memberships.map(item => <tr key={item.membershipId}><td><strong>{item.name}</strong><span>{item.email}</span></td><td>{item.projectRole}</td><td>{item.responsibilityLabel}</td><td>{item.periodLabel}</td><td>{item.packageCount}</td><td><button className="btn-ghost-sm" onClick={() => editor.editMembership(item.membershipId)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    <TeamEditor editor={editor} onSuccess={onSuccess} onError={onError}/>
  </div>;
}
