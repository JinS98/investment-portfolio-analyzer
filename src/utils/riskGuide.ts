import type { RiskData } from '../types';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskGuide {
  score: number;
  level: RiskLevel;
  label: string;
  summary: string;
  alerts: Array<{ title: string; description: string }>;
}

const round = (value: number) => Math.round(value);

export const createRiskGuide = (riskData: RiskData): RiskGuide => {
  const volatilityScore = Math.min((riskData.volatility ?? 0) / 200 * 35, 35);
  const drawdownScore = Math.min(Math.abs(riskData.mdd ?? 0) / 80 * 35, 35);
  const concentrationScore = Math.min(riskData.maxWeight / 70 * 20, 20) + Math.min(riskData.concentration / 100 * 10, 10);
  const score = round(Math.min(volatilityScore + drawdownScore + concentrationScore, 100));
  const level: RiskLevel = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
  const labels = { low: '낮음', medium: '보통', high: '높음' };
  const alerts: RiskGuide['alerts'] = [];

  if (riskData.maxWeight >= 50) alerts.push({
    title: '단일 종목 비중이 높습니다',
    description: `가장 큰 종목 비중이 ${riskData.maxWeight.toFixed(2)}%입니다. 해당 종목의 가격 변동이 전체 평가금액에 크게 반영됩니다.`,
  });
  if (riskData.concentration >= 80) alerts.push({
    title: '상위 종목 집중도가 높습니다',
    description: `상위 2종목이 전체의 ${riskData.concentration.toFixed(2)}%를 차지합니다. 보유 종목 수가 적을수록 개별 종목 위험의 영향이 커집니다.`,
  });
  if ((riskData.volatility ?? 0) >= 80) alerts.push({
    title: '가격 변동성이 큽니다',
    description: `최근 일봉 기준 연율 변동성이 ${riskData.volatility!.toFixed(2)}%입니다. 단기간 평가금액 변동 폭이 클 수 있습니다.`,
  });
  if ((riskData.mdd ?? 0) <= -30) alerts.push({
    title: '과거 하락폭이 큽니다',
    description: `분석 종목 중 최대 낙폭은 ${riskData.mdd!.toFixed(2)}%입니다. 이 값은 미래 하락을 예측하지 않지만 과거 가격 변동 범위를 보여줍니다.`,
  });

  return {
    score,
    level,
    label: labels[level],
    summary: level === 'high' ? '가격 변동과 종목 집중도가 높은 구성입니다.' : level === 'medium' ? '일부 위험 지표를 주기적으로 확인해 주세요.' : '현재 기준으로 주요 위험 지표가 비교적 낮습니다.',
    alerts,
  };
};
