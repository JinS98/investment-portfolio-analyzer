import type { Portfolio, PortfolioType } from '../../types';
import styles from './PortfolioManager.module.scss';

interface PortfolioHeaderProps {
  activePortfolio: Portfolio | null;
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  portfolioType?: PortfolioType;
  holdingsCount: number;
  krCount: number;
  usCount: number;
  onSelectPortfolio: (id: string) => void;
}

export function PortfolioHeader({
  activePortfolio,
  portfolios,
  activePortfolioId,
  portfolioType,
  holdingsCount,
  krCount,
  usCount,
  onSelectPortfolio,
}: PortfolioHeaderProps) {
  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <h2>{activePortfolio?.name ?? '내 포트폴리오'}</h2>
          <p className={styles.description}>
            매수·매도 이력에서 자동 계산된 보유 수량과 이동평균 평단가입니다.
          </p>
        </div>
        {activePortfolio && (
          <div className={styles.summaryControls}>
            <span className={styles.portfolioType}>
              {activePortfolio.type === 'REAL' ? '실제 포트폴리오' : '가상 포트폴리오'}
            </span>
          </div>
        )}
      </div>

      {!portfolioType && portfolios.length > 1 && (
        <div className={styles.portfolioTabs} role="tablist" aria-label="포트폴리오 선택">
          {portfolios.map((portfolio) => (
            <button
              key={portfolio.id}
              type="button"
              role="tab"
              aria-selected={portfolio.id === activePortfolioId}
              className={portfolio.id === activePortfolioId ? styles.activeTab : undefined}
              onClick={() => onSelectPortfolio(portfolio.id)}
            >
              {portfolio.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.portfolioIntro}>
        <span>
          보유 종목 <strong>{holdingsCount}개</strong>
        </span>
        <span>
          국내 {krCount}개 · 미국 {usCount}개
        </span>
      </div>
    </>
  );
}
