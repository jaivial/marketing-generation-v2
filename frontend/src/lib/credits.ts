// Credit <-> dollar conversion, mirrored from app/services/credits.py.
//
// The API only ever speaks in credits. Anywhere the UI wants to show a
// dollar amount it multiplies by CREDIT_USD, so there is exactly one
// place on each side of the wire where the conversion is defined.

export const CREDIT_USD = 0.01;

export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

/** "$1.81" — dollar rendering of a credit amount. */
export function formatCreditsUsd(credits: number, digits = 2): string {
  return '$' + creditsToUsd(credits).toFixed(digits);
}

/** "1,810 credits" */
export function formatCredits(credits: number): string {
  const rounded = Math.round(credits * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Rough max campaign duration a monthly allowance buys, in seconds.
 * Deliberately crude (allowance / per-second price) — it's a marketing
 * figure on the pricing page, not a quota.
 */
export function maxDurationFor(monthlyCredits: number, costPerSec: number): number {
  if (!costPerSec || costPerSec <= 0) return 0;
  return Math.floor(monthlyCredits / costPerSec);
}
