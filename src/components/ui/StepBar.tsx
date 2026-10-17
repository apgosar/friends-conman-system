import { cn } from './cn'

/** Numbered progress for a multi-step form. `step` is 1-based. */
export function StepBar({ step, steps }: { step: number; steps: string[] }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, i) => {
        const num = i + 1
        return (
          <li key={label} className={cn('stepper-item', step === num && 'is-active', step > num && 'is-done')} aria-current={step === num ? 'step' : undefined}>
            <div className="stepper-node">
              <span className="stepper-dot">{step > num ? '✓' : num}</span>
              <span className="stepper-label">{label}</span>
            </div>
            {i < steps.length - 1 && <span className="stepper-line" />}
          </li>
        )
      })}
    </ol>
  )
}
