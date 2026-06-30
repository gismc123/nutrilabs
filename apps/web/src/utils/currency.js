export function centsToDisplay(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function dollarsToCents(dollars) {
  return Math.round(parseFloat(dollars) * 100);
}

export function formatBudgetProgress(spent, total) {
  const percent = total > 0 ? Math.round((spent / total) * 100) : 0;
  const label = `${centsToDisplay(spent)} / ${centsToDisplay(total)}`;
  let colorClass = 'text-primary-600';
  if (percent >= 90) colorClass = 'text-danger-600';
  else if (percent >= 70) colorClass = 'text-accent-600';
  return { percent, label, colorClass };
}
