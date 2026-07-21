import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { usePlanCanvas, usePlanCommand, usePlanDocument, usePlanPins, usePlanPlacement, useProjectPlans } from '../../../hooks/plans/usePlanController.js';
import { useCaptureCommand } from '../../../hooks/snags/useSnagController.js';
import { changePlanZoom, planZoomLabel, renderPlanPoint } from '../../../hooks/plans/usePlanPresentation.js';

// Mobile Field Mode's Plan tab. Reuses the same normalized-coordinate pin
// model, the same private-PDF hooks (usePlanDocument/usePlanCanvas), and the
// same long-press/crosshair placement state machine (usePlanPlacement) as
// the desktop PlanViewerPage — only the layout/controls are mobile-shaped.
// Full-form placement is intentionally not offered here: Field Mode's
// capture flow is always the fast crosshair -> Complete captured Observation
// path (see SnagDetailPage's capture card), matching the MVP's
// minimal-typing goal.
export default function SnagFieldPlanView({ projectId, canCreate, autoStartCapture, onCaptureStarted }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const plans = useProjectPlans(projectId);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const plan = plans.items.find(item => item.id === selectedPlanId)
    || plans.items.find(item => item.isActive)
    || plans.items[0]
    || null;
  const documentState = usePlanDocument(plan);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  const pins = usePlanPins(projectId, plan?.id, page);
  const command = usePlanCommand(() => pins.reload());
  const fieldReturn = `/projects/${projectId}/snags/field`;
  const capture = useCaptureCommand(result => navigate(`/projects/${projectId}/snags/${result.snag.id}?capture=1`, { state: { returnTo: fieldReturn } }));
  const canPlace = canCreate && ['Admin', 'PM'].includes(role);
  const placement = usePlanPlacement({ projectId, planId: plan?.id, page, targetSnagId: null, targetVersion: null, command, navigate });
  const { placing, capturePoint, surfaceRef, place, beginPress, endPress, startCapture, reposition, capturePosition } = placement;
  usePlanCanvas(documentState.pdf, page, zoom, canvasRef);

  useEffect(() => {
    if (autoStartCapture && canPlace && plan) {
      startCapture();
      onCaptureStarted?.();
    }
  }, [autoStartCapture, canPlace, plan, startCapture, onCaptureStarted]);

  if (plans.status === 'loading') return <div className="snag-field-plan-loading" role="status">Loading drawing…</div>;
  if (plans.status === 'error') {
    return (
      <div className="snag-error snag-field-plan-empty" role="alert">
        <p>Drawings could not be loaded.</p>
        <button className="btn" onClick={plans.reload}>Retry</button>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="empty-state snag-field-plan-empty">
        <h2>No drawing uploaded yet</h2>
        <p>Upload a drawing to place observation pins on it, or capture an observation without a plan pin.</p>
        <div className="snag-field-plan-empty-actions">
          <Link className="btn" to={`/projects/${projectId}/plans`}>Manage drawings</Link>
          {canCreate ? <Link className="btn btn-primary" to={`/projects/${projectId}/snags/new`}>Add without a pin</Link> : null}
        </div>
      </div>
    );
  }

  const navOrder = pins.items.map(item => item.id);

  return (
    <div className="snag-field-plan">
      <div className="plan-controls snag-field-plan-controls" aria-label="Drawing controls">
        {plans.items.length > 1 ? (
          <select className="ds-select" value={plan.id} aria-label="Select drawing" onChange={event => { setSelectedPlanId(event.target.value); setPage(1); }}>
            {plans.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.version}</option>)}
          </select>
        ) : (
          <span className="snag-field-plan-name">{plan.name} <small>{plan.version}</small></span>
        )}
        <button className="btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button>
        <span>Page {page}/{plan.pageCount}</span>
        <button className="btn" aria-label="Next page" disabled={page >= plan.pageCount} onClick={() => setPage(value => value + 1)}>›</button>
        <button className="btn" aria-label="Zoom out" onClick={() => setZoom(value => changePlanZoom(value, -1))}>−</button>
        <button className="btn" aria-label="Reset zoom" onClick={() => setZoom(1)}>{planZoomLabel(zoom)}</button>
        <button className="btn" aria-label="Zoom in" onClick={() => setZoom(value => changePlanZoom(value, 1))}>+</button>
      </div>

      {placing ? <div className="plan-placement-banner" role="status">Press and hold on the drawing, then confirm the crosshair. Keyboard: focus the drawing and press Enter.</div> : null}
      {documentState.status === 'loading' ? <div className="plan-loading" role="status">Opening private drawing…</div> : null}
      {documentState.status === 'error' ? <div className="snag-error" role="alert">This drawing could not be opened.</div> : null}

      {documentState.status === 'ready' ? (
        <div className="plan-stage-scroll snag-field-plan-stage">
          <div
            ref={surfaceRef}
            className={`plan-surface${placing ? ' is-placing' : ''}`}
            tabIndex={placing ? 0 : -1}
            role={placing ? 'button' : undefined}
            aria-label={placing ? `Place observation on page ${page}` : undefined}
            onKeyDown={event => {
              if (placing && event.key === 'Enter') {
                const rect = surfaceRef.current.getBoundingClientRect();
                place(rect.left + rect.width / 2, rect.top + rect.height / 2);
              }
            }}
            onPointerDown={beginPress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
          >
            <canvas ref={canvasRef} />
            {capturePosition ? <span className="plan-capture-crosshair" style={{ left: `${capturePosition.left}%`, top: `${capturePosition.top}%` }} aria-hidden="true" /> : null}
            {pins.items.map(pin => {
              const position = renderPlanPoint(pin, { width: 100, height: 100 });
              return (
                <Link
                  key={pin.id}
                  className="plan-pin"
                  style={{ left: `${position.left}%`, top: `${position.top}%` }}
                  to={`/projects/${projectId}/snags/${pin.id}`}
                  state={{ navOrder, returnTo: fieldReturn }}
                  aria-label={`Observation ${pin.snagNumber}: ${pin.title}, ${pin.status}`}
                >
                  <span>{pin.snagNumber}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {capturePoint ? (
        <div className="plan-capture-confirm snag-field-capture-confirm" role="group" aria-label="Confirm observation position">
          <p>Pin at {capturePoint.x.toFixed(3)}, {capturePoint.y.toFixed(3)}</p>
          <button className="btn btn-ghost" onClick={reposition}>Reposition</button>
          <button className="btn btn-primary" disabled={capture.pending} onClick={() => capture.execute({ projectId, planId: plan.id, page, ...capturePoint }).catch(() => {})}>
            {capture.pending ? 'Saving…' : 'Confirm & open Observation'}
          </button>
          {capture.error ? <p className="snag-error" role="alert">{capture.error.message}</p> : null}
        </div>
      ) : null}

      {canPlace && !placing && !capturePoint ? (
        <button type="button" className="snag-field-fab" onClick={startCapture} aria-label="Add observation">+</button>
      ) : null}

      <section className="plan-pin-list" aria-labelledby="mobile-pin-list-heading">
        <h2 id="mobile-pin-list-heading">Observations on page {page}</h2>
        {pins.items.length === 0 ? <p>No observations are pinned to this page.</p> : (
          <ul>
            {pins.items.map(pin => (
              <li key={pin.id}>
                <Link to={`/projects/${projectId}/snags/${pin.id}`} state={{ navOrder, returnTo: fieldReturn }}>
                  Observation #{pin.snagNumber} · {pin.title} · {pin.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
