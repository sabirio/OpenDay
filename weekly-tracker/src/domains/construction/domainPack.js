import { constructionRetailV1 } from './templates/constructionRetailV1.js';

export const constructionDomain = {
  id: 'construction',
  name: 'Construction & Fit-Out',
  dimensions: [
    { key: 'progress',  label: 'Progress' },
    { key: 'risk',      label: 'Risk' },
    { key: 'readiness', label: 'Opening Readiness' },
  ],
  templates: [ constructionRetailV1 ],
};
