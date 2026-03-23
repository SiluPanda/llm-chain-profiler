export type SpanType = 'chain' | 'step' | 'llm-call' | 'streaming' | 'tool-execution' | 'prompt-assembly' | 'post-processing' | 'overhead' | 'custom';

export interface Span {
  id: string;
  parentId?: string;
  name: string;
  type: SpanType;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, unknown>;
  children: Span[];
  error?: { message: string; code?: string };
}

export interface TimingMetrics {
  totalDurationMs: number;
  totalLlmCallDurationMs: number;
  totalToolExecutionDurationMs: number;
  totalOverheadDurationMs: number;
  firstTtftMs: number;
  averageTps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  llmCallCount: number;
  toolExecutionCount: number;
  percentageByType: Record<string, number>;
}

export interface Profile {
  id: string;
  name: string;
  startTimestamp: number;
  totalDurationMs: number;
  rootSpan: Span;
  allSpans: Span[];
  metrics: TimingMetrics;
  version: string;
}

export interface SpanOptions {
  type?: SpanType;
  parentId?: string;
  attributes?: Record<string, unknown>;
}

export interface SpanEndOptions {
  attributes?: Partial<Record<string, unknown>>;
  error?: { message: string; code?: string };
}

export interface ProfilerOptions {
  name?: string;
  enabled?: boolean;
  clockMode?: 'performance' | 'hrtime';
  minSpanDurationMs?: number;
}

export interface ReportOptions {
  output?: 'terminal' | 'json';
  color?: boolean;
  verbosity?: 'brief' | 'detailed';
  showOverhead?: boolean;
}

export interface ActiveSpan {
  readonly id: string;
  readonly name: string;
  end(options?: SpanEndOptions): void;
  setTTFT(ttftMs: number): void;
  addAttributes(attrs: Partial<Record<string, unknown>>): void;
}

export interface Profiler {
  span<T>(name: string, fn: () => T | Promise<T>, options?: SpanOptions): Promise<T>;
  startSpan(name: string, options?: SpanOptions): ActiveSpan;
  getProfile(): Profile;
  report(options?: ReportOptions): void;
  toJSON(): string;
  reset(): void;
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
}
