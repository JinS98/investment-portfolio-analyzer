export type DashboardView = 'dashboard' | 'analysis';
export type DropPosition = 'before' | 'after' | 'left' | 'right';
export interface PanelRow<PanelId extends string> {
  ids: PanelId[];
  /** Width of the first panel in a paired row, as a percentage. */
  split?: number;
}
export type LayoutAction<PanelId extends string> =
  | { type: 'move'; source: PanelId; target: PanelId; position: DropPosition }
  | { type: 'resize'; id: PanelId; split: number }
  | { type: 'reset' };

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;
const LAYOUT_KEY = 'dashboard-panel-layout-v2';
const LEGACY_ORDER_KEY = 'dashboard-panel-order';

const readJson = (storage: LayoutStorage, key: string): unknown => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

export const dropPosition = (
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
): DropPosition => {
  const vertical = (clientY - bounds.top) / bounds.height;
  if (vertical < 0.25) return 'before';
  if (vertical > 0.75) return 'after';
  return clientX > bounds.left + bounds.width / 2 ? 'right' : 'left';
};

export const splitFromPointer = (clientX: number, left: number, width: number): number =>
  Math.min(80, Math.max(20, ((clientX - left) / width) * 100));

export function createDashboardLayout<Registry extends Record<string, { view: DashboardView }>>(
  registry: Registry,
) {
  type PanelId = keyof Registry & string;
  type Row = PanelRow<PanelId>;
  type Action = LayoutAction<PanelId>;

  const DEFAULT_PANEL_ORDER = Object.keys(registry) as PanelId[];
  const DEFAULT_PANEL_ROWS: Row[] = DEFAULT_PANEL_ORDER.map((id) => ({ ids: [id] }));
  const isPanelId = (value: unknown): value is PanelId =>
    typeof value === 'string' && Object.hasOwn(registry, value);

  const isValidPanelRows = (value: unknown): value is Row[] => {
    if (!Array.isArray(value)) return false;
    const ids: PanelId[] = [];
    for (const row of value) {
      if (!row || typeof row !== 'object' || !Array.isArray(row.ids)) return false;
      if (row.ids.length < 1 || row.ids.length > 2 || !row.ids.every(isPanelId)) return false;
      if (
        row.ids.length === 2 &&
        row.split !== undefined &&
        (typeof row.split !== 'number' ||
          !Number.isFinite(row.split) ||
          row.split < 20 ||
          row.split > 80)
      ) {
        return false;
      }
      ids.push(...row.ids);
    }
    return ids.length === DEFAULT_PANEL_ORDER.length && new Set(ids).size === ids.length;
  };

  const isValidLegacyOrder = (value: unknown): value is PanelId[] =>
    Array.isArray(value) &&
    value.length === DEFAULT_PANEL_ORDER.length &&
    value.every(isPanelId) &&
    new Set(value).size === value.length;

  const readDashboardLayout = (storage?: LayoutStorage): Row[] => {
    if (!storage) return DEFAULT_PANEL_ROWS;
    try {
      const saved = readJson(storage, LAYOUT_KEY);
      if (isValidPanelRows(saved)) return saved;
      const legacyOrder = readJson(storage, LEGACY_ORDER_KEY);
      if (isValidLegacyOrder(legacyOrder)) return legacyOrder.map((id) => ({ ids: [id] }));
    } catch {
      // Storage access itself may be disabled.
    }
    return DEFAULT_PANEL_ROWS;
  };

  const saveDashboardLayout = (storage: LayoutStorage | undefined, rows: Row[]) => {
    try {
      storage?.setItem(LAYOUT_KEY, JSON.stringify(rows));
    } catch {
      // A blocked or full storage area does not prevent changing the current layout.
    }
  };

  const visiblePanelRows = (rows: Row[], view: DashboardView): Row[] =>
    rows
      .map((row) => ({ ...row, ids: row.ids.filter((id) => registry[id].view === view) }))
      .filter((row) => row.ids.length > 0);

  const panelGridPosition = (rows: Row[], id: PanelId) => {
    const rowIndex = rows.findIndex((row) => row.ids.includes(id));
    const row = rows[rowIndex];
    const itemIndex = row?.ids.indexOf(id) ?? 0;
    const split = row?.split ?? 50;
    return {
      gridRow: rowIndex + 1,
      gridColumn:
        row?.ids.length === 2
          ? itemIndex === 0
            ? `1 / ${Math.round(split * 10) + 1}`
            : `${Math.round(split * 10) + 1} / -1`
          : '1 / -1',
    };
  };

  const dashboardLayoutReducer = (rows: Row[], action: Action): Row[] => {
    if (action.type === 'reset') return DEFAULT_PANEL_ROWS;
    if (action.type === 'resize') {
      if (!Number.isFinite(action.split)) return rows;
      const split = Math.min(80, Math.max(20, action.split));
      return rows.map((row) =>
        row.ids[0] === action.id && row.ids.length === 2 ? { ...row, split } : row,
      );
    }
    const { source, target, position } = action;
    if (source === target || !rows.some((row) => row.ids.includes(source))) return rows;

    const sourceRow = rows.find((row) => row.ids.includes(source));
    const wasPairedWithTarget = sourceRow?.ids.length === 2 && sourceRow.ids.includes(target);
    const next = rows
      .map((row) => ({ ...row, ids: row.ids.filter((id) => id !== source) }))
      .filter((row) => row.ids.length > 0);
    const targetIndex = next.findIndex((row) => row.ids.includes(target));
    if (targetIndex < 0) return rows;

    const targetRow = next[targetIndex];
    if (position === 'before' || position === 'after') {
      next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, { ids: [source] });
    } else if (wasPairedWithTarget) {
      next.splice(targetIndex + (position === 'right' ? 1 : 0), 0, { ids: [source] });
    } else if (targetRow.ids.length === 1) {
      targetRow.ids = position === 'right' ? [target, source] : [source, target];
      targetRow.split = 50;
    } else {
      next.splice(targetIndex + (position === 'right' ? 1 : 0), 0, { ids: [source] });
    }
    return next;
  };

  return {
    DEFAULT_PANEL_ORDER,
    DEFAULT_PANEL_ROWS,
    dashboardLayoutReducer,
    isValidPanelRows,
    panelGridPosition,
    readDashboardLayout,
    saveDashboardLayout,
    visiblePanelRows,
  };
}
