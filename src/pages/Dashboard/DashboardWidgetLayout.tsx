import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, PointerEvent, RefObject } from 'react';
import { PortfolioSummaryMetric } from '@features/portfolio-management';
import {
  dropWidgetOnRow,
  dropPosition,
  layoutFromRows,
  packWidgetRows,
  positionWidget,
  splitFromPointer,
  type DashboardView,
  type DropPosition,
  type PanelRow,
  type WidgetLayoutItem,
} from '@features/dashboard-layout';
import {
  DEFAULT_PANEL_ROWS,
  PANEL_REGISTRY,
  SUMMARY_WIDGETS,
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
  editing: boolean;
}

const WidgetContent = memo(function WidgetContent({
  id,
  context,
}: {
  id: WidgetId;
  context: DashboardPanelContext;
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
  return PANEL_REGISTRY[id].render(context);
});

const FREE_DRAG_INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, label, [contenteditable="true"], [role="button"], [role="dialog"], [role="menu"], [role="listbox"], [data-no-drag]';

export function DashboardWidgetLayout({
  view,
  userId,
  context,
  recurringPanelRef,
  locked,
  editing,
}: DashboardWidgetLayoutProps) {
  const repository = useMemo(() => browserDashboardLayoutRepository(), []);
  const [basicRows, setBasicRows] = useState(() => repository.readBasic(view, userId));
  const [freeItems, setFreeItems] = useState(() => repository.readFree(view, userId, basicRows));
  const [mode, setMode] = useState<LayoutMode>(() => repository.readMode(view, userId));
  const [basicPreview, setBasicPreview] = useState<PanelRow<PanelId>[] | null>(null);
  const [freePreview, setFreePreview] = useState<WidgetLayoutItem<WidgetId>[] | null>(null);
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  const [freeDropTarget, setFreeDropTarget] = useState<{
    id: WidgetId;
    position: DropPosition;
    columns: number;
    x: number;
    y: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const managerContentRef = useRef<HTMLDivElement>(null);
  const allocationContentRef = useRef<HTMLDivElement>(null);
  const interactionCleanup = useRef<(() => void) | null>(null);
  const shownRows = visiblePanelRows(basicPreview ?? basicRows, view);
  const displayedFree = freePreview ?? freeItems;
  const freeRowHeights = new Map<number, number>();
  for (const item of displayedFree) {
    freeRowHeights.set(item.y, Math.max(freeRowHeights.get(item.y) ?? 0, item.h));
  }
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

  useEffect(() => {
    if (mode !== 'free' || view !== 'dashboard') return;
    const observers: ResizeObserver[] = [];
    for (const [id, ref] of [
      ['manager', managerContentRef],
      ['allocation', allocationContentRef],
    ] as const) {
      const content = ref.current?.firstElementChild;
      if (!(content instanceof HTMLElement)) continue;
      const syncHeight = () => {
        const height = Math.max(content.getBoundingClientRect().height, content.scrollHeight);
        if (height <= 0) return;
        const rows = Math.min(
          WIDGET_SIZES[id].maxH ?? 1000,
          Math.max(WIDGET_SIZES[id].minH, Math.ceil((height + 8) / 40)),
        );
        setFreeItems((current) => {
          const item = current.find((entry) => entry.i === id);
          if (!item || item.h === rows) return current;
          return packWidgetRows(
            current.map((entry) => (entry.i === id ? { ...entry, h: rows } : entry)),
          );
        });
      };
      syncHeight();
      if (typeof ResizeObserver === 'undefined') continue;
      const observer = new ResizeObserver(syncHeight);
      observer.observe(content);
      observers.push(observer);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, [mode, view]);

  const toggleSummaryWidget = (id: keyof typeof SUMMARY_WIDGETS) => {
    setFreeItems((current) => {
      if (current.some((item) => item.i === id))
        return packWidgetRows(current.filter((item) => item.i !== id));
      const size = WIDGET_SIZES[id];
      const y = Math.max(0, ...current.map((item) => item.y + item.h));
      return [...current, { i: id, x: 0, y, w: 4, h: size.defaultH, ...size }];
    });
  };

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
    event: PointerEvent<HTMLElement>,
    immediate = true,
  ) => {
    if (window.matchMedia('(max-width: 1000px)').matches) return;
    const bounds = gridRef.current?.getBoundingClientRect();
    const item = freeItems.find((entry) => entry.i === id);
    if (!bounds || !item) return;
    interactionCleanup.current?.();
    const resizeBaseHeight = Math.max(
      ...freeItems.filter((entry) => entry.y === item.y).map((entry) => entry.h),
    );
    if (immediate) {
      event.preventDefault();
      event.stopPropagation();
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const columnStep = (bounds.width - 11 * 8) / 12 + 8;
    const rowStep = 40;
    // Keep hit areas fixed while the preview changes the panel positions.
    const dropZones =
      kind === 'move'
        ? Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-widget-id]') ?? []).map(
            (element) => ({
              id: element.dataset.widgetId as WidgetId,
              rect: element.getBoundingClientRect(),
            }),
          )
        : [];
    let latest: WidgetLayoutItem<WidgetId>[] | null = null;
    let lastStep = '';
    let active = immediate;
    let hasMoved = false;
    let pointerPosition = { clientX: startX, clientY: startY };
    let autoScrollFrame: number | null = null;
    if (active) {
      setDraggingId(id);
    }
    const updateMoveDrop = (pointer: { clientX: number; clientY: number }) => {
      const currentBounds = gridRef.current?.getBoundingClientRect();
      const offsetX = (currentBounds?.left ?? bounds.left) - bounds.left;
      const offsetY = (currentBounds?.top ?? bounds.top) - bounds.top;
      const zone = dropZones.find(({ id: targetId, rect }) => {
        if (targetId === id) return false;
        return (
          pointer.clientX >= rect.left + offsetX &&
          pointer.clientX <= rect.right + offsetX &&
          pointer.clientY >= rect.top + offsetY &&
          pointer.clientY <= rect.bottom + offsetY
        );
      });
      const firstZone = dropZones.find((entry) => entry.id !== id);
      const dropBeforeFirst =
        !zone &&
        firstZone &&
        window.scrollY <= 1 &&
        pointer.clientY >= 0 &&
        pointer.clientY < 96 &&
        pointer.clientY < firstZone.rect.top + offsetY &&
        pointer.clientX >= (currentBounds?.left ?? bounds.left) &&
        pointer.clientX <= (currentBounds?.right ?? bounds.right);
      if (!zone && !dropBeforeFirst) {
        latest = null;
        setFreePreview(null);
        setFreeDropTarget(null);
        return;
      }
      const targetId = zone?.id ?? firstZone!.id;
      const position = zone
        ? dropPosition(pointer.clientX - offsetX, pointer.clientY - offsetY, zone.rect)
        : 'before';
      const targetY = freeItems.find((entry) => entry.i === targetId)!.y;
      const columns = Math.min(
        3,
        freeItems.filter((entry) => entry.i !== id && entry.y === targetY).length + 1,
      );
      latest = dropWidgetOnRow(freeItems, id, targetId, position);
      setFreePreview(latest);
      setFreeDropTarget({
        id: targetId,
        position,
        columns,
        x: Math.max(8, Math.min(pointer.clientX + 14, window.innerWidth - 230)),
        y: Math.max(8, Math.min(pointer.clientY + 14, window.innerHeight - 56)),
      });
    };
    const autoScroll = () => {
      if (!active || kind !== 'move') return;
      const edge = 96;
      const y = pointerPosition.clientY;
      let direction = 0;
      let proximity = 0;
      if (y >= 0 && y < edge) {
        direction = -1;
        proximity = (edge - y) / edge;
      } else if (y <= window.innerHeight && y > window.innerHeight - edge) {
        direction = 1;
        proximity = (y - (window.innerHeight - edge)) / edge;
      }
      if (direction !== 0) {
        const distance = direction * Math.ceil(6 + proximity * 36);
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const nextScroll = Math.max(0, Math.min(maxScroll, window.scrollY + distance));
        if (nextScroll !== window.scrollY) {
          window.scrollTo({ top: nextScroll, behavior: 'instant' });
          updateMoveDrop(pointerPosition);
        }
      }
      autoScrollFrame = window.requestAnimationFrame(autoScroll);
    };
    const move = (pointer: globalThis.PointerEvent) => {
      if (!active) {
        if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 6) return;
        active = true;
        setDraggingId(id);
      }
      pointerPosition = { clientX: pointer.clientX, clientY: pointer.clientY };
      if (pointer.cancelable) pointer.preventDefault();
      if (kind === 'move') {
        if (!hasMoved && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) >= 6) {
          hasMoved = true;
          autoScrollFrame = window.requestAnimationFrame(autoScroll);
        }
        updateMoveDrop(pointer);
        return;
      }
      const dx = Math.round((pointer.clientX - startX) / columnStep);
      const dy = Math.round((pointer.clientY - startY) / rowStep);
      const step = `${dx}:${dy}`;
      if (step === lastStep) return;
      lastStep = step;
      latest = packWidgetRows(
        positionWidget(
          freeItems,
          id,
          id === 'manager' || id === 'allocation'
            ? { w: item.w + dx }
            : { w: item.w + dx, h: resizeBaseHeight + dy },
        ),
      );
      setFreePreview(latest);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      if (autoScrollFrame !== null) window.cancelAnimationFrame(autoScrollFrame);
      interactionCleanup.current = null;
      setFreePreview(null);
      setFreeDropTarget(null);
      setDraggingId(null);
    };
    const finish = (pointer: globalThis.PointerEvent) => {
      if (active && kind === 'move') updateMoveDrop(pointer);
      if (active && latest) setFreeItems(latest);
      cleanup();
    };
    const cancel = () => cleanup();
    interactionCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
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
      {editing && !locked ? (
        <div className={styles.layoutToolbar}>
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
            {mode === 'free' && view === 'dashboard' ? (
              <div className={styles.summaryWidgetOptions} role="group" aria-label="요약 카드">
                <strong>요약 카드</strong>
                {(Object.keys(SUMMARY_WIDGETS) as Array<keyof typeof SUMMARY_WIDGETS>).map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={freeItems.some((item) => item.i === id)}
                      onChange={() => toggleSummaryWidget(id)}
                    />
                    {SUMMARY_WIDGETS[id].title}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {editing ? (
        <p className={styles.mobileLayoutNotice}>
          위젯 위치와 크기는 큰 화면에서 편집할 수 있습니다.
        </p>
      ) : null}
      {draggingId && freeDropTarget ? (
        <div
          className={styles.freeDropHint}
          style={{ left: freeDropTarget.x, top: freeDropTarget.y }}
          role="status"
        >
          {widgetTitle(draggingId)} → {widgetTitle(freeDropTarget.id)}{' '}
          {freeDropTarget.position === 'before'
            ? '위에 배치'
            : freeDropTarget.position === 'after'
              ? '아래에 배치'
              : freeDropTarget.position === 'left'
                ? `왼쪽에 ${freeDropTarget.columns === 3 ? '1:1:1' : '1:1'} 배치`
                : `오른쪽에 ${freeDropTarget.columns === 3 ? '1:1:1' : '1:1'} 배치`}
        </div>
      ) : null}
      <div
        ref={gridRef}
        className={`${styles.componentGrid} ${mode === 'free' ? styles.freeGrid : ''} ${editing ? styles.editingGrid : ''} ${locked ? styles.analysisLockedContent : ''}`}
      >
        {orderedIds.map((id) => {
          const item = displayedFree.find((entry) => entry.i === id);
          const hasRowPeer =
            mode === 'free' &&
            item &&
            displayedFree.some((entry) => entry.i !== id && entry.y === item.y);
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
                  gridRow: `${item.y + 1} / span ${freeRowHeights.get(item.y) ?? item.h}`,
                }
              : panelGridPosition(shownRows, id as PanelId);
          return (
            <div
              key={id}
              data-widget-id={id}
              ref={id === 'recurring' ? recurringPanelRef : undefined}
              className={`${styles.panelItem} ${mode === 'free' && (id === 'manager' || id === 'allocation') ? styles.autoHeightPanel : ''} ${hasRowPeer && (id === 'manager' || id === 'allocation') ? styles.pairedAutoHeightPanel : ''} ${mode === 'basic' ? pairClass : ''} ${draggingId === id ? (mode === 'free' && freeDropTarget ? styles.freePreviewItem : styles.panelDragging) : ''} ${dropTarget === id ? styles.dropTarget : ''}`}
              style={position}
              onPointerDown={
                editing && !locked && mode === 'free'
                  ? (event) => {
                      if (
                        event.button !== 0 ||
                        (event.target instanceof Element &&
                          event.target.closest(FREE_DRAG_INTERACTIVE_SELECTOR))
                      )
                        return;
                      startFreeInteraction(id, 'move', event, false);
                    }
                  : undefined
              }
              onDragOver={
                editing && mode === 'basic'
                  ? (event) => {
                      event.preventDefault();
                      setDropTarget(id as PanelId);
                    }
                  : undefined
              }
              onDragLeave={editing && mode === 'basic' ? () => setDropTarget(null) : undefined}
              onDragStart={
                editing && mode === 'free' ? (event) => event.preventDefault() : undefined
              }
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
              <div
                ref={
                  mode === 'free' && id === 'manager'
                    ? managerContentRef
                    : mode === 'free' && id === 'allocation'
                      ? allocationContentRef
                      : undefined
                }
                className={styles.widgetContent}
              >
                <WidgetContent id={id} context={context} />
              </div>
              {editing && mode === 'free' ? (
                <button
                  type="button"
                  className={styles.cornerResizeHandle}
                  aria-label={`${widgetTitle(id)} ${id === 'manager' || id === 'allocation' ? '너비' : '크기'} 조절`}
                  title={
                    id === 'manager' || id === 'allocation' ? '너비 조절' : '가로와 세로 크기 조절'
                  }
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
