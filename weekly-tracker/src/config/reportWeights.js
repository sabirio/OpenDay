export const statusScores = {
  "Not started": 0,
  "In progress": 0.5,
  Completed: 1,
  Planned: 0.25,
  Scheduled: 0.25,
  Started: 0.5,
  "Ready for handover": 1,
  "Not ready for handover": 0.25,
};

export const demolitionWeights = {
  "Demolition works": 10,
};

export const constructionWeights = {
  "Flooring installation": 8,
  "Drywall partition installation": 10,
  "Electrical systems installation": 15,
  "HVAC systems installation": 15,
  "Fire safety systems installation": 12,
  "Low current systems installation": 8,
  "Ceiling installation": 10,
  "Lighting installation": 7,
  "Furniture installation": 15,
};

export const testingWeights = {
  "Sprinkler system testing and commissioning": 15,
  "Smoke detection system testing and commissioning": 15,
  "Emergency announcement system testing and commissioning": 10,
  "HVAC system testing and commissioning": 20,
  "Electrical system testing and commissioning": 25,
  "Low current testing and commissioning": 15,
};

export const handoverWeights = {
  "Staff training": 15,
  "Manuals, certificates, test reports": 30,
  "Final cleaning": 20,
  "Snag list resolution": 35,
};

export const phaseWeights = {
  "Demolition works": 0.1,
  "Construction works": 0.55,
  "Testing & Commissioning": 0.2,
  Handover: 0.15,
  total: 1,
};
