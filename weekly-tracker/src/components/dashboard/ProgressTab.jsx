import ProjectCard from './ProjectCard';

export default function ProgressTab({ rows, onSelect, ganttMetrics }) {
  return (
    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
      {rows.map(({ project, latestReport, progress, color, progressPoints, projReports }) => (
        <ProjectCard
          key={project.id}
          project={project}
          latestReport={latestReport}
          progress={progress}
          color={color}
          progressPoints={progressPoints}
          projReports={projReports}
          onSelect={onSelect}
          metrics={ganttMetrics?.get(project.id) ?? null}
        />
      ))}
    </div>
  );
}
