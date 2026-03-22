# llm-chain-profiler

Flame-chart latency profiler for LLM chains.

[![npm version](https://img.shields.io/npm/v/llm-chain-profiler.svg)](https://www.npmjs.com/package/llm-chain-profiler)
[![npm downloads](https://img.shields.io/npm/dt/llm-chain-profiler.svg)](https://www.npmjs.com/package/llm-chain-profiler)
[![license](https://img.shields.io/npm/l/llm-chain-profiler.svg)](https://github.com/SiluPanda/llm-chain-profiler/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/llm-chain-profiler.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

---

## Description

`llm-chain-profiler` instruments the individual timing phases of an LLM chain execution -- prompt assembly, API call dispatch, time-to-first-token (TTFT), streaming duration, tool execution, post-processing, and inter-step overhead -- and produces structured timing breakdowns that answer the question: **where is the time actually going?**

Every phase becomes a named, individually timed **span** in a hierarchical tree. Parent-child relationships between spans are tracked automatically via `AsyncLocalStorage`, so nested `span()` calls produce a correct tree without any manual wiring. The profiler reports timing data as terminal trees, JSON objects, or structured `Profile` objects with computed metrics.

**Key characteristics:**

- Zero mandatory runtime dependencies beyond Node.js built-ins
- Sub-millisecond timing resolution via `performance.now()` or `process.hrtime`
- Automatic async context propagation for parent-child span nesting
- Zero overhead when disabled (single boolean check per span call)
- First-class streaming support with TTFT and tokens-per-second tracking

---

## Installation

```bash
npm install llm-chain-profiler
```

Requires Node.js 18 or later.

---

## Quick Start

### Span wrapper (recommended)

Wrap each phase of your chain with `profiler.span()`. Nesting is automatic -- any `span()` or `startSpan()` call inside the callback inherits the current span as its parent via `AsyncLocalStorage`.

```typescript
import { createProfiler } from 'llm-chain-profiler';

const profiler = createProfiler({ name: 'rag-pipeline' });

const answer = await profiler.span('full-chain', async () => {
  const context = await profiler.span('retrieval', async () => {
    return queryVectorDB(userQuery);
  }, { type: 'tool-execution' });

  const prompt = await profiler.span('prompt-assembly', async () => {
    return buildPrompt(userQuery, context);
  }, { type: 'prompt-assembly' });

  const response = await profiler.span('llm-call', async () => {
    return callModel(prompt);
  }, { type: 'llm-call', attributes: { model: 'gpt-4o', inputTokens: 1024 } });

  return response;
}, { type: 'chain' });

profiler.report();
```

Output:

```
Profile: rag-pipeline (1842.3ms total)
   Spans: 4 | LLM calls: 1
   Tokens: 1024in / 0out

   Span Tree:
     +- full-chain [chain] 1842.3ms
       +- retrieval [tool-execution] 340.2ms
       +- prompt-assembly [prompt-assembly] 12.1ms
       +- llm-call [llm-call] 1490.0ms
```

### Manual startSpan / end

For code that cannot be expressed as a single callback -- event-driven code, streams, callbacks -- use `startSpan()` and manually call `end()`.

```typescript
const span = profiler.startSpan('web-search', { type: 'tool-execution' });
span.addAttributes({ tool: 'web-search', query: 'latest news' });

try {
  const result = await webSearch(query);
  span.end();
  return result;
} catch (err) {
  span.end({ error: { message: String(err) } });
  throw err;
}
```

### Streaming profiling (TTFT + TPS)

Track time-to-first-token and tokens-per-second for streaming LLM responses.

```typescript
const stream = profiler.startSpan('gpt-stream', { type: 'streaming' });
const tokens: string[] = [];
let firstToken = true;
const start = performance.now();

for await (const chunk of openaiStream) {
  if (firstToken && chunk.choices?.[0]?.delta?.content) {
    stream.setTTFT(performance.now() - start);
    firstToken = false;
  }
  if (chunk.choices?.[0]?.delta?.content) {
    tokens.push(chunk.choices[0].delta.content);
  }
}

stream.addAttributes({
  outputTokens: tokens.length,
  tps: tokens.length / ((performance.now() - start) / 1000),
});
stream.end();
```

---

## Features

- **Hierarchical span tree** -- Spans nest automatically via `AsyncLocalStorage`. Call `profiler.span()` inside another `profiler.span()` and the inner span becomes a child of the outer span, across any number of `await` boundaries.

- **Nine built-in span types** -- `chain`, `step`, `llm-call`, `streaming`, `tool-execution`, `prompt-assembly`, `post-processing`, `overhead`, and `custom`. Each type is tracked independently in metrics aggregation.

- **Computed timing metrics** -- `getProfile()` returns a `TimingMetrics` object with totals by span type, token counts, LLM call counts, tool execution counts, TTFT, average TPS, and percentage-of-total breakdowns.

- **Terminal report** -- `report()` prints an indented span tree with durations and key metrics. Supports `brief` and `detailed` verbosity modes, overhead span visibility toggle, and JSON output.

- **JSON serialization** -- `toJSON()` serializes the complete profile to a JSON string for storage, comparison, or programmatic analysis.

- **Enable/disable toggle** -- `disable()` makes the profiler a zero-overhead passthrough. `span()` calls the wrapped function directly without recording. Re-enable at any time with `enable()`.

- **Reset** -- `reset()` clears all spans and resets the clock for a fresh profiling session without creating a new profiler instance.

- **Error tracking** -- When a wrapped function throws, the span records the error message and optional error code, sets the end time to the moment of the throw, and re-throws the error to the caller.

- **Streaming-first design** -- `setTTFT()` and `addAttributes()` on `ActiveSpan` enable precise TTFT and TPS measurement for streaming responses.

---

## API Reference

### `createProfiler(options?)`

Factory function. Returns a `Profiler` instance.

```typescript
import { createProfiler } from 'llm-chain-profiler';

const profiler = createProfiler({
  name: 'my-chain',
  enabled: true,
});
```

**Parameters:**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'profile'` | Name for this profiling session. Appears in reports and JSON output. |
| `enabled` | `boolean` | `true` | When `false`, all profiling operations become no-ops. |
| `clockMode` | `'performance' \| 'hrtime'` | Auto-detected | Clock source for timing. `'performance'` uses `performance.now()`. `'hrtime'` uses `process.hrtime.bigint()` converted to milliseconds. |
| `minSpanDurationMs` | `number` | `undefined` | Minimum span duration threshold. Spans shorter than this are still recorded but can be filtered in reports. |

**Returns:** `Profiler`

---

### `profiler.span(name, fn, options?)`

Wraps a synchronous or asynchronous function in a timed span. The current span is automatically set as the parent for any `span()` or `startSpan()` calls inside `fn` via `AsyncLocalStorage`.

```typescript
const result = await profiler.span('my-operation', async () => {
  // Any span() or startSpan() calls here will be children of 'my-operation'
  return doWork();
}, { type: 'llm-call', attributes: { model: 'gpt-4o' } });
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Name identifying the operation. |
| `fn` | `() => T \| Promise<T>` | The function to execute and time. |
| `options` | `SpanOptions` | Optional. Span type, explicit parent ID, and initial attributes. |

**Returns:** `Promise<T>` -- the return value of `fn`.

**Throws:** Re-throws any error thrown by `fn` after recording it on the span.

---

### `profiler.startSpan(name, options?)`

Creates a span and returns an `ActiveSpan` handle for manual lifecycle control. Parent is inferred from `AsyncLocalStorage` context unless `parentId` is provided explicitly.

```typescript
const span = profiler.startSpan('stream-phase', { type: 'streaming' });
// ... do work ...
span.setTTFT(312.5);
span.addAttributes({ outputTokens: 150, tps: 42.3 });
span.end();
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Name identifying the operation. |
| `options` | `SpanOptions` | Optional. Span type, explicit parent ID, and initial attributes. |

**Returns:** `ActiveSpan`

---

### `ActiveSpan`

The handle returned by `startSpan()`. Provides manual control over span lifecycle.

#### `activeSpan.id` (readonly)

The unique identifier for this span.

#### `activeSpan.name` (readonly)

The name of this span.

#### `activeSpan.end(options?)`

Ends the span, recording the end time and computing the duration.

```typescript
span.end();

// With error information:
span.end({ error: { message: 'connection timeout', code: 'ETIMEOUT' } });

// With additional attributes:
span.end({ attributes: { responseStatus: 200 } });
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `options` | `SpanEndOptions` | Optional. Additional attributes and/or error to record at span end. |

#### `activeSpan.setTTFT(ttftMs)`

Records the time-to-first-token in milliseconds. Intended for use on `streaming` type spans.

```typescript
span.setTTFT(312.5);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `ttftMs` | `number` | Time-to-first-token in milliseconds. |

#### `activeSpan.addAttributes(attrs)`

Merges additional attributes into the span. Can be called multiple times; attributes accumulate.

```typescript
span.addAttributes({ model: 'gpt-4o', temperature: 0.7 });
span.addAttributes({ outputTokens: 150 });
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `attrs` | `Record<string, unknown>` | Key-value pairs to merge into the span's attributes. |

---

### `profiler.getProfile()`

Builds and returns the complete `Profile` object containing the span tree, all spans, and computed timing metrics.

```typescript
const profile = profiler.getProfile();
console.log(profile.totalDurationMs);
console.log(profile.metrics.llmCallCount);
console.log(profile.metrics.percentageByType);
```

**Returns:** `Profile`

---

### `profiler.report(options?)`

Prints a human-readable report to the console.

```typescript
// Terminal tree (default)
profiler.report();

// Brief summary
profiler.report({ verbosity: 'brief' });

// JSON output
profiler.report({ output: 'json' });

// Hide overhead spans
profiler.report({ showOverhead: false });
```

**Parameters:**

| Option | Type | Default | Description |
|---|---|---|---|
| `output` | `'terminal' \| 'json'` | `'terminal'` | Output format. `'terminal'` prints an indented span tree. `'json'` prints the full profile as JSON. |
| `color` | `boolean` | `undefined` | Force color on or off in terminal output. |
| `verbosity` | `'brief' \| 'detailed'` | `'detailed'` | `'brief'` prints only the summary header. `'detailed'` includes the full span tree. |
| `showOverhead` | `boolean` | `true` | Whether to include overhead spans in the terminal tree. |

---

### `profiler.toJSON()`

Serializes the complete profile to a formatted JSON string.

```typescript
const json = profiler.toJSON();
const parsed = JSON.parse(json);
// parsed.name, parsed.allSpans, parsed.metrics, etc.
```

**Returns:** `string` -- pretty-printed JSON of the `Profile` object.

---

### `profiler.reset()`

Clears all recorded spans and resets the internal clock. The profiler is ready for a new profiling session. Configuration (name, enabled state) is preserved.

```typescript
profiler.reset();
// All previous spans are gone. Start fresh.
```

---

### `profiler.enable()`

Enables profiling. Subsequent `span()` and `startSpan()` calls will record spans.

```typescript
profiler.enable();
```

---

### `profiler.disable()`

Disables profiling. Subsequent `span()` calls execute the wrapped function directly with no recording. `startSpan()` returns a no-op `ActiveSpan`.

```typescript
profiler.disable();
```

---

### `profiler.isEnabled()`

Returns the current enabled state.

```typescript
if (profiler.isEnabled()) {
  console.log('Profiling is active');
}
```

**Returns:** `boolean`

---

## Configuration

### `ProfilerOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'profile'` | Name for the profiling session. |
| `enabled` | `boolean` | `true` | Enable or disable profiling at creation time. |
| `clockMode` | `'performance' \| 'hrtime'` | Auto-detected | Timing source. Both provide sub-millisecond resolution. |
| `minSpanDurationMs` | `number` | `undefined` | Minimum span duration threshold for filtering. |

### `SpanOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | `SpanType` | `'custom'` | The category of this span. |
| `parentId` | `string` | Auto-detected | Explicit parent span ID. If omitted, the parent is inferred from `AsyncLocalStorage` context. |
| `attributes` | `Record<string, unknown>` | `{}` | Initial key-value attributes for the span. |

### `SpanEndOptions`

| Option | Type | Description |
|---|---|---|
| `attributes` | `Record<string, unknown>` | Additional attributes to merge at span end. |
| `error` | `{ message: string; code?: string }` | Error information to record on the span. |

### `ReportOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `output` | `'terminal' \| 'json'` | `'terminal'` | Output format. |
| `color` | `boolean` | `undefined` | Force ANSI color on or off. |
| `verbosity` | `'brief' \| 'detailed'` | `'detailed'` | Report verbosity level. |
| `showOverhead` | `boolean` | `true` | Show or hide overhead spans. |

### Span Types

| Type | Description |
|---|---|
| `'chain'` | Top-level chain execution. |
| `'step'` | A discrete step within a chain. |
| `'llm-call'` | An LLM API call (streaming or non-streaming). |
| `'streaming'` | The streaming phase of an LLM response. |
| `'tool-execution'` | External tool or function call. |
| `'prompt-assembly'` | Prompt template rendering and context injection. |
| `'post-processing'` | Response parsing, extraction, or transformation. |
| `'overhead'` | Inter-step gap time (framework overhead, scheduling). |
| `'custom'` | Any operation that does not fit the above categories. |

---

## Error Handling

Errors thrown inside `profiler.span()` are recorded on the span and re-thrown to the caller. The span's `error` field contains the error message and optional error code, and the span's `endTime` and `duration` are set to the moment the error occurred.

```typescript
try {
  await profiler.span('risky-call', async () => {
    throw new Error('API rate limited');
  }, { type: 'llm-call' });
} catch (err) {
  // err is re-thrown -- handle as normal
}

const profile = profiler.getProfile();
const failedSpan = profile.allSpans.find(s => s.name === 'risky-call');
console.log(failedSpan?.error);
// { message: 'Error: API rate limited' }
```

For manual spans, pass error information to `end()`:

```typescript
const span = profiler.startSpan('external-api', { type: 'tool-execution' });
try {
  await callExternalAPI();
  span.end();
} catch (err) {
  span.end({
    error: { message: String(err), code: 'API_ERROR' },
  });
  throw err;
}
```

The profiler itself never throws during normal operation. A disabled profiler silently passes through all calls. `getProfile()` returns a valid (empty) profile even when no spans have been recorded.

---

## Advanced Usage

### Nested span trees

Span nesting is automatic. Any `span()` or `startSpan()` call made inside the callback of another `span()` call inherits the outer span as its parent. This works across `await` boundaries and through any depth of function calls, powered by `AsyncLocalStorage`.

```typescript
await profiler.span('agent-loop', async () => {
  for (let turn = 0; turn < 3; turn++) {
    await profiler.span(`turn-${turn}`, async () => {
      await profiler.span('llm-call', async () => {
        return callModel();
      }, { type: 'llm-call' });

      await profiler.span('tool-call', async () => {
        return executeTool();
      }, { type: 'tool-execution' });
    }, { type: 'step' });
  }
}, { type: 'chain' });
```

This produces a tree:

```
+- agent-loop [chain]
  +- turn-0 [step]
    +- llm-call [llm-call]
    +- tool-call [tool-execution]
  +- turn-1 [step]
    +- llm-call [llm-call]
    +- tool-call [tool-execution]
  +- turn-2 [step]
    +- llm-call [llm-call]
    +- tool-call [tool-execution]
```

### Explicit parent ID

Override automatic parent detection by passing `parentId` in span options. This is useful when the logical parent-child relationship does not align with the call stack.

```typescript
const parentSpan = profiler.startSpan('parent', { type: 'chain' });

// This span will be a child of 'parent' regardless of AsyncLocalStorage context
await profiler.span('child', async () => {
  return doWork();
}, { type: 'step', parentId: parentSpan.id });

parentSpan.end();
```

### Enable/disable mid-session

Toggle profiling at runtime. Spans created while disabled are not recorded. Previously recorded spans are preserved.

```typescript
const profiler = createProfiler({ name: 'conditional' });

await profiler.span('always-profiled', async () => work());

profiler.disable();
await profiler.span('not-profiled', async () => work()); // Executes fn, records nothing

profiler.enable();
await profiler.span('profiled-again', async () => work());

const profile = profiler.getProfile();
// profile.allSpans contains 'always-profiled' and 'profiled-again', but not 'not-profiled'
```

### Token tracking

Record input and output token counts on `llm-call` spans. These are aggregated into `metrics.totalInputTokens` and `metrics.totalOutputTokens`.

```typescript
await profiler.span('gpt-4o-call', async () => {
  const response = await openai.chat.completions.create({ ... });
  return response;
}, {
  type: 'llm-call',
  attributes: {
    model: 'gpt-4o',
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  },
});
```

### JSON export for CI comparisons

Export the profile as JSON and compare across runs for latency regression detection.

```typescript
import { writeFileSync } from 'fs';

const profiler = createProfiler({ name: 'baseline' });
// ... run chain ...

const json = profiler.toJSON();
writeFileSync('profile-baseline.json', json);

// In CI, compare against stored baseline:
const baseline = JSON.parse(readFileSync('profile-baseline.json', 'utf-8'));
const current = profiler.getProfile();

if (current.totalDurationMs > baseline.totalDurationMs * 1.1) {
  throw new Error('Latency regression detected: 10% slower than baseline');
}
```

### Profiling metrics breakdown

Access computed metrics for programmatic analysis.

```typescript
const profile = profiler.getProfile();
const { metrics } = profile;

console.log(`Total: ${metrics.totalDurationMs.toFixed(1)}ms`);
console.log(`LLM calls: ${metrics.llmCallCount} (${metrics.totalLlmCallDurationMs.toFixed(1)}ms)`);
console.log(`Tool executions: ${metrics.toolExecutionCount} (${metrics.totalToolExecutionDurationMs.toFixed(1)}ms)`);
console.log(`Overhead: ${metrics.totalOverheadDurationMs.toFixed(1)}ms`);
console.log(`TTFT: ${metrics.firstTtftMs.toFixed(1)}ms`);
console.log(`Avg TPS: ${metrics.averageTps.toFixed(1)}`);
console.log(`Tokens: ${metrics.totalInputTokens} in / ${metrics.totalOutputTokens} out`);
console.log(`Time by type:`, metrics.percentageByType);
```

---

## TypeScript

`llm-chain-profiler` is written in strict TypeScript and ships complete type definitions. All public types are exported from the package root.

```typescript
import {
  createProfiler,
  type Profiler,
  type Profile,
  type Span,
  type SpanType,
  type ActiveSpan,
  type SpanOptions,
  type SpanEndOptions,
  type ProfilerOptions,
  type ReportOptions,
  type TimingMetrics,
} from 'llm-chain-profiler';
```

### Key type definitions

#### `Span`

```typescript
interface Span {
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
```

#### `Profile`

```typescript
interface Profile {
  id: string;
  name: string;
  startTimestamp: number;
  totalDurationMs: number;
  rootSpan: Span;
  allSpans: Span[];
  metrics: TimingMetrics;
  version: string;
}
```

#### `TimingMetrics`

```typescript
interface TimingMetrics {
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
```

#### `SpanType`

```typescript
type SpanType =
  | 'chain'
  | 'step'
  | 'llm-call'
  | 'streaming'
  | 'tool-execution'
  | 'prompt-assembly'
  | 'post-processing'
  | 'overhead'
  | 'custom';
```

#### `Profiler`

```typescript
interface Profiler {
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
```

---

## License

MIT
