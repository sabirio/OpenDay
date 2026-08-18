import { useLocation } from 'react-router-dom';

const PROJECT_WORKSPACE_PATH = /^\/projects(?:\?|$)/;

export function buildProjectWorkspaceHref(projectId, tab = 'overview') {
  const params = new URLSearchParams();
  if (projectId !== null && projectId !== undefined && String(projectId).trim()) {
    params.set('project', String(projectId));
  }
  if (tab) params.set('tab', tab);
  const query = params.toString();
  return query ? `/projects?${query}` : '/projects';
}

export function resolveProjectReturnHref(returnTo, projectId, tab = 'overview') {
  return typeof returnTo === 'string' && PROJECT_WORKSPACE_PATH.test(returnTo)
    ? returnTo
    : buildProjectWorkspaceHref(projectId, tab);
}

export function resolveWorkspaceReturnHref(workspaceHref, projectHref) {
  return !workspaceHref || workspaceHref === '/projects' ? projectHref : workspaceHref;
}

export function useProjectReturnHref(projectId, tab = 'overview') {
  const location = useLocation();
  return resolveProjectReturnHref(location.state?.returnTo, projectId, tab);
}
