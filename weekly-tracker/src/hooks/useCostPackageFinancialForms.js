import { useState } from 'react';
import { startCommercialCommitmentDraft, startCostPackageForecastDraft } from '../core/presentation/variationPresentationModel.js';

export function useCostPackageFinancialForms(editor,onSuccess,onError){
  const[commitment,setCommitment]=useState(null);const[forecast,setForecast]=useState(null);
  const saveCommitment=async event=>{event.preventDefault();try{await editor.createCommitment(commitment);setCommitment(null);onSuccess('Commercial commitment created.')}catch(error){onError(error)}};
  const saveForecast=async event=>{event.preventDefault();try{await editor.createCostPackageForecast(forecast);setForecast(null);onSuccess('Cost Package forecast version created.')}catch(error){onError(error)}};
  return{commitment,forecast,setCommitment,setForecast,startCommitment:row=>setCommitment(startCommercialCommitmentDraft(row)),startForecast:row=>setForecast(startCostPackageForecastDraft(row)),cancelCommitment:()=>setCommitment(null),cancelForecast:()=>setForecast(null),saveCommitment,saveForecast};
}
