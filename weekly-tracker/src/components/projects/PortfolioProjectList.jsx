import { useState } from "react";
import { describeProjectLocation } from "../../hooks/useProjectInfoPresentation";
import { pageRange, pageWindow } from "../../hooks/usePortfolioPaginationPresentation";
import ProjectFilters from "./ProjectFilters";

// Row "..." actions menu — moved unchanged from the former ProjectTable.jsx
// (Edit Project / GC Invite remain exactly as they were; only their host
// component changed).
function RowActionsMenu({ project, onEditProject, onInviteContractor }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={`Actions for ${project.storeCode || "project"}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="btn-icon"
        style={{ fontSize: 16, lineHeight: 1 }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            role="menu"
            style={{
              position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 11,
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "var(--shadow)", minWidth: 160, overflow: "hidden",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEditProject(project); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
            >
              Edit Project
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onInviteContractor(project); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: project.contractorEmail ? "var(--status-done)" : "var(--status-warn)" }}
            >
              {project.contractorEmail ? "GC Invited" : "GC Invite"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectRow({ project, selected, onSelect, onEditProject, onInviteContractor }) {
  const location = describeProjectLocation(project);

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(project);
    }
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={selected ? "portfolio-row is-selected" : "portfolio-row"}
      onClick={() => onSelect(project)}
      onKeyDown={handleKeyDown}
    >
      {/* Selected state has both a background/accent-bar treatment (below)
          and this text marker, so selection is never color-only (§Accessibility). */}
      <span className="portfolio-row-selected-marker" aria-hidden={!selected}>{selected ? "●" : ""}</span>
      <div className="portfolio-row-main">
        <div className="portfolio-row-code">{project.storeCode || "-"}</div>
        <div className="portfolio-row-meta">
          <span>{location.value || "-"}</span>
          <span aria-hidden="true">·</span>
          <span>{project.city || "-"}</span>
          <span aria-hidden="true">·</span>
          <span>{project.storeConcept || "-"}</span>
        </div>
      </div>
      <span className="portfolio-row-status">{project.projectStatus || "-"}</span>
      <div onClick={(e) => e.stopPropagation()}>
        <RowActionsMenu project={project} onEditProject={onEditProject} onInviteContractor={onInviteContractor} />
      </div>
    </div>
  );
}

function PaginationFooter({ currentPage, pageCount, totalCount, pageSize, onPageChange }) {
  if (totalCount === 0) return null;
  const { start, end } = pageRange(currentPage, pageSize, totalCount);
  // Bounded window of page numbers around the current page — avoids
  // rendering hundreds of page buttons for a very large portfolio.
  const pages = pageWindow(currentPage, pageCount);

  return (
    <nav className="portfolio-pagination" aria-label="Project list pages">
      <span className="portfolio-pagination-summary">{start}–{end} of {totalCount}</span>
      {pageCount > 1 && (
        <div className="portfolio-pagination-controls">
          <button type="button" className="btn-icon" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">‹</button>
          {pages.map(p => (
            <button
              key={p}
              type="button"
              className={p === currentPage ? "portfolio-page-button is-active" : "portfolio-page-button"}
              aria-current={p === currentPage ? "page" : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
          <button type="button" className="btn-icon" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">›</button>
        </div>
      )}
    </nav>
  );
}

/**
 * Compact master list — search/filters and pagination footer stay
 * stationary; only the row content between them scrolls (its own scroll
 * region, independent of the Details pane).
 */
export default function PortfolioProjectList({
  pagedProjects,
  totalFilteredCount,
  totalProjects,
  selectedProjectId,
  onSelectProject,
  onEditProject,
  onInviteContractor,
  currentPage,
  pageCount,
  pageSize,
  onPageChange,
  filterProps,
}) {
  return (
    <div className="portfolio-list-pane">
      <div className="portfolio-list-header">
        <h2 className="portfolio-pane-title">Projects</h2>
        <ProjectFilters {...filterProps} />
      </div>

      <div className="portfolio-list-rows" role="listbox" aria-label="Projects">
        {pagedProjects.length === 0 ? (
          <div className="portfolio-empty-state">
            {totalProjects === 0 ? "No projects yet. Click \"Add New Project\" to create one." : "No projects match the current filters."}
          </div>
        ) : (
          pagedProjects.map(project => (
            <ProjectRow
              key={project.id}
              project={project}
              selected={project.id === selectedProjectId}
              onSelect={onSelectProject}
              onEditProject={onEditProject}
              onInviteContractor={onInviteContractor}
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
    </div>
  );
}
