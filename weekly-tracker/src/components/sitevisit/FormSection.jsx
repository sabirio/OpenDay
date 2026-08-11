import AnalyticalSection from "../shared/detail/AnalyticalSection.jsx";

const ACCENT = "var(--field-accent-sitevisit)";

function FormSection({ title, accentColor = ACCENT, note, children }) {
  return (
    <AnalyticalSection
      title={title}
      description={note}
      className="site-visit-section"
      data-accent-color={accentColor}
    >
      <div className="site-visit-section-content">
        {children}
      </div>
    </AnalyticalSection>
  );
}

export default FormSection;
export { ACCENT };
