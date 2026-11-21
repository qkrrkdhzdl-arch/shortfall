// rules.js — the arithmetic of a week's pay, with the rule it came from.
//
// Two rule sets are here because the app is used in two places:
//
//   Korea  근로기준법 제56조  overtime +50%, night (22:00–06:00) +50%,
//                             holiday work +50% up to 8h and +100% beyond,
//                             and 제55조 weekly holiday pay (주휴수당).
//   US     Fair Labor Standards Act  overtime at 1.5x for hours over 40 in a
//                             workweek. No daily overtime, no night premium.
//
// Every premium is computed on the ordinary hourly wage (통상시급 / regular
// rate) and every amount is returned with the hours and multiplier that made
// it, so the screen can show the formula instead of asking for trust.

import { splitEntry, nightMinutes } from './time.js';

export const KR_MIN_WAGE = { 2025: 10030, 2026: 10320 };
export const US_FEDERAL_MIN_WAGE = 7.25;

export const RULESETS = {
  kr: {
    id: 'kr',
    currency: 'KRW',
    name: { en: 'Korea · Labor Standards Act', ko: '대한민국 · 근로기준법' },
    short: { en: 'Korea', ko: '한국' },
    overtimeRate: 0.5,
    nightRate: 0.5,
    holidayFirst8Rate: 0.5,
    holidayOver8Rate: 1.0,
    hasNight: true,
    hasHolidayPremium: true,
    hasWeeklyHolidayPay: true,
    dailyOvertime: true,
    weeklyOvertimeThreshold: 40 * 60,
    // Art. 56 does not reach a workplace with fewer than five employees.
    requiresFiveEmployees: true,
    citations: [
      {
        key: 'art56-1',
        text: {
          en: 'Labor Standards Act art. 56(1): overtime is paid at 150% of the ordinary wage.',
          ko: '근로기준법 제56조 제1항: 연장근로는 통상임금의 100분의 50 이상을 가산한다.',
        },
      },
      {
        key: 'art56-2',
        text: {
          en: 'Art. 56(2): holiday work is +50% up to 8 hours and +100% beyond 8 hours.',
          ko: '근로기준법 제56조 제2항: 휴일근로는 8시간 이내 100분의 50, 8시간 초과분 100분의 100을 가산한다.',
        },
      },
      {
        key: 'art56-3',
        text: {
          en: 'Art. 56(3): night work, 22:00 to 06:00, is paid at 150%.',
          ko: '근로기준법 제56조 제3항: 야간근로(오후 10시부터 오전 6시)는 100분의 50 이상을 가산한다.',
        },
      },
      {
        key: 'art55',
        text: {
          en: 'Art. 55 and Enforcement Decree art. 30: a worker scheduled for 15 hours or more a week and present on all scheduled days is paid one paid holiday a week.',
          ko: '근로기준법 제55조·시행령 제30조: 1주 소정근로시간이 15시간 이상이고 소정근로일을 개근한 근로자에게 유급휴일(주휴수당)을 준다.',
        },
      },
      {
        key: 'minimum-wage',
        text: {
          en: 'Minimum wage: 10,320 KRW per hour for 2026 (10,030 for 2025), Ministry of Employment and Labor notice 2025-47.',
          ko: '최저임금: 2026년 시간급 10,320원(2025년 10,030원), 고용노동부 고시 제2025-47호.',
        },
      },
    ],
  },
  us: {
    id: 'us',
    currency: 'USD',
    name: { en: 'United States · FLSA (federal)', ko: '미국 · 연방 근로기준법(FLSA)' },
    short: { en: 'United States', ko: '미국' },
    overtimeRate: 0.5,
    nightRate: 0,
    holidayFirst8Rate: 0,
    holidayOver8Rate: 0,
    hasNight: false,
    hasHolidayPremium: false,
    hasWeeklyHolidayPay: false,
    dailyOvertime: false,
    weeklyOvertimeThreshold: 40 * 60,
    requiresFiveEmployees: false,
    citations: [
      {
        key: 'flsa-ot',
        text: {
          en: 'FLSA §207(a): hours over 40 in a workweek are paid at one and a half times the regular rate.',
          ko: 'FLSA §207(a): 1주 40시간을 초과한 시간은 통상시급의 1.5배를 지급한다.',
        },
      },
      {
        key: 'flsa-min',
        text: {
          en: 'Federal minimum wage is $7.25 per hour; many states set a higher one.',
          ko: '연방 최저임금은 시간당 $7.25이며, 주에 따라 더 높다.',
        },
      },
    ],
  },
};

const roundMoney = (value, currency) => {
  if (currency === 'KRW') return Math.round(value);
  return Math.round(value * 100) / 100;
};

function emptyMoney() {
  return { base: 0, overtime: 0, night: 0, holiday: 0, weeklyHoliday: 0, total: 0 };
}

/**
 * Compute a week of pay.
 *
 * @param entries  [{day:0..6, startMin, endMin, breakMin, holiday}]
 * @param settings {rate, workplaceSize:'five'|'under', contractWeeklyHours,
 *                  scheduledDays, weeklyHoliday:boolean, attendedAll:boolean}
 * @param rulesetId 'kr' | 'us'
 */
export function computeWeek(entries, settings, rulesetId = 'kr') {
  const rules = RULESETS[rulesetId] || RULESETS.kr;
  const rate = Number(settings.rate) || 0;
  const currency = rules.currency;
  const premiumAllowed = !(rules.requiresFiveEmployees && settings.workplaceSize === 'under');

  // 1. Every entry becomes calendar-day segments.
  const perDay = new Map();
  const holidayPerDay = new Map();
  let workedMin = 0;
  let holidayMin = 0;

  entries.forEach((entry) => {
    splitEntry(entry).forEach((seg) => {
      const dayIndex = entry.day + seg.dayOffset;
      const worked = (perDay.get(dayIndex) || 0) + seg.minutes;
      perDay.set(dayIndex, worked);
      if (seg.holiday) {
        holidayPerDay.set(dayIndex, (holidayPerDay.get(dayIndex) || 0) + seg.minutes);
        holidayMin += seg.minutes;
      }
      workedMin += seg.minutes;
    });
  });

  // 2. Night minutes are counted on the raw span, so a shift crossing midnight
  //    keeps its 22:00–02:00 hours.
  let nightMin = 0;
  entries.forEach((entry) => {
    nightMin += nightMinutes(entry.startMin, entry.endMin);
    // Breaks are unpaid; take the night share down by the same proportion.
    const span = entry.endMin - entry.startMin;
    if (span > 0 && entry.breakMin > 0) {
      const share = Math.min(entry.breakMin, span) / span;
      nightMin -= Math.round(nightMinutes(entry.startMin, entry.endMin) * share);
    }
  });
  nightMin = Math.max(0, Math.round(nightMin));

  // 3. Daily overtime (Korea only): hours beyond eight in a workday.
  let dailyOtMin = 0;
  const dayRows = [];
  for (let day = 0; day < 7; day += 1) {
    const worked = perDay.get(day) || 0;
    const holidayWorked = holidayPerDay.get(day) || 0;
    const regularWorked = worked - holidayWorked;
    const ot = rules.dailyOvertime && premiumAllowed ? Math.max(0, regularWorked - 8 * 60) : 0;
    dailyOtMin += ot;
    dayRows.push({
      day,
      worked,
      regularWorked,
      holidayWorked,
      overtime: ot,
      night: dayRowsNight(entries, day),
    });
  }

  // 4. Weekly overtime: hours beyond 40 that the daily rule did not already
  //    count. Holiday hours are not part of the 40 in Korea.
  const weeklyBase = rules.id === 'kr' ? workedMin - holidayMin : workedMin;
  let weeklyOtMin = Math.max(0, weeklyBase - rules.weeklyOvertimeThreshold);
  if (rules.dailyOvertime) weeklyOtMin = Math.max(0, weeklyOtMin - dailyOtMin);
  if (!premiumAllowed) weeklyOtMin = 0;

  const overtimeMin = dailyOtMin + weeklyOtMin;

  // 5. Holiday work: first eight hours a day at +50%, the rest at +100%.
  let holidayFirst8 = 0;
  let holidayOver8 = 0;
  holidayPerDay.forEach((minutes) => {
    holidayFirst8 += Math.min(8 * 60, minutes);
    holidayOver8 += Math.max(0, minutes - 8 * 60);
  });
  if (!rules.hasHolidayPremium || !premiumAllowed) {
    holidayFirst8 = 0;
    holidayOver8 = 0;
  }

  const nightPayMin = rules.hasNight && premiumAllowed ? nightMin : 0;

  // 6. Weekly holiday pay: one paid day for a week of 15 hours or more.
  let weeklyHolidayMin = 0;
  if (rules.hasWeeklyHolidayPay && settings.weeklyHoliday !== false) {
    const contractHours = Number(settings.contractWeeklyHours);
    const scheduledDays = Number(settings.scheduledDays) || 0;
    const attended = settings.attendedAll !== false;
    const longEnough = Number.isFinite(contractHours) && contractHours >= 15;
    const daysMet = scheduledDays >= 1 && (perDay.size >= scheduledDays || attended);
    if (longEnough && attended && daysMet) {
      weeklyHolidayMin = Math.round(Math.min(8 * 60, (contractHours / 40) * 8 * 60));
    }
  }

  // 7. Money. Base pay covers every hour worked at 100%.
  const money = emptyMoney();
  money.base = roundMoney((workedMin / 60) * rate, currency);
  money.overtime = roundMoney((overtimeMin / 60) * rate * rules.overtimeRate, currency);
  money.night = roundMoney((nightPayMin / 60) * rate * rules.nightRate, currency);
  money.holiday = roundMoney(
    (holidayFirst8 / 60) * rate * rules.holidayFirst8Rate + (holidayOver8 / 60) * rate * rules.holidayOver8Rate,
    currency,
  );
  money.weeklyHoliday = roundMoney((weeklyHolidayMin / 60) * rate, currency);
  money.total = roundMoney(
    money.base + money.overtime + money.night + money.holiday + money.weeklyHoliday,
    currency,
  );

  const hours = {
    worked: workedMin,
    regular: workedMin - overtimeMin - holidayMin,
    overtime: overtimeMin,
    night: nightPayMin,
    holiday: holidayMin,
    holidayFirst8,
    holidayOver8,
    weeklyHoliday: weeklyHolidayMin,
  };

  // 8. Flags a worker should see before trusting the number.
  const flags = [];
  if (premiumAllowed === false) {
    flags.push({
      id: 'under-five',
      level: 'warn',
      en: 'Under five employees: art. 56 premiums (overtime, night, holiday) do not apply. Base pay still does.',
      ko: '5인 미만 사업장: 근로기준법 제56조의 연장·야간·휴일 가산은 적용되지 않습니다. 기본임금은 그대로입니다.',
    });
  }
  if (rules.id === 'kr') {
    const minWage = KR_MIN_WAGE[2026];
    if (rate > 0 && rate < minWage) {
      flags.push({
        id: 'min-wage',
        level: 'warn',
        en: `Your base rate is below the 2026 minimum wage of ${minWage.toLocaleString('en-US')} KRW.`,
        ko: `기본시급이 2026년 최저임금 ${minWage.toLocaleString('ko-KR')}원보다 낮습니다.`,
      });
    }
    if (settings.weeklyHoliday !== false && Number(settings.contractWeeklyHours) > 0 && Number(settings.contractWeeklyHours) < 15) {
      flags.push({
        id: 'no-weekly-holiday',
        level: 'info',
        en: 'Under 15 contracted hours a week, weekly holiday pay does not apply.',
        ko: '1주 소정근로시간이 15시간 미만이면 주휴수당이 적용되지 않습니다.',
      });
    }
    if (weeklyHolidayMin > 0 && settings.workplaceSize === 'under') {
      flags.push({
        id: 'weekly-holiday-small',
        level: 'info',
        en: 'Weekly holiday pay is included even under five employees; check your contract, practice differs.',
        ko: '5인 미만 사업장에서도 주휴수당을 포함해 계산했습니다. 계약 내용에 따라 다툼이 있을 수 있습니다.',
      });
    }
    const breakProblem = breakCheck(entries);
    if (breakProblem) flags.push(breakProblem);
  }
  if (rules.id === 'us') {
    flags.push({
      id: 'us-states',
      level: 'info',
      en: 'Federal rules only. States such as California add daily overtime and other premiums.',
      ko: '연방 규칙만 반영했습니다. 캘리포니아 등 일부 주는 일 단위 연장수당 등 다른 기준을 둡니다.',
    });
    if (rate > 0 && rate < US_FEDERAL_MIN_WAGE) {
      flags.push({
        id: 'us-min-wage',
        level: 'warn',
        en: 'This rate is below the federal minimum wage of $7.25.',
        ko: '연방 최저임금 $7.25보다 낮은 시급입니다.',
      });
    }
  }

  return {
    rulesetId: rules.id,
    currency,
    rate,
    hours,
    money,
    days: dayRows,
    flags,
    settings: { ...settings },
  };
}

function dayRowsNight(entries, day) {
  let total = 0;
  entries.forEach((entry) => {
    splitEntry(entry).forEach((seg) => {
      if (entry.day + seg.dayOffset === day) total += nightMinutes(seg.start, seg.end);
    });
  });
  return total;
}

// Art. 54: 30 minutes of rest after four hours, an hour after eight.
function breakCheck(entries) {
  const short = entries.filter((entry) => {
    const span = (entry.endMin - entry.startMin) / 60;
    const given = entry.breakMin;
    if (span >= 8 && given < 60) return true;
    if (span >= 4 && given < 30) return true;
    return false;
  });
  if (!short.length) return null;
  return {
    id: 'break',
    level: 'info',
    en: `${short.length} shift(s) are recorded with less rest than art. 54 requires. Unpaid rest still has to be given.`,
    ko: `근로기준법 제54조의 휴게시간보다 짧게 기록된 근무가 ${short.length}건 있습니다. 휴게는 무급이어도 반드시 주어야 합니다.`,
  };
}
