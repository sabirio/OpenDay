export default function StickySubmitBar({ onSubmit, disabled = false, label = "Submit Weekly Report" }) {
  return (
    <>
      <div className="field-form-sticky-submit-spacer" />
      <div className="field-form-sticky-submit">
        <span className="contractor-report-autosave-note">Draft changes save automatically</span>
        <button
          type="button"
          data-testid="save-contractor-report"
          onClick={onSubmit}
          disabled={disabled}
          className="btn btn-primary contractor-report-submit"
        >
          {label}
        </button>
      </div>
    </>
  );
}
