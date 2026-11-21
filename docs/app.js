// app.js — the page.
//
// State lives in one object. Every input writes to it and re-renders the two
// columns: what happened (left) and what it is worth (right). Nothing leaves
// the browser; there is no network call after the page loads.

import { parseTimecard, parseEntryLine, formatClock, formatHours, DAYS_EN, DAYS_KO, splitEntry, nightMinutes } from './lib/time.js?v=8';
import { computeWeek, RULESETS, KR_MIN_WAGE, US_FEDERAL_MIN_WAGE } from './lib/rules.js?v=8';
import { parsePayslip, compare } from './lib/payslip.js?v=8';

const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    tagline: 'You worked the hours. This is what they are worth — and what the payslip says.',
    rules_title: 'Rules',
    country: 'Country and rule set',
    rate: 'Ordinary hourly wage',
    week_start: 'Week begins',
    size: 'Workplace size',
    size_five: 'Five or more employees',
    size_under: 'Fewer than five',
    timecard: 'Timecard',
    preset_store: 'Convenience store',
    preset_night: 'Night warehouse',
    preset_us: 'US retail, 45h',
    preset_clear: 'Clear',
    timecard_hint: 'One line a day: Mon 09:00-18:00 · 월 18:00~22:30 · Tue 22:00-02:00 break 30 · Sat 10-16 holiday',
    add_row: 'Add a day',
    contract: 'Contract',
    contract_hours: 'Contracted hours a week',
    scheduled_days: 'Scheduled days a week',
    weekly_holiday: 'Weekly holiday pay (주휴수당)',
    wh_yes: 'Include it',
    wh_no: 'Not applicable to me',
    contract_hint: 'Weekly holiday pay needs 15 contracted hours or more a week and attendance on every scheduled day.',
    hero_kicker: 'The week, re-added',
    stat_hours: 'hours worked',
    stat_ot: 'overtime hours',
    stat_night: 'night hours',
    stat_rate: 'ordinary rate',
    breakdown: 'Where the money comes from',
    th_line: 'Line',
    th_hours: 'Hours',
    th_amount: 'Amount',
    th_formula: 'Formula',
    week_chart: 'The week, hour by hour',
    leg_regular: 'regular',
    leg_overtime: 'overtime',
    leg_night: 'night',
    leg_holiday: 'holiday',
    payslip: 'The payslip you received',
    payslip_hint: 'Paste the lines as they appear: 기본급 1,200,000 / 연장근로수당 90,000 / 주휴수당 96,000. Labels in Korean or English.',
    message: 'Ask about it, without accusing anyone',
    message_hint: 'A message that states the hours, the calculation and the difference, and asks one question.',
    copy: 'Copy message',
    copied: 'Copied',
    csv: 'Download the calculation (CSV)',
    print: 'Print',
    assumptions: 'What this page assumes',
    limits: 'Shortfall does arithmetic on the hours and the rules you select. It is not legal advice, it does not read images, and it cannot know what your contract says. Where the law depends on a fact the app cannot see — workplace size, contract type, a rest break actually taken — it asks instead of assuming.',
    tests_label: 'The same rules run in the test page:',
    line_base: 'Base pay',
    line_overtime: 'Overtime premium',
    line_night: 'Night premium',
    line_holiday: 'Holiday premium',
    line_weeklyHoliday: 'Weekly holiday pay',
    line_total: 'Total',
    f_base: '{h}h × {rate}',
    f_overtime: '{h}h × {rate} × 50%',
    f_night: '{h}h × {rate} × 50%',
    f_holiday: '{a}h × {rate} × 50% + {b}h × {rate} × 100%',
    f_holiday_simple: '{a}h × {rate} × 50%',
    f_weekly: '{h}h × {rate}',
    empty_week: 'No hours read yet. Paste a timecard or press a preset.',
    hero_total: 'owed for this week',
    hero_none: 'Add hours to see the week',
    compare_title: 'Payslip against the week',
    th_owed: 'Owed',
    th_paid: 'Paid',
    th_gap: 'Difference',
    not_paid: 'not on the payslip',
    gap_short: 'The payslip is {gap} short of the week it covers.',
    gap_over: 'The payslip is {gap} more than this calculation.',
    gap_match: 'The payslip matches this calculation.',
    gap_unknown: 'Paste the payslip lines above to compare.',
    unread_title: 'Lines this page could not file',
    unread_hint: 'They are counted in the gross total if your payslip has one, but not in a line above.',
    problems_none: '',
    prob_line: 'Line {n}: {text} — {reason}',
    reason_no_hours: 'no hours found',
    reason_no_day: 'no day found',
    reason_unreadable_clock: 'the time is not readable',
    reason_same: 'start and end are the same',
    reason_break: 'the break is longer than the shift',
    letter_intro: 'Hello, I checked the hours I worked in the week of {start} against the payslip for that week, and I would like to confirm one part of it.',
    letter_hours: 'Hours I recorded: {worked}h in total ({regular}h regular, {ot}h overtime, {night}h night, {holiday}h on a holiday).',
    letter_calc: 'The calculation I get:',
    letter_paid: 'The payslip shows {paid}.',
    letter_gap_short: 'The payslip is {gap} short of that.',
    letter_gap_over: 'The payslip is {gap} above that.',
    letter_ask: 'Could you check how these hours were counted? I can send the timecard I used. Thank you.',
    letter_sign: '— Park Gaon',
    csv_name: 'shortfall-calculation.csv',
    day_short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    add_hint: 'New day',
    holiday_word: 'holiday',
    break_word: 'break',
    hours_word: 'h',
    rates_label: 'ordinary rate',
    short_us_rules: 'US federal rules',
  },
  ko: {
    tagline: '일한 시간은 그대로인데, 그 시간이 얼마인지는 다시 계산해 봐야 합니다.',
    rules_title: '적용 기준',
    country: '국가와 규칙',
    rate: '통상시급',
    week_start: '주 시작일',
    size: '사업장 규모',
    size_five: '상시 5인 이상',
    size_under: '5인 미만',
    timecard: '근무표',
    preset_store: '편의점',
    preset_night: '야간 물류',
    preset_us: '미국 소매 45시간',
    preset_clear: '지우기',
    timecard_hint: '하루 한 줄: Mon 09:00-18:00 · 월 18:00~22:30 · Tue 22:00-02:00 break 30 · Sat 10-16 holiday',
    add_row: '하루 추가',
    contract: '근로계약',
    contract_hours: '1주 소정근로시간',
    scheduled_days: '1주 소정근로일 수',
    weekly_holiday: '주휴수당',
    wh_yes: '포함해서 계산',
    wh_no: '해당 없음',
    contract_hint: '주휴수당은 1주 소정근로시간 15시간 이상이고 소정근로일을 개근했을 때 적용됩니다.',
    hero_kicker: '이 주의 임금, 다시 계산',
    stat_hours: '근로시간',
    stat_ot: '연장시간',
    stat_night: '야간시간',
    stat_rate: '통상시급',
    breakdown: '금액이 나온 곳',
    th_line: '항목',
    th_hours: '시간',
    th_amount: '금액',
    th_formula: '계산식',
    week_chart: '요일별 근로시간',
    leg_regular: '기본',
    leg_overtime: '연장',
    leg_night: '야간',
    leg_holiday: '휴일',
    payslip: '받은 급여명세서',
    payslip_hint: '명세서에 적힌 그대로 붙여넣으세요: 기본급 1,200,000 / 연장근로수당 90,000 / 주휴수당 96,000. 한글·영어 모두 인식합니다.',
    message: '따지지 않고 확인을 요청하는 문장',
    message_hint: '시간과 계산, 차액만 적고 질문은 하나만 하는 문장입니다.',
    copy: '문장 복사',
    copied: '복사했습니다',
    csv: '계산 내역 내려받기 (CSV)',
    print: '인쇄',
    assumptions: '이 페이지가 전제하는 것',
    limits: 'Shortfall은 입력한 시간과 선택한 규칙으로 계산만 합니다. 법률 자문이 아니고, 이미지(스크린샷)를 읽지 않으며, 근로계약 내용을 알 수 없습니다. 법이 사실관계에 따라 달라지는 부분(사업장 규모, 계약 형태, 실제로 부여된 휴게)은 추정하지 않고 묻습니다.',
    tests_label: '같은 규칙을 검사하는 테스트:',
    line_base: '기본급',
    line_overtime: '연장근로 가산',
    line_night: '야간근로 가산',
    line_holiday: '휴일근로 가산',
    line_weeklyHoliday: '주휴수당',
    line_total: '합계',
    f_base: '{h}시간 × {rate}',
    f_overtime: '{h}시간 × {rate} × 50%',
    f_night: '{h}시간 × {rate} × 50%',
    f_holiday: '{a}시간 × {rate} × 50% + {b}시간 × {rate} × 100%',
    f_holiday_simple: '{a}시간 × {rate} × 50%',
    f_weekly: '{h}시간 × {rate}',
    empty_week: '아직 읽은 근무가 없습니다. 근무표를 붙여넣거나 예시를 눌러 보세요.',
    hero_total: '이 주에 받아야 할 금액',
    hero_none: '시간을 넣으면 계산합니다',
    compare_title: '급여명세서와 이 주의 계산',
    th_owed: '받아야 할 금액',
    th_paid: '지급액',
    th_gap: '차액',
    not_paid: '명세서에 없음',
    gap_short: '명세서가 이 주의 계산보다 {gap} 적습니다.',
    gap_over: '명세서가 이 계산보다 {gap} 많습니다.',
    gap_match: '명세서와 이 계산이 일치합니다.',
    gap_unknown: '위에 급여명세서를 붙여넣으면 대조합니다.',
    unread_title: '분류하지 못한 줄',
    unread_hint: '명세서에 총액이 있으면 총액에는 포함되어 있지만, 위 항목별 대조에는 들어가지 않습니다.',
    problems_none: '',
    prob_line: '{n}번째 줄: {text} — {reason}',
    reason_no_hours: '시간을 찾지 못함',
    reason_no_day: '요일을 찾지 못함',
    reason_unreadable_clock: '시각을 읽지 못함',
    reason_same: '시작과 끝이 같음',
    reason_break: '휴게가 근무시간보다 김',
    letter_intro: '안녕하세요. {start} 주에 근무한 시간을 그 주 급여명세서와 대조해 보았는데, 한 가지만 확인하고 싶어 연락드립니다.',
    letter_hours: '제가 기록한 시간은 총 {worked}시간입니다(기본 {regular}시간, 연장 {ot}시간, 야간 {night}시간, 휴일 {holiday}시간).',
    letter_calc: '제가 계산한 금액은 다음과 같습니다.',
    letter_paid: '명세서에는 {paid}으로 되어 있습니다.',
    letter_gap_short: '명세서 금액이 계산보다 {gap} 적습니다.',
    letter_gap_over: '명세서 금액이 계산보다 {gap} 많습니다.',
    letter_ask: '이 시간이 어떻게 계산되었는지 확인해 주실 수 있을까요? 제가 쓴 근무표를 보내드릴 수 있습니다. 감사합니다.',
    letter_sign: '— 박가온',
    csv_name: 'shortfall-계산내역.csv',
    day_short: ['월', '화', '수', '목', '금', '토', '일'],
    add_hint: '새 근무',
    holiday_word: '휴일',
    break_word: '휴게',
    hours_word: '시간',
    rates_label: '통상시급',
    short_us_rules: '미국 연방 규칙',
  },
};

const state = {
  lang: 'en',
  country: 'kr',
  rate: '12000',
  weekStart: '',
  size: 'five',
  timecard: '',
  payslip: '',
  contractHours: '20',
  scheduledDays: '4',
  weeklyHoliday: 'yes',
};

const t = (key) => I18N[state.lang][key] ?? I18N.en[key] ?? key;
const fmt = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

function money(amount, currency = 'KRW') {
  if (amount == null || Number.isNaN(amount)) return '—';
  const negative = amount < 0;
  const value = Math.abs(amount);
  // The won sign is not in every font stack; the currency is written out
  // instead, in the form each language actually uses.
  const text = currency === 'KRW'
    ? (state.lang === 'ko'
      ? `${Math.round(value).toLocaleString('ko-KR')}원`
      : `KRW ${Math.round(value).toLocaleString('en-US')}`)
    : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return negative ? `−${text}` : text;
}

function hours(minutes) {
  if (minutes == null) return '—';
  return formatHours(minutes) + t('hours_word');
}

function parseRate(raw, currency) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

// ── reading the inputs ───────────────────────────────────────────────

function currentEntries() {
  const weekStart = state.weekStart ? new Date(`${state.weekStart}T00:00:00`) : null;
  return parseTimecard(state.timecard, weekStart);
}

function readSettings() {
  return {
    rate: parseRate(state.rate),
    workplaceSize: state.size,
    contractWeeklyHours: Number(state.contractHours),
    scheduledDays: Number(state.scheduledDays),
    attendedAll: true,
    weeklyHoliday: state.weeklyHoliday === 'yes',
  };
}

// ── rendering ────────────────────────────────────────────────────────

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-t]').forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll('[data-t-opt]').forEach((el) => {
    el.textContent = t(el.dataset.tOpt);
  });
  document.querySelectorAll('.lang button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang));
  });
  render();
}

function render() {
  const entries = currentEntries();
  const settings = readSettings();
  const rulesetId = state.country;
  const rules = RULESETS[rulesetId];
  const currency = rules.currency;

  // rule notes and citation list
  const minWage = rulesetId === 'kr' ? KR_MIN_WAGE[2026] : US_FEDERAL_MIN_WAGE;
  $('rulesNote').textContent = state.lang === 'ko'
    ? `${rules.name.ko} · 최저임금 ${money(minWage, currency)}`
    : `${rules.name.en} · minimum wage ${money(minWage, currency)}`;
  $('citations').innerHTML = rules.citations
    .map((citation) => `<li>${citation.text[state.lang]}</li>`)
    .join('');

  // the size question only matters in Korea
  $('sizeField').classList.toggle('hidden', !rules.requiresFiveEmployees);
  $('weeklyHolidayField').classList.toggle('hidden', !rules.hasWeeklyHolidayPay);
  $('contractCard').classList.toggle('hidden', !rules.hasWeeklyHolidayPay);

  renderProblems(entries.problems);
  renderRows(entries.entries);

  const result = computeWeek(entries.entries, settings, rulesetId);
  renderHero(result);
  renderFlags(result.flags);
  renderBreakdown(result);

  state._entries = entries.entries;
  state._result = result;

  const parsedPayslip = parsePayslip(state.payslip);
  const cmp = compare(result.money, parsedPayslip.values);
  renderCompare(cmp, parsedPayslip, currency);
  renderDays(result, currency);
  renderLetter(result, cmp, currency);
  state._cmp = cmp;
}

function renderProblems(problems) {
  const box = $('problems');
  if (!problems.length) { box.textContent = ''; return; }
  box.innerHTML = problems
    .map((p) => {
      const reasonKey = {
        'no hours': 'reason_no_hours',
        'no day': 'reason_no_day',
        'unreadable clock': 'reason_unreadable_clock',
        'start and end are the same': 'reason_same',
        'break is longer than the shift': 'reason_break',
      }[p.reason] || 'reason_no_hours';
      return `<div>${fmt('prob_line', { n: p.line, text: escapeHtml(p.text), reason: t(reasonKey) })}</div>`;
    })
    .join('');
}

function renderRows(entries) {
  const box = $('rows');
  if (!entries.length) { box.innerHTML = ''; return; }
  const dayNames = t('day_short');
  box.innerHTML = entries
    .map((entry, index) => {
      const span = `${formatClock(entry.startMin)}–${formatClock(entry.endMin)}`;
      const bits = [];
      if (entry.breakMin) bits.push(`${t('break_word')} ${formatHours(entry.breakMin)}${t('hours_word')}`);
      if (entry.holiday) bits.push(t('holiday_word'));
      return `<div class="rowitem">
        <span class="d">${dayNames[entry.day] ?? entry.day}</span>
        <span class="mono">${span}</span>
        <span class="mono">${escapeHtml(bits.join(' · '))}</span>
        <span class="mono">${hours(entry.endMin - entry.startMin - entry.breakMin)}</span>
        <button class="x" type="button" data-remove="${index}" aria-label="remove">×</button>
      </div>`;
    })
    .join('');
  box.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.remove);
      const lines = state.timecard.split(/\r?\n/).filter((line) => line.trim());
      const kept = [];
      let seen = -1;
      lines.forEach((line) => {
        const result = parseEntryLine(line, state.weekStart ? new Date(`${state.weekStart}T00:00:00`) : null);
        if (result.ok) seen += 1;
        if (seen !== index) kept.push(line);
      });
      state.timecard = kept.join('\n');
      $('timecard').value = state.timecard;
      render();
    });
  });
}

function renderHero(result) {
  const currency = result.currency;
  const hero = $('hero');
  const empty = result.hours.worked === 0;
  hero.classList.remove('short');
  if (empty) {
    $('heroAmount').textContent = '—';
    $('heroSub').textContent = t('hero_none');
  } else {
    $('heroAmount').textContent = money(result.money.total, currency);
    const short = state._cmp && state._cmp.gapTotal != null && state._cmp.gapTotal < 0;
    if (short) hero.classList.add('short');
    $('heroSub').textContent = short
      ? fmt('gap_short', { gap: money(Math.abs(state._cmp.gapTotal), currency) })
      : `${t('hero_total')} · ${result.settings.rate.toLocaleString()} ${currency === 'KRW' ? 'KRW/h' : 'USD/h'}`;
  }
  $('statHours').textContent = empty ? '—' : hours(result.hours.worked);
  $('statOt').textContent = empty ? '—' : hours(result.hours.overtime);
  $('statNight').textContent = empty ? '—' : hours(result.hours.night);
  $('statRate').textContent = money(result.settings.rate, currency);
}

function renderFlags(flags) {
  $('flags').innerHTML = flags
    .map((flag) => `<div class="flag ${flag.level}">${escapeHtml(flag[state.lang])}</div>`)
    .join('');
}

const CITATION = {
  kr: { overtime: 'art. 56(1)', night: 'art. 56(3)', holiday: 'art. 56(2)', weeklyHoliday: 'art. 55' },
  us: { overtime: 'FLSA §207(a)' },
};

function renderBreakdown(result) {
  const currency = result.currency;
  const rate = money(result.settings.rate, currency);
  const rows = [];
  const cited = CITATION[result.rulesetId] || {};

  const push = (labelKey, minutes, amount, formula, citeKey) => {
    const zero = !minutes || minutes <= 0;
    const cite = citeKey && cited[citeKey] ? ` <small class="cite">${cited[citeKey]}</small>` : '';
    rows.push(`<tr class="${zero ? 'zero' : ''}">
      <td>${t(labelKey)}${cite}</td>
      <td class="num">${zero ? '—' : hours(minutes)}</td>
      <td class="num">${zero ? '—' : money(amount, currency)}</td>
      <td class="formula">${zero ? '' : escapeHtml(formula)}</td>
    </tr>`);
  };

  push('line_base', result.hours.worked, result.money.base, fmt('f_base', { h: formatHours(result.hours.worked), rate }));
  push('line_overtime', result.hours.overtime, result.money.overtime, fmt('f_overtime', { h: formatHours(result.hours.overtime), rate }), 'overtime');
  if (RULESETS[result.rulesetId].hasNight) {
    push('line_night', result.hours.night, result.money.night, fmt('f_night', { h: formatHours(result.hours.night), rate }), 'night');
  }
  if (RULESETS[result.rulesetId].hasHolidayPremium) {
    const a = formatHours(result.hours.holidayFirst8);
    const b = formatHours(result.hours.holidayOver8);
    push('line_holiday', result.hours.holidayFirst8 + result.hours.holidayOver8, result.money.holiday,
      Number(result.hours.holidayOver8) ? fmt('f_holiday', { a, b, rate }) : fmt('f_holiday_simple', { a, rate }), 'holiday');
  }
  if (RULESETS[result.rulesetId].hasWeeklyHolidayPay) {
    push('line_weeklyHoliday', result.hours.weeklyHoliday, result.money.weeklyHoliday, fmt('f_weekly', { h: formatHours(result.hours.weeklyHoliday), rate }), 'weeklyHoliday');
  }

  rows.push(`<tr class="total"><td>${t('line_total')}</td><td class="num">${hours(result.hours.worked)}</td><td class="num">${money(result.money.total, currency)}</td><td class="formula"></td></tr>`);
  $('breakdown').innerHTML = rows.join('');

  const assumptions = [
    `${t('rates_label')} ${money(result.settings.rate, currency)}`,
    result.rulesetId === 'kr'
      ? (result.settings.workplaceSize === 'five' ? t('size_five') : t('size_under'))
      : t('short_us_rules'),
    result.rulesetId === 'kr'
      ? `${t('contract_hours')} ${result.settings.contractWeeklyHours}${t('hours_word')} · ${t('line_weeklyHoliday')}: ${result.settings.weeklyHoliday === false ? t('wh_no') : t('wh_yes')}`
      : '',
  ].filter(Boolean);
  $('assumptionsLine').textContent = assumptions.join(' · ');
}

function renderDays(result, currency) {
  const dayNames = t('day_short');
  const max = Math.max(60, ...result.days.map((day) => day.worked));
  $('days').innerHTML = result.days
    .map((day) => {
      const holidayWorked = day.holidayWorked;
      const night = day.night;
      const overtime = day.overtime;
      const regular = Math.max(0, day.worked - overtime - holidayWorked);
      const scale = (minutes) => `${(minutes / max) * 100}%`;
      return `<div class="day">
        <div class="bar" title="${hours(day.worked)}">
          <i class="seg-regular" style="height:${scale(regular)}"></i>
          <i class="seg-overtime" style="height:${scale(overtime)}"></i>
          <i class="seg-night" style="height:${scale(night)}"></i>
          <i class="seg-holiday" style="height:${scale(holidayWorked)}"></i>
        </div>
        <div class="lbl">${dayNames[day.day]}</div>
        <div class="hrs">${day.worked ? formatHours(day.worked) : '·'}</div>
      </div>`;
    })
    .join('');
}

function renderCompare(cmp, parsed, currency) {
  if (!parsed.found) {
    $('compareWrap').innerHTML = `<p class="hint">${t('gap_unknown')}</p>`;
    $('unreadWrap').innerHTML = '';
    return;
  }
  const rows = cmp.rows
    .filter((row) => row.owed > 0 || row.paid != null)
    .map((row) => {
      const gap = row.gap;
      const gapText = gap == null ? '—' : money(gap, currency);
      const cls = gap != null && gap < 0 ? 'style="color:#b3261e;font-weight:600"' : '';
      return `<tr>
        <td>${t(`line_${row.key}`)}</td>
        <td class="num">${money(row.owed, currency)}</td>
        <td class="num">${row.paid == null ? `<span style="color:#9aa0a6">${t('not_paid')}</span>` : money(row.paid, currency)}</td>
        <td class="num" ${cls}>${gapText}</td>
      </tr>`;
    })
    .join('');

  const banner = (() => {
    if (cmp.paidTotal == null) return '';
    if (Math.abs(cmp.gapTotal) < 0.5) return `<div class="banner good">${t('gap_match')}</div>`;
    if (cmp.gapTotal < 0) return `<div class="banner bad">${fmt('gap_short', { gap: money(Math.abs(cmp.gapTotal), currency) })}</div>`;
    return `<div class="banner good">${fmt('gap_over', { gap: money(cmp.gapTotal, currency) })}</div>`;
  })();

  $('compareWrap').innerHTML = `
    <table style="margin-top:12px">
      <thead><tr><th>${t('th_line')}</th><th class="num">${t('th_owed')}</th><th class="num">${t('th_paid')}</th><th class="num">${t('th_gap')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${banner}`;

  $('unreadWrap').innerHTML = parsed.unread.length
    ? `<div style="margin-top:12px"><strong style="font-size:12px">${t('unread_title')}</strong>
        <ul style="font-size:12px;color:#4a525c;margin:6px 0 0;padding-left:18px">${parsed.unread.slice(0, 8).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        <p class="hint">${t('unread_hint')}</p></div>`
    : '';
}

function renderLetter(result, cmp, currency) {
  const start = state.weekStart
    ? new Date(`${state.weekStart}T00:00:00`).toLocaleDateString(state.lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : (state.lang === 'ko' ? '이번' : 'this');
  const lines = [];
  lines.push(fmt('letter_intro', { start }));
  lines.push('');
  lines.push(fmt('letter_hours', {
    worked: formatHours(result.hours.worked),
    regular: formatHours(Math.max(0, result.hours.worked - result.hours.overtime - result.hours.holiday)),
    ot: formatHours(result.hours.overtime),
    night: formatHours(result.hours.night),
    holiday: formatHours(result.hours.holiday),
  }));
  lines.push('');
  lines.push(t('letter_calc'));
  const items = [
    ['line_base', result.hours.worked, result.money.base],
    ['line_overtime', result.hours.overtime, result.money.overtime],
  ];
  if (RULESETS[result.rulesetId].hasNight) items.push(['line_night', result.hours.night, result.money.night]);
  if (RULESETS[result.rulesetId].hasHolidayPremium) items.push(['line_holiday', result.hours.holidayFirst8 + result.hours.holidayOver8, result.money.holiday]);
  if (RULESETS[result.rulesetId].hasWeeklyHolidayPay) items.push(['line_weeklyHoliday', result.hours.weeklyHoliday, result.money.weeklyHoliday]);
  items.filter(([, minutes, amount]) => minutes > 0 && amount > 0).forEach(([key, minutes, amount]) => {
    lines.push(`  · ${t(key)}: ${hours(minutes)} → ${money(amount, currency)}`);
  });
  lines.push(`  · ${t('line_total')}: ${money(result.money.total, currency)}`);
  if (cmp && cmp.paidTotal != null) {
    lines.push('');
    lines.push(fmt('letter_paid', { paid: money(cmp.paidTotal, currency) }));
    lines.push(fmt(cmp.gapTotal < 0 ? 'letter_gap_short' : 'letter_gap_over', { gap: money(Math.abs(cmp.gapTotal), currency) }));
  }
  lines.push('');
  lines.push(t('letter_ask'));
  lines.push(t('letter_sign'));
  $('letter').textContent = lines.join('\n');
}

// ── export ───────────────────────────────────────────────────────────

function downloadCsv() {
  const result = state._result;
  if (!result) return;
  const rows = [['day', 'start', 'end', 'break_min', 'holiday', 'worked_hours', 'overtime_hours', 'night_hours']];
  state._entries.forEach((entry) => {
    const segments = splitEntry(entry);
    const worked = segments.reduce((sum, seg) => sum + seg.minutes, 0);
    rows.push([
      t('day_short')[entry.day],
      formatClock(entry.startMin),
      formatClock(entry.endMin),
      entry.breakMin,
      entry.holiday ? 'yes' : '',
      formatHours(worked),
      formatHours(entry.holiday ? 0 : Math.max(0, (entry.endMin - entry.startMin - entry.breakMin) - 480)),
      formatHours(nightMinutes(entry.startMin, entry.endMin)),
    ]);
  });
  rows.push([]);
  rows.push(['line', 'hours', 'amount', result.currency]);
  rows.push([t('line_base'), formatHours(result.hours.worked), result.money.base, result.currency]);
  rows.push([t('line_overtime'), formatHours(result.hours.overtime), result.money.overtime, result.currency]);
  rows.push([t('line_night'), formatHours(result.hours.night), result.money.night, result.currency]);
  rows.push([t('line_holiday'), formatHours(result.hours.holiday), result.money.holiday, result.currency]);
  rows.push([t('line_weeklyHoliday'), formatHours(result.hours.weeklyHoliday), result.money.weeklyHoliday, result.currency]);
  rows.push([t('line_total'), formatHours(result.hours.worked), result.money.total, result.currency]);
  if (state._cmp && state._cmp.paidTotal != null) {
    rows.push([]);
    rows.push(['paid_total', '', state._cmp.paidTotal, result.currency]);
    rows.push(['difference', '', state._cmp.gapTotal, result.currency]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = t('csv_name');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ── wiring ───────────────────────────────────────────────────────────

const PRESETS = {
  store: {
    country: 'kr', rate: '12000', size: 'five', contractHours: '20', scheduledDays: '5', weeklyHoliday: 'yes',
    timecard: 'Mon 13:00-18:00 break 60\nTue 13:00-18:00 break 60\nWed 13:00-18:00 break 60\nThu 13:00-18:00 break 60\nFri 13:00-18:00 break 60',
    payslip: '기본급 240,000\n식대 100,000\n공제 합계 25,000\n실수령액 315,000',
  },
  night: {
    country: 'kr', rate: '13000', size: 'five', contractHours: '40', scheduledDays: '5', weeklyHoliday: 'yes',
    timecard: 'Mon 18:00-02:00\nTue 18:00-02:00\nWed 18:00-02:00\nThu 18:00-03:00\nFri 18:00-02:00',
    payslip: '기본급 533,000\n야간근로수당 65,000\n주휴수당 104,000\n공제 합계 120,000',
  },
  us: {
    country: 'us', rate: '15.00', size: 'five', contractHours: '40', scheduledDays: '5', weeklyHoliday: 'no',
    timecard: 'Mon 9-6 break 60\nTue 9-6 break 60\nWed 9-6 break 60\nThu 9-6 break 60\nFri 9-6 break 60\nSat 9-2',
    payslip: 'Regular pay 600.00\nOvertime 37.50\nGross pay 637.50',
  },
  clear: { timecard: '', payslip: '' },
};

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  Object.assign(state, preset);
  $('country').value = state.country;
  $('rate').value = state.rate;
  $('size').value = state.size;
  $('contractHours').value = state.contractHours;
  $('scheduledDays').value = state.scheduledDays;
  $('weeklyHoliday').value = state.weeklyHoliday;
  $('timecard').value = state.timecard;
  $('payslip').value = state.payslip;
  render();
}

function save() {
  try {
    localStorage.setItem('shortfall.v2', JSON.stringify({
      lang: state.lang, country: state.country, rate: state.rate, weekStart: state.weekStart,
      size: state.size, timecard: state.timecard, payslip: state.payslip,
      contractHours: state.contractHours, scheduledDays: state.scheduledDays, weeklyHoliday: state.weeklyHoliday,
    }));
  } catch (_) { /* private mode: nothing to save, nothing to lose */ }
}

function load() {
  try {
    const raw = localStorage.getItem('shortfall.v2');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    return true;
  } catch (_) {
    return false;
  }
}

function bind() {
  document.querySelectorAll('.lang button').forEach((button) => {
    button.addEventListener('click', () => {
      state.lang = button.dataset.lang;
      applyLanguage();
      save();
    });
  });

  $('country').addEventListener('change', (event) => { state.country = event.target.value; render(); save(); });
  $('rate').addEventListener('input', (event) => { state.rate = event.target.value; render(); save(); });
  $('weekStart').addEventListener('change', (event) => { state.weekStart = event.target.value; render(); save(); });
  $('size').addEventListener('change', (event) => { state.size = event.target.value; render(); save(); });
  $('timecard').addEventListener('input', (event) => { state.timecard = event.target.value; render(); save(); });
  $('payslip').addEventListener('input', (event) => { state.payslip = event.target.value; render(); save(); });
  $('contractHours').addEventListener('input', (event) => { state.contractHours = event.target.value; render(); save(); });
  $('scheduledDays').addEventListener('input', (event) => { state.scheduledDays = event.target.value; render(); save(); });
  $('weeklyHoliday').addEventListener('change', (event) => { state.weeklyHoliday = event.target.value; render(); save(); });

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => { applyPreset(button.dataset.preset); save(); });
  });

  $('addRow').addEventListener('click', () => {
    const nextDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][new Set(currentEntries().entries.map((e) => e.day)).size % 7];
    state.timecard = `${state.timecard.trim()}\n${nextDay} 09:00-18:00 break 60`.trim();
    $('timecard').value = state.timecard;
    render(); save();
  });

  $('copyLetter').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('letter').textContent);
      const button = $('copyLetter');
      const original = button.textContent;
      button.textContent = t('copied');
      setTimeout(() => { button.textContent = original; }, 1400);
    } catch (_) { /* clipboard blocked: the text is selectable */ }
  });

  $('downloadCsv').addEventListener('click', downloadCsv);
  $('printPage').addEventListener('click', () => window.print());
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ── start ────────────────────────────────────────────────────────────

function defaultWeekStart() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const iso = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  return iso;
}

function init() {
  const saved = load();
  if (!state.weekStart) state.weekStart = defaultWeekStart();
  $('weekStart').value = state.weekStart;
  $('country').value = state.country;
  $('rate').value = state.rate;
  $('size').value = state.size;
  $('contractHours').value = state.contractHours;
  $('scheduledDays').value = state.scheduledDays;
  $('weeklyHoliday').value = state.weeklyHoliday;
  if (!saved) applyPreset('store');
  else {
    $('timecard').value = state.timecard;
    $('payslip').value = state.payslip;
  }
  bind();
  applyLanguage();
}

window.Shortfall = { parseTimecard, parseEntryLine, computeWeek, parsePayslip, compare, RULESETS, state, render };

init();
