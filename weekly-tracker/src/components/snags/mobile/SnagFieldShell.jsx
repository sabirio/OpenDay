import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CaptureSetup from '../CaptureSetup.jsx';
import SnagFieldTabBar from './SnagFieldTabBar.jsx';
import SnagFieldPlanView from './SnagFieldPlanView.jsx';
import SnagFieldListView from './SnagFieldListView.jsx';

// Mobile Field Mode owns only presentation and tab state. The desktop and
// field surfaces continue to consume the same Snag hooks and commands.
export default function SnagFieldShell({ projectId, project, status, reload, model, filters, setFilters, selected, setSelected, publish, publishNotice, catalog }) {
  const [query, setQuery] = useSearchParams();
  const mode = query.get('tab') === 'list' ? 'list' : 'plan';
  const [pendingAdd, setPendingAdd] = useState(false);

  function handleTab(next) {
    if (next === 'add') {
      setQuery({ tab: 'plan' }, { replace: true });
      setPendingAdd(true);
    } else {
      setQuery(next === 'list' ? { tab: 'list' } : {}, { replace: true });
    }
  }

  return (
    <div className="snag-field-shell">
      <Link className="snag-field-back-link" to="/field-snag">← Field Snag List</Link>
      <header className="snag-field-header">
        <div className="snag-field-header-context">
          <h1>{project?.storeCode || `Project ${projectId}`}</h1>
          <p>
            {[project?.shoppingMallName, project?.city].filter(Boolean).join(' · ')}
            {model.total ? ` · ${model.total} Observation${model.total === 1 ? '' : 's'}` : ''}
          </p>
        </div>
      </header>

      {query.get('created') ? <div className="plan-placement-banner is-success" role="status">Observation saved. Continue placing pins on this drawing.</div> : null}

      {model.canCreate ? <CaptureSetup projectId={projectId} /> : null}

      <div className="snag-field-body">
        {mode === 'plan' ? (
          <SnagFieldPlanView
            projectId={projectId}
            canCreate={model.canCreate}
            autoStartCapture={pendingAdd}
            onCaptureStarted={() => setPendingAdd(false)}
          />
        ) : (
          <SnagFieldListView
            projectId={projectId}
            status={status}
            reload={reload}
            model={model}
            filters={filters}
            setFilters={setFilters}
            selected={selected}
            setSelected={setSelected}
            publish={publish}
            publishNotice={publishNotice}
            catalog={catalog}
          />
        )}
      </div>

      <SnagFieldTabBar mode={mode} onSelect={handleTab} canCreate={model.canCreate} />
    </div>
  );
}
