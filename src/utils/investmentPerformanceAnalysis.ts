export type PerformanceRange = '1M' | '3M' | '6M' | 'ALL';
export interface ValuePoint { date: string; value: number; }
export interface ReturnPoint extends ValuePoint { returnRate: number; }
export interface PerformanceMetrics { highestValue: number; lowestValue: number; maxDrawdown: number; }
export interface CashFlowPoint { date: string; amount: number; }

const rangeMonths: Record<Exclude<PerformanceRange, 'ALL'>, number> = { '1M': 1, '3M': 3, '6M': 6 };

export function selectPerformanceRange(points: ValuePoint[], range: PerformanceRange): ValuePoint[] {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  if (range === 'ALL' || !sorted.length) return sorted;
  const latest = new Date(`${sorted.at(-1)!.date}T00:00:00Z`);
  latest.setUTCMonth(latest.getUTCMonth() - rangeMonths[range]);
  const cutoff = latest.toISOString().slice(0, 10);
  return sorted.filter((point) => point.date >= cutoff);
}

export function normalizePerformance(points: ValuePoint[]): ReturnPoint[] {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const baseValue = sorted[0]?.value ?? 0;
  return sorted.map((point) => ({ ...point, returnRate: baseValue > 0 ? ((point.value - baseValue) / baseValue) * 100 : 0 }));
}

export function calculateTimeWeightedPerformance(
  points: ValuePoint[],
  cashFlows: CashFlowPoint[],
): ReturnPoint[] {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  if (!sorted.length) return [];
  const sortedCashFlows = [...cashFlows].sort((left, right) => left.date.localeCompare(right.date));
  let cashFlowIndex = 0;
  while (sortedCashFlows[cashFlowIndex]?.date <= sorted[0].date) cashFlowIndex += 1;
  let growth = 1;

  return sorted.map((point, index) => {
    if (index > 0) {
      const previous = sorted[index - 1];
      let flow = 0;
      while (sortedCashFlows[cashFlowIndex]?.date <= point.date) {
        if (sortedCashFlows[cashFlowIndex].date > previous.date) flow += sortedCashFlows[cashFlowIndex].amount;
        cashFlowIndex += 1;
      }
      if (previous.value > 0) growth *= 1 + (point.value - flow - previous.value) / previous.value;
    }
    return { ...point, returnRate: (growth - 1) * 100 };
  });
}

export function calculateMaxDrawdown(points: ReturnPoint[]): number {
  if (!points.length) return 0;
  let peak = 100 + points[0].returnRate;
  let maxDrawdown = 0;
  points.forEach((point) => {
    const value = 100 + point.returnRate;
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((value - peak) / peak) * 100);
  });
  return maxDrawdown;
}

export function calculatePerformanceMetrics(points: ValuePoint[]): PerformanceMetrics | null {
  if (!points.length) return null;
  let peak = points[0].value;
  let maxDrawdown = 0;
  let highestValue = points[0].value;
  let lowestValue = points[0].value;
  points.forEach((point) => {
    peak = Math.max(peak, point.value);
    highestValue = Math.max(highestValue, point.value);
    lowestValue = Math.min(lowestValue, point.value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((point.value - peak) / peak) * 100);
  });
  return { highestValue, lowestValue, maxDrawdown };
}

export function commonStartDate(series: ValuePoint[][]): string | null {
  const starts = series.filter((points) => points.length).map((points) => points[0].date);
  return starts.length ? starts.sort().at(-1)! : null;
}
