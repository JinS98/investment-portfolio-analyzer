import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePersistentColumns } from '@features/portfolio-management';

afterEach(() => {
  localStorage.removeItem('portfolio-table-columns-v1-REAL');
  localStorage.removeItem('portfolio-table-columns-v2-REAL-KR');
  localStorage.removeItem('portfolio-table-columns-v2-REAL-US');
});

describe('portfolio column preferences', () => {
  it('persists and resets domestic and US column choices independently', () => {
    const { result } = renderHook(() => usePersistentColumns('REAL'));
    const firstColumn = result.current.visibleColumnsByMarket.KR[0];
    act(() => result.current.toggleColumn('KR', firstColumn));
    expect(result.current.visibleColumnsByMarket.KR).not.toContain(firstColumn);
    expect(result.current.visibleColumnsByMarket.US).toContain(firstColumn);
    expect(JSON.parse(localStorage.getItem('portfolio-table-columns-v2-REAL-KR') ?? '[]')).toEqual(
      result.current.visibleColumnsByMarket.KR,
    );
    expect(localStorage.getItem('portfolio-table-columns-v2-REAL-US')).toBeNull();

    act(() => result.current.toggleColumn('US', firstColumn));
    act(() => result.current.resetColumns('KR'));
    expect(result.current.visibleColumnsByMarket.KR).toContain(firstColumn);
    expect(result.current.visibleColumnsByMarket.US).not.toContain(firstColumn);
  });

  it('uses the previous shared preference until each market gets its own choice', () => {
    localStorage.setItem('portfolio-table-columns-v1-REAL', JSON.stringify(['quantity']));
    const first = renderHook(() => usePersistentColumns('REAL'));
    expect(first.result.current.visibleColumnsByMarket).toEqual({
      KR: ['quantity'],
      US: ['quantity'],
    });
    act(() => first.result.current.toggleColumn('KR', 'averagePrice'));
    first.unmount();

    const restored = renderHook(() => usePersistentColumns('REAL'));
    expect(restored.result.current.visibleColumnsByMarket).toEqual({
      KR: ['quantity', 'averagePrice'],
      US: ['quantity'],
    });
  });
});
