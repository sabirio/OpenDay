const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'mapping', label: 'Map' },
  { id: 'preview', label: 'Review' },
  { id: 'result', label: 'Result' },
];

export default function StepIndicator({ current }) {
  const currentIndex = STEPS.findIndex(step => step.id === current);
  return (
    <ol className="import-steps" aria-label="Import progress">
      {STEPS.map((step, index) => {
        const isActive = step.id === current;
        const isDone = index < currentIndex;
        const className = ['import-step', isActive ? 'import-step--active' : '', isDone ? 'import-step--done' : ''].filter(Boolean).join(' ');
        return (
          <li key={step.id} className={className} aria-current={isActive ? 'step' : undefined}>
            <span className="import-step-index" aria-hidden="true">{index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
