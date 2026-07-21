import { Navigate, useParams, useSearchParams } from 'react-router-dom';

// Compatibility shim for the pre-standalone-field-snag route
// (/projects/:projectId/snags/field) — the canonical workspace now lives at
// /field-snag/:projectId. Preserves any existing query string (e.g. ?tab=list
// or ?created=<id>) so old deep links/bookmarks keep working.
export default function LegacyFieldSnagRedirect() {
  const { projectId } = useParams();
  const [query] = useSearchParams();
  const search = query.toString();
  return <Navigate to={`/field-snag/${projectId}${search ? `?${search}` : ''}`} replace />;
}
