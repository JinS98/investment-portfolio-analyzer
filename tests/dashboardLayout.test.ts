import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDashboardLayout,
  dropPosition,
  splitFromPointer,
} from '../src/features/dashboard-layout/model/dashboardLayout.ts';
import {
  dropWidgetOnRow,
  isValidWidgetLayout,
  layoutFromRows,
  packWidgetRows,
  positionWidget,
} from '../src/features/dashboard-layout/model/freeWidgetLayout.ts';

const {
  DEFAULT_PANEL_ORDER,
  DEFAULT_PANEL_ROWS,
  dashboardLayoutReducer,
  isValidPanelRows,
  panelGridPosition,
  readDashboardLayout,
  saveDashboardLayout,
  visiblePanelRows,
} = createDashboardLayout({
  market: { view: 'dashboard' },
  manager: { view: 'dashboard' },
  allocation: { view: 'dashboard' },
  recurring: { view: 'analysis' },
  performance: { view: 'analysis' },
  history: { view: 'analysis' },
  monthly: { view: 'analysis' },
  guide: { view: 'analysis' },
});

test('free drops reorder complete rows without a blank first row', () => {
  const sizes = {
    first: { minW: 4, minH: 2, defaultH: 8 },
    second: { minW: 4, minH: 2, defaultH: 12 },
    third: { minW: 4, minH: 2, defaultH: 6 },
  };
  const initial = layoutFromRows(
    [{ ids: ['first'] }, { ids: ['second'] }, { ids: ['third'] }],
    sizes,
  );
  const before = dropWidgetOnRow(initial, 'second', 'first', 'before');
  assert.deepEqual(
    [...before].sort((a, b) => a.y - b.y).map(({ i, y }) => ({ i, y })),
    [
      { i: 'second', y: 0 },
      { i: 'first', y: 12 },
      { i: 'third', y: 20 },
    ],
  );
  assert.equal(isValidWidgetLayout(before, Object.keys(sizes), sizes), true);

  const after = dropWidgetOnRow(initial, 'first', 'second', 'after');
  assert.deepEqual(
    [...after].sort((a, b) => a.y - b.y).map(({ i, y }) => ({ i, y })),
    [
      { i: 'second', y: 0 },
      { i: 'first', y: 12 },
      { i: 'third', y: 20 },
    ],
  );

  const paired = dropWidgetOnRow(initial, 'second', 'first', 'right');
  assert.deepEqual(
    paired.map(({ i, x, y, w }) => ({ i, x, y, w })),
    [
      { i: 'first', x: 0, y: 0, w: 6 },
      { i: 'second', x: 6, y: 0, w: 6 },
      { i: 'third', x: 0, y: 12, w: 12 },
    ],
  );
  assert.equal(isValidWidgetLayout(paired, Object.keys(sizes), sizes), true);

  const trio = dropWidgetOnRow(paired, 'third', 'first', 'right');
  assert.deepEqual(
    [...trio].sort((a, b) => a.x - b.x).map(({ i, x, y, w }) => ({ i, x, y, w })),
    [
      { i: 'first', x: 0, y: 0, w: 4 },
      { i: 'third', x: 4, y: 0, w: 4 },
      { i: 'second', x: 8, y: 0, w: 4 },
    ],
  );
  assert.equal(isValidWidgetLayout(trio, Object.keys(sizes), sizes), true);

  const fourth = { i: 'fourth', x: 0, y: 12, w: 12, h: 5, minW: 4, minH: 2, defaultH: 5 };
  const fullRowDrop = dropWidgetOnRow([...trio, fourth], 'fourth', 'second', 'right');
  assert.deepEqual(
    [...fullRowDrop]
      .filter((item) => item.y === 0)
      .sort((a, b) => a.x - b.x)
      .map(({ i, w }) => ({ i, w })),
    [
      { i: 'third', w: 4 },
      { i: 'second', w: 4 },
      { i: 'fourth', w: 4 },
    ],
  );
  assert.equal(fullRowDrop.find((item) => item.i === 'first')?.y, 12);
  assert.equal(
    isValidWidgetLayout(fullRowDrop, [...Object.keys(sizes), 'fourth'], { ...sizes, fourth }),
    true,
  );

  const taller = packWidgetRows(
    paired.map((item) => (item.i === 'first' ? { ...item, h: 18 } : item)),
  );
  assert.equal(taller.find((item) => item.i === 'third')?.y, 18);

  const unevenPair = initial.map((item) =>
    item.i === 'first'
      ? { ...item, x: 0, w: 8 }
      : item.i === 'second'
        ? { ...item, x: 8, y: 0, w: 4 }
        : { ...item, y: 12 },
  );
  const keepPair = dropWidgetOnRow(unevenPair, 'third', 'first', 'before');
  assert.equal(keepPair.find((item) => item.i === 'first')?.w, 8);
  assert.equal(keepPair.find((item) => item.i === 'second')?.x, 8);
  assert.equal(isValidWidgetLayout(keepPair, Object.keys(sizes), sizes), true);
});

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

test('a newly registered panel joins the default layout and its destination view', () => {
  const layout = createDashboardLayout({
    market: { view: 'dashboard' },
    news: { view: 'analysis' },
  });
  assert.deepEqual(layout.DEFAULT_PANEL_ORDER, ['market', 'news']);
  assert.deepEqual(layout.visiblePanelRows(layout.DEFAULT_PANEL_ROWS, 'analysis'), [
    { ids: ['news'] },
  ]);
});

test('free layout migrates paired rows and moves or resizes without overlaps', () => {
  const sizes = {
    market: { minW: 4, minH: 5, defaultH: 8 },
    manager: { minW: 6, minH: 8, defaultH: 12 },
    allocation: { minW: 4, minH: 5, defaultH: 8 },
  };
  const rows = [{ ids: ['market', 'manager'], split: 50 }, { ids: ['allocation'] }] as const;
  const initial = layoutFromRows(
    rows.map((row) => ({ ids: [...row.ids], ...('split' in row ? { split: row.split } : {}) })),
    sizes,
  );
  assert.equal(isValidWidgetLayout(initial, ['market', 'manager', 'allocation'], sizes), true);
  assert.deepEqual(
    initial.map(({ i, x, y, w }) => ({ i, x, y, w })),
    [
      { i: 'market', x: 0, y: 0, w: 6 },
      { i: 'manager', x: 6, y: 0, w: 6 },
      { i: 'allocation', x: 0, y: 12, w: 12 },
    ],
  );
  const resized = positionWidget(initial, 'market', { w: 9, h: 10 });
  assert.equal(resized.find((item) => item.i === 'market')?.w, 9);
  assert.equal(resized.find((item) => item.i === 'manager')?.y, 10);
  assert.equal(isValidWidgetLayout(resized, ['market', 'manager', 'allocation'], sizes), true);
  const moved = positionWidget(resized, 'allocation', { x: 0, y: 0, w: 4 });
  assert.equal(isValidWidgetLayout(moved, ['market', 'manager', 'allocation'], sizes), true);
  assert.equal(positionWidget(initial, 'manager', { w: 1 })[1].w, 6);
  assert.equal(
    isValidWidgetLayout(
      [{ ...initial[0], x: 11 }, ...initial.slice(1)],
      ['market', 'manager', 'allocation'],
      sizes,
    ),
    false,
  );
});
