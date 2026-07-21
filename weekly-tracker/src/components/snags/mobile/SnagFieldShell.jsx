import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CaptureSetup from '../CaptureSetup.jsx';
import SnagFieldTabBar from './SnagFieldTabBar.jsx';
import SnagFieldPlanView from './SnagFieldPlanView.jsx';
import SnagFieldListView from './SnagFieldListView.jsx';

// Mobile Field Mode shell — the "PLAN | LIST | ADD" surface a PM uses while
// walking the site. All data (project snags, capture catalog, product
// commands) is fetched once by SnagListPage using the same hooks the
// desktop view uses, then handed down as props: this shell only owns which
// of the three field screens is showing, nothing about the Observation
// domain itself.
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
      <header className="snag-field-header">
        <div>
          <Link className="snag-back" to={`/projects/${projectId}/snags`}>Back to Site Snag</Link>
          <h1>Field Snag List</h1>
          <p>{project?.storeCode || `Project ${projectId}`} · {model.total} items</p>
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
