import type { EvaluationExperimentSummary, TraceDetail } from './types'

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function exportTraceAsJson(trace: TraceDetail) {
  downloadTextFile(`${trace.id}.json`, JSON.stringify(trace, null, 2), 'application/json;charset=utf-8')
}

export function exportTraceAsMarkdown(trace: TraceDetail) {
  const lines = [
    '# Trace Report',
    '',
    `- Trace ID: ${trace.id}`,
    `- Task Type: ${trace.task_type}`,
    `- Status: ${trace.status}`,
    `- Execution Mode: ${trace.execution_mode}`,
    `- Provider: ${trace.provider}`,
    `- Model Name: ${trace.model_name}`,
    `- Prompt Version: ${trace.prompt_version}`,
    `- Token Usage: ${trace.token_usage}`,
    `- Input Token Usage: ${trace.input_token_usage}`,
    `- Output Token Usage: ${trace.output_token_usage}`,
    `- Cached Token Usage: ${trace.cached_token_usage}`,
    `- Total Latency: ${trace.total_latency_ms} ms`,
    '',
    '## Input',
    '',
    trace.task_input,
    '',
    '## Final Output',
    '',
    trace.final_output,
    '',
    '## Steps',
    '',
  ]

  for (const step of trace.steps) {
    lines.push(`### Step ${step.step_index}: ${step.title}`)
    lines.push('')
    lines.push(`- Type: ${step.step_type}`)
    lines.push(`- Status: ${step.status}`)
    lines.push(`- Latency: ${step.latency_ms} ms`)
    lines.push(`- Detail: ${step.detail}`)
    if (step.tool_name) {
      lines.push(`- Tool: ${step.tool_name}`)
    }
    if (step.tool_input) {
      lines.push('')
      lines.push('```text')
      lines.push(step.tool_input)
      lines.push('```')
    }
    if (step.tool_output) {
      lines.push('')
      lines.push('```text')
      lines.push(step.tool_output)
      lines.push('```')
    }
    lines.push('')
  }

  downloadTextFile(`${trace.id}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
}

export function exportExperimentSummaryAsJson(summary: EvaluationExperimentSummary) {
  downloadTextFile(`experiment-${summary.experiment_label}.json`, JSON.stringify(summary, null, 2), 'application/json;charset=utf-8')
}

export function exportExperimentSummaryAsMarkdown(summary: EvaluationExperimentSummary) {
  const lines = [
    `# Experiment Summary: ${summary.experiment_label}`,
    '',
    `- Suite: ${summary.suite_name}`,
    `- Runs: ${summary.run_count}`,
    `- Average Run Score: ${summary.average_run_score ?? 'n/a'}`,
    `- Max Run Score Spread: ${summary.max_run_score_spread ?? 'n/a'}`,
    '',
    '## Runs',
    ...summary.run_columns.map((run) => `- ${run.label} | ${run.model_name} | avg=${run.average_score ?? 'n/a'}`),
    '',
    '## Case Summaries',
    ...summary.case_summaries.map((item) => `- ${item.case_title}: avg=${item.average_score ?? 'n/a'}, best=${item.best_score ?? 'n/a'}, worst=${item.worst_score ?? 'n/a'}, spread=${item.score_spread ?? 'n/a'}, reviews=${item.review_coverage}`),
    '',
    '## Matrix',
  ]

  for (const row of summary.matrix_rows) {
    lines.push(`### ${row.case_title}`)
    lines.push(`- Spread: ${row.score_spread ?? 'n/a'}`)
    for (const cell of row.cells) {
      const run = summary.run_columns.find((item) => item.run_id === cell.run_id)
      lines.push(`- ${run?.label ?? `run-${cell.run_id}`}: label=${cell.quality_label ?? 'n/a'}, score=${cell.quality_score ?? 'n/a'}, review=${cell.latest_review_label ?? 'n/a'}, adjudication=${cell.adjudication_label ?? 'n/a'}`)
    }
    lines.push('')
  }

  downloadTextFile(`experiment-${summary.experiment_label}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
}