import { useEffect, useState } from 'react';
import { loadContractorDirectory } from '../core/contractorWorkspace/loadContractorDirectory.js';

/**
 * Admin-only list of Contractor accounts for the Contractor Workspace
 * selector. `enabled` gates the fetch — pass false for non-Admin roles so
 * this never runs (and never needs to) outside Admin mode.
 *
 * `status` is derived by comparing `resolvedFor` (only ever written inside
 * the fetch's own .then()/.catch()) against the current `enabled` value,
 * rather than the effect body calling setState synchronously to mark
 * "loading" — this needs no react-hooks/set-state-in-effect suppression.
 */
export function useContractorDirectory(enabled) {
  const [result, setResult] = useState({ contractors: [] });
  const [resolvedFor, setResolvedFor] = useState(undefined);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    loadContractorDirectory()
      .then(contractors => { if (!ignore) { setResult({ contractors }); setResolvedFor(enabled); } })
      .catch(() => { if (!ignore) { setResult({ contractors: [] }); setResolvedFor(enabled); } });
    return () => { ignore = true; };
  }, [enabled]);

  const status = !enabled ? 'ready' : resolvedFor === enabled ? 'ready' : 'loading';
  return { status, contractors: enabled ? result.contractors : [] };
}
