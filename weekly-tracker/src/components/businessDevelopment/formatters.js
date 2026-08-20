export function formatMoney(value, currency = 'KZT') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
}
