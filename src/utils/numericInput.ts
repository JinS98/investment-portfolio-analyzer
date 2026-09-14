export function parseNumericInput(value: string): number {
  const normalized = value.replaceAll(',', '').trim();
  if (!normalized) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatNumericInput(value: string): string {
  let normalized = value.replaceAll(',', '').replaceAll(/[^\d.]/g, '');
  const firstDecimal = normalized.indexOf('.');
  if (firstDecimal >= 0)
    normalized =
      normalized.slice(0, firstDecimal + 1) +
      normalized.slice(firstDecimal + 1).replaceAll('.', '');
  const hasDecimal = normalized.includes('.');
  const [integer = '', fraction = ''] = normalized.split('.');
  const cleanInteger = integer.replace(/^0+(?=\d)/, '') || (hasDecimal ? '0' : '');
  const grouped = cleanInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hasDecimal ? `${grouped}.${fraction}` : grouped;
}
