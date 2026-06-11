// Pure utility functions for the Weekly Reports feature (no React).
import { WP_STATUS_SCORES } from '../../config/workPackages';

export function statusColor(status) {
  const score = WP_STATUS_SCORES[status] ?? 0;
  return score >= 1 ? '#22c55e' : score >= 0.5 ? '#f59e0b' : score >= 0.3 ? '#be185d' : '#94a3b8';
}

export function deriveOverallStatus(statuses) {
  if (!statuses.length) return 'Not Started';
  if (statuses.some(s => s === 'Delayed'))    return 'Delayed';
  if (statuses.every(s => s === 'Completed')) return 'Completed';
  if (statuses.some(s => s === 'Completed' || s === 'In Progress')) return 'In Progress';
  return 'Not Started';
}

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
