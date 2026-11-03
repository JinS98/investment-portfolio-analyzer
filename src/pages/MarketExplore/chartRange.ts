/** Keep rows in the last calendar-day window ending at the latest trading date. */
export function recentCalendarDays<T>(rows: T[], dateOf: (row: T) => string, days = 30): T[] {
  const lastRow = rows.at(-1);
  const lastDate = lastRow ? dateOf(lastRow).slice(0, 10) : null;
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) return rows;
  const start = new Date(`${lastDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const firstDate = start.toISOString().slice(0, 10);
  return rows.filter((row) => {
    const date = dateOf(row).slice(0, 10);
    return date >= firstDate && date <= lastDate;
  });
}
