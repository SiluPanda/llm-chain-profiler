import type { Profile, Span, ReportOptions } from './types';

export function formatTerminal(profile: Profile, options?: ReportOptions): string {
  const lines: string[] = [];
  const brief = options?.verbosity === 'brief';
  lines.push(`\nProfile: ${profile.name} (${profile.totalDurationMs.toFixed(1)}ms total)`);
  lines.push(`   Spans: ${profile.allSpans.length} | LLM calls: ${profile.metrics.llmCallCount}`);
  if (profile.metrics.firstTtftMs) {
    lines.push(`   TTFT: ${profile.metrics.firstTtftMs.toFixed(1)}ms`);
  }
  if (profile.metrics.averageTps > 0) {
    lines.push(`   Avg TPS: ${profile.metrics.averageTps.toFixed(1)}`);
  }
  if (profile.metrics.totalInputTokens > 0 || profile.metrics.totalOutputTokens > 0) {
    lines.push(`   Tokens: ${profile.metrics.totalInputTokens}in / ${profile.metrics.totalOutputTokens}out`);
  }
  if (!brief) {
    lines.push(`\n   Span Tree:`);
    const tree = formatSpanTree(profile.rootSpan, 0, options);
    if (tree) lines.push(tree);
  }
  return lines.join('\n');
}

function formatSpanTree(span: Span, depth: number, options?: ReportOptions): string {
  const showOverhead = options?.showOverhead !== false;
  if (span.type === 'overhead' && !showOverhead) return '';
  const indent = '  '.repeat(depth + 2);
  const dur = span.duration !== undefined ? span.duration.toFixed(1) : '...';
  const errorSuffix = span.error ? ` [ERROR: ${span.error.message}]` : '';
  const lines = [`${indent}+- ${span.name} [${span.type}] ${dur}ms${errorSuffix}`];
  for (const child of span.children) {
    const childStr = formatSpanTree(child, depth + 1, options);
    if (childStr) lines.push(childStr);
  }
  return lines.join('\n');
}
