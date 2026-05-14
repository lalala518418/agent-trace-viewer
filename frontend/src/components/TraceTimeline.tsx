import type { TraceStep } from '../types'

interface TraceTimelineProps {
  steps: TraceStep[]
}

function getStepTypeLabel(stepType: string) {
  switch (stepType) {
    case 'input':
      return 'Input'
    case 'reasoning':
      return 'Reasoning'
    case 'tool_call':
      return 'Tool Call'
    case 'llm_call':
      return 'LLM Call'
    default:
      return stepType
  }
}

export function TraceTimeline({ steps }: TraceTimelineProps) {
  return (
    <div className="timeline">
      {steps.map((step) => (
        <article key={step.id} className="timeline-card">
          <div className="timeline-card__header">
            <div className="timeline-card__title-group">
              <span className="timeline-card__index">Step {step.step_index}</span>
              <span className="timeline-card__type">{getStepTypeLabel(step.step_type)}</span>
            </div>
            <span className="timeline-card__status">{step.status}</span>
          </div>
          <h3>{step.title}</h3>
          <p>{step.detail}</p>
          {step.tool_name ? <p><strong>Tool:</strong> {step.tool_name}</p> : null}
          {step.tool_input ? (
            <div className="timeline-card__payload">
              <span className="timeline-card__payload-label">Input Payload</span>
              <pre>{step.tool_input}</pre>
            </div>
          ) : null}
          {step.tool_output ? (
            <div className="timeline-card__payload">
              <span className="timeline-card__payload-label">Output Payload</span>
              <pre>{step.tool_output}</pre>
            </div>
          ) : null}
          <p className="timeline-card__meta">Latency: {step.latency_ms} ms</p>
          {step.error_message ? <p className="timeline-card__error">{step.error_message}</p> : null}
        </article>
      ))}
    </div>
  )
}