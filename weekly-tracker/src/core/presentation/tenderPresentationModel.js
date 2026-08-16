import {
  presentBidderClarifications,
  presentClarificationRegister,
  presentTenderAward,
  presentTenderBidReview,
  presentTenderComparisonWorkspace,
  presentTenderSetupEditor,
  presentTenderInvitationPreview,
} from '../../engines/tenderPresentationEngine.js';

export const buildTenderComparisonPresentation = presentTenderComparisonWorkspace;
export const buildTenderAwardPresentation = presentTenderAward;
export const buildTenderBidReviewPresentation = presentTenderBidReview;
export const buildClarificationRegisterPresentation = presentClarificationRegister;
export const buildBidderClarificationsPresentation = presentBidderClarifications;
export const buildTenderSetupEditorPresentation = presentTenderSetupEditor;
export const buildTenderInvitationPreviewPresentation = presentTenderInvitationPreview;
