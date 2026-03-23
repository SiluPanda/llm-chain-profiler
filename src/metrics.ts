import type { Span, TimingMetrics } from './types';

export function computeMetrics(spans: Span[]): TimingMetrics {
  const byType: Record<string, number> = {};
  let llmCallDuration = 0;
  let toolDuration = 0;
  let overheadDuration = 0;
  let firstTtft = 0;
  let totalTps = 0;
  let tpsCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let llmCallCount = 0;
  let toolCount = 0;

  const totalDuration = spans.find((s) => !s.parentId)?.duration ?? 0;

  for (const span of spans) {
    if (span.duration === undefined) continue;
    byType[span.type] = (byType[span.type] ?? 0) + span.duration;
    switch (span.type) {
      case 'llm-call':
        llmCallDuration += span.duration;
        llmCallCount++;
        if (span.attributes.inputTokens !== undefined)
          inputTokens += span.attributes.inputTokens as number;
        if (span.attributes.outputTokens !== undefined)
          outputTokens += span.attributes.outputTokens as number;
        break;
      case 'tool-execution':
        toolDuration += span.duration;
        toolCount++;
        break;
      case 'overhead':
        overheadDuration += span.duration;
        break;
      case 'streaming':
        if (span.attributes.ttftMs !== undefined && firstTtft === 0)
          firstTtft = span.attributes.ttftMs as number;
        if (span.attributes.tps) {
          totalTps += span.attributes.tps as number;
          tpsCount++;
        }
        break;
    }
  }

  const percentageByType: Record<string, number> = {};
  for (const [type, dur] of Object.entries(byType)) {
    percentageByType[type] = totalDuration > 0 ? Math.round((dur / totalDuration) * 100) : 0;
  }

  return {
    totalDurationMs: totalDuration,
    totalLlmCallDurationMs: llmCallDuration,
    totalToolExecutionDurationMs: toolDuration,
    totalOverheadDurationMs: overheadDuration,
    firstTtftMs: firstTtft,
    averageTps: tpsCount > 0 ? totalTps / tpsCount : 0,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    llmCallCount,
    toolExecutionCount: toolCount,
    percentageByType,
  };
}
