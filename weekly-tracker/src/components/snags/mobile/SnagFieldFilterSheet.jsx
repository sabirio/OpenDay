import Modal from '../../shared/Modal.jsx';
import SnagFilters from '../SnagFilters.jsx';

// Compact filter drawer for mobile — same accessible Modal shell used
// elsewhere in the app (focus trap, Escape-to-close, scroll lock), styled
// bottom-anchored, wrapping the existing SnagFilters form unchanged so
// filter semantics/state stay identical to desktop.
export default function SnagFieldFilterSheet({ filters, onChange, onReset, onClose, activeCount }) {
  return (
    <Modal
      onClose={onClose}
      titleId="snag-field-filters-heading"
      className="snag-field-sheet"
      overlayClassName="snag-field-sheet-overlay"
      testId="snag-field-filter-sheet"
    >
      <div className="snag-field-sheet-header">
        <h2 id="snag-field-filters-heading">Filters{activeCount ? ` (${activeCount})` : ''}</h2>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
      <SnagFilters filters={filters} onChange={onChange} onReset={onReset} />
    </Modal>
  );
}
