import type {
  Holding,
  HoldingHistory,
  Portfolio,
  PortfolioLedger,
  PortfolioType,
} from '../../../types/index.ts';

export const GUEST_REAL_PORTFOLIO: Portfolio = {
  id: 'guest-real',
  userId: 'guest',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

interface PortfolioSelectionInput {
  userId?: string;
  requestedType?: PortfolioType;
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  portfolioLedgers: Record<string, PortfolioLedger>;
  fallbackHoldings?: Holding[];
}

export interface PortfolioSelection {
  activePortfolio: Portfolio | null;
  transactionPortfolio: Portfolio | null;
  holdings: Holding[];
  histories: HoldingHistory[];
}

export function selectPortfolioWorkspace({
  userId,
  requestedType,
  portfolios,
  activePortfolioId,
  portfolioLedgers,
  fallbackHoldings = [],
}: PortfolioSelectionInput): PortfolioSelection {
  const activePortfolio =
    (requestedType
      ? portfolios.find((portfolio) => portfolio.type === requestedType)
      : (portfolios.find((portfolio) => portfolio.id === activePortfolioId) ??
        portfolios.find((portfolio) => portfolio.type === 'REAL'))) ??
    (!userId && requestedType !== 'VIRTUAL' ? GUEST_REAL_PORTFOLIO : null);
  const ledger = activePortfolio ? portfolioLedgers[activePortfolio.id] : undefined;

  return {
    activePortfolio,
    transactionPortfolio: activePortfolio ?? (!userId ? GUEST_REAL_PORTFOLIO : null),
    holdings: ledger?.holdings ?? (activePortfolio ? [] : fallbackHoldings),
    histories: ledger?.histories ?? [],
  };
}

export function selectPortfolioByType(portfolios: Portfolio[], type: PortfolioType) {
  return portfolios.find((portfolio) => portfolio.type === type) ?? null;
}
