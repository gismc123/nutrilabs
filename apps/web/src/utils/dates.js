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

export function dayEnumToLabel(dayEnum) {
  return DAY_NAMES[dayEnum] ?? dayEnum;
}

export function shortDayLabel(dayEnum) {
  return dayEnum ? dayEnum.charAt(0) + dayEnum.slice(1, 2).toLowerCase() + dayEnum.slice(2).toLowerCase() : dayEnum;
}
