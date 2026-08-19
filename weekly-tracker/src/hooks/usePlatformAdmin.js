import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  commitPlatformOrganizationEntitlement,commitPlatformOrganizationStatus,
  commitPlatformOrganizationSubscription,loadPlatformCapabilities,
  loadPlatformEntitlementEvents,loadPlatformOrganization,loadPlatformOrganizations,
  loadPlatformPlans,
} from '../core/platformAdmin/platformAdminOrchestration.js';
import { buildPlatformOrganizationSummary,groupPlatformCapabilities,indexEffectiveCapabilities,indexManualOverrides } from '../core/platformAdmin/platformAdminPresentationModel.js';

export function usePlatformAdmin() {
  const [state,setState]=useState({ status:'loading',organizations:[],plans:[],capabilities:[],error:null });
  const [selectedId,setSelectedId]=useState(null);
  const [detail,setDetail]=useState(null);
  const [events,setEvents]=useState([]);
  const [detailStatus,setDetailStatus]=useState('idle');

  const load=useCallback(async()=>{
    setState(previous=>({ ...previous,status:'loading',error:null }));
    try {
      const [organizations,plans,capabilities]=await Promise.all([
        loadPlatformOrganizations(),loadPlatformPlans(),loadPlatformCapabilities(),
      ]);
      setState({ status:'ready',organizations,plans,capabilities,error:null });
      setSelectedId(current=>current && organizations.some(row=>row.organizationId===current)
        ? current : organizations[0]?.organizationId ?? null);
    } catch(error) { setState(previous=>({ ...previous,status:'error',error })); }
  },[]);

  const loadDetail=useCallback(async organizationId=>{
    if(!organizationId){setDetail(null);setEvents([]);return;}
    setDetailStatus('loading');
    try {
      const [nextDetail,nextEvents]=await Promise.all([
        loadPlatformOrganization(organizationId),loadPlatformEntitlementEvents(organizationId),
      ]);
      setDetail(nextDetail);setEvents(nextEvents);setDetailStatus('ready');
    } catch(error){setDetailStatus('error');setState(previous=>({ ...previous,error }));}
  },[]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{loadDetail(selectedId);},[selectedId,loadDetail]);

  const refresh=useCallback(async()=>{await Promise.all([load(),loadDetail(selectedId)]);},[load,loadDetail,selectedId]);
  async function mutate(command){await command();await refresh();}
  const grouped=useMemo(()=>groupPlatformCapabilities(state.capabilities),[state.capabilities]);
  const effectiveById=useMemo(()=>indexEffectiveCapabilities(detail?.effective?.capabilities),[detail]);
  const overridesById=useMemo(()=>indexManualOverrides(detail?.entitlements),[detail]);
  const summary=useMemo(()=>buildPlatformOrganizationSummary(detail),[detail]);

  return {
    ...state,selectedId,setSelectedId,detail,events,detailStatus,refresh,
    grouped,effectiveById,overridesById,summary,
    setStatus: input=>mutate(()=>commitPlatformOrganizationStatus(input)),
    setSubscription: input=>mutate(()=>commitPlatformOrganizationSubscription(input)),
    setEntitlement: input=>mutate(()=>commitPlatformOrganizationEntitlement(input)),
  };
}
