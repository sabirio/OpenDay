const PROJECT_TEAM_FIELDS = [
  "projectManager",
  "constructionManager",
  "leaseManager",
  "securityManager",
  "itManager",
  "hrManager",
  "storeDesigner",
  "supplyManager",
  "facilityManager",
];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function buildOpeningSummary(project, daysLeft) {
  if (!project.targetOpeningDate || daysLeft === null) {
    return { value: "Date not set", tone: "caution", detail: "Add the target opening date" };
  }

  if (daysLeft < 0) {
    return { value: `${Math.abs(daysLeft)} days overdue`, tone: "danger", detail: "Target opening date has passed" };
  }

  if (daysLeft === 0) {
    return { value: "Opening today", tone: "caution", detail: "Target opening date" };
  }

  return { value: `${daysLeft} days left`, tone: daysLeft <= 30 ? "caution" : "info", detail: "Until target opening" };
}

function buildRecommendation({ projectSetupReady, teamReady }) {
  if (!projectSetupReady) {
    return {
      title: "Complete the project setup",
      reason: "Area, currency and target opening date are needed before budgets, procurement and delivery can be read consistently.",
    };
  }

  if (!teamReady) {
    return {
      title: "Assign the project team",
      reason: "Add colleagues from Users so ownership is clear before budgets and procurement decisions begin.",
    };
  }

  return {
    title: "Review Plan & Budget, then choose the relevant procurement stream",
    reason: "The project basics and team are in place. Confirm the sourcing strategy and budget before issuing tender documents.",
  };
}

function action(href, label, description, status = "Open workspace", tone = "neutral") {
  return { href, label, description, status, tone };
}

export function buildProjectCurrentSituation(project, { daysLeft = null } = {}) {
  const projectId = project.id;
  const projectSetupReady = [project.storeSizeSqm, project.currencyCode, project.targetOpeningDate].every(hasValue);
  const teamReady = PROJECT_TEAM_FIELDS.some((field) => hasValue(project[field]));
  const opening = buildOpeningSummary(project, daysLeft);

  return {
    stage: project.projectStatus || "Status not set",
    recommendation: buildRecommendation({ projectSetupReady, teamReady }),
    summaries: [
      {
        label: "Project data",
        value: projectSetupReady ? "Ready" : "Needs attention",
        detail: projectSetupReady ? "Area, currency and opening are set" : "Complete area, currency and opening",
        tone: projectSetupReady ? "positive" : "caution",
      },
      {
        label: "Project team",
        value: teamReady ? "Configured" : "Needs setup",
        detail: teamReady ? "At least one colleague is assigned" : "No project colleague is assigned",
        tone: teamReady ? "positive" : "caution",
      },
      { label: "Opening", ...opening },
    ],
    groups: [
      {
        id: "plan-budget",
        title: "Plan & Budget",
        description: "Set ownership, sourcing method and the approved financial baseline.",
        actions: [
          action(`/projects/${projectId}/project-team`, "Project Team", "Assign colleagues to project roles.", teamReady ? "Configured" : "Needs setup", teamReady ? "positive" : "caution"),
          action(`/projects/${projectId}/cost-packages`, "Procurement Strategy", "Choose how each work section will be procured."),
          action(`/projects/${projectId}/budget`, "Departmental Budget", "Prepare, review and approve the project budget."),
        ],
      },
      {
        id: "tender",
        title: "Tender",
        description: "Prepare the BOQ, issue packages and manage contractor bids.",
        actions: [
          action(`/projects/${projectId}/boq`, "BOQ Editor", "Prepare the detailed tender quantities and rates."),
          action(`/projects/${projectId}/tender-packages`, "Tender Packages", "Define the packages that will be issued."),
          action(`/projects/${projectId}/tender`, "Tender Workspace", "Invite bidders, run rounds, compare and award."),
        ],
      },
      {
        id: "delivery",
        title: "Delivery",
        description: "Follow programme, contractor reporting and site quality.",
        actions: [
          action(`/projects/${projectId}/schedule-review`, "Schedule Review", "Review and approve the contractor programme."),
          action(`/contractor-report/${projectId}`, "Contractor Reports", "Review weekly contractor progress reports."),
          action(`/site-visit/${projectId}`, "Site Visits", "Record PM observations and evidence."),
          action(`/projects/${projectId}/snags`, "Site Snags", "Track defects, ownership and closure."),
        ],
      },
      {
        id: "commercial-control",
        title: "Commercial Control",
        description: "Control payments, changes and forecast exposure during delivery.",
        actions: [
          action(`/projects/${projectId}/payments`, "Payment Schedule", "Plan and certify contractual payments."),
          action(`/projects/${projectId}/variations`, "Additional Works", "Register and explain changes to the original works."),
          action(`/projects/${projectId}/cost-forecast`, "Cost Packages & Forecast", "Compare commitments, changes and expected final cost."),
        ],
      },
      {
        id: "closeout",
        title: "Closeout",
        description: "Confirm final cost, schedule, scope, quality and lessons learned.",
        actions: [
          action(`/projects/${projectId}/closeout`, "Project Closeout", "Complete the single project closeout workflow."),
        ],
      },
    ],
  };
}
