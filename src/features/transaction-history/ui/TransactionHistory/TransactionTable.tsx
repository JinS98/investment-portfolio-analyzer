import type { HoldingHistory } from '../../../../types';
import type { DisplayCurrency } from '@shared/lib';
import { formatHistoricalMoney } from '../../../../utils/displayCurrency';
import { TransactionMobileList } from './TransactionMobileList';
import styles from './TransactionHistory.module.scss';

export interface TransactionTableProps {
  histories: HoldingHistory[];
  displayCurrency: DisplayCurrency;
  isSaving: boolean;
  deletingId: string | null;
  showConfirm: boolean;
  showDelete: boolean;
  onConfirm: (history: HoldingHistory) => void;
  onDeleteHistory: (history: HoldingHistory) => void;
}

export function TransactionTable({
  histories,
  displayCurrency,
  isSaving,
  deletingId,
  showConfirm,
  showDelete,
  onConfirm,
  onDeleteHistory,
}: TransactionTableProps) {
  return (
    <>
      {!histories.length ? (
        <p className={styles.empty}>조건에 맞는 거래 기록이 없습니다.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>거래일</th>
                  <th>구분</th>
                  <th>출처</th>
                  <th>종목</th>
                  <th>가격</th>
                  <th>수량</th>
                  <th>거래금액</th>
                  <th>수수료/세금</th>
                  <th>실현손익</th>
                  {showConfirm && <th>체결 확인</th>}
                  {showDelete && <th>관리</th>}
                </tr>
              </thead>
              <tbody>
                {histories.map((history) => {
                  const cost = history.fee + history.tax;
                  return (
                    <tr key={history.id}>
                      <td>{history.date}</td>
                      <td>
                        <span
                          className={history.type === 'BUY' ? styles.buyBadge : styles.sellBadge}
                        >
                          {history.type === 'BUY' ? '매수' : '매도'}
                        </span>
                      </td>
                      <td>
                        {history.source === 'RECURRING' ? (
                          <span className={styles.recurringSource}>
                            <strong>{history.recurringRuleName ?? '적립식 자동매수'}</strong>
                            <small>
                              예정 {history.scheduledDate ?? history.date} · 반영 {history.date}
                            </small>
                          </span>
                        ) : (
                          <span className={styles.manualSource}>수동 기록</span>
                        )}
                      </td>
                      <td>
                        <strong>{history.name ?? history.ticker}</strong>
                      </td>
                      <td>
                        {formatHistoricalMoney(
                          history.price,
                          history.market,
                          displayCurrency,
                          history.exchangeRate,
                        )}
                      </td>
                      <td>{history.quantity.toLocaleString('ko-KR')}주</td>
                      <td>
                        {formatHistoricalMoney(
                          history.grossAmount,
                          history.market,
                          displayCurrency,
                          history.exchangeRate,
                        )}
                      </td>
                      <td>
                        {cost
                          ? formatHistoricalMoney(
                              cost,
                              history.market,
                              displayCurrency,
                              history.exchangeRate,
                            )
                          : '-'}
                      </td>
                      <td
                        className={
                          history.type === 'SELL'
                            ? history.realizedPnL >= 0
                              ? styles.positive
                              : styles.negative
                            : undefined
                        }
                      >
                        {history.type === 'SELL'
                          ? formatHistoricalMoney(
                              history.realizedPnL,
                              history.market,
                              displayCurrency,
                              history.exchangeRate,
                            )
                          : '-'}
                      </td>
                      {showConfirm && (
                        <td>
                          {history.source === 'RECURRING' &&
                          history.portfolioType === 'REAL' &&
                          history.recurringExecutionStatus !== 'CONFIRMED' ? (
                            <button
                              type="button"
                              className={styles.confirmButton}
                              onClick={() => onConfirm(history)}
                            >
                              확인 필요
                            </button>
                          ) : history.source === 'RECURRING' && history.portfolioType === 'REAL' ? (
                            <span className={styles.confirmed}>확정</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      )}
                      {showDelete && (
                        <td>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => void onDeleteHistory(history)}
                            disabled={isSaving || deletingId !== null}
                          >
                            {deletingId === history.id ? '삭제 중' : '삭제'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TransactionMobileList
            histories={histories}
            displayCurrency={displayCurrency}
            isSaving={isSaving}
            deletingId={deletingId}
            showConfirm={showConfirm}
            showDelete={showDelete}
            onConfirm={onConfirm}
            onDeleteHistory={onDeleteHistory}
          />
        </>
      )}
    </>
  );
}
