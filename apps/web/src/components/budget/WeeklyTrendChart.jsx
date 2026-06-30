import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { SkeletonCard } from '../ui/Skeleton.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function WeeklyTrendChart({ weeklyData, isLoading }) {
  if (isLoading) return <SkeletonCard className="h-64" />;
  if (!weeklyData || weeklyData.length === 0) return null;

  const reversed = [...weeklyData].reverse();

  const labels = reversed.map((w) => formatWeekLabel(w.weekStartDate));
  const groceries = reversed.map((w) => (w.grocerySpend / 100).toFixed(2));
  const eatingOut = reversed.map((w) => (w.eatingOutSpend / 100).toFixed(2));

  const data = {
    labels,
    datasets: [
      {
        label: 'Groceries',
        data: groceries,
        backgroundColor: '#16a34a',
        borderRadius: 4,
      },
      {
        label: 'Eating out',
        data: eatingOut,
        backgroundColor: '#d97706',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => ` $${parseFloat(ctx.raw).toFixed(2)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `$${value}`,
        },
      },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <h2 className="text-sm font-semibold text-neutral-700 mb-4">Last 12 weeks</h2>
      <Bar data={data} options={options} />
    </div>
  );
}
