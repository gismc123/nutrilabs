import { Link } from 'react-router-dom';
import { IconCalendarCheck } from '@tabler/icons-react';

const DAY_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function PrepDayBanner({ settings }) {
  const prepDay = settings?.prepDay ?? settings?.weekStartDay ?? 'SUN';
  const todayEnum = DAY_ENUM[new Date().getDay()];

  if (prepDay !== todayEnum) return null;

  return (
    <div className="flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
      <IconCalendarCheck size={20} className="text-primary-600 shrink-0" />
      <p className="text-sm text-primary-700 font-medium">
        It's prep day — your grocery list is ready.{' '}
        <Link to="/shop" className="underline hover:no-underline">View list</Link>
      </p>
    </div>
  );
}
