import { Link, useParams } from 'react-router-dom';
import ConsultantBoqWorkspace from '../components/commercial/ConsultantBoqWorkspace.jsx';
import { useConsultantBoq } from '../hooks/useConsultantBoq.js';

export default function ConsultantBoq() {
  const { tenderId } = useParams();
  const model = useConsultantBoq(tenderId);
  if (model.status === 'loading') return <div className="page-loading">Loading Consultant BOQ...</div>;
  if (model.status === 'error') return <div className="page-error"><h2>Consultant BOQ could not be loaded</h2><button type="button" className="btn btn-primary" onClick={model.retry}>Retry</button></div>;
  return (
    <main className="consultant-boq-page">
      <Link to="/consultant-boqs">← Consultant BOQs</Link>
      <ConsultantBoqWorkspace draft={model.draft} presentation={model.presentation} busy={model.busy} onPatchQuantity={model.patchQuantity} onPatchDraft={model.patchDraft} onAddCustom={model.addCustom} onPatchCustom={model.patchCustom} onRemoveCustom={model.removeCustom} onSave={model.save} onSubmit={model.submit} onReview={model.review} />
    </main>
  );
}
