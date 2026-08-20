import { useTenderInvitationPreviewPresentation } from '../../hooks/useTenderPresentation.js';
import Modal from '../shared/Modal.jsx';

export default function TenderInvitationPreview({ draft, project, participant, onClose }) {
  const view = useTenderInvitationPreviewPresentation(draft, project, participant);
  return <Modal onClose={onClose} titleId="tender-invitation-preview-title" className="modal tender-invitation-preview">
    <div className="modal-header"><div><span className="tender-email-kicker">EMAIL PREVIEW</span><h2 id="tender-invitation-preview-title">Invitation to Tender</h2></div><button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close invitation preview">Close</button></div>
    <div className="tender-email-preview">
      <div className="tender-email-brand">OpenDay</div>
      <p>Dear {view.biddingOrganizationName},</p>
      <p className="tender-email-message">{view.invitationMessage}</p>
      <dl><div><dt>Project</dt><dd>{view.projectCode}</dd></div><div><dt>Tender</dt><dd>{view.tenderNumber}</dd></div><div><dt>Title</dt><dd>{view.title}</dd></div><div><dt>Deadline</dt><dd>{view.deadlineDisplay}</dd></div><div><dt>Currency</dt><dd>{view.currencyCode}</dd></div></dl>
      <button className="btn btn-primary" type="button" disabled>Open Tender</button>
      <small>The secure sign-in link can be used once and expires shortly. Do not forward this invitation.</small>
    </div>
  </Modal>;
}
