import type { AppPage } from '../../../app/navigation';
import Dashboard from '../../../pages/Dashboard';
import { MarketExplorePage } from '../../../pages/MarketExplore';
import { TransactionHistoryPage } from '../../../pages/TransactionHistory/TransactionHistoryPage';
import { VirtualPortfolioPage } from '../../../pages/VirtualPortfolio/VirtualPortfolioPage';

interface ContentProps {
  page: AppPage;
}

/** Routes the currently selected top-level page without owning navigation state. */
export function Content({ page }: ContentProps) {
  switch (page) {
    case 'transactions':
      return <TransactionHistoryPage />;
    case 'market':
      return <MarketExplorePage />;
    case 'virtual':
      return <VirtualPortfolioPage />;
    case 'dashboard':
    case 'analysis':
      return <Dashboard view={page} />;
  }
}
