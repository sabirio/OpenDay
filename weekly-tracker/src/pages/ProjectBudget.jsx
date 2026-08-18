import { Link, useParams } from 'react-router-dom';
import { useProjectBudget } from '../hooks/useProjectBudget.js';
import { useToast } from '../components/shared/Toast.jsx';
import DepartmentalBudgetWorkspace from '../components/budget/DepartmentalBudgetWorkspace.jsx';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

export default function ProjectBudget() {
  const { projectId } = useParams();
  const backHref = useProjectReturnHref(projectId, 'commercial');
  const editor = useProjectBudget({ id: projectId });
  const toast = useToast();
  if (editor.status === 'loading') return <div className="boq-state">Loading budget…</div>;
  if (editor.status === 'error') return <div className="boq-state boq-state-error"><h2>Budget could not be loaded</h2><p>{editor.error?.code || editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></div>;
  const workspace = editor.workspace;
  const project = { id: projectId, storeCode: workspace.projectCode, currencyCode: workspace.projectCurrencyCode };

  const exportExcel = async () => {
    try {
      const [{ buildProjectBudgetWorkbookBytes }, { downloadXlsxBlob }] = await Promise.all([
        import('../export/xlsx/buildProjectWorkbook.js'), import('../export/xlsx/downloadXlsxBlob.js'),
      ]);
      const bytes = buildProjectBudgetWorkbookBytes({ projectId, workspace });
      const code = String(workspace.projectCode || 'project').replace(/[^a-z0-9_-]+/gi, '-');
      downloadXlsxBlob(bytes, `${code}-Budget-R${workspace.roundControl.currentRoundNumber}.xlsx`);
    } catch (error) {
      console.error('[ProjectBudget] export failed:', error);
      toast.error('Budget export could not be generated.');
    }
  };

  return <main className="budget-page">
    <header className="boq-page-header"><div><Link to={backHref}>← Project Commercial</Link><span>{workspace.projectCode}</span><h1>Departmental Budget</h1><p>Collaborative management-level budgeting by canonical Work Group.</p></div></header>
    <DepartmentalBudgetWorkspace editor={editor} project={project} onExport={exportExcel} onSuccess={toast.success} onError={error => toast.error(error?.message || 'Budget action failed.')} />
  </main>;
}
