import { useState } from 'react';
import { retailFitoutV2, CATEGORY_LIBRARY, V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2';
import { computeZoneWeights } from '../../core/projects/weights/computeZoneWeights';

const ALL_ZONE_IDS = retailFitoutV2.zones.map(z => z.id);
const ALL_CATEGORY_IDS = retailFitoutV2.zones.flatMap(z => z.categories.map(c => c.id));
const ALL_WP_IDS = Object.values(CATEGORY_LIBRARY).flatMap(cat => cat.workPackages.map(wp => wp.id));

const ZONE_LABELS = { common: 'Common Areas', sales: 'Sales Floor', boh: 'Back of House' };

/**
 * Scope configurator for the zoned retail fit-out v2 template — fully
 * separate from ProjectScopeConfigurator.jsx (v1's flat phase/WP tree).
 * Zone -> category -> work-package, with a live zone-weight % preview
 * (computeZoneWeights) that reacts to which zones/areas are active.
 *
 * `areas` (project.scope.zoneAreas, e.g. { sales: 700, boh: 300 }) is
 * read-only here — it's edited in ProjectEditorModal.jsx's "Zone Areas (m²)"
 * section, not in this modal; the parent merges it back into `scope` on save
 * (see Projects.jsx) so saving a new selection here never wipes it out.
 */
export default function ZonedScopeConfigurator({ initialScope, areas = {}, onSave, onClose }) {
  const [activeZoneIds, setActiveZoneIds] = useState(new Set(initialScope?.zones ?? ALL_ZONE_IDS));
  const [activeCategoryIds, setActiveCategoryIds] = useState(new Set(initialScope?.categories ?? ALL_CATEGORY_IDS));
  const [activeWPIds, setActiveWPIds] = useState(new Set(initialScope?.workPackages ?? ALL_WP_IDS));
  const [expandedZones, setExpandedZones] = useState(new Set(ALL_ZONE_IDS));
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  const zoneWeights = computeZoneWeights(retailFitoutV2, areas, [...activeZoneIds]);

  function toggleZoneExpanded(zoneId) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId);
      return next;
    });
  }

  function toggleCategoryExpanded(categoryId) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return next;
    });
  }

  function categoryWPIds(categoryId) {
    return (CATEGORY_LIBRARY[categoryId]?.workPackages ?? []).map(wp => wp.id);
  }

  function zoneCategoryIds(zone) {
    return zone.categories.map(c => c.id);
  }

  function toggleZone(zone) {
    const isActive = activeZoneIds.has(zone.id);
    const catIds = zoneCategoryIds(zone);
    const wpIds = catIds.flatMap(categoryWPIds);

    setActiveZoneIds(prev => {
      const next = new Set(prev);
      if (isActive) next.delete(zone.id); else next.add(zone.id);
      return next;
    });
    setActiveCategoryIds(prev => {
      const next = new Set(prev);
      if (isActive) catIds.forEach(id => next.delete(id)); else catIds.forEach(id => next.add(id));
      return next;
    });
    setActiveWPIds(prev => {
      const next = new Set(prev);
      if (isActive) wpIds.forEach(id => next.delete(id)); else wpIds.forEach(id => next.add(id));
      return next;
    });
  }

  function toggleCategory(category, zone) {
    const isActive = activeCategoryIds.has(category.id);
    const wpIds = categoryWPIds(category.id);

    setActiveCategoryIds(prev => {
      const next = new Set(prev);
      if (isActive) next.delete(category.id); else next.add(category.id);
      return next;
    });
    setActiveWPIds(prev => {
      const next = new Set(prev);
      if (isActive) wpIds.forEach(id => next.delete(id)); else wpIds.forEach(id => next.add(id));
      return next;
    });

    // Keep the zone's own active flag in sync: active if any category in it is active.
    const otherCatIds = zoneCategoryIds(zone).filter(id => id !== category.id);
    const anyOtherActive = otherCatIds.some(id => activeCategoryIds.has(id));
    const zoneShouldBeActive = isActive ? anyOtherActive : true;
    setActiveZoneIds(prev => {
      const next = new Set(prev);
      if (zoneShouldBeActive) next.add(zone.id); else next.delete(zone.id);
      return next;
    });
  }

  function toggleWP(wpId, category, zone) {
    const isActive = activeWPIds.has(wpId);
    setActiveWPIds(prev => {
      const next = new Set(prev);
      if (isActive) next.delete(wpId); else next.add(wpId);
      return next;
    });

    const catWPIds = categoryWPIds(category.id);
    const otherWPIds = catWPIds.filter(id => id !== wpId);
    const anyOtherActive = otherWPIds.some(id => activeWPIds.has(id));
    const categoryShouldBeActive = isActive ? anyOtherActive : true;
    setActiveCategoryIds(prev => {
      const next = new Set(prev);
      if (categoryShouldBeActive) next.add(category.id); else next.delete(category.id);
      return next;
    });

    const otherCatIds = zoneCategoryIds(zone).filter(id => id !== category.id);
    const anyOtherCatActive = otherCatIds.some(id => activeCategoryIds.has(id));
    const zoneShouldBeActive = categoryShouldBeActive || anyOtherCatActive;
    setActiveZoneIds(prev => {
      const next = new Set(prev);
      if (zoneShouldBeActive) next.add(zone.id); else next.delete(zone.id);
      return next;
    });
  }

  function handleSave() {
    onSave({
      template: V2_TEMPLATE_TYPE,
      zones: [...activeZoneIds],
      categories: [...activeCategoryIds],
      workPackages: [...activeWPIds],
    });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', width: '90vw', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Configure Zoned Scope</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Retail Fit-Out (Zoned) — select active zones, categories, and work packages</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Zone tree */}
        <div style={{ overflowY: 'auto', padding: '14px 24px', flex: 1 }}>
          {retailFitoutV2.zones.map(zone => {
            const zoneActive = activeZoneIds.has(zone.id);
            const catIds = zoneCategoryIds(zone);
            const activeCatCount = catIds.filter(id => activeCategoryIds.has(id)).length;
            const indeterminate = zoneActive && activeCatCount < catIds.length && activeCatCount > 0;
            const expanded = expandedZones.has(zone.id);
            const weight = zoneWeights[zone.id];

            return (
              <div key={zone.id} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: zoneActive ? 'var(--status-done-bg)' : 'var(--bg-elevated)', cursor: 'pointer' }}
                  onClick={() => toggleZoneExpanded(zone.id)}
                >
                  <input
                    type="checkbox"
                    checked={zoneActive}
                    ref={el => { if (el) el.indeterminate = indeterminate; }}
                    onChange={() => toggleZone(zone)}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                  <span style={{ fontWeight: 700, fontSize: 13, color: zoneActive ? 'var(--status-done)' : 'var(--text-primary)', flex: 1 }}>
                    {ZONE_LABELS[zone.id] ?? zone.id}
                    <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
                      ({zone.weightMode === 'fixed' ? 'fixed' : 'by area'})
                    </span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {weight != null ? `${weight}%` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
                </div>

                {expanded && (
                  <div style={{ padding: '6px 14px 8px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {zone.categories.map(category => {
                      const catActive = activeCategoryIds.has(category.id);
                      const wpIds = categoryWPIds(category.id);
                      const activeWpCount = wpIds.filter(id => activeWPIds.has(id)).length;
                      const catIndeterminate = catActive && activeWpCount < wpIds.length && activeWpCount > 0;
                      const catExpanded = expandedCategories.has(category.id);
                      const lib = CATEGORY_LIBRARY[category.id];

                      return (
                        <div key={category.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', background: catActive ? 'var(--accent-subtle)' : 'transparent', cursor: 'pointer' }}
                            onClick={() => toggleCategoryExpanded(category.id)}
                          >
                            <input
                              type="checkbox"
                              checked={catActive}
                              ref={el => { if (el) el.indeterminate = catIndeterminate; }}
                              onChange={() => toggleCategory(category, zone)}
                              onClick={e => e.stopPropagation()}
                              style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 600, color: catActive ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>
                              {lib?.label ?? category.id}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{activeWpCount}/{wpIds.length}</span>
                          </div>
                          {catExpanded && (
                            <div style={{ padding: '4px 12px 6px 28px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {(lib?.workPackages ?? []).map(wp => {
                                const wpActive = activeWPIds.has(wp.id);
                                return (
                                  <label key={wp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={wpActive}
                                      onChange={() => toggleWP(wp.id, category, zone)}
                                      style={{ cursor: 'pointer', width: 13, height: 13 }}
                                    />
                                    <span style={{ fontSize: 11, color: wpActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{wp.label}</span>
                                    {wp.isBlocker && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-alert)', marginLeft: 'auto' }}>BLOCKER</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {activeWPIds.size} work packages · {activeCategoryIds.size} categories · {activeZoneIds.size} zones
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" onClick={handleSave} disabled={activeZoneIds.size === 0}>Save Scope</button>
          </div>
        </div>
      </div>
    </div>
  );
}
