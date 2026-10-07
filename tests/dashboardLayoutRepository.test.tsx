import { describe, expect, it } from 'vitest';
import { createLocalDashboardLayoutRepository } from '../src/pages/Dashboard/layoutRepository';
import { DEFAULT_PANEL_ROWS, dashboardLayoutReducer } from '../src/pages/Dashboard/panelRegistry';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe('dashboard layout repository', () => {
  it('restores the old row layout and saves each page and account separately', () => {
    const storage = createStorage();
    const oldRows = dashboardLayoutReducer(DEFAULT_PANEL_ROWS, {
      type: 'move',
      source: 'manager',
      target: 'market',
      position: 'right',
    });
    storage.setItem('dashboard-panel-layout-v2', JSON.stringify(oldRows));
    const repository = createLocalDashboardLayoutRepository(storage);
    expect(repository.readBasic('dashboard', 'a')).toEqual(oldRows);
    const changed = dashboardLayoutReducer(oldRows, {
      type: 'move',
      source: 'allocation',
      target: 'market',
      position: 'before',
    });
    repository.saveBasic('dashboard', 'a', changed);
    expect(repository.readBasic('dashboard', 'a')).toEqual(changed);
    expect(repository.readBasic('analysis', 'a')).toEqual(oldRows);
    expect(repository.readBasic('dashboard', 'b')).toEqual(oldRows);
  });

  it('keeps free positions and sizes independent between pages', () => {
    const repository = createLocalDashboardLayoutRepository(createStorage());
    const dashboard = repository.readFree('dashboard', 'a', DEFAULT_PANEL_ROWS);
    const analysis = repository.readFree('analysis', 'a', DEFAULT_PANEL_ROWS);
    expect(dashboard.map((item) => item.i)).toEqual([
      'market',
      'accountValue',
      'profitAmount',
      'profitRate',
      'manager',
      'allocation',
    ]);
    expect(analysis.map((item) => item.i)).toEqual([
      'recurring',
      'performance',
      'history',
      'monthly',
      'guide',
    ]);
    repository.saveFree('dashboard', 'a', [
      { ...dashboard[0], h: dashboard[0].h + 2 },
      ...dashboard.slice(1).map((item) => ({ ...item, y: item.y + 2 })),
    ]);
    repository.saveMode('dashboard', 'a', 'free');
    expect(repository.readFree('dashboard', 'a', DEFAULT_PANEL_ROWS)[0].h).toBe(dashboard[0].h + 2);
    expect(repository.readFree('analysis', 'a', DEFAULT_PANEL_ROWS)).toEqual(analysis);
    expect(repository.readMode('dashboard', 'a')).toBe('free');
    expect(repository.readMode('analysis', 'a')).toBe('basic');
  });
});
