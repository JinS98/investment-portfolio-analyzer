import type { Holding, HoldingHistory } from '../../../types';

/** Remaining shares' KRW cost, including buy fees and each purchase's exchange rate. */
export function holdingKrwCost(holding: Holding, histories: HoldingHistory[]): number | null {
  let quantity = 0;
  let cost = 0;
  const transactions = histories
    .filter(
      (history) =>
        history.portfolioId === holding.portfolioId &&
        history.market === holding.market &&
        history.ticker === holding.ticker,
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.createdAt - right.createdAt ||
        left.id.localeCompare(right.id),
    );

  if (transactions.length === 0) return null;
  for (const history of transactions) {
    const fx = holding.market === 'US' ? history.exchangeRate : 1;
    if (!fx || fx <= 0) return null;
    if (history.type === 'BUY') {
      quantity += history.quantity;
      cost += (history.grossAmount + history.fee + history.tax) * fx;
    } else if (quantity > 0) {
      const soldQuantity = Math.min(history.quantity, quantity);
      cost -= (cost / quantity) * soldQuantity;
      quantity -= soldQuantity;
    }
  }
  return quantity > 0 ? cost : null;
}
