// time.js — reading a timecard the way people write one.
//
// A timecard is a list of lines. Each line names a day and a span of hours:
//
//   Mon 09:00-18:00            월 18:00~22:30
//   Tue 22:00-02:00 break 30   Sat 10:00-16:00 holiday
//   11/17 9-6                  Sun 10-16 (break 1h)
//
// Everything here is deliberate about the two places a timecard is usually
// misread: "9-6" means nine in the morning to six in the evening (not a
// nine-hour overnight shift), and "22:00-02:00" crosses midnight and belongs
// to two calendar days. Guessing wrong in either direction changes the pay.

export const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];

const DAY_ALIASES = new Map();
for (let i = 0; i < 7; i += 1) {
  const en = DAYS_EN[i].toLowerCase();
  const ko = DAYS_KO[i];
  [en, en.slice(0, 2), `${en}day`, `${en}sday`, ko, `${ko}요일`, `${ko}욜`].forEach((alias) => {
    DAY_ALIASES.set(alias, i);
  });
}
// Sunday has two common English short forms.
DAY_ALIASES.set('sun', 6);
DAY_ALIASES.set('su', 6);
DAY_ALIASES.set('thur', 3);
DAY_ALIASES.set('thurs', 3);
DAY_ALIASES.set('tues', 1);

export function parseDayToken(token) {
  if (!token) return null;
  const key = String(token).trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  if (DAY_ALIASES.has(key)) return DAY_ALIASES.get(key);
  return null;
}

// "09:00", "9", "6pm", "18시", "오후 6시 30분", "24:00"
export function parseClock(text) {
  if (text == null) return null;
  let s = String(text).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let meridiem = null;
  if (/오전/.test(s)) meridiem = 'am';
  if (/오후/.test(s)) meridiem = 'pm';
  if (/pm/.test(s)) meridiem = 'pm';
  if (/am/.test(s)) meridiem = 'am';
  s = s.replace(/오전|오후|am|pm/g, '');
  s = s.replace(/시/g, ':').replace(/분/g, '').replace(/\./g, ':').replace(/;$/, '');
  if (s.endsWith(':')) s = s.slice(0, -1);
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(hour) || minute > 59) return null;
  if (meridiem) {
    if (hour === 12) hour = meridiem === 'am' ? 0 : 12;
    else if (meridiem === 'pm' && hour < 12) hour += 12;
  }
  if (hour === 24 && minute === 0) return 1440;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

export function formatClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatHours(minutes) {
  const h = minutes / 60;
  if (Number.isInteger(h)) return String(h);
  return h.toFixed(2).replace(/0$/, '');
}

function parseBreak(text) {
  if (!text) return 0;
  const s = String(text).toLowerCase();
  const hm = s.match(/(\d+(?:\.\d+)?)\s*(h|시간|hour)/);
  if (hm) return Math.round(Number(hm[1]) * 60);
  const mm = s.match(/(\d+)\s*(m|분|min)/);
  if (mm) return Math.round(Number(mm[1]));
  const bare = s.match(/(\d+)/);
  return bare ? Math.round(Number(bare[1])) : 0;
}

// A line may carry the break in a few shapes: "break 30", "(break 1h)",
// "휴게 60분", "break:30".
function splitBreak(line) {
  const m = line.match(/(?:break|휴게|휴식)\s*[:=]?\s*\(?([0-9.]+\s*(?:h|시간|hour|m|분|min)?)\)?/i);
  if (!m) return { line, breakMin: 0 };
  return {
    line: line.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
    breakMin: parseBreak(m[1]),
  };
}

function splitHoliday(line) {
  const m = line.match(/holiday|\bhol\b|휴일|공휴일/i);
  if (!m) return { line, holiday: false };
  return { line: line.replace(m[0], ' ').replace(/\s+/g, ' ').trim(), holiday: true };
}

// "11/17" or "2026-11-17" → day index inside the week that starts at weekStart.
export function dayIndexFromDate(text, weekStart) {
  if (!weekStart) return null;
  const s = String(text).trim();
  let month = null;
  let day = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    if (Number(m[1]) !== weekStart.getFullYear()) return null;
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = s.match(/^(\d{1,2})[/.](\d{1,2})$/);
    if (!m) return null;
    month = Number(m[1]);
    day = Number(m[2]);
  }
  const d = new Date(weekStart.getFullYear(), month - 1, day);
  if (d.getMonth() !== month - 1) return null;
  const diff = Math.round((d - new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())) / 86400000);
  if (diff < 0 || diff > 6) return null;
  return diff;
}

/**
 * Parse one line of a timecard.
 * Returns { ok: true, entry } or { ok: false, reason }.
 */
export function parseEntryLine(line, weekStart = null, fallbackDay = null) {
  const raw = String(line).trim();
  if (!raw) return { ok: false, reason: 'empty' };
  if (/^#|^\/\//.test(raw)) return { ok: false, reason: 'comment' };

  let rest = raw;
  let { line: noBreak, breakMin } = splitBreak(rest);
  let { line: noHoliday, holiday } = splitHoliday(noBreak);

  // The span: anything between two clock-shaped tokens joined by a dash/tilde.
  const span = noHoliday.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|시|오전|오후)?)\s*(?:-|–|~|부터|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|시|오전|오후)?(?:\s*\d{1,2}\s*분)?)/i);
  if (!span) return { ok: false, reason: 'no hours' };

  const startRaw = span[1];
  const endRaw = span[2];
  let start = parseClock(startRaw);
  let end = parseClock(endRight(endRaw));
  if (start == null || end == null) return { ok: false, reason: 'unreadable clock' };

  // "9-6" and "9-6pm" are the same shift; "6-2" written by a night worker is
  // not. Add twelve hours when the end reads as an afternoon of the same day.
  if (end === start) return { ok: false, reason: 'start and end are the same' };
  if (end < start) {
    // "9-6" and "12-6" read as a same-day afternoon end; "22-2" reads as the
    // next morning. Twelve hours of shift is the line between the two.
    if (end + 12 * 60 > start) end += 12 * 60;
    else end += 24 * 60;
  }

  // Day: an explicit weekday, a date, or the line's own fallback.
  let day = null;
  const before = noHoliday.slice(0, Math.max(0, noHoliday.indexOf(span[0]))).trim();
  const after = noHoliday.slice(noHoliday.indexOf(span[0]) + span[0].length).trim();
  const dayText = `${before} ${after}`.trim();
  const dayToken = dayText.split(/[\s,()]+/).find((t) => parseDayToken(t) != null);
  if (dayToken) day = parseDayToken(dayToken);
  if (day == null) {
    const dateToken = dayText.split(/[\s,()]+/).find((t) => /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}[/.]\d{1,2}$/.test(t));
    if (dateToken) day = dayIndexFromDate(dateToken, weekStart);
  }
  if (day == null) day = fallbackDay;
  if (day == null) return { ok: false, reason: 'no day' };

  if (breakMin < 0) breakMin = 0;
  const grossMin = end - start;
  if (grossMin - breakMin <= 0) return { ok: false, reason: 'break is longer than the shift' };

  return {
    ok: true,
    entry: { day, startMin: start, endMin: end, breakMin, holiday },
    consumed: raw,
  };
}

function endRight(text) {
  // A Korean "오후 6시 30분" carries its minutes after the 시; keep them.
  return String(text).trim();
}

/** Parse a whole pasted timecard. */
export function parseTimecard(text, weekStart = null) {
  const entries = [];
  const problems = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const result = parseEntryLine(line, weekStart);
    if (result.ok) entries.push({ ...result.entry, source: line.trim() });
    else if (result.reason !== 'empty' && result.reason !== 'comment') {
      problems.push({ line: i + 1, text: line.trim(), reason: result.reason });
    }
  });
  return { entries, problems };
}

/**
 * Cut one entry into calendar days and into night/day pieces.
 * A shift 22:00–02:00 is two days of work and three hours of night pay.
 */
export function splitEntry(entry) {
  const { startMin, endMin, breakMin, holiday } = entry;
  const segments = [];
  let breakLeft = breakMin;
  let cursor = startMin;
  while (cursor < endMin) {
    const dayStart = Math.floor(cursor / 1440);
    const boundary = (dayStart + 1) * 1440;
    const segEnd = Math.min(endMin, boundary);
    let segMin = segEnd - cursor;
    // The break is taken out of the first part of the shift.
    const take = Math.min(breakLeft, segMin);
    breakLeft -= take;
    if (segMin - take > 0) {
      segments.push({
        dayOffset: dayStart,
        start: cursor,
        end: segEnd,
        minutes: segMin - take,
        holiday,
      });
    }
    cursor = segEnd;
  }
  return segments;
}

/** Minutes of [start,end) that fall inside 22:00–06:00 of the day they belong to. */
export function nightMinutes(start, end) {
  let total = 0;
  // Night windows repeat every 24 hours: 22:00–24:00 and 00:00–06:00.
  for (let day = Math.floor(start / 1440) - 1; day <= Math.floor(end / 1440); day += 1) {
    const windows = [
      [day * 1440 + 22 * 60, day * 1440 + 24 * 60],
      [day * 1440, day * 1440 + 6 * 60],
    ];
    windows.forEach(([a, b]) => {
      const overlap = Math.min(end, b) - Math.max(start, a);
      if (overlap > 0) total += overlap;
    });
  }
  return total;
}
