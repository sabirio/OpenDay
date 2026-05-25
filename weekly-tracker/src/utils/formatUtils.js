// Formatting helpers — add display-layer formatters here as the app grows.

export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US").replace(/,/g, " ");
}

export function formatCurrency(value, currency) {
  const formatted = formatNumber(value);
  return currency ? `${formatted} ${currency}` : formatted;
}
