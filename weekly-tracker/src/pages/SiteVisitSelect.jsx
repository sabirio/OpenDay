import ProjectSelectList from '../components/shared/ProjectSelectList.jsx';

function SiteVisitSelect({ projects = [] }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Site Visit</h1>
          <p>Select a project to record PM site observations.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state" role="status">
          <h2 className="empty-state__title">No projects available</h2>
          <p className="empty-state__text">Projects you can visit will appear here when access is assigned.</p>
        </div>
      ) : (
        <ProjectSelectList
          projects={projects}
          buildHref={(project) => `/site-visit/${project.id}`}
          ctaLabel="Start Visit →"
          ariaLabelPrefix="Start site visit for"
        />
      )}
    </div>
  );
}

export default SiteVisitSelect;
