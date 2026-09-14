import type { RiskData } from '../../types';
import { createRiskGuide } from '../../utils/riskGuide';
import styles from './RiskGuidePanel.module.scss';

interface RiskGuidePanelProps {
  riskData: RiskData | null;
  isLoading: boolean;
}

export function RiskGuidePanel({ riskData, isLoading }: RiskGuidePanelProps) {
  if (isLoading || !riskData) return null;
  const guide = createRiskGuide(riskData);

  return (
    <section className={styles.section} aria-labelledby="risk-guide-title">
      <div className={styles.header}>
        <div>
          <h2 id="risk-guide-title">리스크 진단</h2>
          <p>변동성, 과거 하락폭, 종목 집중도를 종합한 참고 지표입니다.</p>
        </div>
        <div className={`${styles.badge} ${styles[guide.level]}`}>
          <span>위험도</span><strong>{guide.label}</strong><small>{guide.score}/100</small>
        </div>
      </div>

      <p className={styles.summary}>{guide.summary}</p>
      {guide.alerts.length > 0 ? (
        <ul className={styles.alerts}>
          {guide.alerts.map((alert) => <li key={alert.title}><strong>{alert.title}</strong><span>{alert.description}</span></li>)}
        </ul>
      ) : <p className={styles.clear}>현재 기준으로 별도 경고 항목이 없습니다.</p>}
      <p className={styles.note}>참고: 위험도는 투자 권유나 미래 수익률 예측이 아니라, 최근 확보된 가격 데이터의 특징을 요약한 값입니다.</p>
    </section>
  );
}
