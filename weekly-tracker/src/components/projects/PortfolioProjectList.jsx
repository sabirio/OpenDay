import { pageRange, pageWindow } from "../../hooks/usePortfolioPaginationPresentation";
import ProjectFilters from "./ProjectFilters";
import StatusBadge from "../shared/StatusBadge.jsx";

function ProjectRow({ project, selected, onSelect }) {
  const projectName = project.shoppingMallName || project.street || "Project name not set";
  const location = [project.city, project.country].filter(Boolean).join(", ") || "Location not set";

  return (
    <button
      type="button"
      className={selected ? "master-list-row portfolio-master-row is-selected" : "master-list-row portfolio-master-row"}
      aria-pressed={selected}
      onClick={() => onSelect(project)}
      data-testid="portfolio-master-project"
      data-project-id={String(project.id)}
    >
      <span className="master-row-top">
        <strong title={project.storeCode || undefined}>{project.storeCode || "Project code not set"}</strong>
        <StatusBadge tone="neutral">{project.projectStatus || "Status not set"}</StatusBadge>
      </span>
      <span className="master-row-name" title={projectName}>{projectName}</span>
      <span className="master-row-bottom">
        <span title={location}>{location}</span>
      </span>
    </button>
  );
}

function PaginationFooter({ currentPage, pageCount, totalCount, pageSize, onPageChange }) {
  if (totalCount === 0) return null;
  const { start, end } = pageRange(currentPage, pageSize, totalCount);
  const pages = pageWindow(currentPage, pageCount);

  return (
    <nav className="portfolio-pagination" aria-label="Project list pages">
      <span className="portfolio-pagination-summary">{start}–{end} of {totalCount}</span>
      {pageCount > 1 && (
        <div className="portfolio-pagination-controls">
          <button type="button" className="btn-icon" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">‹</button>
          {pages.map((page) => (
            <button
              key={page}
              type="button"
              className={page === currentPage ? "portfolio-page-button is-active" : "portfolio-page-button"}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          <button type="button" className="btn-icon" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">›</button>
        </div>
      )}
    </nav>
  );
}

export default function PortfolioProjectList({
  pagedProjects,
  totalFilteredCount,
  totalProjects,
  selectedProjectId,
  onSelectProject,
  currentPage,
  pageCount,
  pageSize,
  onPageChange,
  filterProps,
}) {
  return (
    <>
      <div className="master-pane-header portfolio-master-header">
        <h2 className="master-pane-title">Projects</h2>
        <ProjectFilters {...filterProps} />
      </div>

      <div className="master-pane-list" aria-label="Projects">
        <div className="master-list-label">
          <span>Project list</span>
          <span>{totalFilteredCount}</span>
        </div>
        {pagedProjects.length === 0 ? (
          <div className="master-list-empty">
            {totalProjects === 0 ? "No projects yet. Add a project to begin." : "No projects match the current filters."}
          </div>
        ) : (
          pagedProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              selected={project.id === selectedProjectId}
              onSelect={onSelectProject}
            />
          ))
        )}
      </div>

      <PaginationFooter
        currentPage={currentPage}
        pageCount={pageCount}
        totalCount={totalFilteredCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </>
  );
}
