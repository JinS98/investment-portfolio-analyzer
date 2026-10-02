import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PANEL_ORDER,
  DEFAULT_PANEL_ROWS,
  dashboardLayoutReducer,
  dropPosition,
  isValidPanelRows,
  panelGridPosition,
  readDashboardLayout,
  saveDashboardLayout,
  splitFromPointer,
  visiblePanelRows,
} from '../src/features/dashboard-layout/model/dashboardLayout.ts';

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

test('dashboard layout moves panels into pairs and separates a dropped pair', () => {
  const paired = dashboardLayoutReducer(DEFAULT_PANEL_ROWS, {
    type: 'move',
    source: 'manager',
    target: 'market',
    position: 'right',
  });
  assert.deepEqual(paired[0], { ids: ['market', 'manager'], split: 50 });
  assert.equal(isValidPanelRows(paired), true);
  assert.deepEqual(DEFAULT_PANEL_ROWS[0], { ids: ['market'] });

  const separated = dashboardLayoutReducer(paired, {
    type: 'move',
    source: 'manager',
    target: 'market',
    position: 'left',
  });
  assert.deepEqual(separated.slice(0, 2), [{ ids: ['manager'] }, { ids: ['market'], split: 50 }]);
  assert.equal(isValidPanelRows(separated), true);
});

test('dashboard layout keeps no more than two panels per row and clamps split', () => {
  const paired = dashboardLayoutReducer(DEFAULT_PANEL_ROWS, {
    type: 'move',
    source: 'manager',
    target: 'market',
    position: 'right',
  });
  const moved = dashboardLayoutReducer(paired, {
    type: 'move',
    source: 'allocation',
    target: 'market',
    position: 'left',
  });
  assert.deepEqual(
    moved.slice(0, 2).map((row) => row.ids),
    [['allocation'], ['market', 'manager']],
  );
  assert.deepEqual(
    dashboardLayoutReducer(paired, { type: 'resize', id: 'market', split: 100 })[0],
    { ids: ['market', 'manager'], split: 80 },
  );
  assert.equal(splitFromPointer(-5, 0, 100), 20);
  assert.equal(splitFromPointer(45, 0, 100), 45);
  assert.equal(dropPosition(10, 5, { left: 0, top: 0, width: 100, height: 100 }), 'before');
  assert.equal(dropPosition(90, 50, { left: 0, top: 0, width: 100, height: 100 }), 'right');
  assert.deepEqual(panelGridPosition(paired, 'manager'), { gridRow: 1, gridColumn: '501 / -1' });
  assert.deepEqual(visiblePanelRows(paired, 'analysis')[0].ids, ['recurring']);
});

test('dashboard layout restores v2 and migrates the legacy order', () => {
  const paired = dashboardLayoutReducer(DEFAULT_PANEL_ROWS, {
    type: 'move',
    source: 'manager',
    target: 'market',
    position: 'right',
  });
  const storage = createStorage();
  saveDashboardLayout(storage, paired);
  assert.deepEqual(readDashboardLayout(storage), paired);

  const reversed = [...DEFAULT_PANEL_ORDER].reverse();
  const legacy = createStorage({
    'dashboard-panel-layout-v2': '{broken',
    'dashboard-panel-order': JSON.stringify(reversed),
  });
  assert.deepEqual(
    readDashboardLayout(legacy),
    reversed.map((id) => ({ ids: [id] })),
  );
  assert.deepEqual(
    readDashboardLayout(createStorage({ 'dashboard-panel-order': JSON.stringify(reversed) })),
    reversed.map((id) => ({ ids: [id] })),
  );
});

test('dashboard layout rejects duplicate, unknown, and malformed saved panels', () => {
  assert.equal(isValidPanelRows([...DEFAULT_PANEL_ROWS.slice(0, -1), { ids: ['market'] }]), false);
  assert.equal(isValidPanelRows([...DEFAULT_PANEL_ROWS.slice(0, -1), { ids: ['unknown'] }]), false);
  assert.equal(
    isValidPanelRows([{ ids: ['market', 'manager'], split: 500 }, ...DEFAULT_PANEL_ROWS.slice(2)]),
    false,
  );
  assert.deepEqual(
    readDashboardLayout(
      createStorage({ 'dashboard-panel-layout-v2': JSON.stringify([{ ids: ['market'] }]) }),
    ),
    DEFAULT_PANEL_ROWS,
  );
});
