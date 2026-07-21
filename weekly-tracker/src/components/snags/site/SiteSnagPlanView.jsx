import { useCallback, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { usePlanCanvas, usePlanDocument, usePlanPins, useProjectPlans } from '../../../hooks/plans/usePlanController.js';
import { changePlanZoom, normalizeRequestedPlanPage, planZoomLabel, renderPlanPoint } from '../../../hooks/plans/usePlanPresentation.js';
import SiteSnagPinPreview from './SiteSnagPinPreview.jsx';

export default function SiteSnagPlanView({ projectId, catalog }) {
  const { role } = useAuth();
  const location = useLocation();
  const [query, setQuery] = useSearchParams();
  const plans = useProjectPlans(projectId);
  const requestedPlanId = query.get('plan');
  const plan = plans.items.find((item) => String(item.id) === String(requestedPlanId))
    || plans.items.find((item) => item.isActive)
    || plans.items[0]
    || null;
  const page = normalizeRequestedPlanPage(query.get('page'), plan?.pageCount);
  const zoom = Number(query.get('zoom')) || 1;
  const selectedSnagId = query.get('pin');
  const documentState = usePlanDocument(plan);
  const pins = usePlanPins(projectId, plan?.id, page);
  const canvasRef = useRef(null);
  const lastPinRef = useRef(null);
  usePlanCanvas(documentState.pdf, page, zoom, canvasRef);

  const updateQuery = useCallback((updates) => {
    const next = new URLSearchParams(query);
    Object.entries(updates).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, String(value)));
    setQuery(next, { replace: true });
  }, [query, setQuery]);
  const closePreview = useCallback(() => {
    updateQuery({ pin: null });
    requestAnimationFrame(() => lastPinRef.current?.focus());
  }, [updateQuery]);
  const canManagePlans = ['ADMIN', 'PM'].includes(String(role || '').toUpperCase());
  const returnTo = `${location.pathname}?${query.toString()}`;

  if (plans.status === 'loading') return <div className="site-snag-section-state" role="status">Loading drawings…</div>;
  if (plans.status === 'error') return <div className="snag-error" role="alert"><p>Drawings could not be loaded.</p><button className="btn" onClick={plans.reload}>Retry</button></div>;
  if (!plan) {
    return <div className="empty-state"><h2>No drawing available</h2><p>Site Snag Plan becomes available after an authorized plan revision is uploaded.</p>{canManagePlans ? <Link className="btn" to={`/projects/${projectId}/plans`}>Manage drawings</Link> : null}</div>;
  }

  return (
    <div className={`site-snag-plan-layout${selectedSnagId ? ' has-preview' : ''}`}>
      <div className="site-snag-plan-main">
        <div className="site-snag-section-intro">
          <div><h2>Observation map</h2><p>Review existing pins without entering field capture mode.</p></div>
          {canManagePlans ? <Link className="btn btn-ghost" to={`/projects/${projectId}/plans`}>Drawing revisions</Link> : null}
        </div>
        <div className="plan-controls site-snag-plan-controls" aria-label="Observation map controls">
          <label>
            <span className="sr-only">Select drawing</span>
            <select className="ds-select" value={plan.id} onChange={(event) => updateQuery({ plan: event.target.value, page: 1, pin: null })}>
              {plans.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version}{item.isActive ? ' · Active' : ''}</option>)}
            </select>
          </label>
          <button className="btn" aria-label="Previous page" disabled={page <= 1} onClick={() => updateQuery({ page: page - 1, pin: null })}>Previous</button>
          <span>Page {page} / {plan.pageCount}</span>
          <button className="btn" aria-label="Next page" disabled={page >= plan.pageCount} onClick={() => updateQuery({ page: page + 1, pin: null })}>Next</button>
          <button className="btn" aria-label="Zoom out" onClick={() => updateQuery({ zoom: changePlanZoom(zoom, -1) })}>−</button>
          <button className="btn" aria-label="Reset zoom" onClick={() => updateQuery({ zoom: null })}>{planZoomLabel(zoom)}</button>
          <button className="btn" aria-label="Zoom in" onClick={() => updateQuery({ zoom: changePlanZoom(zoom, 1) })}>+</button>
        </div>
        {documentState.status === 'loading' ? <div className="plan-loading" role="status">Opening private drawing…</div> : null}
        {documentState.status === 'error' ? <div className="snag-error" role="alert">This private drawing could not be opened.</div> : null}
        {documentState.status === 'ready' ? (
          <div className="plan-stage-scroll site-snag-plan-stage" aria-label={`${plan.name}, page ${page}`}>
            <div className="plan-surface">
              <canvas ref={canvasRef} />
              {pins.items.map((pin) => {
                const position = renderPlanPoint(pin, { width: 100, height: 100 });
                return (
                  <button
                    key={pin.id}
                    ref={String(pin.id) === String(selectedSnagId) ? lastPinRef : undefined}
                    type="button"
                    className={`plan-pin${String(pin.id) === String(selectedSnagId) ? ' is-selected' : ''}`}
                    style={{ left: `${position.left}%`, top: `${position.top}%` }}
                    onClick={(event) => { lastPinRef.current = event.currentTarget; updateQuery({ pin: pin.id }); }}
                    aria-pressed={String(pin.id) === String(selectedSnagId)}
                    aria-label={`Preview Observation ${pin.snagNumber}: ${pin.title}, ${pin.status}`}
                  >
                    <span>{pin.snagNumber}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <section className="plan-pin-list" aria-labelledby="site-snag-pin-list-heading">
          <h2 id="site-snag-pin-list-heading">Observations on page {page}</h2>
          {pins.items.length === 0 ? <p>No Observations are pinned to this page.</p> : <ul>{pins.items.map((pin) => <li key={pin.id}><button type="button" onClick={(event) => { lastPinRef.current = event.currentTarget; updateQuery({ pin: pin.id }); }}>Observation #{pin.snagNumber} · {pin.title} · {pin.status}</button></li>)}</ul>}
        </section>
      </div>
      {selectedSnagId ? <SiteSnagPinPreview projectId={projectId} snagId={selectedSnagId} catalog={catalog} returnTo={returnTo} onClose={closePreview} /> : null}
    </div>
  );
}
