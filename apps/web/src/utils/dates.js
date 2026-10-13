const DAY_NAMES = {
  SUN: 'Sunday',
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

const DAY_ORDER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function getWeekStart(date, weekStartDay = 'MON') {
  const d = new Date(date);
  const targetDay = DAY_ORDER.indexOf(weekStartDay);
  const currentDay = d.getDay();
  const diff = (currentDay - targetDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

/** Parse 'YYYY-MM-DD' or an ISO timestamp as a UTC-midnight Date (no local-time shift). */
export function parseIsoDate(value) {
  return new Date(String(value).slice(0, 10) + 'T00:00:00.000Z');
}

/** Add days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. */
export function addDaysIso(dateStr, days) {
  const d = parseIsoDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const UTC_DAY_ENUMS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Day enums in display order for a week starting on `weekStart` (a UTC-midnight Date). */
export function orderedWeekDays(weekStart) {
  const first = weekStart ? weekStart.getUTCDay() : 1;
  return Array.from({ length: 7 }, (_, i) => UTC_DAY_ENUMS[(first + i) % 7]);
}

export function dayEnumToLabel(dayEnum) {
  return DAY_NAMES[dayEnum] ?? dayEnum;
}

export function shortDayLabel(dayEnum) {
  return dayEnum ? dayEnum.charAt(0) + dayEnum.slice(1, 2).toLowerCase() + dayEnum.slice(2).toLowerCase() : dayEnum;
}
