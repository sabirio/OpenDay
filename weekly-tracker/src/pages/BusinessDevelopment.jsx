import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../auth/useWorkspace.js';
import { useToast } from '../components/shared/Toast.jsx';
import { ErrorState, Icon, LoadingState, PageHeader, SecondaryButton, WorkspaceNavigation } from '../components/businessDevelopment/BusinessDevelopmentShell.jsx';
import OpportunityWorkspace from '../components/businessDevelopment/OpportunityWorkspace.jsx';
import EstimateWorkspace from '../components/businessDevelopment/EstimateWorkspace.jsx';
import RateCardWorkspace from '../components/businessDevelopment/RateCardWorkspace.jsx';
import PricingWorkspace from '../components/businessDevelopment/PricingWorkspace.jsx';
import ProposalWorkspace from '../components/businessDevelopment/ProposalWorkspace.jsx';
import { useBusinessDevelopmentWorkspace } from '../hooks/useBusinessDevelopmentWorkspace.js';
import { getAllowedNavItemsForSession } from '../hooks/useDefaultRoute.js';
import { Eyebrow, Surface } from '../components/shared/UiPrimitives.jsx';
import { PageShell } from '../components/shared/LayoutPrimitives.jsx';
import { InlineAlert, MetricCard } from '../components/shared/UiPatterns.jsx';

const MODULES = Object.freeze([
  { to: '/business-development/opportunities', resource: 'opportunities', label: 'Opportunities', step: '01', description: 'Qualify pre-award work and keep the pipeline visible.' },
  { to: '/business-development/estimates', resource: 'estimates', label: 'Estimates', step: '02', description: 'Build confidential expected delivery cost.' },
  { to: '/business-development/rate-cards', resource: 'rate_cards', label: 'Rate Cards', step: '03', description: 'Maintain controlled organization cost and selling rates.' },
  { to: '/business-development/pricing', resource: 'pricing', label: 'Pricing', step: '04', description: 'Convert approved cost into a controlled selling price.' },
  { to: '/business-development/proposals', resource: 'proposals', label: 'Proposals', step: '05', description: 'Prepare controlled customer-facing scope and terms.' },
]);

const SECTION_COPY = Object.freeze({
  home: { title: 'Commercial pipeline', description: 'Move qualified work from opportunity through internal delivery cost and into a controlled customer proposal.' },
  opportunities: { title: 'Opportunities', description: 'Qualify potential work, assign a clear stage and establish the controlled source for estimating.' },
  estimates: { title: 'Delivery estimates', description: 'Build internal labour, external supplier and other direct cost without exposing confidential rates to clients.' },
  rate_cards: { title: 'Organization rate cards', description: 'Maintain effective-dated internal cost and optional selling rates without using employee salary as a commercial primitive.' },
  pricing: { title: 'Commercial pricing', description: 'Apply target margin, cost plus, fixed price or rate-based methods to an approved internal delivery estimate.' },
  proposals: { title: 'Customer proposals', description: 'Issue customer-facing scope and price without exposing internal labour, cost rates or margin.' },
});

function Overview({ modules, metrics, opportunities, estimates }) {
  const recentOpportunities = opportunities.slice(0, 4);
  const recentEstimates = estimates.slice(0, 4);
  return <div className="grid gap-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Pipeline records" value={metrics.opportunities} detail={`${metrics.activeOpportunities} currently active`} tone="accent"/>
      <MetricCard label="Delivery estimates" value={metrics.estimates} detail={`${metrics.estimatesInReview} in internal review`}/>
      <MetricCard label="Approved cost bases" value={metrics.approvedEstimates} detail="Ready for future pricing"/>
      <MetricCard label="Approved pricings" value={metrics.approvedPricings} detail="Controlled selling price"/>
      <MetricCard label="Client proposals" value={metrics.proposals} detail="Immutable customer revisions" tone="warning"/>
    </section>
    <Surface elevated>
      <div className="grid lg:grid-cols-[0.9fr_2.1fr]">
        <div className="border-b border-ui-border p-5 lg:border-b-0 lg:border-r"><Eyebrow>Operating model</Eyebrow><h2 className="mt-2 text-xl font-bold text-ui-primary">One connected pre-award flow</h2><p className="mt-2 text-sm leading-6 text-ui-muted">Every stage is the controlled source for the next. Internal cost stays separate from customer-facing price and terms.</p></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">{modules.map((item, index) => <Link key={item.to} to={item.to} className="group flex min-h-44 flex-col border-b border-ui-border p-5 no-underline last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0"><span className="text-xs font-extrabold text-ui-accent">{item.step}</span><strong className="mt-6 flex items-center justify-between text-base text-ui-primary">{item.label}<Icon name="arrow" className="size-4 transition-transform group-hover:translate-x-1"/></strong><p className="mt-2 text-xs leading-5 text-ui-muted">{item.description}</p>{index < modules.length - 1 ? <small className="mt-auto pt-4 text-xs font-bold uppercase tracking-wider text-ui-muted">Feeds the next stage</small> : null}</Link>)}</div>
      </div>
    </Surface>
    <section className="grid gap-5 xl:grid-cols-2">
      <Surface as="article"><header className="flex items-center justify-between border-b border-ui-border px-4 py-3"><div><h3 className="text-sm font-bold text-ui-primary">Recent opportunities</h3><p className="mt-0.5 text-xs text-ui-muted">Latest pipeline activity</p></div><Link className="text-xs font-bold text-ui-accent no-underline" to="/business-development/opportunities">Open register</Link></header>{recentOpportunities.length ? <div>{recentOpportunities.map(item => <div key={item.opportunityId} className="flex items-center justify-between gap-4 border-t border-ui-border px-4 py-3 first:border-t-0"><div className="min-w-0"><strong className="block truncate text-sm text-ui-primary">{item.title}</strong><span className="block truncate text-xs text-ui-muted">{item.opportunityNumber} · {item.clientName}</span></div><small className="shrink-0 font-bold text-ui-secondary">{item.status.replaceAll('_', ' ')}</small></div>)}</div> : <p className="p-6 text-sm text-ui-muted">No opportunity activity yet.</p>}</Surface>
      <Surface as="article"><header className="flex items-center justify-between border-b border-ui-border px-4 py-3"><div><h3 className="text-sm font-bold text-ui-primary">Recent estimates</h3><p className="mt-0.5 text-xs text-ui-muted">Confidential delivery cost</p></div><Link className="text-xs font-bold text-ui-accent no-underline" to="/business-development/estimates">Open register</Link></header>{recentEstimates.length ? <div>{recentEstimates.map(item => <div key={item.estimateId} className="flex items-center justify-between gap-4 border-t border-ui-border px-4 py-3 first:border-t-0"><div className="min-w-0"><strong className="block truncate text-sm text-ui-primary">{item.title}</strong><span className="block truncate text-xs text-ui-muted">{item.estimateNumber} · Revision {item.revision}</span></div><strong className="shrink-0 text-sm text-ui-primary">{Number(item.estimatedDeliveryCost || 0).toLocaleString('en-GB')} {item.currencyCode}</strong></div>)}</div> : <p className="p-6 text-sm text-ui-muted">No estimate activity yet.</p>}</Surface>
    </section>
    <section className="grid gap-4 md:grid-cols-2"><Surface as="article" className="p-5"><Eyebrow>Confidential by design</Eyebrow><h3 className="mt-2 text-base font-bold text-ui-primary">Internal cost stays internal</h3><p className="mt-2 text-sm leading-6 text-ui-muted">Labour grades, rates, external cost and margin are never copied directly into a client document.</p></Surface><Surface as="article" className="p-5"><Eyebrow>Controlled progression</Eyebrow><h3 className="mt-2 text-base font-bold text-ui-primary">Every stage has a source</h3><p className="mt-2 text-sm leading-6 text-ui-muted">Estimates originate from opportunities; proposals originate from approved pricing rather than disconnected spreadsheets.</p></Surface></section>
  </div>;
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

  async function command(action, successMessage) {
    try { await action(); toast.success(successMessage); }
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
            ? <EstimateWorkspace opportunities={editor.workspace.opportunities || []} estimates={editor.workspace.estimates || []} rateCards={editor.workspace.rateCards || []} saving={editor.saving} onSave={saveEstimate} createItem={editor.createEstimateItem} initialOpportunityId={location.state?.opportunityId || null}/>
            : section === 'rate_cards'
              ? <RateCardWorkspace rateCards={editor.workspace.rateCards || []} saving={editor.saving} onSave={input => command(() => editor.saveRateCard(input), 'Rate card saved.')}/>
              : section === 'pricing'
                ? <PricingWorkspace estimates={editor.workspace.estimates || []} pricings={editor.workspace.pricings || []} saving={editor.saving} onSave={input => command(() => editor.savePricing(input), 'Commercial pricing saved.')} createDraft={editor.createPricingDraft}/>
                : <ProposalWorkspace proposals={editor.workspace.proposals || []} pricings={editor.workspace.pricings || []} estimates={editor.workspace.estimates || []} opportunities={editor.workspace.opportunities || []} saving={editor.saving} onSave={input => command(() => editor.saveProposal(input), 'Proposal revision saved.')} onTransition={input => command(() => editor.transitionProposal(input), 'Proposal status updated.')} createSection={editor.createProposalSection}/>;

  return <PageShell>
    <PageHeader title={copy.title} description={copy.description} organizationName={activeOrganization?.name} action={<SecondaryButton onClick={editor.refresh} disabled={editor.state === 'loading'}><Icon name="refresh"/>Refresh</SecondaryButton>}/>
    <WorkspaceNavigation items={enabledModules} section={section}/>
    {editor.error && editor.state !== 'error' ? <InlineAlert>{editor.error}</InlineAlert> : null}
    {content}
  </PageShell>;
}
