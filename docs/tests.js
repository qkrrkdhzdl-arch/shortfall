// tests.js — the rules, checked.
//
// Every assertion here is a case the app can get wrong in a way that changes
// someone's pay: a shift read as nine hours instead of one, a night hour left
// out, a weekly holiday paid twice. Open tests.html; the count at the top is
// the result.

import { parseClock, parseDayToken, parseEntryLine, parseTimecard, splitEntry, nightMinutes, formatHours, dayIndexFromDate } from './lib/time.js';
import { computeWeek, RULESETS, KR_MIN_WAGE, US_FEDERAL_MIN_WAGE } from './lib/rules.js';
import { parsePayslip, compare, classifyLabel } from './lib/payslip.js';

const results = [];
let current = '';

function group(name) {
  current = name;
}

function ok(condition, label, detail = '') {
  results.push({ group: current, label, pass: Boolean(condition), detail });
}

function eq(actual, expected, label) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  ok(pass, label, pass ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function near(actual, expected, label, tolerance = 0.005) {
  const pass = Math.abs(Number(actual) - Number(expected)) <= tolerance;
  ok(pass, label, pass ? '' : `expected ${expected}, got ${actual}`);
}

const entry = (day, start, end, extra = {}) => ({ day, startMin: start, endMin: end, breakMin: 0, holiday: false, ...extra });
const settings = (over = {}) => ({ rate: 12000, workplaceSize: 'five', contractWeeklyHours: 40, scheduledDays: 5, weeklyHoliday: true, attendedAll: true, ...over });

// ── reading a clock ─────────────────────────────────────────────────
group('clock');
eq(parseClock('09:00'), 540, 'HH:MM');
eq(parseClock('9'), 540, 'bare hour');
eq(parseClock('18:30'), 1110, 'half past');
eq(parseClock('6pm'), 1080, 'pm suffix');
eq(parseClock('6:30 PM'), 1110, 'pm with minutes');
eq(parseClock('12am'), 0, 'midnight as 12am');
eq(parseClock('12pm'), 720, 'noon as 12pm');
eq(parseClock('오후 6시'), 1080, 'Korean afternoon');
eq(parseClock('오전 7시 30분'), 450, 'Korean morning with minutes');
eq(parseClock('18시'), 1080, 'Korean 24-hour');
eq(parseClock('24:00'), 1440, 'end of day');
eq(parseClock('25:00'), null, 'hour out of range');
eq(parseClock(''), null, 'empty');
eq(parseClock('noon'), null, 'word without a number');

group('day');
eq(parseDayToken('Mon'), 0, 'Mon');
eq(parseDayToken('monday'), 0, 'monday');
eq(parseDayToken('Tue'), 1, 'Tue');
eq(parseDayToken('tues'), 1, 'tues');
eq(parseDayToken('Thurs'), 3, 'Thurs');
eq(parseDayToken('sat'), 5, 'sat');
eq(parseDayToken('Sun'), 6, 'Sun');
eq(parseDayToken('일요일'), 6, '일요일');
eq(parseDayToken('화'), 1, '화');
eq(parseDayToken('수욜'), 2, '수욜');
eq(parseDayToken('Funday'), null, 'not a day');

// ── reading a line ──────────────────────────────────────────────────
group('line');
{
  const line = parseEntryLine('Mon 09:00-18:00');
  ok(line.ok, 'weekday and span parse');
  eq(line.entry.day, 0, 'Monday is day 0');
  eq(line.entry.startMin, 540, 'start 09:00');
  eq(line.entry.endMin, 1080, 'end 18:00');
  eq(line.entry.breakMin, 0, 'no break');
  eq(line.entry.holiday, false, 'not a holiday');
}
{
  const line = parseEntryLine('Tue 22:00-02:00');
  ok(line.ok, 'overnight span parses');
  eq(line.entry.endMin, 1560, 'crosses midnight');
  eq(line.entry.day, 1, 'belongs to its starting day');
}
{
  const line = parseEntryLine('9-6');
  eq(line.ok, false, 'no day is a problem, not a guess');
}
{
  const line = parseEntryLine('Mon 9-6');
  ok(line.ok, 'nine to six');
  eq(line.entry.startMin, 540, '9 means 09:00');
  eq(line.entry.endMin, 1080, '6 means 18:00');
}
{
  eq(parseEntryLine('Mon 12-6').entry.endMin, 1080, 'noon to six');
  eq(parseEntryLine('Mon 10-4').entry.endMin, 960, 'ten to four in the afternoon');
  eq(parseEntryLine('Mon 18-2').entry.endMin, 1560, 'six to two crosses midnight');
  eq(parseEntryLine('Mon 22-2').entry.endMin, 1560, 'ten to two crosses midnight');
}
eq(parseEntryLine('Mon 9-9').ok, false, 'a zero-length shift is rejected');
eq(parseEntryLine('Mon 09:00-18:00 break 30').entry.breakMin, 30, 'break in minutes');
eq(parseEntryLine('Mon 09:00-18:00 (break 1h)').entry.breakMin, 60, 'break in hours inside brackets');
eq(parseEntryLine('Mon 09:00-18:00 휴게 60분').entry.breakMin, 60, 'Korean break');
eq(parseEntryLine('Sat 10-16 holiday').entry.holiday, true, 'holiday marker');
eq(parseEntryLine('Sat 10-16 휴일').entry.holiday, true, 'Korean holiday marker');
eq(parseEntryLine('월 18:00~22:30').entry.startMin, 1080, 'Korean weekday and tilde');
eq(parseEntryLine('월 18:00~22:30').entry.endMin, 1350, 'Korean end time');
eq(parseEntryLine('Mon 09:00-18:00 break 600').ok, false, 'a break longer than the shift is rejected');
eq(parseEntryLine('# rest day').ok, false, 'comments are skipped');
{
  const weekStart = new Date('2026-11-16T00:00:00');
  eq(parseEntryLine('11/17 09:00-18:00', weekStart).entry.day, 1, 'a date resolves inside the week');
  eq(parseEntryLine('11/30 09:00-18:00', weekStart).ok, false, 'a date outside the week does not resolve');
  eq(dayIndexFromDate('2026-11-19', weekStart), 3, 'ISO date resolves');
}

group('timecard');
{
  const parsed = parseTimecard('Mon 09:00-18:00\n\nTue 09:00-18:00\n???');
  eq(parsed.entries.length, 2, 'two good lines');
  eq(parsed.problems.length, 1, 'one line reported as unreadable');
  eq(parsed.problems[0].line, 4, 'the problem keeps its line number');
}

// ── cutting a shift into days and nights ────────────────────────────
group('segments');
{
  const segments = splitEntry(entry(1, 1320, 1560));
  eq(segments.length, 2, 'an overnight shift is two segments');
  eq(segments[0].minutes, 120, 'two hours before midnight');
  eq(segments[1].minutes, 120, 'two hours after');
  eq(segments[1].dayOffset, 1, 'the second half belongs to the next day');
}
{
  const segments = splitEntry(entry(0, 1080, 1560, { breakMin: 60 }));
  eq(segments[0].minutes, 300, 'the break comes out of the first half');
  eq(segments[1].minutes, 120, 'the second half is untouched');
}
eq(splitEntry(entry(0, 540, 1080)).length, 1, 'a day shift is one segment');

group('night');
eq(nightMinutes(1320, 1560), 240, '22:00 to 02:00 is four night hours');
eq(nightMinutes(1080, 1560), 240, '18:00 to 02:00 keeps four night hours');
eq(nightMinutes(540, 1080), 0, 'a day shift has no night hours');
eq(nightMinutes(300, 420), 60, '05:00 to 07:00 is one night hour');
eq(nightMinutes(0, 360), 360, 'midnight to six is all night');

// ── Korea ───────────────────────────────────────────────────────────
group('korea base');
{
  const week = Array.from({ length: 5 }, (_, i) => entry(i, 780, 1020)); // 13:00–17:00
  const result = computeWeek(week, settings({ contractWeeklyHours: 20 }), 'kr');
  eq(result.hours.worked, 1200, 'twenty hours');
  eq(result.money.base, 240000, 'base pay at 12,000');
  eq(result.hours.weeklyHoliday, 240, 'weekly holiday is four hours for a 20-hour week');
  eq(result.money.weeklyHoliday, 48000, 'weekly holiday pay');
  eq(result.money.total, 288000, 'total');
  eq(result.hours.overtime, 0, 'no overtime');
}

group('korea overtime');
{
  const result = computeWeek([entry(0, 540, 1200, { breakMin: 60 })], settings(), 'kr'); // 09:00–20:00 minus an hour = 10h
  eq(result.hours.worked, 600, 'ten hours worked');
  eq(result.hours.overtime, 120, 'two hours of overtime');
  eq(result.money.overtime, 12000, 'premium is half the rate for two hours');
  eq(result.money.base, 120000, 'base covers every hour');
}
{
  // 40 hours in five days plus eight on Saturday, without a daily overtime hour.
  const week = [...Array.from({ length: 5 }, (_, i) => entry(i, 540, 1020)), entry(5, 540, 1020)];
  const result = computeWeek(week, settings(), 'kr');
  eq(result.hours.worked, 2880, 'forty-eight hours');
  eq(result.hours.overtime, 480, 'weekly overtime beyond forty hours');
}
{
  // Daily overtime is not counted twice by the weekly rule.
  const week = Array.from({ length: 4 }, (_, i) => entry(i, 540, 1140)); // 10h each = 40h
  const result = computeWeek(week, settings(), 'kr');
  eq(result.hours.worked, 2400, 'forty hours');
  eq(result.hours.overtime, 480, 'daily overtime only');
}

group('korea night');
{
  const result = computeWeek([entry(0, 1080, 1560)], settings(), 'kr'); // 18:00–02:00
  eq(result.hours.worked, 480, 'eight hours');
  eq(result.hours.night, 240, 'four of them are night');
  eq(result.money.night, 24000, 'night premium');
}
{
  const result = computeWeek([entry(0, 1320, 1800)], settings(), 'kr'); // 22:00–06:00
  eq(result.hours.night, 480, 'a full night is all night');
  eq(result.money.night, 48000, 'eight night hours');
}

group('korea holiday');
{
  const result = computeWeek([entry(5, 600, 1200, { breakMin: 60, holiday: true })], settings(), 'kr'); // 10:00–20:00 = 9h
  eq(result.hours.worked, 540, 'nine hours on a holiday');
  eq(result.hours.holidayFirst8, 480, 'first eight hours');
  eq(result.hours.holidayOver8, 60, 'one hour beyond eight');
  eq(result.money.holiday, 60000, '50% on eight hours and 100% on one');
  eq(result.hours.overtime, 0, 'holiday hours are not also overtime');
}
{
  const result = computeWeek([entry(0, 540, 1080), entry(5, 600, 960, { holiday: true })], settings({ contractWeeklyHours: 48 }), 'kr');
  eq(result.hours.worked, 900, 'fifteen hours');
  eq(result.hours.weeklyHoliday, 480, 'a 48-hour contract caps the weekly holiday at eight hours');
}

group('korea small workplace');
{
  const week = [entry(0, 540, 1200, { breakMin: 60 })];
  const result = computeWeek(week, settings({ workplaceSize: 'under' }), 'kr');
  eq(result.money.overtime, 0, 'no overtime premium under five employees');
  eq(result.money.base, 120000, 'base pay remains');
  ok(result.flags.some((f) => f.id === 'under-five'), 'the screen says why');
}
{
  const result = computeWeek([entry(0, 1080, 1560)], settings({ workplaceSize: 'under' }), 'kr');
  eq(result.money.night, 0, 'no night premium under five employees');
}

group('korea minimum wage');
{
  const result = computeWeek([entry(0, 540, 1020)], settings({ rate: 9000 }), 'kr');
  ok(result.flags.some((f) => f.id === 'min-wage'), 'a rate under 10,320 is flagged');
  ok(KR_MIN_WAGE[2026] === 10320, 'the 2026 minimum wage is 10,320');
}
{
  const result = computeWeek([entry(0, 540, 1020)], settings({ rate: 10320 }), 'kr');
  ok(!result.flags.some((f) => f.id === 'min-wage'), 'the minimum itself is not flagged');
}

group('korea weekly holiday pay');
{
  const week = Array.from({ length: 3 }, (_, i) => entry(i, 780, 1020)); // 12h a week
  const result = computeWeek(week, settings({ contractWeeklyHours: 12, scheduledDays: 3 }), 'kr');
  eq(result.money.weeklyHoliday, 0, 'under fifteen hours there is none');
  ok(result.flags.some((f) => f.id === 'no-weekly-holiday'), 'and it says so');
}
{
  const week = [entry(0, 780, 1020)];
  const result = computeWeek(week, settings({ contractWeeklyHours: 4, scheduledDays: 1 }), 'kr');
  eq(result.money.weeklyHoliday, 0, 'a four-hour contract earns no weekly holiday');
}
{
  const week = [entry(0, 780, 1020)];
  const result = computeWeek(week, settings({ contractWeeklyHours: 20, scheduledDays: 1, weeklyHoliday: false }), 'kr');
  eq(result.money.weeklyHoliday, 0, 'turning it off removes it');
}

group('korea breaks');
{
  const result = computeWeek([entry(0, 540, 1080, { breakMin: 0 })], settings(), 'kr');
  ok(result.flags.some((f) => f.id === 'break'), 'an eight-hour shift without rest is flagged');
}
{
  const result = computeWeek([entry(0, 540, 1080, { breakMin: 60 })], settings(), 'kr');
  ok(!result.flags.some((f) => f.id === 'break'), 'an hour of rest clears it');
}

// ── United States ───────────────────────────────────────────────────
group('us');
{
  const week = [...Array.from({ length: 5 }, (_, i) => entry(i, 540, 1080, { breakMin: 60 })), entry(5, 540, 840)];
  const result = computeWeek(week, settings({ rate: 15, contractWeeklyHours: 40 }), 'us');
  eq(result.hours.worked, 2700, 'forty-five hours');
  near(result.money.base, 675, 'base pay for every hour');
  near(result.money.overtime, 37.5, 'five overtime hours at half the rate');
  near(result.money.total, 712.5, 'total');
  eq(result.money.night, 0, 'no night premium under the FLSA');
  eq(result.money.weeklyHoliday, 0, 'no weekly holiday pay under the FLSA');
}
{
  // A ten-hour day is not overtime in the United States.
  const result = computeWeek([entry(0, 480, 1080)], settings({ rate: 20 }), 'us');
  eq(result.hours.overtime, 0, 'no daily overtime');
  near(result.money.total, 200, 'ten hours at the regular rate');
}
{
  const result = computeWeek([entry(0, 540, 1080)], settings({ rate: 7 }), 'us');
  ok(result.flags.some((f) => f.id === 'us-min-wage'), 'below the federal minimum is flagged');
  ok(result.flags.some((f) => f.id === 'us-states'), 'the state-law limit is stated');
  ok(US_FEDERAL_MIN_WAGE === 7.25, 'the federal minimum is 7.25');
}

// ── payslip ─────────────────────────────────────────────────────────
group('payslip labels');
eq(classifyLabel('기본급 240,000'), 'base', '기본급');
eq(classifyLabel('연장근로수당 90,000'), 'overtime', '연장근로수당');
eq(classifyLabel('야간근로수당 65,000'), 'night', '야간근로수당');
eq(classifyLabel('휴일근로수당 12,000'), 'holiday', '휴일근로수당');
eq(classifyLabel('주휴수당 48,000'), 'weeklyHoliday', '주휴수당');
eq(classifyLabel('총 급여 1,000,000'), 'gross', '총 급여');
eq(classifyLabel('공제 합계 120,000'), 'deductions', '공제 합계');
eq(classifyLabel('실수령액 880,000'), 'net', '실수령액');
eq(classifyLabel('Regular pay 600.00'), 'base', 'Regular pay');
eq(classifyLabel('Overtime (6.5h) $48.75'), 'overtime', 'Overtime');
eq(classifyLabel('Gross pay 637.50'), 'gross', 'Gross pay');
eq(classifyLabel('식대 100,000'), null, 'an allowance is not guessed into a bucket');

group('payslip values');
{
  const parsed = parsePayslip('기본급 240,000\n주휴수당 48,000\n공제 합계 25,000');
  eq(parsed.values.base, 240000, 'base read');
  eq(parsed.values.weeklyHoliday, 48000, 'weekly holiday read');
  eq(parsed.values.deductions, 25000, 'deductions read');
  eq(parsed.currencyHint, 'KRW', 'currency seen');
}
{
  const parsed = parsePayslip('Regular pay $600.00\nOvertime (5h) $37.50\nGross pay $637.50');
  eq(parsed.values.base, 600, 'dollars read');
  eq(parsed.values.overtime, 37.5, 'overtime read without the hours');
  eq(parsed.values.gross, 637.5, 'gross read');
  eq(parsed.currencyHint, 'USD', 'currency seen');
}
{
  const parsed = parsePayslip('기본급 240,000\n식대 100,000\n교통비 50,000');
  eq(parsed.unread.length, 2, 'unfiled lines are kept');
  eq(parsed.found, 1, 'only one line filed');
}

group('comparison');
{
  const computed = { base: 240000, overtime: 0, night: 0, holiday: 0, weeklyHoliday: 48000, total: 288000 };
  const cmp = compare(computed, { base: 240000 });
  eq(cmp.gapTotal, -48000, 'a missing weekly holiday is a shortfall');
  ok(cmp.shortfall === true, 'marked as a shortfall');
  eq(cmp.matched, 1, 'one bucket matched');
  eq(cmp.rows.find((row) => row.key === 'weeklyHoliday').gap, -48000, 'a bucket with no payslip line counts as zero');
}
{
  const computed = { base: 675, overtime: 37.5, night: 0, holiday: 0, weeklyHoliday: 0, total: 712.5 };
  const cmp = compare(computed, { base: 675, overtime: 37.5 });
  near(cmp.gapTotal, 0, 'a correct payslip leaves nothing');
  ok(cmp.shortfall === false, 'not a shortfall');
}
{
  const cmp = compare({ base: 100, overtime: 0, night: 0, holiday: 0, weeklyHoliday: 0, total: 100 }, {});
  eq(cmp.paidTotal, null, 'no payslip means no comparison');
}

// ── whole scenarios, the ones on the screen ─────────────────────────
group('scenario: convenience store');
{
  const parsed = parseTimecard('Mon 13:00-17:00\nTue 13:00-17:00\nWed 13:00-17:00\nThu 13:00-17:00\nFri 13:00-17:00');
  const result = computeWeek(parsed.entries, settings({ rate: 12000, contractWeeklyHours: 20, scheduledDays: 5 }), 'kr');
  const cmp = compare(result.money, parsePayslip('기본급 240,000\n식대 100,000\n공제 합계 25,000\n실수령액 315,000').values);
  eq(result.money.total, 288000, 'the week is worth 288,000');
  eq(cmp.gapTotal, -48000, 'the payslip is 48,000 short');
}

group('scenario: night warehouse');
{
  const parsed = parseTimecard('Mon 18:00-02:00\nTue 18:00-02:00\nWed 18:00-02:00\nThu 18:00-03:00\nFri 18:00-02:00');
  const result = computeWeek(parsed.entries, settings({ rate: 13000, contractWeeklyHours: 40, scheduledDays: 5 }), 'kr');
  eq(result.hours.worked, 2460, 'forty-one hours');
  eq(result.hours.overtime, 60, 'one overtime hour from the nine-hour day');
  eq(result.hours.night, 1260, 'twenty-one night hours');
  eq(result.money.total, 780000, 'the week is worth 780,000');
  const cmp = compare(result.money, parsePayslip('기본급 533,000\n야간근로수당 65,000\n주휴수당 104,000').values);
  eq(cmp.gapTotal, -78000, 'the payslip is 78,000 short');
}

group('scenario: us retail');
{
  const parsed = parseTimecard('Mon 9-6 break 60\nTue 9-6 break 60\nWed 9-6 break 60\nThu 9-6 break 60\nFri 9-6 break 60\nSat 9-2');
  const result = computeWeek(parsed.entries, settings({ rate: 15, contractWeeklyHours: 40 }), 'us');
  near(result.money.total, 712.5, 'the week is worth 712.50');
  const cmp = compare(result.money, parsePayslip('Regular pay 600.00\nOvertime 37.50\nGross pay 637.50').values);
  near(cmp.gapTotal, -75, 'the payslip is 75 short');
}

group('format');
eq(formatHours(90), '1.5', 'ninety minutes is 1.5 hours');
eq(formatHours(60), '1', 'a whole hour');
eq(formatHours(45), '0.75', 'three quarters');
eq(formatHours(0), '0', 'zero');

// ── report ──────────────────────────────────────────────────────────
const total = results.length;
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);

globalThis.__testSummary = {
  total,
  passed,
  failed: failed.length,
  failures: failed.map((r) => ({ group: r.group, label: r.label, detail: r.detail })),
};

if (typeof document === 'undefined') {
  // Nothing to draw outside a page; the runner reads __testSummary.
} else {

const summary = document.getElementById('summary');
summary.textContent = `${passed}/${total} passed`;
summary.className = failed.length ? 'fail' : 'pass';

document.getElementById('headline').textContent = failed.length
  ? `${failed.length} assertion(s) failed`
  : `All ${total} assertions pass`;

const byGroup = new Map();
results.forEach((result) => {
  if (!byGroup.has(result.group)) byGroup.set(result.group, []);
  byGroup.get(result.group).push(result);
});

document.getElementById('groups').innerHTML = [...byGroup.entries()]
  .map(([name, items]) => {
    const okCount = items.filter((item) => item.pass).length;
    const rows = items
      .filter((item) => !item.pass)
      .map((item) => `<li class="bad">${escapeHtml(item.label)} — ${escapeHtml(item.detail)}</li>`)
      .join('');
    return `<section class="g">
      <h2>${escapeHtml(name)} <span>${okCount}/${items.length}</span></h2>
      ${rows ? `<ul>${rows}</ul>` : '<p class="allok">all passing</p>'}
    </section>`;
  })
  .join('');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

}
