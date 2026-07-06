/**
 * additionalWorksEngine.js — parsing, aggregation, and formatting for the
 * "Additional Works" cost log shown on Weekly Reports.
 *
 * Moved here from components/weekly/sharedUtils.js + a local reduce in
 * WeeklyReports.jsx (architecture-conformance pass, 2026-07-06): summing
 * reported additional-works costs into a displayed total is a business
 * calculation, not presentation — it belongs in an engine like every other
 * derived number, not recomputed inline in a page.
 */

export function parseAdditionalWorksCost(cost) {
  if (!cost) return { value: 0, currency: '' };
  const raw = String(cost).trim();
  const currencyMatch = raw.match(/[A-Za-z]{1,5}$/);
  const currency = currencyMatch ? currencyMatch[0] : '';
  const numericPart = raw.replace(/[^0-9.,-]+/g, '').replace(/\s+/g, '');
  if (!numericPart) return { value: 0, currency };
  let n = numericPart;
  if (n.includes(',') && n.includes('.')) {
    n = n.lastIndexOf('.') > n.lastIndexOf(',') ? n.replace(/,/g, '') : n.replace(/\./g, '').replace(/,/g, '.');
  } else if (n.includes(',')) {
    const parts = n.split(',');
    n = parts.length > 1 && parts[1].length === 3 ? parts.join('') : n.replace(/,/g, '.');
  }
  const value = parseFloat(n);
  return { value: Number.isFinite(value) ? value : 0, currency };
}

export function formatAdditionalWorksSum(value, currency) {
  const formatted = Math.round(value).toLocaleString('en-US').replace(/,/g, ' ');
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Builds the Additional Works entry list + total cost sum for the report
 * history. `num` labels a "Yes" entry by its position in the FULL sorted
 * report history (not sequential among only the "Yes" entries) — preserved
 * exactly from the prior WeeklyReports.jsx implementation.
 *
 * @param {Array<Record<string, any>>} sortedReports — reports sorted oldest → newest
 * @returns {{ entries: Array<Record<string, any>>, total: string|null }}
 */
export function computeAdditionalWorksSummary(sortedReports) {
  const entries = sortedReports.reduce((acc, r, idx) => {
    if (r.additionalWorks !== "Yes") return acc;
    const { value, currency } = parseAdditionalWorksCost(r.additionalWorksCost);
    acc.push({
      num: idx + 1,
      date: r.reportingDate || new Date(r.submittedAt).toLocaleDateString("en-GB"),
      cost: r.additionalWorksCost || "—",
      description: r.additionalWorksDescription || "",
      party: r.additionalWorksParty || "",
      costValue: value,
      currency,
    });
    return acc;
  }, []);
  const totalSum = entries.reduce((s, e) => s + (e.costValue || 0), 0);
  const allCurrencies = [...new Set(entries.map(e => e.currency).filter(Boolean))];
  const currency = allCurrencies.length === 1 ? allCurrencies[0] : "";
  const total = entries.length > 0 ? formatAdditionalWorksSum(totalSum, currency) : null;
  return { entries, total };
}
