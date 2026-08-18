import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectCloseout } from '../hooks/useProjectCloseout.js';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';
import { useToast } from '../components/shared/Toast.jsx';
import ScheduleCloseout from '../components/closeout/ScheduleCloseout.jsx';
import ScopeCloseout from '../components/closeout/ScopeCloseout.jsx';
import QualityCloseout from '../components/closeout/QualityCloseout.jsx';
import VariationCloseout from '../components/closeout/VariationCloseout.jsx';
import PaymentCloseout from '../components/closeout/PaymentCloseout.jsx';
import LessonsLearned from '../components/closeout/LessonsLearned.jsx';
import ContractorScorecard from '../components/closeout/ContractorScorecard.jsx';
import HistoricalRecord from '../components/closeout/HistoricalRecord.jsx';
import HistoricalIntelligence from '../components/closeout/HistoricalIntelligence.jsx';
import ManagementOutputs from '../components/closeout/ManagementOutputs.jsx';

const money = (value, currency) => value == null
  ? 'Not available'
  : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ''}`;

function CloseoutStage({ number, title, description, status = 'NOT STARTED', open = false, children }) {
  return <details className="closeout-stage" open={open}>
    <summary><span className="closeout-stage-number">{number}</span><div><strong>{title}</strong><small>{description}</small></div><span className="closeout-stage-status" data-status={status}>{status}</span></summary>
    <div className="closeout-stage-body">{children}</div>
  </details>;
}

function CostCloseout({ model, toast }) {
  const closeout = model.workspace.closeout;
  const [finalCost, setFinalCost] = useState('');
  const [budgetWhy, setBudgetWhy] = useState('');
  const [awardWhy, setAwardWhy] = useState('');
  const [forecastWhy, setForecastWhy] = useState('');
  const save = async confirm => {
    try {
      await model.saveCost(finalCost, budgetWhy, awardWhy, forecastWhy, confirm);
      toast.success(confirm ? 'Cost closeout confirmed.' : 'Cost closeout draft saved.');
    } catch (error) { toast.error(error.message); }
  };
  return <section className="variation-workspace"><h2>Cost Closeout</h2>
    {closeout && <article className="variation-card closeout-cost-chain"><strong>Version {closeout.versionNumber} · {closeout.status}</strong><p>Approved Budget {money(closeout.approvedBudget, closeout.currencyCode)} → Award {money(closeout.awardValue, closeout.currencyCode)} → Approved Variations {money(closeout.approvedVariations, closeout.currencyCode)} → Final Cost {money(closeout.finalCost, closeout.currencyCode)}</p><p>Variance: budget {money(closeout.varianceToBudget, closeout.currencyCode)} · award {money(closeout.varianceToAward, closeout.currencyCode)} · forecast {money(closeout.varianceToForecast, closeout.currencyCode)}</p><p>{closeout.budgetVarianceExplanation}</p><p>{closeout.awardVarianceExplanation}</p><p>{closeout.forecastVarianceExplanation}</p></article>}
    {closeout?.status !== 'CONFIRMED' && <article className="variation-card closeout-form"><label>Final Cost<input type="number" min="0" value={finalCost} onChange={event => setFinalCost(event.target.value)}/></label><label>Why final cost differs from Approved Budget<textarea rows="3" maxLength="3000" value={budgetWhy} onChange={event => setBudgetWhy(event.target.value)}/></label><label>Why final cost differs from Award<textarea rows="3" maxLength="3000" value={awardWhy} onChange={event => setAwardWhy(event.target.value)}/></label><label>Why final cost differs from latest Forecast<textarea rows="3" maxLength="3000" value={forecastWhy} onChange={event => setForecastWhy(event.target.value)}/></label><div className="closeout-actions"><button className="btn" disabled={model.busy || !finalCost || !budgetWhy.trim() || !awardWhy.trim() || !forecastWhy.trim()} onClick={() => save(false)}>Save immutable draft version</button><button className="btn btn-primary" disabled={model.busy || !finalCost || !budgetWhy.trim() || !awardWhy.trim() || !forecastWhy.trim()} onClick={() => save(true)}>Confirm Cost Closeout</button></div></article>}
  </section>;
}

export default function ProjectCloseout() {
  const { projectId } = useParams();
  const model = useProjectCloseout(projectId);
  const toast = useToast();
  const backHref = useProjectReturnHref(projectId, 'commercial');

  if (model.status === 'loading') return <main className="variation-page" role="status">Loading project closeout…</main>;
  if (model.status === 'error') return <main className="variation-page"><h2>Project closeout could not be loaded</h2><p>{model.error?.message}</p><button className="btn" onClick={model.retry}>Retry</button></main>;

  const workspace = model.workspace;
  const status = record => record?.status || 'NOT STARTED';

  return <main className="variation-page commercial-flow-page">
    <header className="variation-page-header commercial-page-header"><div><Link to={backHref}>← Back to Commercial</Link><h1>Project Closeout</h1><p>One ordered checklist for the final commercial, delivery and historical project record.</p></div></header>
    <section className="closeout-overview card"><div><span>Closeout sequence</span><strong>Complete each stage from cost through historical record</strong></div><p>Open only the stage you are working on. Confirmed stages stay visible as evidence and cannot be silently overwritten.</p></section>
    <div className="closeout-flow">
      <CloseoutStage number="01" title="Cost" description="Final cost and variance explanations" status={status(workspace.closeout)} open={status(workspace.closeout) !== 'CONFIRMED'}><CostCloseout model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="02" title="Schedule" description="Completion, delay drivers and recovery" status={status(workspace.scheduleCloseout?.closeout)}><ScheduleCloseout workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="03" title="Scope" description="Original, added, removed and changed works" status={status(workspace.scopeCloseout?.closeout)}><ScopeCloseout workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="04" title="Quality" description="Snags, closure performance and evidence" status={status(workspace.qualityCloseout?.closeout)}><QualityCloseout workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="05" title="Additional Works" description="Approved, rejected and unresolved changes" status={status(workspace.variationCloseout?.closeout)}><VariationCloseout workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="06" title="Payments and retention" description="Certified, paid and future obligations" status={status(workspace.paymentCloseout?.closeout)}><PaymentCloseout workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="07" title="Lessons learned" description="What worked, what failed, what changes next time" status={status(workspace.lessonsLearned?.lessons)}><LessonsLearned workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="08" title="Contractor scorecard" description="Evidence-based contractor performance" status={status(workspace.contractorScorecard?.scorecard)}><ContractorScorecard workspace={workspace} model={model} toast={toast}/></CloseoutStage>
      <CloseoutStage number="09" title="Historical record" description="Seal the verified record and generate management intelligence" status={workspace.historicalRecord?.isSealed ? 'SEALED' : 'NOT READY'}><HistoricalRecord workspace={workspace} model={model} toast={toast}/><HistoricalIntelligence workspace={workspace}/><ManagementOutputs workspace={workspace}/></CloseoutStage>
    </div>
  </main>;
}
