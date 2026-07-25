/**
 * portfolioPaginationModel — Portfolio master-detail workspace's read-model
 * over paginationEngine: page count/clamping, the current page's slice, and
 * the bounded page-number window shown in the list pane's footer. One
 * canonical derivation for UI to consume, not reimplemented per component.
 */
import { computePageCount, clampPage, pageRange, paginate, pageWindow } from '../../engines/paginationEngine.js';

export { computePageCount, clampPage, pageRange, paginate, pageWindow };
