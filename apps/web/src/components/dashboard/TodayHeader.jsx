import HouseholdBadge from '../ui/HouseholdBadge.jsx';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TodayHeader({ grid, profiles = [] }) {
  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`;

  const DAY_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayEnum = DAY_ENUM[now.getDay()];
  const todayConfig = grid?.[todayEnum];
  const mode = todayConfig?.householdMode ?? 'SOLO';

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{dateLabel}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Today's meal plan</p>
      </div>
      <HouseholdBadge mode={mode} profiles={profiles} />
    </div>
  );
}
