// Pure Previous/Next selector for Mobile Field Mode's Observation review
// screen — mirrors the shape of core/siteVisit/siteVisitNavigationModel.js's
// selectSiteVisitNavigation so both field workflows share one navigation
// pattern. `navOrder` is a plain array of snag ids representing whatever
// list/filter the PM was browsing when they opened an Observation; it is
// carried via router state rather than refetched, so this never duplicates
// the list-fetching hook.
export function selectSnagNavigation(navOrder, currentId) {
  const order = Array.isArray(navOrder) ? navOrder : [];
  const index = order.findIndex(id => String(id) === String(currentId));
  return {
    index,
    previousId: index > 0 ? order[index - 1] : null,
    nextId: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
    position: index >= 0 ? index + 1 : null,
    total: order.length,
  };
}
