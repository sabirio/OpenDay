import ProjectSelectList from '../../components/shared/ProjectSelectList.jsx';

export default function SnagProjectSelectPage({ projects = [] }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Site Snag</h1>
          <p>Select an accessible project to review its Observation workspace.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state" role="status">
          <h2 className="empty-state__title">No accessible projects</h2>
          <p className="empty-state__text">Your project access determines which Site Snag workspaces are available.</p>
        </div>
      ) : (
        <ProjectSelectList
          projects={projects}
          buildHref={(project) => `/projects/${project.id}/snags`}
          ctaLabel="Open Site Snag →"
          ariaLabelPrefix="Open Site Snag for"
        />
      )}
    </div>
  );
}
