export type HoldingColumnId =
  | 'averagePrice'
  | 'currentPrice'
  | 'quantity'
  | 'investment'
  | 'evaluatedValue'
  | 'profitAmount'
  | 'profitRate';

export const HOLDING_COLUMN_OPTIONS: Array<{ id: HoldingColumnId; label: string }> = [
  { id: 'averagePrice', label: '평단가' },
  { id: 'currentPrice', label: '현재가' },
  { id: 'quantity', label: '보유 수량' },
  { id: 'investment', label: '투자원금' },
  { id: 'evaluatedValue', label: '평가금액' },
  { id: 'profitAmount', label: '평가손익' },
  { id: 'profitRate', label: '수익률' },
];
