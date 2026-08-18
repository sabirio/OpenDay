import { useMemo, useState } from 'react';
import {
  buildBidderClarificationsPresentation,
  buildClarificationRegisterPresentation,
  buildTenderAwardPresentation,
  buildTenderBidReviewPresentation,
  buildTenderComparisonPresentation,
  buildTenderInvitationPreviewPresentation,
} from '../core/presentation/tenderPresentationModel.js';

export function useTenderComparisonPresentation(workspace) {
  const [roundId, setRoundId] = useState('');
  const [level, setLevel] = useState('WORK_GROUP');
  const view = useMemo(() => buildTenderComparisonPresentation(workspace, roundId), [workspace, roundId]);
  return { view, level, setLevel, setRoundId };
}

export function useTenderAwardPresentation(workspace) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [note, setNote] = useState('');
  const view = useMemo(() => buildTenderAwardPresentation(workspace, selectedSubmissionId, note), [workspace, selectedSubmissionId, note]);
  return { view, note, setNote, setSelectedSubmissionId };
}

export function useTenderBidReviewPresentation(workspace) {
  const [roundId, setRoundId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const view = useMemo(() => buildTenderBidReviewPresentation(workspace, roundId, submissionId), [workspace, roundId, submissionId]);
  return { view, setRoundId, setSubmissionId };
}

export function useClarificationRegisterPresentation(submission, workspace, draft) {
  return useMemo(() => buildClarificationRegisterPresentation(submission, workspace, draft), [submission, workspace, draft]);
}

export function useBidderClarificationsPresentation(items) {
  return useMemo(() => buildBidderClarificationsPresentation(items), [items]);
}

export function useTenderInvitationPreviewPresentation(draft, project, participant) {
  return useMemo(() => buildTenderInvitationPreviewPresentation(draft, project, participant), [draft, project, participant]);
}
