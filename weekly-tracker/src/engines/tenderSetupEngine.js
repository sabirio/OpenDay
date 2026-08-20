const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function defaultInvitationMessage(project, title) {
  return `We invite your company to participate in ${title} for project ${project.storeCode || 'OpenDay'}. Please review the issued BOQ and tender requirements, then submit your commercial offer before the deadline.`;
}

export function prepareTenderSetupContext({ project, tenders, tender, commercial, boq, boqVersions, selectedBoqVersion, totals, consultantWorkspace, bidderAccess, bidRounds, bidReviewWorkspace, clarificationWorkspace, comparisonWorkspace, awardWorkspace }) {
  const tenderIdentity = commercial?.tenderPackages?.find(item => item.tenderId === tender?.id) || null;
  const packageIds = new Set(tenderIdentity?.costPackageIds || []);
  const scopedIds = new Set((commercial?.costPackages || []).filter(item => packageIds.has(item.costPackageId)).flatMap(item => item.workGroupIds));
  const availableWorkGroups = tender?.boqMode === 'CONSULTANT_MEASURED'
    ? Array.from(new Map((consultantWorkspace?.items || []).map(item => [item.workGroupId, { id: item.workGroupId, code: item.workGroupCode, label: item.workGroupLabel, disciplineLabel: item.disciplineLabel }])).values())
    : (totals || []).filter(row => scopedIds.has(row.workGroupId)).map(row => ({ id: row.workGroupId, code: row.workGroupCode, label: row.workGroupLabel, disciplineLabel: row.disciplineLabel, lineCount: row.lineCount }));
  const readyVersions = selectedBoqVersion ? [selectedBoqVersion] : boqVersions;
  const presentedAccess = (bidderAccess || []).map(access => ({ ...access, statusLabel: access.status.replaceAll('_',' '), deliveryLabel: access.emailOpenedAt ? 'OPENED' : access.emailSentAt ? 'SENT' : 'NOT SENT', deliveryTone: access.emailOpenedAt ? 'is-opened' : access.emailSentAt ? 'is-sent' : 'is-not-sent' }));
  const acceptedCount = presentedAccess.filter(access => access.status === 'ACCEPTED').length;
  const latestReviewRound = bidReviewWorkspace?.rounds?.at(-1) || null;
  const submittedCount = latestReviewRound?.participants?.filter(item => item.submission).length || 0;
  const reviewedCount = latestReviewRound?.participants?.filter(item => item.submission?.reviewStatus === 'REVIEWED').length || 0;
  const overview = buildTenderOverview({ tender, latestSetup: tender?.latestSetup, boqReady: readyVersions.length > 0, access: presentedAccess, acceptedCount, bidRounds, submittedCount, reviewedCount, award: awardWorkspace?.award });
  return {
    project, commercial, boq, boqVersions: readyVersions, availableWorkGroups, tenders, tender,
    boqMode: tender?.boqMode || null,
    boqPrerequisite: !tender ? 'TENDER_PACKAGE_REQUIRED' : tender.boqMode === 'CONSULTANT_MEASURED' && consultantWorkspace?.status !== 'FROZEN' ? 'CONSULTANT_BOQ_FREEZE_REQUIRED' : readyVersions.length === 0 ? 'PROJECT_BOQ_REVISION_REQUIRED' : null,
    latestSetup: tender?.latestSetup || null,
    scopeWorkGroupIds: tender?.scopeWorkGroupIds || [], participants: tender?.participants || [],
    bidderAccess:presentedAccess, bidRounds, bidReviewWorkspace, clarificationWorkspace, comparisonWorkspace, awardWorkspace,
    overview,
    tabs:[{id:'OVERVIEW',label:'Overview'},...(tender?.boqMode==='CONSULTANT_MEASURED'?[{id:'CONSULTANT',label:'Consultant'}]:[]),{id:'PARTICIPANTS',label:'Participants'},{id:'BOQ',label:'BOQ'},{id:'BIDS',label:'Bids'},{id:'COMPARISON',label:'Comparison'},{id:'CLARIFICATIONS',label:'Clarifications'},{id:'AWARD',label:'Award'}],
  };
}

function buildTenderOverview({tender,latestSetup,boqReady,access,acceptedCount,bidRounds,submittedCount,reviewedCount,award}){
  const completed=[];
  if(tender)completed.push('Tender Package created');
  if(boqReady)completed.push('Issue BOQ ready');
  if(latestSetup)completed.push(`Tender Setup R${latestSetup.revisionNumber} saved`);
  if(access.length)completed.push(`${access.length} bidding organization invitation(s) issued`);
  if(acceptedCount)completed.push(`${acceptedCount} bidding organization(s) accepted`);
  if(submittedCount)completed.push(`${submittedCount} immutable bid submission(s) received`);
  if(reviewedCount)completed.push(`${reviewedCount} bid submission(s) reviewed`);
  if(award)completed.push('Commercial award baseline frozen');
  if(award)return{completed,current:'Tender awarded and commercial baseline is immutable.',next:'Continue committed cost and forecast control from the awarded baseline.'};
  if(!latestSetup)return{completed,current:'Tender Setup is being prepared.',next:'Complete the issue details and save Tender Setup.'};
  if(access.length===0)return{completed,current:'Tender Setup is ready for participants.',next:'Add bidding organizations and send invitations.'};
  if(acceptedCount===0)return{completed,current:'Bidding organization responses are pending.',next:'Wait for an acceptance, or record No Response after the deadline.'};
  if(bidRounds.length===0)return{completed,current:'Accepted bidding organizations can access the Tender Package.',next:'Open Bid Round 1.'};
  if(submittedCount===0)return{completed,current:'The current Bid Round is open.',next:'Wait for immutable contractor submissions.'};
  if(reviewedCount<submittedCount)return{completed,current:'Submitted bids are under PM review.',next:'Complete review and raise any required clarifications.'};
  return{completed,current:'Current bid submissions are reviewed.',next:'Resolve clarifications, open the next round, or proceed to Award.'};
}

export function createTenderSetupDraft(project, context, createId = () => crypto.randomUUID()) {
  const latest = context.boqVersions.at(-1) || null;
  const title = context.latestSetup?.title || `${project.storeCode || 'Project'} Main Works Tender`;
  return {
    tenderId: context.tender?.id || '',
    tenderNumber: context.tender?.tenderNumber || '',
    title,
    deadlineAt: context.latestSetup?.deadlineAt?.slice(0, 16) || '',
    currencyCode: context.latestSetup?.currencyCode || project.currencyCode || context.boq?.currencyCode || 'KZT',
    tenderRules: context.latestSetup?.tenderRules || 'All prices must include labour, materials, delivery, installation, testing and applicable taxes. State every exclusion explicitly.',
    invitationMessage: context.latestSetup?.invitationMessage || defaultInvitationMessage(project, title),
    issuedBoqVersionId: context.latestSetup?.issuedBoqVersionId || latest?.id || '',
    workGroupIds: context.availableWorkGroups.map(item => item.id),
    participants: context.participants?.length ? context.participants.map(item => ({ ...item, biddingOrganizationName: item.biddingOrganizationName || item.contractorName || '' })) : [{ participantId: createId(), biddingOrganizationId: null, biddingOrganizationName: '', contactEmail: '' }],
    expectedLatestRevision: context.latestSetup?.revisionNumber || 0,
  };
}

export function isTenderInvitationSaved(draft, latestSetup) {
  if (!latestSetup) return false;
  return latestSetup.title === draft.title && latestSetup.deadlineAt?.slice(0, 16) === draft.deadlineAt?.slice(0, 16) && latestSetup.currencyCode === draft.currencyCode && latestSetup.invitationMessage === draft.invitationMessage;
}

export function appendTenderParticipant(draft,participantId){return{...draft,participants:[...draft.participants,{participantId,biddingOrganizationId:null,biddingOrganizationName:'',contactEmail:''}]}}
export function updateTenderParticipant(draft,participantId,field,value){return{...draft,participants:draft.participants.map(item=>item.participantId===participantId?{...item,[field]:value}:item)}}
export function removeTenderParticipant(draft,participantId){return{...draft,participants:draft.participants.filter(item=>item.participantId!==participantId)}}
export function pickTenderInvitationPreviewParticipant(draft){return draft.participants.find(item=>(item.biddingOrganizationName||item.contractorName)?.trim()||item.contactEmail?.trim())||{}}

export function validateTenderSetupDraft(draft) {
  const issues = [];
  if (!draft.tenderId) issues.push({ code: 'TENDER_PACKAGE_REQUIRED' });
  if (!draft.tenderNumber?.trim()) issues.push({ code: 'TENDER_NUMBER_REQUIRED' });
  if (!draft.title?.trim()) issues.push({ code: 'TENDER_TITLE_REQUIRED' });
  if (!draft.deadlineAt || Number.isNaN(Date.parse(draft.deadlineAt))) issues.push({ code: 'TENDER_DEADLINE_REQUIRED' });
  if (!/^[A-Z]{3}$/.test(draft.currencyCode || '')) issues.push({ code: 'INVALID_CURRENCY_CODE' });
  if (!draft.tenderRules?.trim()) issues.push({ code: 'TENDER_RULES_REQUIRED' });
  if (!draft.invitationMessage?.trim()) issues.push({ code: 'TENDER_INVITATION_MESSAGE_REQUIRED' });
  if ((draft.invitationMessage || '').length > 4000) issues.push({ code: 'TENDER_INVITATION_MESSAGE_TOO_LONG' });
  if (!draft.issuedBoqVersionId) issues.push({ code: 'TENDER_BOQ_VERSION_REQUIRED' });
  if (!draft.workGroupIds?.length) issues.push({ code: 'TENDER_SCOPE_REQUIRED' });
  const validParticipants = (draft.participants || []).filter(item => (item.biddingOrganizationName||item.contractorName)?.trim() || item.contactEmail?.trim());
  if (!validParticipants.length) issues.push({ code: 'TENDER_PARTICIPANT_REQUIRED' });
  validParticipants.forEach((item, index) => { if (!(item.biddingOrganizationName||item.contractorName)?.trim()) issues.push({ code: 'BIDDING_ORGANIZATION_NAME_REQUIRED', index }); if (!EMAIL.test(item.contactEmail?.trim() || '')) issues.push({ code: 'INVALID_PARTICIPANT_EMAIL', index }); });
  const emails = validParticipants.map(item => item.contactEmail.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) issues.push({ code: 'DUPLICATE_TENDER_PARTICIPANT' });
  return issues;
}

export function buildTenderSetupPayload(draft) {
  const issues = validateTenderSetupDraft(draft);
  if (issues.length) { const error = new Error('INVALID_TENDER_SETUP'); error.code = 'INVALID_TENDER_SETUP'; error.issues = issues; throw error; }
  return { ...draft, tenderNumber: draft.tenderNumber.trim(), title: draft.title.trim(), deadlineAt: new Date(draft.deadlineAt).toISOString(), currencyCode: draft.currencyCode.toUpperCase(), tenderRules: draft.tenderRules.trim(), invitationMessage: draft.invitationMessage.trim(), issuedBoqVersionId: Number(draft.issuedBoqVersionId), participants: draft.participants.filter(item => (item.biddingOrganizationName||item.contractorName)?.trim() || item.contactEmail?.trim()).map(item => { const biddingOrganizationName=(item.biddingOrganizationName||item.contractorName).trim();return { participantId:item.participantId,biddingOrganizationId:item.biddingOrganizationId||null,biddingOrganizationName,contractorName:biddingOrganizationName,contactEmail:item.contactEmail.trim().toLowerCase() }; }) };
}
