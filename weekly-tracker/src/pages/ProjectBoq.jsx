import { Link, useParams } from 'react-router-dom';
import { useResolvedProject } from '../hooks/useResolvedProject.js';
import { useProjectBoqEditor } from '../hooks/useProjectBoqEditor.js';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard.js';
import { useToast } from '../components/shared/Toast.jsx';
import ProjectBoqEditor from '../components/boq/ProjectBoqEditor.jsx';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

function ProjectBoqWorkspace({ project }) {
  const toast = useToast();
  const editor = useProjectBoqEditor(project);
  const { guardLinkClick } = useUnsavedChangesGuard(editor.dirty, 'This BOQ revision has unsaved changes. Leave without saving?');
  const backHref = useProjectReturnHref(project.id, 'tender');

  async function exportExcel() {
    try {
      const [{ buildProjectBoqWorkbookBytes }, { downloadXlsxBlob }] = await Promise.all([
        import('../export/xlsx/buildProjectWorkbook.js'), import('../export/xlsx/downloadXlsxBlob.js'),
      ]);
      const { context } = editor;
      const bytes = buildProjectBoqWorkbookBytes({ boq: context.boq, version: context.latestVersion, ontology: context.ontology, items: editor.draft.items });
      const code = String(project.storeCode || 'project').replace(/[^a-z0-9_-]+/gi, '-');
      downloadXlsxBlob(bytes, `${code}-BOQ-R${context.latestVersion.revisionNumber}.xlsx`);
    } catch (error) {
      console.error('[ProjectBoq] export failed:', error);
      toast.error('BOQ export could not be generated.');
    }
  }

  if (editor.status === 'loading') return <div className="boq-state" role="status">Loading BOQ…</div>;
  if (editor.status === 'error') return <div className="boq-state boq-state-error" role="alert"><h2>BOQ could not be loaded</h2><p>{editor.error?.code || editor.error?.message}</p><button className="btn" onClick={() => editor.loadVersion()}>Retry</button></div>;
  const view = editor.presentation;

  return <div className="boq-page">
    <div className="boq-sticky-overview">
      <header className="boq-page-header"><div><Link to={backHref} onClick={event => guardLinkClick(event, backHref)}>← Project Tender</Link><span>{project.storeCode}</span><h1>{view.title}</h1><p>Native, versioned tender BOQ mapped to canonical Work Groups.</p></div><div className="boq-header-meta"><span>{view.currencyCode}</span><span>{view.summary.lineCount} lines</span></div></header>
      <section className="boq-total-strip card" aria-label="Total BOQ">
        <div className="boq-total-strip-overall"><div><span>Total BOQ</span><strong>{view.summary.totalDisplay} {view.currencyCode}</strong></div><div className="boq-total-strip-meta"><span>{view.summary.pricedLineCount} priced</span><span>{view.summary.unpricedLineCount} unpriced</span></div></div>
        <div className="boq-discipline-totals" role="table" aria-label="BOQ totals by discipline">{view.disciplineTotals.map(discipline => <div className="boq-discipline-total-row" role="row" key={discipline.id}><span role="cell"><b>{discipline.code}</b>{discipline.label}</span><strong role="cell">{discipline.totalDisplay} {view.currencyCode}</strong></div>)}</div>
      </section>
      {view.hasRevisionHistory && <nav className="boq-history" aria-label="BOQ revision history"><strong>Revisions</strong>{view.revisionHistory.map(version => <button key={version.id} type="button" className={version.isActive ? 'is-active' : ''} disabled={view.dirty} onClick={() => editor.loadVersion(version.id)}>{version.label}<span>{version.sourceKind}</span></button>)}</nav>}
    </div>
    {view.isHistorical && <div className="boq-alert boq-alert-info"><strong>Historical revision — read only.</strong><span>Select the latest revision to continue editing.</span></div>}
    <ProjectBoqEditor editor={editor} onExport={exportExcel} onImportSuccess={() => toast.success('Excel imported as a new immutable BOQ revision.')} onSaveSuccess={({ result }) => toast.success(`BOQ revision ${result.revisionNumber} saved.`)} onSaveError={error => toast.error(error?.message || 'BOQ revision could not be saved.')}/>
  </div>;
}

export default function ProjectBoq({ projects = [] }) {
  const { projectId } = useParams();
  const project = useResolvedProject(projects, projectId);
  if (project !== false && !project) return <div className="boq-state" role="status">Loading project…</div>;
  if (!project) return <div className="boq-state boq-state-error" role="alert">Project is unavailable or you do not have access.</div>;
  return <ProjectBoqWorkspace project={project}/>;
}
