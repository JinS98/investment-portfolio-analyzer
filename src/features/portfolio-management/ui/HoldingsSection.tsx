import { useEffect, useRef } from 'react';
import { FiPlus } from 'react-icons/fi';
import { StockAvatar } from '@entities/stock';
import type { Holding, MarketType, PriceMap } from '../../../types';
import { formatRate } from '../../../utils/calculator';
import { HOLDING_COLUMN_OPTIONS, type HoldingColumnId } from '../model/holdingColumns';
import styles from './HoldingsSection.module.scss';

interface HoldingMetrics {
  currentPrice?: number;
  evaluatedValue: number | null;
  profitAmount: number | null;
  profitRate: number | null;
}
const metrics = (holding: Holding, prices: PriceMap): HoldingMetrics => {
  const currentPrice = prices[holding.ticker];
  const evaluatedValue = currentPrice === undefined ? null : currentPrice * holding.quantity;
  const profitAmount = evaluatedValue === null ? null : evaluatedValue - holding.investedAmount;
  const profitRate =
    profitAmount === null || holding.investedAmount <= 0
      ? null
      : (profitAmount / holding.investedAmount) * 100;
  return { currentPrice, evaluatedValue, profitAmount, profitRate };
};

interface ColumnVisibilityMenuProps {
  label?: string;
  open: boolean;
  visibleColumns: HoldingColumnId[];
  onToggleOpen: () => void;
  onClose: () => void;
  onToggleColumn: (column: HoldingColumnId) => void;
  onReset: () => void;
}

export function ColumnVisibilityMenu({
  label = '표시 항목 설정',
  open,
  visibleColumns,
  onToggleOpen,
  onClose,
  onToggleColumn,
  onReset,
}: ColumnVisibilityMenuProps) {
  const settingsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  return (
    <div className={styles.settings} ref={settingsRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.settingsTrigger}
        aria-label={label}
        aria-expanded={open}
        onClick={onToggleOpen}
      >
        ⚙
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.menuHeader}>
            <strong>표시 항목</strong>
            <button type="button" onClick={onReset}>
              모두 보기
            </button>
          </div>
          {HOLDING_COLUMN_OPTIONS.map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.id)}
                onChange={() => onToggleColumn(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface HoldingsViewProps {
  holdings: Holding[];
  prices: PriceMap;
  visibleColumns: HoldingColumnId[];
  money: (value: number, market: MarketType) => string;
  onBuy: (holding: Holding, currentPrice?: number) => void;
}

export function HoldingsTable({
  holdings,
  prices,
  visibleColumns,
  money,
  onBuy,
}: HoldingsViewProps) {
  const visible = (id: HoldingColumnId) => visibleColumns.includes(id);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>종목</th>
            {HOLDING_COLUMN_OPTIONS.filter((column) => visible(column.id)).map((column) => (
              <th key={column.id}>{column.label}</th>
            ))}
            <th>기록</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const value = metrics(holding, prices);
            const cells: Record<HoldingColumnId, string> = {
              averagePrice: money(holding.averagePrice, holding.market),
              currentPrice:
                value.currentPrice === undefined
                  ? '시세 미조회'
                  : money(value.currentPrice, holding.market),
              quantity: holding.quantity.toLocaleString('ko-KR'),
              investment: money(holding.investedAmount, holding.market),
              evaluatedValue:
                value.evaluatedValue === null ? '—' : money(value.evaluatedValue, holding.market),
              profitAmount:
                value.profitAmount === null ? '—' : money(value.profitAmount, holding.market),
              profitRate: value.profitRate === null ? '—' : formatRate(value.profitRate),
            };
            return (
              <tr key={`${holding.market}-${holding.ticker}`}>
                <td>
                  <span className={styles.identity}>
                    <StockAvatar
                      name={holding.name}
                      ticker={holding.ticker}
                      market={holding.market}
                    />
                    <strong>{holding.name ?? holding.ticker}</strong>
                  </span>
                </td>
                {HOLDING_COLUMN_OPTIONS.filter((column) => visible(column.id)).map((column) => (
                  <td
                    key={column.id}
                    className={
                      (column.id === 'profitAmount'
                        ? value.profitAmount
                        : column.id === 'profitRate'
                          ? value.profitRate
                          : null) !== null &&
                      (column.id === 'profitAmount' ? value.profitAmount! : value.profitRate!) < 0
                        ? styles.negative
                        : column.id === 'profitAmount' || column.id === 'profitRate'
                          ? styles.positive
                          : undefined
                    }
                  >
                    {cells[column.id]}
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className={styles.record}
                    onClick={() => onBuy(holding, value.currentPrice)}
                    aria-label={`${holding.name ?? holding.ticker} 매수 기록 추가`}
                  >
                    <FiPlus />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HoldingsCardList({
  holdings,
  prices,
  money,
  onBuy,
}: Omit<HoldingsViewProps, 'visibleColumns'>) {
  return (
    <div className={styles.cards}>
      {holdings.map((holding) => {
        const value = metrics(holding, prices);
        return (
          <article className={styles.card} key={`${holding.market}-${holding.ticker}`}>
            <span className={styles.cardHeader}>
              <StockAvatar name={holding.name} ticker={holding.ticker} market={holding.market} />
              <strong>{holding.name ?? holding.ticker}</strong>
            </span>
            <button
              type="button"
              className={styles.record}
              onClick={() => onBuy(holding, value.currentPrice)}
              aria-label={`${holding.name ?? holding.ticker} 매수 기록 추가`}
            >
              <FiPlus />
            </button>
            <dl>
              <dt>평가금액</dt>
              <dd>
                {value.evaluatedValue === null
                  ? '시세 미조회'
                  : money(value.evaluatedValue, holding.market)}
              </dd>
              <dt>평가손익</dt>
              <dd
                className={
                  value.profitAmount === null || value.profitAmount >= 0
                    ? styles.positive
                    : styles.negative
                }
              >
                {value.profitAmount === null ? '—' : money(value.profitAmount, holding.market)}
              </dd>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

interface HoldingsSectionProps extends Omit<HoldingsViewProps, 'holdings' | 'visibleColumns'> {
  groups: Array<{ market: MarketType; holdings: Holding[] }>;
  visibleColumnsByMarket: Record<MarketType, HoldingColumnId[]>;
  menuMarket: MarketType | null;
  onMenuMarketChange: (market: MarketType | null) => void;
  onToggleColumn: (market: MarketType, column: HoldingColumnId) => void;
  onResetColumns: (market: MarketType) => void;
}

export function HoldingsSection({
  groups,
  prices,
  visibleColumnsByMarket,
  money,
  menuMarket,
  onMenuMarketChange,
  onToggleColumn,
  onResetColumns,
  onBuy,
}: HoldingsSectionProps) {
  return (
    <div className={styles.section}>
      {groups.map(({ market, holdings }) => {
        const visibleColumns = visibleColumnsByMarket[market];
        const totalInvestment = holdings.reduce((sum, holding) => sum + holding.investedAmount, 0);
        const hasEveryPrice = holdings.every((holding) => prices[holding.ticker] !== undefined);
        const totalValue = hasEveryPrice
          ? holdings.reduce((sum, holding) => sum + prices[holding.ticker] * holding.quantity, 0)
          : null;
        const profit = totalValue === null ? null : totalValue - totalInvestment;
        return (
          <section
            className={
              menuMarket === market ? `${styles.market} ${styles.marketMenuOpen}` : styles.market
            }
            key={market}
          >
            <header className={styles.header}>
              <h3>{market === 'KR' ? '국내 주식 (KRW)' : '미국 주식 (USD)'}</h3>
              <ColumnVisibilityMenu
                label={`${market === 'KR' ? '국내 주식' : '미국 주식'} 표시 항목 설정`}
                open={menuMarket === market}
                visibleColumns={visibleColumns}
                onToggleOpen={() => onMenuMarketChange(menuMarket === market ? null : market)}
                onClose={() => onMenuMarketChange(null)}
                onToggleColumn={(column) => onToggleColumn(market, column)}
                onReset={() => onResetColumns(market)}
              />
            </header>
            <div className={styles.summary}>
              <span>
                투자원금 <strong>{money(totalInvestment, market)}</strong>
              </span>
              <span>
                평가금액{' '}
                <strong>{totalValue === null ? '시세 미조회' : money(totalValue, market)}</strong>
              </span>
              <span>
                평가손익{' '}
                <strong
                  className={profit === null || profit >= 0 ? styles.positive : styles.negative}
                >
                  {profit === null ? '시세 미조회' : money(profit, market)}
                </strong>
              </span>
              <span>
                수익률{' '}
                <strong
                  className={profit === null || profit >= 0 ? styles.positive : styles.negative}
                >
                  {profit === null
                    ? '시세 미조회'
                    : formatRate(totalInvestment ? (profit / totalInvestment) * 100 : 0)}
                </strong>
              </span>
            </div>
            <HoldingsTable
              holdings={holdings}
              prices={prices}
              visibleColumns={visibleColumns}
              money={money}
              onBuy={onBuy}
            />
            <HoldingsCardList holdings={holdings} prices={prices} money={money} onBuy={onBuy} />
          </section>
        );
      })}
    </div>
  );
}
