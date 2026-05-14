import { useState } from 'react'

import type { TraceStep } from '../types'

interface TraceTimelineProps {
  steps: TraceStep[]
  locale?: 'en' | 'zh'
}

const KNOWN_TRACE_COPY: Array<{ english: string, chinese: string }> = [
  {
    english: 'Receive Task Input',
    chinese: '接收任务输入',
  },
  {
    english: 'Received user request with execution_mode=mock, provider=deepseek, model_name=deepseek-chat, prompt_version=v1.',
    chinese: '收到用户请求，execution_mode=mock，provider=deepseek，model_name=deepseek-chat，prompt_version=v1。',
  },
  {
    english: 'Call Local Search Tool',
    chinese: '调用本地搜索工具',
  },
  {
    english: 'Use an offline mock search tool so the MVP runs locally on Windows with stable results.',
    chinese: '使用离线 mock 搜索工具，保证 MVP 在 Windows 本地可运行且结果稳定。',
  },
]

function pickLocaleText(locale: 'en' | 'zh', english: string, chinese: string): string {
  return locale === 'en' ? english : chinese
}

function localizeKnownTraceCopy(locale: 'en' | 'zh', value: string): string {
  const match = KNOWN_TRACE_COPY.find((item) => item.english === value || item.chinese === value)
  return match ? pickLocaleText(locale, match.english, match.chinese) : value
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

export function TraceTimeline({ steps, locale = 'en' }: TraceTimelineProps) {
  const [showAllSteps, setShowAllSteps] = useState(false)
  const [expandedPayloadStepIds, setExpandedPayloadStepIds] = useState<number[]>([])
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 4)

  function togglePayload(stepId: number) {
    setExpandedPayloadStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId])
  }

  return (
    <div className="timeline">
      {steps.length > 4 ? (
        <div className="detail-actions detail-actions--hero">
          <button className="secondary-button" onClick={() => setShowAllSteps((current) => !current)} type="button">
            {showAllSteps ? pickLocaleText(locale, 'Show Fewer Steps', '收起步骤') : pickLocaleText(locale, `Show All ${steps.length} Steps`, `展开全部 ${steps.length} 个步骤`)}
          </button>
        </div>
      ) : null}
      {visibleSteps.map((step) => {
        const showPayload = expandedPayloadStepIds.includes(step.id)
        return (
        <article key={step.id} className="timeline-card">
          <div className="timeline-card__header">
            <div className="timeline-card__title-group">
              <span className="timeline-card__index">Step {step.step_index}</span>
              <span className="timeline-card__type">{getStepTypeLabel(step.step_type)}</span>
            </div>
            <span className="timeline-card__status">{step.status}</span>
          </div>
          <h3>{localizeKnownTraceCopy(locale, step.title)}</h3>
          <p>{localizeKnownTraceCopy(locale, step.detail)}</p>
          {step.tool_name ? <p><strong>Tool:</strong> {step.tool_name}</p> : null}
          {step.tool_input || step.tool_output ? (
            <div className="detail-actions detail-actions--hero">
              <button className="secondary-button" onClick={() => togglePayload(step.id)} type="button">
                {showPayload ? pickLocaleText(locale, 'Hide Payload', '收起 Payload') : pickLocaleText(locale, 'Show Payload', '展开 Payload')}
              </button>
            </div>
          ) : null}
          {showPayload && step.tool_input ? (
            <div className="timeline-card__payload">
              <span className="timeline-card__payload-label">{pickLocaleText(locale, 'Input Payload', '输入 Payload')}</span>
              <pre>{step.tool_input}</pre>
            </div>
          ) : null}
          {showPayload && step.tool_output ? (
            <div className="timeline-card__payload">
              <span className="timeline-card__payload-label">{pickLocaleText(locale, 'Output Payload', '输出 Payload')}</span>
              <pre>{step.tool_output}</pre>
            </div>
          ) : null}
          <p className="timeline-card__meta">Latency: {step.latency_ms} ms</p>
          {step.error_message ? <p className="timeline-card__error">{step.error_message}</p> : null}
        </article>
      )})}
    </div>
  )
}