// payslip.js — reading a payslip back into the same buckets the week produces.
//
// A payslip is a list of "label amount" lines, sometimes with the hours in
// between:  "연장근로수당  12,450" or "Overtime (6.5h)  $92.63". This reads the
// label, takes the last money-shaped number on the line, and files it under
// one of six buckets. Anything it cannot file is kept and shown unread, so a
// line the app did not understand is visible rather than silently dropped.

const LABELS = [
  { key: 'base', ko: [/기본급/, /기본임금/, /^급여$/, /월급여/, /시급제/, /일급제/], en: [/regular\s*(pay|wage|hours)/i, /base\s*(pay|wage|salary)/i, /hourly\s*pay/i] },
  { key: 'overtime', ko: [/연장\s*(근로)?\s*수당/, /시간외\s*수당/, /연장수당/], en: [/overtime/i, /\bO\/T\b/i, /over\s*time/i] },
  { key: 'night', ko: [/야간\s*(근로)?\s*수당/, /심야\s*수당/, /야간수당/], en: [/night\s*(shift\s*)?(differential|premium|pay)/i] },
  { key: 'holiday', ko: [/휴일\s*(근로)?\s*수당/, /휴일수당/], en: [/holiday\s*pay/i, /holiday\s*premium/i] },
  { key: 'weeklyHoliday', ko: [/주휴\s*수당/, /유급\s*휴일\s*수당/, /^주휴$/], en: [/weekly\s*holiday\s*pay/i, /paid\s*holiday/i] },
  { key: 'gross', ko: [/총\s*급여/, /지급\s*합계/, /급여\s*합계/, /세전\s*급여/, /지급액\s*합계/], en: [/gross\s*(pay|income|wages)/i, /total\s*(pay|earnings)/i] },
  { key: 'deductions', ko: [/공제\s*합계/, /총\s*공제/, /공제액\s*합계/], en: [/total\s*deductions/i, /deductions?\s*total/i] },
  { key: 'net', ko: [/실\s*수령\s*액?/, /차인\s*지급\s*액?/, /실지급액/], en: [/net\s*(pay|income)/i, /take[- ]home/i] },
];

const MONEY = /(?:[₩$€£]\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?:[₩$€£]\s*)?-?\d+(?:\.\d+)?/g;

function readAmount(line) {
  const cleaned = line
    .replace(/\(\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|시간|분|min)\s*\)/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|시간)\b/gi, ' ');
  const matches = cleaned.match(MONEY);
  if (!matches) return null;
  // The amount is the last money-shaped number that is not the line's label.
  const last = matches[matches.length - 1];
  const value = Number(last.replace(/[₩$€£,\s]/g, ''));
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 0;
  return value;
}

export function classifyLabel(line) {
  for (const group of LABELS) {
    if (group.ko.some((re) => re.test(line))) return group.key;
    if (group.en.some((re) => re.test(line))) return group.key;
  }
  return null;
}

// A Korean label on a line with no currency symbol still means won.
function looksKorean(line) {
  if (!/[가-힣]/.test(line)) return false;
  return LABELS.some((group) => group.ko.some((re) => re.test(line)));
}

/**
 * Parse a pasted payslip.
 * @returns {{values: object, unread: Array, found: number, currencyHint: string|null}}
 */
export function parsePayslip(text) {
  const values = {};
  const unread = [];
  let found = 0;
  let currencyHint = null;
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (/[₩]/.test(line) || /원\s*$/.test(line) || /원\b/.test(line)) currencyHint = currencyHint || 'KRW';
    if (/\$/.test(line)) currencyHint = currencyHint || 'USD';
    if (looksKorean(line)) currencyHint = currencyHint || 'KRW';
    const key = classifyLabel(line);
    if (!key) {
      if (/\d/.test(line)) unread.push(line);
      return;
    }
    const amount = readAmount(line);
    if (amount == null) {
      unread.push(line);
      return;
    }
    // A duplicated label: keep the larger, which is the paid total.
    if (values[key] == null || amount > values[key]) values[key] = amount;
    found += 1;
  });

  return { values, unread, found, currencyHint };
}

const ORDER = ['base', 'overtime', 'night', 'holiday', 'weeklyHoliday'];

/** Compare what the week is worth with what the payslip says. */
export function compare(computedMoney, payslipValues) {
  const rows = ORDER.map((key) => {
    const owed = Number(computedMoney[key]) || 0;
    const paid = payslipValues[key];
    return {
      key,
      owed,
      paid: paid == null ? null : Number(paid),
      gap: paid == null ? null : round2(Number(paid) - owed),
    };
  });

  const known = rows.filter((row) => row.paid != null);
  const owedTotal = Number(computedMoney.total) || 0;
  const paidTotal = payslipValues.gross != null
    ? Number(payslipValues.gross)
    : known.reduce((sum, row) => sum + (row.paid || 0), 0);

  // A bucket the payslip does not mention was not paid: it counts as zero once
  // there is a payslip to compare against at all.
  if (known.length) {
    rows.forEach((row) => {
      if (row.gap == null) row.gap = round2(0 - row.owed);
    });
  }

  const gapTotal = round2(paidTotal - owedTotal);
  return {
    rows,
    owedTotal,
    paidTotal: paidTotal || null,
    gapTotal: paidTotal ? gapTotal : null,
    shortfall: paidTotal ? gapTotal < 0 : null,
    matched: known.length,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
