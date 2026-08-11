import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import EmptyState from '../shared/detail/EmptyState.jsx';
import EvidenceLedger from '../shared/detail/EvidenceLedger.jsx';
import { formatActivityDate } from './homePresentation.js';

export default function RecentActivity({ items }) {
  const evidence = items.map(item => ({
    key: item.key,
    label: item.type,
    value: `${item.code} ${item.action}`,
    secondary: item.name,
    timestamp: formatActivityDate(item.occurredAt),
    dateTime: item.occurredAt,
  }));

  return (
    <AnalyticalSection
      className="home-recent-activity"
      title="Recent activity"
      description="Latest existing contractor reports and PM site visits."
      accessory="Latest available"
      headingLevel="h2"
      ruled={false}
    >
      {evidence.length > 0 ? (
        <EvidenceLedger items={evidence} layout="rows" aria-label="Recent operational evidence" />
      ) : (
        <EmptyState
          title="No recent evidence"
          description="Weekly reports and PM site visits will appear here when they are recorded."
        />
      )}
    </AnalyticalSection>
  );
}
