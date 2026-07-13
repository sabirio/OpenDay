import * as pdfjs from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
export async function openPdfBlob(blob){const bytes=await blob.arrayBuffer();const task=pdfjs.getDocument({data:bytes});try{const document=await task.promise;if(document.numPages<1)throw new Error('INVALID_PDF');return {document,pageCount:document.numPages,destroy:()=>task.destroy()}}catch(error){task.destroy();throw Object.assign(new Error('PDF_PARSE_FAILED'),{code:'PDF_PARSE_FAILED',cause:error})}}
