import{useMemo}from'react';import{buildScheduleCloseoutPresentation}from'../core/presentation/scheduleCloseoutPresentationModel.js';
export function useScheduleCloseoutPresentation(){return useMemo(()=>buildScheduleCloseoutPresentation(),[])}
