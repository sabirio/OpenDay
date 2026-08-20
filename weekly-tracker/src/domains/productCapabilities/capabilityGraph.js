const CAPABILITY_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

function normalizedId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateCapabilityGraph({ capabilities = [], dependencies = [] } = {}) {
  const issues = [];
  const ids = new Set();

  for (const capability of capabilities) {
    const id = normalizedId(capability?.id);
    if (!CAPABILITY_ID.test(id)) issues.push({ code: 'INVALID_CAPABILITY_ID', capabilityId: id || null });
    if (ids.has(id)) issues.push({ code: 'DUPLICATE_CAPABILITY_ID', capabilityId: id });
    ids.add(id);
  }

  const adjacency = new Map([...ids].map((id) => [id, new Set()]));
  const edgeKeys = new Set();
  for (const dependency of dependencies) {
    const capabilityId = normalizedId(dependency?.capabilityId ?? dependency?.capability_id);
    const requiredCapabilityId = normalizedId(
      dependency?.requiredCapabilityId ?? dependency?.required_capability_id,
    );
    const edgeKey = `${capabilityId}\u0000${requiredCapabilityId}`;
    if (edgeKeys.has(edgeKey)) issues.push({ code: 'DUPLICATE_DEPENDENCY', capabilityId, requiredCapabilityId });
    edgeKeys.add(edgeKey);
    if (!ids.has(capabilityId)) issues.push({ code: 'UNKNOWN_CAPABILITY', capabilityId });
    if (!ids.has(requiredCapabilityId)) issues.push({ code: 'UNKNOWN_REQUIRED_CAPABILITY', capabilityId, requiredCapabilityId });
    if (capabilityId === requiredCapabilityId) issues.push({ code: 'SELF_DEPENDENCY', capabilityId });
    if (ids.has(capabilityId) && ids.has(requiredCapabilityId) && capabilityId !== requiredCapabilityId) {
      adjacency.get(capabilityId).add(requiredCapabilityId);
    }
  }

  const state = new Map();
  const stack = [];
  function visit(id) {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const cycleStart = stack.indexOf(id);
      issues.push({ code: 'DEPENDENCY_CYCLE', path: [...stack.slice(cycleStart), id] });
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const requiredId of adjacency.get(id) ?? []) visit(requiredId);
    stack.pop();
    state.set(id, 'done');
  }
  for (const id of ids) visit(id);

  return { ok: issues.length === 0, issues };
}

export function resolveCapabilityClosure(requestedCapabilityIds, graph) {
  const validation = validateCapabilityGraph(graph);
  if (!validation.ok) return { ok: false, capabilityIds: [], issues: validation.issues };

  const ids = new Set(graph.capabilities.map((capability) => capability.id));
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const dependency of graph.dependencies) {
    const capabilityId = dependency.capabilityId ?? dependency.capability_id;
    const requiredId = dependency.requiredCapabilityId ?? dependency.required_capability_id;
    adjacency.get(capabilityId).push(requiredId);
  }

  const requested = [...new Set(requestedCapabilityIds ?? [])];
  const issues = requested
    .filter((id) => !ids.has(id))
    .map((id) => ({ code: 'UNKNOWN_REQUESTED_CAPABILITY', capabilityId: id }));
  if (issues.length) return { ok: false, capabilityIds: [], issues };

  const closure = new Set();
  function include(id) {
    if (closure.has(id)) return;
    closure.add(id);
    for (const requiredId of adjacency.get(id)) include(requiredId);
  }
  requested.forEach(include);
  return { ok: true, capabilityIds: [...closure].sort(), issues: [] };
}
