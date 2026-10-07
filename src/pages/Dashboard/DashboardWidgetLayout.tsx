import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, PointerEvent, RefObject } from 'react';
import { PortfolioManager, PortfolioSummaryMetric } from '@features/portfolio-management';
import {
  dropPosition,
  layoutFromRows,
  positionWidget,
  splitFromPointer,
  type DashboardView,
  type PanelRow,
  type WidgetLayoutItem,
} from '@features/dashboard-layout';
import {
  DEFAULT_PANEL_ROWS,
  PANEL_REGISTRY,
  WIDGET_SIZES,
  dashboardLayoutReducer,
  freeWidgetRows,
  panelGridPosition,
  visiblePanelRows,
  widgetTitle,
  type DashboardPanelContext,
  type PanelId,
  type WidgetId,
} from './panelRegistry';
import { browserDashboardLayoutRepository, type LayoutMode } from './layoutRepository';
import styles from './Dashboard.module.scss';

interface DashboardWidgetLayoutProps {
  view: DashboardView;
  userId?: string;
  context: DashboardPanelContext;
  recurringPanelRef: RefObject<HTMLDivElement | null>;
  locked: boolean;
}

const WidgetContent = memo(function WidgetContent({
  id,
  context,
  mode,
}: {
  id: WidgetId;
  context: DashboardPanelContext;
  mode: LayoutMode;
}) {
  if (id === 'accountValue' || id === 'profitAmount' || id === 'profitRate') {
    return (
      <PortfolioSummaryMetric
        metric={id}
        viewModel={context.summaryViewModel}
        displayCurrency={context.summaryCurrency}
      />
    );
  }
  if (id === 'manager' && mode === 'free')
    return <PortfolioManager portfolioType="REAL" hideSummaryCards />;
  return PANEL_REGISTRY[id].render(context);
});

export function DashboardWidgetLayout({
  view,
  userId,
  context,
  recurringPanelRef,
  locked,
}: DashboardWidgetLayoutProps) {
  const repository = useMemo(() => browserDashboardLayoutRepository(), []);
  const [basicRows, setBasicRows] = useState(() => repository.readBasic(view, userId));
  const [freeItems, setFreeItems] = useState(() => repository.readFree(view, userId, basicRows));
  const [mode, setMode] = useState<LayoutMode>(() => repository.readMode(view, userId));
  const [editing, setEditing] = useState(false);
  const [basicPreview, setBasicPreview] = useState<PanelRow<PanelId>[] | null>(null);
  const [freePreview, setFreePreview] = useState<WidgetLayoutItem<WidgetId>[] | null>(null);
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const interactionCleanup = useRef<(() => void) | null>(null);
  const shownRows = visiblePanelRows(basicPreview ?? basicRows, view);
  const displayedFree = freePreview ?? freeItems;
  const orderedIds =
    mode === 'basic'
      ? shownRows.flatMap((row) => row.ids)
      : [...displayedFree].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.i);

  useEffect(
    () => repository.saveBasic(view, userId, basicRows),
    [basicRows, repository, userId, view],
  );
  useEffect(() => {
    if (mode === 'free') repository.saveFree(view, userId, freeItems);
  }, [freeItems, mode, repository, userId, view]);
  useEffect(() => repository.saveMode(view, userId, mode), [mode, repository, userId, view]);
  useEffect(() => () => interactionCleanup.current?.(), []);

  const changeMode = (next: LayoutMode) => {
    if (next === mode) return;
    if (next === 'free')
      setFreeItems(repository.readFree(view, userId, visiblePanelRows(basicRows, view)));
    setMode(next);
  };

  const resetLayout = () => {
    setBasicRows(DEFAULT_PANEL_ROWS);
    const defaults = layoutFromRows(freeWidgetRows(DEFAULT_PANEL_ROWS, view), WIDGET_SIZES);
    setFreeItems(defaults);
    repository.saveFree(view, userId, defaults);
    setBasicPreview(null);
    setFreePreview(null);
    setMode('basic');
  };

  const startBasicResize = (id: PanelId, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = gridRef.current?.getBoundingClientRect();
    if (!bounds) return;
    let latest: PanelRow<PanelId>[] | null = null;
    const move = (pointer: globalThis.PointerEvent) => {
      latest = dashboardLayoutReducer(basicRows, {
        type: 'resize',
        id,
        split: splitFromPointer(pointer.clientX, bounds.left, bounds.width),
      });
      setBasicPreview(latest);
    };
    const finish = () => {
      if (latest) setBasicRows(latest);
      setBasicPreview(null);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      interactionCleanup.current = null;
    };
    interactionCleanup.current?.();
    interactionCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const startFreeInteraction = (
    id: WidgetId,
    kind: 'move' | 'resize',
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (window.matchMedia('(max-width: 1000px)').matches) return;
    const bounds = gridRef.current?.getBoundingClientRect();
    const item = freeItems.find((entry) => entry.i === id);
    if (!bounds || !item) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const columnStep = (bounds.width - 11 * 8) / 12 + 8;
    const rowStep = 40;
    let latest: WidgetLayoutItem<WidgetId>[] | null = null;
    let lastStep = '';
    setDraggingId(id);
    const move = (pointer: globalThis.PointerEvent) => {
      const dx = Math.round((pointer.clientX - startX) / columnStep);
      const dy = Math.round((pointer.clientY - startY) / rowStep);
      const step = `${dx}:${dy}`;
      if (step === lastStep) return;
      lastStep = step;
      latest = positionWidget(
        freeItems,
        id,
        kind === 'move' ? { x: item.x + dx, y: item.y + dy } : { w: item.w + dx, h: item.h + dy },
      );
      setFreePreview(latest);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      interactionCleanup.current = null;
      setFreePreview(null);
      setDraggingId(null);
    };
    const finish = () => {
      if (latest) setFreeItems(latest);
      cleanup();
    };
    const cancel = () => cleanup();
    interactionCleanup.current?.();
    interactionCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  };

  const basicDrop = (target: PanelId, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const source = event.dataTransfer.getData('text/plain') as PanelId;
    if (source !== target && Object.hasOwn(PANEL_REGISTRY, source)) {
      setBasicRows((rows) =>
        dashboardLayoutReducer(rows, {
          type: 'move',
          source,
          target,
          position: dropPosition(
            event.clientX,
            event.clientY,
            event.currentTarget.getBoundingClientRect(),
          ),
        }),
      );
    }
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <>
      <div className={`${styles.layoutToolbar} ${editing ? styles.editingToolbar : ''}`}>
        {editing && !locked ? (
          <div className={styles.editControls}>
            <span className={styles.editStatus}>레이아웃 편집 중</span>
            <button
              type="button"
              className={mode === 'basic' ? styles.selectedMode : ''}
              onClick={() => changeMode('basic')}
              aria-pressed={mode === 'basic'}
            >
              기본 배치
            </button>
            <button
              type="button"
              className={mode === 'free' ? styles.selectedMode : ''}
              onClick={() => changeMode('free')}
              aria-pressed={mode === 'free'}
            >
              자유 배치
            </button>
            <button type="button" onClick={resetLayout}>
              기본값 초기화
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.editToggle}
          onClick={() => setEditing((current) => !current)}
          disabled={locked}
        >
          {editing ? '편집 완료' : '레이아웃 편집'}
        </button>
      </div>
      {editing ? (
        <p className={styles.mobileLayoutNotice}>
          위젯 위치와 크기는 큰 화면에서 편집할 수 있습니다.
        </p>
      ) : null}
      <div
        ref={gridRef}
        className={`${styles.componentGrid} ${mode === 'free' ? styles.freeGrid : ''} ${editing ? styles.editingGrid : ''} ${locked ? styles.analysisLockedContent : ''}`}
      >
        {orderedIds.map((id) => {
          const item = displayedFree.find((entry) => entry.i === id);
          const paired = shownRows.find((row) => row.ids.includes(id as PanelId));
          const pairClass =
            paired?.ids.length === 2
              ? paired.ids[0] === id
                ? styles.pairedFirst
                : styles.pairedSecond
              : '';
          const position: CSSProperties =
            mode === 'free' && item
              ? {
                  gridColumn: `${item.x + 1} / span ${item.w}`,
                  gridRow: `${item.y + 1} / span ${item.h}`,
                }
              : panelGridPosition(shownRows, id as PanelId);
          return (
            <div
              key={id}
              ref={id === 'recurring' ? recurringPanelRef : undefined}
              className={`${styles.panelItem} ${mode === 'basic' ? pairClass : ''} ${draggingId === id ? styles.panelDragging : ''} ${dropTarget === id ? styles.dropTarget : ''}`}
              style={position}
              onDragOver={
                editing && mode === 'basic'
                  ? (event) => {
                      event.preventDefault();
                      setDropTarget(id as PanelId);
                    }
                  : undefined
              }
              onDragLeave={editing && mode === 'basic' ? () => setDropTarget(null) : undefined}
              onDrop={
                editing && mode === 'basic' ? (event) => basicDrop(id as PanelId, event) : undefined
              }
            >
              {editing ? (
                <button
                  type="button"
                  className={styles.dragHandle}
                  aria-label={`${widgetTitle(id)} 이동`}
                  title={`${widgetTitle(id)} 이동`}
                  draggable={mode === 'basic'}
                  onDragStart={
                    mode === 'basic'
                      ? (event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', id);
                          setDraggingId(id);
                        }
                      : undefined
                  }
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  onPointerDown={
                    mode === 'free' ? (event) => startFreeInteraction(id, 'move', event) : undefined
                  }
                >
                  ⠿
                </button>
              ) : null}
              {editing && mode === 'basic' && paired?.ids[0] === id && paired.ids.length === 2 ? (
                <button
                  type="button"
                  className={styles.resizeHandle}
                  aria-label="같은 행 패널의 너비 조절"
                  onPointerDown={(event) => startBasicResize(id, event)}
                />
              ) : null}
              <div className={styles.widgetContent}>
                <WidgetContent id={id} context={context} mode={mode} />
              </div>
              {editing && mode === 'free' ? (
                <button
                  type="button"
                  className={styles.cornerResizeHandle}
                  aria-label={`${widgetTitle(id)} 크기 조절`}
                  title="가로와 세로 크기 조절"
                  onPointerDown={(event) => startFreeInteraction(id, 'resize', event)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
