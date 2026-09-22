export const APP_PAGES = ['dashboard', 'analysis', 'transactions', 'market', 'virtual'] as const;

export type AppPage = (typeof APP_PAGES)[number];

export const NAVIGATION_ITEMS: ReadonlyArray<{ page: AppPage; hash: string; label: string }> = [
  { page: 'dashboard', hash: '#dashboard', label: '대시보드' },
  { page: 'analysis', hash: '#analysis', label: '투자 분석' },
  { page: 'transactions', hash: '#transactions', label: '거래 내역' },
  { page: 'market', hash: '#market', label: '시장 탐색' },
  { page: 'virtual', hash: '#virtual', label: '가상 포트폴리오' },
];

export const pageFromHash = (hash: string): AppPage =>
  NAVIGATION_ITEMS.find((item) => item.hash === hash)?.page ?? 'dashboard';
