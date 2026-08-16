import { useMemo, useState } from 'react';
import { buildVariationWorkspacePresentation, changeAdditionalWorkDraft, prepareAdditionalWorkTransition, startAdditionalWorkDraft, startAdditionalWorkEdit, validateAdditionalWorkDraft } from '../core/presentation/variationPresentationModel.js';
import { buildVariationExposurePresentation, buildCommercialReviewView } from '../core/presentation/variationPresentationModel.js';
import { buildCommercialReviewPresentation } from '../core/presentation/commercialReviewPresentationModel.js';

export function useVariationWorkspacePresentation(editor) {
  const [draft,setDraft]=useState(null);const[errors,setErrors]=useState({});
  const view=useMemo(()=>buildVariationWorkspacePresentation(editor.workspace,draft),[draft,editor.workspace]);
  const patch=patch=>setDraft(value=>changeAdditionalWorkDraft(value,patch));
  const start=()=>{setDraft(startAdditionalWorkDraft(editor.workspace.currencyCode));setErrors({})};
  const edit=item=>{setDraft(startAdditionalWorkEdit(item));setErrors({})};
  const cancel=()=>{setDraft(null);setErrors({})};
  const save=async()=>{const inspection=validateAdditionalWorkDraft(draft);setErrors(inspection.errors);if(!inspection.valid)return{ok:false,validation:true};try{await editor.save(draft);cancel();return{ok:true}}catch(error){return{ok:false,error}}};
  const transition=async(item,action,form)=>{try{await editor.transition(item.variationId,prepareAdditionalWorkTransition(item,action,form));return{ok:true}}catch(error){return{ok:false,error}}};
  return{draft,errors,view,patch,start,edit,cancel,save,transition};
}

export function useVariationExposurePresentation(exposure){return useMemo(()=>buildVariationExposurePresentation(exposure),[exposure])}
export function useCommercialReviewView(review,currency){const buckets=useMemo(()=>buildCommercialReviewPresentation(review),[review]);return useMemo(()=>buildCommercialReviewView(review,currency,buckets),[buckets,currency,review])}
