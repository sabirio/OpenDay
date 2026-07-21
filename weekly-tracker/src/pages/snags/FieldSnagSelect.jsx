import ProjectSelectList from '../../components/shared/ProjectSelectList.jsx';

// Field Snag List's own project-selection page, deliberately simple (select
// a project, enter the field workspace) — mirrors Site Visit's selection UX
// via the shared ProjectSelectList rather than a second bespoke list.
// `projects` is the same access-scoped array every other project surface
// (Portfolio, Site Visit, Site Snag) already receives, so no new frontend
// access rule is introduced here.
export default function FieldSnagSelect({ projects = [] }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Field Snag List</h1>
          <p>Select a project to capture and review site observations.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state" role="status">
          <h2 className="empty-state__title">No projects available</h2>
          <p className="empty-state__text">Projects you can access will appear here when access is assigned.</p>
        </div>
      ) : (
        <ProjectSelectList
          projects={projects}
          buildHref={(project) => `/field-snag/${project.id}`}
          ctaLabel="Open Field Snag →"
          ariaLabelPrefix="Open Field Snag List for"
        />
      )}
    </div>
  );
}
