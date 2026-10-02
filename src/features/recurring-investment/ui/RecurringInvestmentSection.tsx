import { FiEdit2, FiList } from 'react-icons/fi';
import { StockAvatar } from '@entities/stock';
import type { DisplayCurrency } from '@shared/lib';
import { formatHistoricalMoney, formatMarketMoney, formatShortDateTime } from '@shared/lib';
import type { HoldingHistory, RecurringInvestmentRule } from '../../../types';
import type { RecurringFailureState } from '../../../utils/recurringExecution';
import { getNextPendingRecurringInvestmentDate } from '../../../utils/recurringInvestment';
import styles from './RecurringInvestmentSection.module.scss';

const WEEKDAY_LABELS = ['', '월요일', '화요일', '수요일', '목요일', '금요일'];

interface RecurringInvestmentSectionProps {
  rules: RecurringInvestmentRule[];
  histories: HoldingHistory[];
  displayCurrency: DisplayCurrency;
  failureStates: Map<string, RecurringFailureState>;
  progress: { completed: number; total: number } | null;
  updatingRuleId: string | null;
  openStatusRuleId: string | null;
  showAnalysis?: boolean;
  onAdd: () => void;
  onEdit: (rule: RecurringInvestmentRule) => void;
  onHistory: (rule: RecurringInvestmentRule) => void;
  onStatusMenu: (ruleId: string | null) => void;
  onStatusChange: (rule: RecurringInvestmentRule, status: 'ACTIVE' | 'PAUSED') => void;
  onRetry: (rule: RecurringInvestmentRule) => void;
  onAnalysis: () => void;
}

export function RecurringRuleCard({
  rule,
  histories,
  displayCurrency,
  updating,
  statusOpen,
  onEdit,
  onHistory,
  onStatusMenu,
  onStatusChange,
}: {
  rule: RecurringInvestmentRule;
  histories: HoldingHistory[];
  displayCurrency: DisplayCurrency;
  updating: boolean;
  statusOpen: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onStatusMenu: (open: boolean) => void;
  onStatusChange: (status: 'ACTIVE' | 'PAUSED') => void;
}) {
  const ruleHistories = histories
    .filter((history) => history.source === 'RECURRING' && history.recurringRuleId === rule.id)
    .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt - left.createdAt);
  const totalQuantity = ruleHistories.reduce((total, history) => total + history.quantity, 0);
  const totalInvestment = ruleHistories.reduce(
    (total, history) => total + history.grossAmount + history.fee + history.tax,
    0,
  );
  const historicalInvestment =
    rule.market === 'US' && displayCurrency === 'KRW'
      ? ruleHistories.some((history) => !history.exchangeRate)
        ? null
        : ruleHistories.reduce(
            (total, history) =>
              total + (history.grossAmount + history.fee + history.tax) * history.exchangeRate!,
            0,
          )
      : totalInvestment;
  const investmentLabel =
    historicalInvestment === null
      ? '환율 없음'
      : formatMarketMoney(
          historicalInvestment,
          rule.market === 'US' && displayCurrency === 'KRW' ? 'KR' : rule.market,
        );
  const latest = ruleHistories[0];
  const latestLabel = latest
    ? `최근 실행 ${latest.date} · ${formatHistoricalMoney(latest.price, rule.market, displayCurrency, latest.exchangeRate)} · ${latest.recurringExecutionStatus === 'PENDING' ? '체결 확인 필요' : '체결 확인 완료'}`
    : '최근 실행 내역 없음';
  return (
    <li className={styles.card}>
      <strong className={styles.identity}>
        <StockAvatar name={rule.name} ticker={rule.ticker} market={rule.market} />
        <span>
          <b>{rule.name ?? rule.ticker}</b>
          <small>
            {ruleHistories.length
              ? `${ruleHistories.length}회 · ${totalQuantity.toLocaleString('ko-KR')}주 · ${investmentLabel}`
              : '아직 자동매수 이력이 없습니다.'}
          </small>
          <small title={latestLabel}>{latestLabel}</small>
        </span>
      </strong>
      <span>
        {rule.frequency === 'WEEKLY'
          ? `매주 ${WEEKDAY_LABELS[rule.weeklyDay ?? 1]}`
          : `매월 ${rule.monthlyDay}일`}
      </span>
      <span>{rule.quantity.toLocaleString('ko-KR')}주</span>
      <span>
        다음 매수 {rule.status === 'ACTIVE' ? getNextPendingRecurringInvestmentDate(rule) : '-'}
      </span>
      <div className={styles.status}>
        <button
          type="button"
          onClick={() => onStatusMenu(!statusOpen)}
          onBlur={() => window.setTimeout(() => onStatusMenu(false), 120)}
          disabled={updating}
          aria-expanded={statusOpen}
        >
          {rule.status === 'ACTIVE' ? '진행 중' : '일시 정지'}
        </button>
        {statusOpen && (
          <div className={styles.statusMenu} role="menu">
            <button
              type="button"
              role="menuitem"
              data-selected={rule.status === 'ACTIVE'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStatusChange('ACTIVE')}
            >
              진행 중
            </button>
            <button
              type="button"
              role="menuitem"
              data-selected={rule.status === 'PAUSED'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onStatusChange('PAUSED')}
            >
              일시 정지
            </button>
          </div>
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={onHistory}
          aria-label={`${rule.name ?? rule.ticker} 자동매수 거래 이력 보기`}
        >
          <FiList />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${rule.name ?? rule.ticker} 적립식 투자 수정`}
        >
          <FiEdit2 />
        </button>
      </div>
    </li>
  );
}

export function RecurringRuleList(
  props: Omit<
    RecurringInvestmentSectionProps,
    'progress' | 'failureStates' | 'showAnalysis' | 'onAdd' | 'onRetry' | 'onAnalysis'
  >,
) {
  return (
    <ul className={styles.list}>
      {props.rules.map((rule) => (
        <RecurringRuleCard
          key={rule.id}
          rule={rule}
          histories={props.histories}
          displayCurrency={props.displayCurrency}
          updating={props.updatingRuleId === rule.id}
          statusOpen={props.openStatusRuleId === rule.id}
          onEdit={() => props.onEdit(rule)}
          onHistory={() => props.onHistory(rule)}
          onStatusMenu={(open) => props.onStatusMenu(open ? rule.id : null)}
          onStatusChange={(status) => props.onStatusChange(rule, status)}
        />
      ))}
    </ul>
  );
}

export function RecurringExecutionList({
  rules,
  failureStates,
  updatingRuleId,
  onRetry,
}: Pick<
  RecurringInvestmentSectionProps,
  'rules' | 'failureStates' | 'updatingRuleId' | 'onRetry'
>) {
  return (
    <>
      {rules.map((rule) => {
        const failure = failureStates.get(rule.id);
        return failure ? (
          <div key={rule.id} className={styles.failure} role="alert">
            <div className={styles.failureText}>
              <strong>{rule.name ?? rule.ticker} 자동매수 반영 실패</strong>
              <small>
                {formatShortDateTime(failure.latest.attemptedAt)} · {failure.consecutiveFailures}회
                연속 실패
              </small>
              <span>{failure.latest.errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => onRetry(rule)}
              disabled={updatingRuleId === rule.id}
            >
              다시 시도
            </button>
          </div>
        ) : null;
      })}
    </>
  );
}

export function RecurringInvestmentSection(props: RecurringInvestmentSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="recurring-rules-title">
      <header className={styles.header}>
        <div>
          <h3 id="recurring-rules-title">적립식 투자</h3>
          <p>규칙 수정·삭제는 이미 반영된 자동매수 이력에 영향을 주지 않습니다.</p>
        </div>
        <button type="button" onClick={props.onAdd}>
          규칙 추가
        </button>
      </header>
      {props.progress && (
        <div className={styles.progress} role="status">
          <span>자동매수 이력 확인 중</span>
          <span>
            {props.progress.completed} / {props.progress.total} 규칙
          </span>
          <i style={{ width: `${(props.progress.completed / props.progress.total) * 100}%` }} />
        </div>
      )}
      <RecurringRuleList {...props} />
      <RecurringExecutionList
        rules={props.rules}
        failureStates={props.failureStates}
        updatingRuleId={props.updatingRuleId}
        onRetry={props.onRetry}
      />
      {props.showAnalysis && (
        <div className={styles.analysis}>
          <span>
            <strong>적립식 투자 성과</strong>
            <small>
              자동매수{' '}
              {props.histories
                .filter((history) => history.source === 'RECURRING')
                .length.toLocaleString('ko-KR')}
              건의 수익률과 월별 추이를 확인하세요.
            </small>
          </span>
          <button type="button" onClick={props.onAnalysis}>
            성과 분석 보기
          </button>
        </div>
      )}
    </section>
  );
}
