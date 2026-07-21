import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCaptureCatalog, useProjectSnags, useSnagProductCommand } from './useSnagController.js';
import { buildSnagListModel, formatPublishNoticeMessage } from './useSnagPresentation.js';

// Shared route-level orchestration for Site Snag and Field Snag List.
// Both surfaces consume the same Observation controllers and presentation
// model; this hook only owns transient list selection/filter state.
export function useSnagWorkspace(projectId) {
  const { user, role } = useAuth();
  const { status, items, error, reload } = useProjectSnags(projectId);
  const catalog = useCaptureCatalog(projectId);
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState([]);
  const [publishNotice, setPublishNotice] = useState(null);
  const actor = useMemo(() => ({ id: user?.id, role }), [user?.id, role]);
  const model = buildSnagListModel(items, filters, actor);
  const publish = useSnagProductCommand(async (result) => {
    setSelected([]);
    await reload();
    setPublishNotice(formatPublishNoticeMessage(result));
  });

  return {
    status,
    error,
    items,
    reload,
    catalog,
    filters,
    setFilters,
    selected,
    setSelected,
    publish,
    publishNotice,
    actor,
    model,
  };
}
