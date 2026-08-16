export default function ContractorScheduleSetupEditor({
  executionScope,
  activities,
  issues,
  dirty,
  saving,
  onUpdate,
  onAdd,
  onRemove,
  onDiscard,
  onSave,
}) {
  const workGroupById = new Map(executionScope.workGroups.map(item => [item.id, item]));
  const disciplineById = new Map(executionScope.disciplines.map(item => [item.id, item]));
  const uncovered = new Set(issues
    .filter(issue => issue.code === 'UNCOVERED_EXECUTION_SCOPE_WORK_GROUP')
    .map(issue => issue.referenceId));

  function toggleWorkGroup(activity, workGroupId) {
    const selected = new Set(activity.workGroupIds);
    if (selected.has(workGroupId)) selected.delete(workGroupId);
    else selected.add(workGroupId);
    onUpdate(activity.activityId, {
      workGroupIds: executionScope.workGroupIds.filter(id => selected.has(id)),
    });
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ padding: 16, border: '1px solid var(--field-border)', borderRadius: 10, background: 'var(--field-bg-card)' }}>
        <h2 style={{ margin: '0 0 5px', color: 'var(--field-text-heading)', fontSize: 18 }}>Schedule Setup</h2>
        <p style={{ margin: 0, color: 'var(--field-text-secondary)', fontSize: 13 }}>
          Turn the {executionScope.workGroups.length} Execution Scope Work Groups into your construction activities. You may split one Work Group across several activities or combine related Work Groups. Dates come next.
        </p>
      </div>

      {activities.map((activity, index) => (
        <article key={activity.activityId} style={{ padding: 14, border: '1px solid var(--field-border)', borderRadius: 10, background: 'var(--field-bg-card)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: 'var(--field-text-muted)', fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
            <input
              value={activity.title}
              onChange={event => onUpdate(activity.activityId, { title: event.target.value })}
              placeholder="Activity title"
              aria-label={`Activity ${index + 1} title`}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--field-border)', background: 'var(--field-bg-contractor)', color: 'var(--field-text-body)' }}
            />
            <button type="button" onClick={() => onRemove(activity.activityId)} disabled={activities.length === 1} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--field-border)', background: 'transparent', color: 'var(--field-danger-fg)', cursor: activities.length === 1 ? 'not-allowed' : 'pointer' }}>
              Remove
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {executionScope.workGroupIds.map(workGroupId => {
              const workGroup = workGroupById.get(workGroupId);
              const selected = activity.workGroupIds.includes(workGroupId);
              const discipline = disciplineById.get(workGroup.disciplineId);
              return (
                <label key={workGroupId} title={discipline?.label} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 7, border: `1px solid ${selected ? 'var(--field-accent-contractor)' : uncovered.has(workGroupId) ? 'var(--field-danger-fg)' : 'var(--field-border)'}`, color: 'var(--field-text-body)', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleWorkGroup(activity, workGroupId)} />
                  {workGroup.label}
                </label>
              );
            })}
          </div>
        </article>
      ))}

      {issues.length > 0 && (
        <div role="alert" style={{ color: 'var(--field-danger-fg)', fontSize: 13 }}>
          Every activity needs a title and at least one Work Group. Every Execution Scope Work Group must be covered.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onAdd} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--field-border)', background: 'transparent', color: 'var(--field-text-body)', cursor: 'pointer' }}>
          + Add activity
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onDiscard} disabled={!dirty || saving} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--field-border)', background: 'transparent', color: 'var(--field-text-secondary)', cursor: !dirty || saving ? 'not-allowed' : 'pointer' }}>
            Discard
          </button>
          <button type="button" onClick={onSave} disabled={!dirty || saving || issues.length > 0} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: !dirty || saving || issues.length > 0 ? 'var(--field-neutral-bg)' : 'var(--field-accent-contractor)', color: !dirty || saving || issues.length > 0 ? 'var(--field-text-muted)' : 'var(--field-text-on-accent)', fontWeight: 700, cursor: !dirty || saving || issues.length > 0 ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Setup'}
          </button>
        </div>
      </div>
    </section>
  );
}
