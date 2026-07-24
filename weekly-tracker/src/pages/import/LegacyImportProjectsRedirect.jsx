import { Navigate, useSearchParams } from 'react-router-dom';

// Compatibility shim for the pre-Projects-IA-v1 route (/import/projects) —
// Import is now a Portfolio-owned operation, so its canonical route moved to
// /projects/import (see docs/SourceOfTruth.md "Projects Information
// Architecture v1"). Preserves any existing query string so old deep
// links/bookmarks keep working. Mirrors pages/snags/LegacyFieldSnagRedirect.jsx.
export default function LegacyImportProjectsRedirect() {
  const [query] = useSearchParams();
  const search = query.toString();
  return <Navigate to={`/projects/import${search ? `?${search}` : ''}`} replace />;
}
