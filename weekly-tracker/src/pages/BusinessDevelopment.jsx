import { Link } from 'react-router-dom';
import { useWorkspace } from '../auth/useWorkspace.js';
import { getAllowedNavItemsForSession } from '../hooks/useDefaultRoute.js';

const MODULES = Object.freeze([
  { to: '/business-development/opportunities', resource: 'opportunities', label: 'Opportunities', step: '01', description: 'Qualify pre-award work and keep the commercial pipeline visible.' },
  { to: '/business-development/estimates', resource: 'estimates', label: 'Estimates', step: '02', description: 'Build the internal expected delivery cost before setting a selling price.' },
  { to: '/business-development/proposals', resource: 'proposals', label: 'Proposals', step: '03', description: 'Prepare controlled customer-facing scope and commercial terms.' },
]);

const SECTION_COPY = Object.freeze({
  opportunities: {
    eyebrow: 'Pipeline',
    title: 'Opportunities',
    description: 'A lightweight register for qualified pre-award work. Detailed CRM activity remains outside the OpenDay MVP.',
    emptyTitle: 'No opportunities recorded',
    emptyBody: 'New opportunities for this organization will appear here with their stage, client and commercial owner.',
  },
  estimates: {
    eyebrow: 'Internal cost',
    title: 'Estimates',
    description: 'Internal labour and external delivery costs remain confidential and separate from the client proposal.',
    emptyTitle: 'No estimates started',
    emptyBody: 'Estimates created from an opportunity will appear here with their currency, revision and delivery-cost status.',
  },
  proposals: {
    eyebrow: 'Customer commercial',
    title: 'Proposals',
    description: 'Customer-facing scope and price will be issued here without exposing internal rates, cost or margin.',
    emptyTitle: 'No proposals prepared',
    emptyBody: 'Approved pricing will become a versioned proposal in this workspace.',
  },
});

function WorkspaceNavigation({ items, section }) {
  return <nav className="business-development-tabs" aria-label="Business Development sections">
    <Link className={section === 'home' ? 'is-active' : ''} to="/business-development">Home</Link>
    {items.map(item => <Link key={item.to} className={section === item.resource ? 'is-active' : ''} to={item.to}>{item.label}</Link>)}
  </nav>;
}

export default function BusinessDevelopment({ section = 'home' }) {
  const { activeOrganization, scopedUser } = useWorkspace();
  const enabledModules = getAllowedNavItemsForSession(scopedUser, MODULES);
  const copy = SECTION_COPY[section];

  return <div className="business-development-page">
    <header className="business-development-header">
      <div><span>Business Development</span><h1>{copy?.title || 'Commercial pipeline'}</h1><p>{copy?.description || 'Move qualified work from opportunity through internal cost and into a controlled customer proposal.'}</p></div>
      <strong>{activeOrganization?.name || 'Active organization'}</strong>
    </header>
    <WorkspaceNavigation items={enabledModules} section={section}/>
    {section === 'home' ? <>
      <section className="business-development-summary card">
        <div><span>Operating model</span><h2>One connected pre-award flow</h2><p>OpenDay keeps internal delivery cost separate from customer-facing scope and price. Each stage becomes the controlled input to the next.</p></div>
        <div className="business-development-flow" aria-label="Business Development workflow">
          {enabledModules.map(item => <Link key={item.to} to={item.to}><small>{item.step}</small><strong>{item.label}</strong><span>{item.description}</span></Link>)}
        </div>
      </section>
      <section className="business-development-principles">
        <article className="card"><span>Confidential by design</span><h3>Internal cost stays internal</h3><p>Labour rates, external cost and future margin are never copied directly into the client document.</p></article>
        <article className="card"><span>Controlled progression</span><h3>Every stage has a source</h3><p>Estimates originate from opportunities; proposals originate from approved pricing rather than disconnected spreadsheets.</p></article>
      </section>
    </> : <section className="business-development-register card">
      <header><div><span>{copy.eyebrow}</span><h2>{copy.title}</h2></div><small>Organization scoped</small></header>
      <div className="business-development-empty"><strong>{copy.emptyTitle}</strong><p>{copy.emptyBody}</p></div>
    </section>}
  </div>;
}
