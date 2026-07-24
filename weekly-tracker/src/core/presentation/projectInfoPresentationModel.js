/**
 * projectInfoPresentationModel — display-only helpers shared by Portfolio
 * (ProjectTable's derived LOCATION column) and Project Information
 * (ProjectDetailModal's conditional Mall/Street detail). One canonical
 * derivation, not reimplemented per surface (Project Information
 * Architecture v1, §36).
 *
 * `location_type`/`shopping_mall_name`/`street` remain the only stored
 * facts — nothing here is persisted, and no new "location" column exists.
 */

/**
 * @param {{locationType?: string|null, shoppingMallName?: string|null, street?: string|null}} project
 * @returns {{ locationType: string|null, fieldLabel: string|null, value: string|null }}
 */
export function describeProjectLocation(project) {
  const locationType = project?.locationType || null;
  if (locationType === 'Mall') {
    return { locationType, fieldLabel: 'Shopping Mall Name', value: project?.shoppingMallName || null };
  }
  if (locationType === 'Street') {
    return { locationType, fieldLabel: 'Street Address', value: project?.street || null };
  }
  return { locationType, fieldLabel: null, value: null };
}

/** Unknown stays "—" — never rendered as 0, matching the frozen "unknown ≠ zero" rule. */
export function formatArea(value) {
  if (value == null || value === '') return '—';
  return `${Number(value).toLocaleString('en-US')} m²`;
}

/** No FX conversion — the raw stored amount + its own currency_code, or "—" when unknown. */
export function formatMoney(value, currencyCode) {
  if (value == null || value === '') return '—';
  const formatted = Number(value).toLocaleString('en-US');
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}
