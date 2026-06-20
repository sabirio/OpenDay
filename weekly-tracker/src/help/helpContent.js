export const HELP_CONTENT = {
  dataConfidence: {
    title: 'Data Confidence',
    body: 'Rates how complete and recent this project\'s data is. Higher scores mean the dashboard numbers are more reliable.',
    dimensions: [
      { label: 'Report history',   max: 3, description: '1pt for ≥1 report · 2pt for ≥4 · 3pt for ≥8' },
      { label: 'PM site visits',   max: 3, description: '2pt for 1 visit · 3pt for ≥2 visits' },
      { label: 'Report freshness', max: 2, description: '1pt if ≤14 days old · 2pt if ≤7 days old' },
    ],
  },
};
