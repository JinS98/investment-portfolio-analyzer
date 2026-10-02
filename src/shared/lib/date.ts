export function formatShortDateTime(value: number | Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}
