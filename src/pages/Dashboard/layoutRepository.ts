import {
  isValidWidgetLayout,
  layoutFromRows,
  type DashboardView,
  type PanelRow,
  type WidgetLayoutItem,
} from '@features/dashboard-layout';
import {
  PANEL_REGISTRY,
  SUMMARY_WIDGETS,
  WIDGET_SIZES,
  freeWidgetRows,
  isValidPanelRows,
  readDashboardLayout,
  type PanelId,
  type WidgetId,
} from './panelRegistry';

export type LayoutMode = 'basic' | 'free';
type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The UI depends on this contract; an account API can replace the local implementation. */
export interface DashboardLayoutRepository {
  readMode(view: DashboardView, userId?: string): LayoutMode;
  saveMode(view: DashboardView, userId: string | undefined, mode: LayoutMode): void;
  readBasic(view: DashboardView, userId?: string): PanelRow<PanelId>[];
  saveBasic(view: DashboardView, userId: string | undefined, rows: PanelRow<PanelId>[]): void;
  readFree(
    view: DashboardView,
    userId: string | undefined,
    rows: PanelRow<PanelId>[],
  ): WidgetLayoutItem<WidgetId>[];
  saveFree(
    view: DashboardView,
    userId: string | undefined,
    items: WidgetLayoutItem<WidgetId>[],
  ): void;
}

const storageKey = (view: DashboardView, userId: string | undefined, kind: string) =>
  `dashboard-layout-v3:${userId ?? 'guest'}:${view}:${kind}`;

export function createLocalDashboardLayoutRepository(
  storage?: LayoutStorage,
): DashboardLayoutRepository {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage failures do not prevent editing the in-memory layout.
    }
  };
  return {
    readMode: (view, userId) =>
      read(storageKey(view, userId, 'mode')) === 'free' ? 'free' : 'basic',
    saveMode: (view, userId, mode) => write(storageKey(view, userId, 'mode'), mode),
    readBasic: (view, userId) => {
      const saved = read(storageKey(view, userId, 'basic'));
      if (isValidPanelRows(saved)) return saved;
      // Preserve the existing v2 layout when a user first opens the new editor.
      return readDashboardLayout(storage);
    },
    saveBasic: (view, userId, rows) => write(storageKey(view, userId, 'basic'), rows),
    readFree: (view, userId, rows) => {
      const visibleRows = freeWidgetRows(rows, view);
      const ids = [
        ...Object.keys(PANEL_REGISTRY).filter((id) => PANEL_REGISTRY[id as PanelId].view === view),
        ...(view === 'dashboard' ? Object.keys(SUMMARY_WIDGETS) : []),
      ] as WidgetId[];
      const saved = read(storageKey(view, userId, 'free'));
      return isValidWidgetLayout(saved, ids, WIDGET_SIZES)
        ? saved.map((item) => ({ ...item, ...WIDGET_SIZES[item.i] }))
        : layoutFromRows(visibleRows, WIDGET_SIZES);
    },
    saveFree: (view, userId, items) => write(storageKey(view, userId, 'free'), items),
  };
}

export function browserDashboardLayoutRepository(): DashboardLayoutRepository {
  try {
    return createLocalDashboardLayoutRepository(window.localStorage);
  } catch {
    return createLocalDashboardLayoutRepository();
  }
}
