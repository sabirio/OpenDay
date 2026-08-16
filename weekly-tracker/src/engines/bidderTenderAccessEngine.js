export function presentTenderPortalUser(user) {
  return { canAccess: user?.role === 'Contractor', displayName: user?.name || '' };
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
