import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../auth/useWorkspace.js';
import { useToast } from '../components/shared/Toast.jsx';
import { ErrorState, Icon, LoadingState, PageHeader, SecondaryButton, WorkspaceNavigation } from '../components/businessDevelopment/BusinessDevelopmentShell.jsx';
import OpportunityWorkspace from '../components/businessDevelopment/OpportunityWorkspace.jsx';
import EstimateWorkspace from '../components/businessDevelopment/EstimateWorkspace.jsx';
import { useBusinessDevelopmentWorkspace } from '../hooks/useBusinessDevelopmentWorkspace.js';
import { getAllowedNavItemsForSession } from '../hooks/useDefaultRoute.js';

const MODULES = Object.freeze([
  { to: '/business-development/opportunities', resource: 'opportunities', label: 'Opportunities', step: '01', description: 'Qualify pre-award work and keep the pipeline visible.' },
  { to: '/business-development/estimates', resource: 'estimates', label: 'Estimates', step: '02', description: 'Build confidential expected delivery cost.' },
  { to: '/business-development/proposals', resource: 'proposals', label: 'Proposals', step: '03', description: 'Prepare controlled customer-facing scope and terms.' },
]);

const SECTION_COPY = Object.freeze({
  home: { title: 'Commercial pipeline', description: 'Move qualified work from opportunity through internal delivery cost and into a controlled customer proposal.' },
  opportunities: { title: 'Opportunities', description: 'Qualify potential work, assign a clear stage and establish the controlled source for estimating.' },
  estimates: { title: 'Delivery estimates', description: 'Build internal labour, external supplier and other direct cost without exposing confidential rates to clients.' },
  proposals: { title: 'Proposals', description: 'Customer-facing scope and price will be issued here without exposing internal rate, cost or margin.' },
});

function MetricCard({ label, value, detail, tone = 'neutral' }) {
  const valueClass = tone === 'accent' ? 'text-[var(--accent)]' : tone === 'warning' ? 'text-[var(--status-warn)]' : 'text-[var(--text-primary)]';
  return <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm"><span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span><strong className={`mt-2 block text-2xl font-extrabold ${valueClass}`}>{value}</strong><small className="mt-1 block text-xs text-[var(--text-muted)]">{detail}</small></article>;
}

function Overview({ modules, metrics, opportunities, estimates }) {
  const recentOpportunities = opportunities.slice(0, 4);
  const recentEstimates = estimates.slice(0, 4);
  return <div className="grid gap-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Pipeline records" value={metrics.opportunities} detail={`${metrics.activeOpportunities} currently active`} tone="accent"/>
      <MetricCard label="Delivery estimates" value={metrics.estimates} detail={`${metrics.estimatesInReview} in internal review`}/>
      <MetricCard label="Approved cost bases" value={metrics.approvedEstimates} detail="Ready for future pricing"/>
      <MetricCard label="Client proposals" value="—" detail="Pricing & Proposal Engine is next" tone="warning"/>
    </section>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm">
      <div className="grid lg:grid-cols-[0.9fr_2.1fr]">
        <div className="border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r"><span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">Operating model</span><h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">One connected pre-award flow</h2><p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Every stage is the controlled source for the next. Internal cost stays separate from customer-facing price and terms.</p></div>
        <div className="grid md:grid-cols-3">{modules.map((item, index) => <Link key={item.to} to={item.to} className="group flex min-h-44 flex-col border-b border-[var(--border)] p-5 no-underline last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><span className="text-xs font-extrabold text-[var(--accent)]">{item.step}</span><strong className="mt-6 flex items-center justify-between text-base text-[var(--text-primary)]">{item.label}<Icon name="arrow" className="size-4 transition-transform group-hover:translate-x-1"/></strong><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{item.description}</p>{index < modules.length - 1 ? <small className="mt-auto pt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Feeds the next stage</small> : null}</Link>)}</div>
      </div>
    </section>
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]"><header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h3 className="text-sm font-bold text-[var(--text-primary)]">Recent opportunities</h3><p className="mt-0.5 text-xs text-[var(--text-muted)]">Latest pipeline activity</p></div><Link className="text-xs font-bold text-[var(--accent)] no-underline" to="/business-development/opportunities">Open register</Link></header>{recentOpportunities.length ? <div>{recentOpportunities.map(item => <div key={item.opportunityId} className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-4 py-3 first:border-t-0"><div className="min-w-0"><strong className="block truncate text-sm text-[var(--text-primary)]">{item.title}</strong><span className="block truncate text-xs text-[var(--text-muted)]">{item.opportunityNumber} · {item.clientName}</span></div><small className="shrink-0 font-bold text-[var(--text-secondary)]">{item.status.replaceAll('_', ' ')}</small></div>)}</div> : <p className="p-6 text-sm text-[var(--text-muted)]">No opportunity activity yet.</p>}</article>
      <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]"><header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h3 className="text-sm font-bold text-[var(--text-primary)]">Recent estimates</h3><p className="mt-0.5 text-xs text-[var(--text-muted)]">Confidential delivery cost</p></div><Link className="text-xs font-bold text-[var(--accent)] no-underline" to="/business-development/estimates">Open register</Link></header>{recentEstimates.length ? <div>{recentEstimates.map(item => <div key={item.estimateId} className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-4 py-3 first:border-t-0"><div className="min-w-0"><strong className="block truncate text-sm text-[var(--text-primary)]">{item.title}</strong><span className="block truncate text-xs text-[var(--text-muted)]">{item.estimateNumber} · Revision {item.revision}</span></div><strong className="shrink-0 text-sm text-[var(--text-primary)]">{Number(item.estimatedDeliveryCost || 0).toLocaleString('en-GB')} {item.currencyCode}</strong></div>)}</div> : <p className="p-6 text-sm text-[var(--text-muted)]">No estimate activity yet.</p>}</article>
    </section>
    <section className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"><span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent)]">Confidential by design</span><h3 className="mt-2 text-base font-bold text-[var(--text-primary)]">Internal cost stays internal</h3><p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Labour grades, rates, external cost and future margin are never copied directly into a client document.</p></article><article className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"><span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent)]">Controlled progression</span><h3 className="mt-2 text-base font-bold text-[var(--text-primary)]">Every stage has a source</h3><p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Estimates originate from opportunities; future proposals will originate from approved pricing rather than disconnected spreadsheets.</p></article></section>
  </div>;
}

function ProposalsPlaceholder() {
  return <section className="grid min-h-[420px] place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center shadow-sm"><div className="max-w-xl"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--status-warn-bg)] text-2xl text-[var(--status-warn)]">03</span><h2 className="mt-5 text-xl font-bold text-[var(--text-primary)]">Proposal editor follows the pricing engine</h2><p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">The workspace is reserved, but OpenDay will not create a customer price directly from confidential cost. Rate cards, margin rules and approval controls must be implemented first.</p><div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left"><strong className="text-sm text-[var(--text-primary)]">Required controlled inputs</strong><ul className="mt-2 grid gap-2 text-xs leading-5 text-[var(--text-muted)] sm:grid-cols-2"><li>• Approved delivery estimate</li><li>• Pricing strategy and margin</li><li>• Customer-facing scope</li><li>• Commercial approval</li></ul></div></div></section>;
}

export default function BusinessDevelopment({ section = 'home' }) {
  const { activeOrganization, scopedUser } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const enabledModules = getAllowedNavItemsForSession(scopedUser, MODULES);
  const editor = useBusinessDevelopmentWorkspace(activeOrganization?.organizationId);
  const copy = SECTION_COPY[section] || SECTION_COPY.home;

  async function saveOpportunity(input) {
    try { await editor.saveOpportunity(input); toast.success('Opportunity saved.'); }
    catch (error) { toast.error(error.message); throw error; }
  }

  async function saveEstimate(input) {
    try { await editor.saveEstimate(input); toast.success('Delivery estimate saved.'); }
    catch (error) { toast.error(error.message); throw error; }
  }

  const content = editor.state === 'loading'
    ? <LoadingState/>
    : editor.state === 'error'
      ? <ErrorState message={editor.error} onRetry={editor.refresh}/>
      : section === 'home'
        ? <Overview modules={enabledModules} metrics={editor.metrics} opportunities={editor.workspace.opportunities || []} estimates={editor.workspace.estimates || []}/>
        : section === 'opportunities'
          ? <OpportunityWorkspace opportunities={editor.workspace.opportunities || []} estimates={editor.workspace.estimates || []} saving={editor.saving} onSave={saveOpportunity} onCreateEstimate={opportunity => navigate('/business-development/estimates', { state: { opportunityId: opportunity.opportunityId } })}/>
          : section === 'estimates'
            ? <EstimateWorkspace opportunities={editor.workspace.opportunities || []} estimates={editor.workspace.estimates || []} saving={editor.saving} onSave={saveEstimate} createItem={editor.createEstimateItem} initialOpportunityId={location.state?.opportunityId || null}/>
            : <ProposalsPlaceholder/>;

  return <div className="mx-auto grid w-full max-w-[1480px] gap-5 pb-10">
    <PageHeader title={copy.title} description={copy.description} organizationName={activeOrganization?.name} action={<SecondaryButton onClick={editor.refresh} disabled={editor.state === 'loading'}><Icon name="refresh"/>Refresh</SecondaryButton>}/>
    <WorkspaceNavigation items={enabledModules} section={section}/>
    {editor.error && editor.state !== 'error' ? <p role="alert" className="rounded-lg border border-[var(--status-alert)] bg-[var(--status-alert-bg)] px-4 py-3 text-sm text-[var(--status-alert)]">{editor.error}</p> : null}
    {content}
  </div>;
}
