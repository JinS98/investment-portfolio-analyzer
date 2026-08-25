import type { MonthlyChangeMap, SignalZone, SignalData } from '../types';

/**
 * 월별 투자 시그널 구간 판단
 *
 * 하락(bear):  -5% 이하 종목 1개 이상 → 예산 30만원
 * 횡보(flat):  전 종목 -3% ~ +3% 사이  → 예산 20만원
 * 상승(bull):  전 종목 +3% 이상         → 예산 20만원
 * 과열(hot):   +7% 이상 종목 1개 이상   → 예산 10만원
 */
export const detectSignalZone = (changes: MonthlyChangeMap): SignalData => {
  const values = Object.values(changes);
  if (!values.length) {
    return {
      zone: 'flat',
      changes,
      budgetRecommendation: 20,
      strategyNote: '데이터 없음 — 정기 적립 유지',
    };
  }

  const hasBearStock = values.some((v) => v <= -5);
  const hasHotStock = values.some((v) => v >= 7);
  const allBull = values.every((v) => v >= 3);
  const allFlat = values.every((v) => v > -3 && v < 3);

  let zone: SignalZone;
  let budgetRecommendation: number;
  let strategyNote: string;

  if (hasBearStock) {
    zone = 'bear';
    budgetRecommendation = 30;
    strategyNote = '하락 구간 — 분할 매수 기회, 손절 기준 재확인';
  } else if (hasHotStock) {
    zone = 'hot';
    budgetRecommendation = 10;
    strategyNote = '과열 구간 — 신규 매수 자제, 일부 익절 고려';
  } else if (allBull) {
    zone = 'bull';
    budgetRecommendation = 20;
    strategyNote = '상승 구간 — 트렌드 추종, 보유 유지';
  } else if (allFlat) {
    zone = 'flat';
    budgetRecommendation = 20;
    strategyNote = '횡보 구간 — 정기 적립 유지, 관망';
  } else {
    zone = 'flat';
    budgetRecommendation = 20;
    strategyNote = '혼조 구간 — 개별 종목 분석 필요';
  }

  return { zone, changes, budgetRecommendation, strategyNote };
};
