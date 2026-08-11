import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import MetadataRows from '../shared/detail/MetadataRows.jsx';
import { TONE, countTone } from './homePresentation.js';

const toned = (value, color) => <span style={{ color }}>{value}</span>;

function PortfolioHealth({ kpis }) {
  const {
    active, total, atRisk, critical, missing, openingSoon, avgProgress,
  } = kpis;
  const items = [
    { key: 'active', value: `${active} active projects` },
    { key: 'total', value: `${total} total` },
    { key: 'progress', value: toned(`${avgProgress}% avg progress`, avgProgress >= 70 ? TONE.done : avgProgress >= 40 ? TONE.warn : TONE.alert) },
    { key: 'risk', value: toned(`${atRisk} at risk`, countTone(atRisk)) },
    { key: 'critical', value: toned(`${critical} critical`, countTone(critical, TONE.alert)) },
    { key: 'reports', value: toned(`${missing} reports missing`, countTone(missing)) },
    { key: 'opening', value: toned(`${openingSoon} opening soon`, countTone(openingSoon, TONE.warn, TONE.muted)) },
  ];

  return (
    <AnalyticalSection
      className="home-snapshot"
      title="Operational snapshot"
      accessory="Portfolio context"
      headingLevel="h2"
    >
      <MetadataRows items={items} layout="inline" aria-label="Portfolio operational snapshot" />
    </AnalyticalSection>
  );
}

export default PortfolioHealth;
