import type { PanelRow } from './dashboardLayout';

export const WIDGET_COLUMNS = 12;

export interface WidgetSize {
  minW: number;
  minH: number;
  defaultH: number;
  maxW?: number;
  maxH?: number;
}

export interface WidgetLayoutItem<Id extends string = string> extends WidgetSize {
  i: Id;
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: WidgetLayoutItem, b: WidgetLayoutItem) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function layoutFromRows<Id extends string>(
  rows: PanelRow<Id>[],
  sizes: Record<Id, WidgetSize>,
): WidgetLayoutItem<Id>[] {
  let y = 0;
  return rows.flatMap((row) => {
    const first = row.ids[0];
    if (!first) return [];
    const firstWidth =
      row.ids.length === 2
        ? clamp(
            Math.round(((row.split ?? 50) / 100) * WIDGET_COLUMNS),
            sizes[first].minW,
            WIDGET_COLUMNS - sizes[row.ids[1]!].minW,
          )
        : WIDGET_COLUMNS;
    const items = row.ids.map((id, index) => {
      const size = sizes[id];
      return {
        i: id,
        x: index === 0 ? 0 : firstWidth,
        y,
        w: index === 0 ? firstWidth : WIDGET_COLUMNS - firstWidth,
        h: size.defaultH,
        ...size,
      };
    });
    const rowHeight = Math.max(...items.map((item) => item.h));
    y += rowHeight;
    return items;
  });
}

export function isValidWidgetLayout<Id extends string>(
  value: unknown,
  ids: Id[],
  sizes: Record<Id, WidgetSize>,
): value is WidgetLayoutItem<Id>[] {
  if (!Array.isArray(value) || value.length !== ids.length) return false;
  const expected = new Set(ids);
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.i !== 'string') return false;
    if (!expected.has(item.i as Id) || seen.has(item.i)) return false;
    seen.add(item.i);
    const size = sizes[item.i as Id];
    if (!size) return false;
    for (const key of ['x', 'y', 'w', 'h'] as const) {
      if (!Number.isInteger(item[key])) return false;
    }
    if (
      item.x < 0 ||
      item.y < 0 ||
      item.y > 1000 ||
      item.w < size.minW ||
      item.h < size.minH ||
      item.w > (size.maxW ?? WIDGET_COLUMNS) ||
      item.h > (size.maxH ?? 1000) ||
      item.x + item.w > WIDGET_COLUMNS
    )
      return false;
  }
  return value.every((item, index) =>
    value.slice(index + 1).every((other) => !overlaps(item, other)),
  );
}

export function positionWidget<Id extends string>(
  layout: WidgetLayoutItem<Id>[],
  id: Id,
  change: Partial<Pick<WidgetLayoutItem, 'x' | 'y' | 'w' | 'h'>>,
): WidgetLayoutItem<Id>[] {
  const current = layout.find((item) => item.i === id);
  if (!current) return layout;
  const w = clamp(change.w ?? current.w, current.minW, current.maxW ?? WIDGET_COLUMNS);
  const h = clamp(change.h ?? current.h, current.minH, current.maxH ?? 1000);
  const selected = {
    ...current,
    w,
    h,
    x: clamp(change.x ?? current.x, 0, WIDGET_COLUMNS - w),
    y: clamp(change.y ?? current.y, 0, 1000),
  };
  const placed: WidgetLayoutItem<Id>[] = [selected];
  for (const item of layout
    .filter((candidate) => candidate.i !== id)
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    let next = { ...item };
    let collision = placed.find((other) => overlaps(next, other));
    while (collision) {
      next = { ...next, y: collision.y + collision.h };
      collision = placed.find((other) => overlaps(next, other));
    }
    placed.push(next);
  }
  return layout.map((item) => placed.find((placedItem) => placedItem.i === item.i)!);
}
