export function presentTenderPortalUser(user) {
  return { canAccess: Boolean(user?.id), displayName: user?.name || '' };
}

export function presentTenderInboxItems(items) {
  return (items || []).map(item => ({
    ...item,
    locationLabel: item.projectCity || 'Location not specified',
    deadlineDisplay: new Date(item.deadlineAt).toLocaleString(),
    setupRevisionLabel: `Setup R${item.setupRevision}`,
    statusLabel: item.invitationStatus.replaceAll('_', ' '),
    invitationTone: `is-${item.invitationStatus.toLowerCase()}`,
    responseActions: ['INVITED','NO_RESPONSE'].includes(item.invitationStatus) ? [{ decision: 'DECLINED', label: 'Decline', className: 'btn btn-secondary' }, { decision: 'ACCEPTED', label: 'Accept invitation', className: 'btn btn-primary' }] : [],
  }));
}

export function presentInvitationOrganizationChoices(item, organizations) {
  const options=(organizations||[]).filter(organization=>organization.organizationId!==item?.procuringOrganizationId);
  return{options,initialOrganizationId:item?.biddingOrganizationId||options[0]?.organizationId||''};
}
