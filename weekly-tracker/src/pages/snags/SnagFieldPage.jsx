import { useParams } from 'react-router-dom';
import SnagFieldShell from '../../components/snags/mobile/SnagFieldShell.jsx';
import { useSnagWorkspace } from '../../hooks/snags/useSnagWorkspace.js';

export default function SnagFieldPage({ projects = [] }) {
  const { projectId } = useParams();
  const workspace = useSnagWorkspace(projectId);
  const project = projects.find((item) => String(item.id) === String(projectId));

  return <SnagFieldShell projectId={projectId} project={project} {...workspace} />;
}
