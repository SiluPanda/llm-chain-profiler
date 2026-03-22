# llm-chain-profiler — Task Breakdown

This file tracks all tasks required to implement `llm-chain-profiler` per the SPEC.md. Each task is granular, actionable, and maps to a specific feature, type, test, or deliverable described in the specification.

---

## Phase 1: Project Scaffolding and Setup

- [ ] **Install dev dependencies** — Add `typescript`, `vitest`, `eslint`, `@types/node` as devDependencies in `package.json`. Verify `npm install` succeeds. | Status: not_done
- [ ] **Configure ESLint** — Create `.eslintrc` (or equivalent) with TypeScript parser and rules matching the monorepo conventions. Verify `npm run lint` runs without config errors. | Status: not_done
- [ ] **Add optional peer dependencies** — Add `openai` and `@anthropic-ai/sdk` as optional `peerDependencies` in `package.json` with permissive version ranges. | Status: not_done
- [ ] **Create source file structure** — Create all source files listed in SPEC section 16: `src/profiler.ts`, `src/span.ts`, `src/types.ts`, `src/clock.ts`, `src/context.ts`, `src/metrics.ts`, `src/report.ts`, `src/flame-chart.ts`, `src/otlp.ts`, `src/decorator.ts`, `src/instrument/index.ts`, `src/instrument/openai.ts`, `src/instrument/anthropic.ts`, `src/instrument/stream.ts`. Create empty stubs with appropriate module exports. | Status: not_done
- [ ] **Create test file structure** — Create all test files listed in SPEC section 16: `src/__tests__/profiler.test.ts`, `src/__tests__/span.test.ts`, `src/__tests__/streaming.test.ts`, `src/__tests__/instrument.test.ts`, `src/__tests__/report.test.ts`, `src/__tests__/flame-chart.test.ts`, `src/__tests__/otlp.test.ts`, `src/__tests__/metrics.test.ts`, `src/__tests__/integration.test.ts`. Create empty stubs. | Status: not_done
- [ ] **Verify build pipeline** — Run `npm run build` and confirm TypeScript compiles with no errors (even with stub files). Fix any tsconfig issues. | Status: not_done
- [ ] **Verify test pipeline** — Run `npm run test` and confirm vitest discovers the test files and exits cleanly (with zero tests or placeholder tests). | Status: not_done

---

## Phase 2: Core Types (src/types.ts)

- [x] **Define SpanType union type** — Implement the `SpanType` union: `'chain' | 'step' | 'llm-call' | 'streaming' | 'tool-execution' | 'prompt-assembly' | 'post-processing' | 'overhead' | 'custom'`. | Status: done
- [ ] **Define SpanAttributes types** — Implement all attribute interfaces: `ChainAttributes`, `StepAttributes`, `LlmCallAttributes`, `StreamingAttributes`, `ToolExecutionAttributes`, `PromptAssemblyAttributes`, `PostProcessingAttributes`, `OverheadAttributes`, `CustomAttributes`, and the discriminated union `SpanAttributes`. | Status: not_done
- [x] **Define Span interface** — Implement the `Span` interface with all fields: `id`, `parentId`, `name`, `type`, `startTime`, `endTime`, `duration`, `attributes`, `children`, `error`. | Status: done
- [x] **Define Profile interface** — Implement the `Profile` interface with: `id`, `name`, `startTimestamp`, `totalDurationMs`, `rootSpan`, `allSpans`, `metrics`, `version`. | Status: done
- [ ] **Define TimingMetrics interface** — Implement `TimingMetrics` with all fields: `totalDurationMs`, `totalLlmCallDurationMs`, `totalToolExecutionDurationMs`, `totalPromptAssemblyDurationMs`, `totalPostProcessingDurationMs`, `totalOverheadDurationMs`, `firstTtftMs`, `averageTps`, `totalInputTokens`, `totalOutputTokens`, `llmCallCount`, `toolExecutionCount`, `percentageByType`. | Status: not_done
- [ ] **Define FlameChartData interface** — Implement `FlameChartData` with `speedscope` (SpedscopeProfile) and `chromeTrace` (ChromeTraceEvent[]) fields. Define supporting types for speedscope evented profile format and Chrome trace event format. | Status: not_done
- [ ] **Define ProfilerOptions interface** — Implement `ProfilerOptions` with: `name`, `enabled`, `clockMode`, `computeOverhead`, `minSpanDurationMs`, `recordChunkTimeline`, `otlp`. | Status: not_done
- [ ] **Define OtlpExportOptions interface** — Implement with `endpoint`, `headers`, `serviceName`. | Status: not_done
- [x] **Define SpanOptions interface** — Implement with `type`, `parentId`, `attributes`. | Status: done
- [x] **Define SpanEndOptions interface** — Implement with `attributes`, `error`. | Status: done
- [x] **Define ActiveSpan interface** — Implement with `id`, `name`, `end()`, `setTTFT()`, `addAttributes()`. | Status: done
- [ ] **Define InstrumentOptions interface** — Implement with `capturePromptAssembly`, `captureModel`, `captureTokens`, `spanName`. | Status: not_done
- [ ] **Define ReportOptions interface** — Implement with `output`, `color`, `verbosity`, `showOverhead`, `minDurationMs`. | Status: not_done
- [ ] **Define Profiler interface** — Implement the full `Profiler` interface with all method signatures: `span()`, `startSpan()`, `instrument()`, `getProfile()`, `report()`, `toFlameChart()`, `toJSON()`, `exportOtlp()`, `reset()`, `enable()`, `disable()`, `isEnabled()`, `setAsActive()`. | Status: not_done
- [ ] **Define ProfilerError class** — Create a custom error class for profiler-specific errors (e.g., OTLP not configured). | Status: not_done

---

## Phase 3: Clock Abstraction (src/clock.ts)

- [x] **Implement performance.now() clock mode** — Export a `now()` function that returns `performance.now()` as the default clock. | Status: done
- [x] **Implement hrtime clock mode** — Implement an alternative `now()` that uses `process.hrtime.bigint()` and converts to milliseconds for nanosecond-precision timing. | Status: done
- [ ] **Implement clock factory** — Create a `createClock(mode: 'performance' | 'hrtime')` function that returns the appropriate `now()` implementation based on the `clockMode` option. | Status: not_done
- [ ] **Write clock tests** — Test monotonicity (successive calls return non-decreasing values). Test that both modes produce values in milliseconds. Test that resolution is sub-millisecond. | Status: not_done

---

## Phase 4: AsyncLocalStorage Context (src/context.ts)

- [x] **Implement span context with AsyncLocalStorage** — Create an `AsyncLocalStorage`-based context that tracks the current active span. Export `getCurrentSpan()` to retrieve the current parent span and `runWithSpan(span, fn)` to execute a function within a span's context. | Status: done
- [x] **Handle nested async contexts** — Ensure that nested `runWithSpan()` calls correctly set and restore the parent span, including across `await` boundaries and concurrent async operations. | Status: done
- [ ] **Write context tests** — Test: nested sync calls inherit parent correctly. Test: nested async calls inherit parent correctly. Test: concurrent async calls have independent context (span A's children do not appear in span B). Test: `getCurrentSpan()` returns `undefined` when no span is active. | Status: not_done

---

## Phase 5: Span Implementation (src/span.ts)

- [x] **Implement ActiveSpan class** — Create a class implementing the `ActiveSpan` interface. Constructor takes name, type, start time, parent ID. Track internal mutable state for attributes, error, endTime. | Status: done
- [ ] **Implement ActiveSpan.end()** — Record `endTime` using the clock, compute `duration`. Second call is a silent no-op. Accept optional `SpanEndOptions` to merge final attributes and error info. | Status: not_done
- [ ] **Implement ActiveSpan.setTTFT()** — Accept a `ttftMs` number. Only meaningful for `streaming` spans; silently ignored on other types. Store the value in the span's `StreamingAttributes`. | Status: not_done
- [x] **Implement ActiveSpan.addAttributes()** — Merge partial attributes into the span's existing attributes object. Can be called multiple times; attributes are merged, not replaced. | Status: done
- [x] **Implement Span serialization** — Implement a method or utility to convert an `ActiveSpan` (mutable, internal) to a `Span` (immutable, public) for the profile output. Include the `children` array. | Status: done
- [x] **Implement span error recording** — When the wrapped function throws, record the error message, code, and stack on the span. Set `endTime` to the moment of the throw. Re-throw the error to the caller. | Status: done
- [ ] **Write span unit tests** — Test: span creation with correct name, type, startTime. Test: `end()` sets endTime and duration. Test: `end()` called twice is a no-op. Test: `setTTFT()` on streaming span records correctly. Test: `setTTFT()` on non-streaming span is ignored. Test: `addAttributes()` merges attributes. Test: error recording on throw. | Status: not_done

---

## Phase 6: Core Profiler (src/profiler.ts)

- [ ] **Implement createProfiler() factory** — Accept `ProfilerOptions`, apply defaults, resolve environment variable overrides (PROFILER_ENABLED, PROFILER_OTLP_ENDPOINT, PROFILER_OTLP_SERVICE_NAME, PROFILER_MIN_SPAN_MS). Return a `Profiler` instance. | Status: not_done
- [ ] **Implement configuration resolution order** — Apply: built-in defaults (lowest) -> options argument -> environment variables (highest). | Status: not_done
- [x] **Implement profiler.span()** — Accept `name`, `fn`, and optional `SpanOptions`. Use `context.ts` to infer parent span. Create an `ActiveSpan`, run `fn` within the span's context via `runWithSpan()`, record endTime on completion or error. Return `fn`'s result. Handle both sync and async `fn`. | Status: done
- [x] **Implement profiler.startSpan()** — Accept `name` and optional `SpanOptions`. Create an `ActiveSpan` and register it. Use `context.ts` for parent inference if `parentId` is not explicitly provided. Return the `ActiveSpan`. | Status: done
- [x] **Implement parent-child span nesting** — When `profiler.span()` is called inside another `profiler.span()`, the inner span automatically becomes a child of the outer span (via AsyncLocalStorage context). Add child to parent's `children` array. Set child's `parentId`. | Status: done
- [x] **Implement profiler.getProfile()** — Build and return a `Profile` object: generate UUID for profile ID, set `startTimestamp` (ISO 8601), compute `totalDurationMs` from root span or first/last span, build span tree, compute metrics. | Status: done
- [x] **Implement profiler.reset()** — Clear all recorded spans and timing data. Reset internal state so the profiler is ready for a new chain execution. Do not change configuration. | Status: done
- [ ] **Implement profiler.enable() and profiler.disable()** — When disabled: `span()` calls `fn()` directly with no timing; `startSpan()` returns a no-op `ActiveSpan`; `instrument()` returns the original client; `getProfile()` returns an empty profile. When re-enabled, resume normal recording. | Status: not_done
- [x] **Implement profiler.isEnabled()** — Return the current enabled state as a boolean. | Status: done
- [ ] **Implement no-op ActiveSpan** — Create a lightweight no-op implementation of `ActiveSpan` where `end()`, `setTTFT()`, and `addAttributes()` are empty functions. Used when the profiler is disabled. | Status: not_done
- [ ] **Implement PROFILER_ENABLED env var support** — Read `PROFILER_ENABLED` from `process.env`. Accept values `true`, `false`, `1`, `0`. Override the `enabled` option from `ProfilerOptions`. | Status: not_done
- [ ] **Implement profiler.setAsActive()** — Store this profiler instance as the global active profiler for use by the `@profile` decorator. | Status: not_done
- [x] **Implement profiler.toJSON()** — Serialize the complete `Profile` object to a JSON string. Ensure the output is stable and can be deserialized back to a `Profile`. | Status: done
- [ ] **Write core profiler tests** — Test: `createProfiler()` with default options. Test: `span()` with sync fn. Test: `span()` with async fn. Test: `span()` where fn throws (error recorded, error re-thrown). Test: nested `span()` calls produce correct parent-child relationships. Test: concurrent async spans are tracked independently. Test: `startSpan()` / `end()` pattern. Test: `reset()` clears all spans. Test: `disable()` makes span() a no-op. Test: `enable()` after `disable()` resumes recording. Test: `PROFILER_ENABLED=false` disables the profiler. Test: `getProfile()` returns correct structure. Test: `toJSON()` produces valid JSON matching `getProfile()`. | Status: not_done

---

## Phase 7: Overhead Computation and Metrics (src/metrics.ts)

- [x] **Implement computeMetrics()** — Accept a flat array of spans and the root span. Compute all `TimingMetrics` fields: totals by span type, token counts, call counts, TTFT, average TPS. | Status: done
- [ ] **Implement overhead gap detection** — For each parent span, examine its children in start-time order. Compute gaps between consecutive sibling spans (`children[i+1].startTime - children[i].endTime`). Generate synthetic `overhead` spans for gaps. | Status: not_done
- [x] **Implement percentageByType computation** — For each `SpanType`, sum durations of all spans of that type and compute their percentage of `totalDurationMs`. Include `overhead` in the breakdown. | Status: done
- [x] **Implement firstTtftMs extraction** — Find the first `streaming` span and read its `ttftMs` attribute. | Status: done
- [x] **Implement averageTps computation** — Average the `tps` values across all `streaming` spans that have a non-undefined `tps` attribute. | Status: done
- [x] **Implement token count aggregation** — Sum `inputTokens` and `outputTokens` across all `llm-call` spans. Count total `llm-call` and `tool-execution` spans. | Status: done
- [ ] **Handle edge cases in metrics** — Handle: no spans recorded (return zeroed metrics). Handle: spans with undefined duration (exclude from calculations). Handle: no streaming spans (TTFT and TPS are undefined). | Status: not_done
- [ ] **Write metrics tests** — Test: single span produces correct metrics. Test: multiple span types produce correct per-type totals and percentages. Test: overhead gaps are computed correctly between siblings. Test: TTFT is extracted from first streaming span. Test: average TPS across multiple streaming spans. Test: token aggregation across multiple llm-call spans. Test: empty profile returns zeroed metrics. Test: spans with undefined duration are excluded. | Status: not_done

---

## Phase 8: Terminal Report Renderer (src/report.ts)

- [ ] **Implement tree renderer** — Render the span tree as an indented text tree. Each line shows: span type icon, span type and name, duration in ms, percentage of total time. Indent children under their parent. | Status: not_done
- [ ] **Implement ANSI color coding** — Apply colors per spec: spans >50% of total in yellow, >80% in red, overhead spans in dim gray, TTFT values in cyan, token counts in dim. | Status: not_done
- [ ] **Implement color auto-detection** — Default to ANSI colors when `stdout.isTTY` is true and `NO_COLOR` env var is not set. Respect the `color` option in `ReportOptions`. | Status: not_done
- [x] **Implement report header** — Print a header line: `llm-chain-profiler: <name>  <totalDurationMs>ms total` followed by a separator line. | Status: done
- [ ] **Implement summary block** — After the tree, print a summary section showing: total chain time, LLM call time (with TTFT and streaming sub-breakdown), retrieval time, prompt assembly time, post-processing time, overhead time, token counts, call counts. | Status: not_done
- [ ] **Implement verbosity: 'summary' mode** — Render a single-line summary: `<name>  <totalMs>ms  (TTFT: <ttft>ms, TPS: <tps>, <in>/<out> tokens, <n> LLM call(s))`. | Status: not_done
- [ ] **Implement verbosity: 'detailed' mode** — Render the full tree plus span attributes and metadata below each span line (e.g., messageCount, estimatedTokenCount, model, inputTokens, outputTokens). | Status: not_done
- [x] **Implement showOverhead option** — When `showOverhead: false`, omit overhead spans from the tree output. | Status: done
- [ ] **Implement minDurationMs filtering** — Omit spans below `minDurationMs` threshold from the terminal tree. Collapse them into their parent. Does not affect JSON or flame chart output. | Status: not_done
- [ ] **Implement custom output stream** — Write report output to `options.output` (WritableStream) instead of `process.stdout` when provided. | Status: not_done
- [ ] **Implement empty profile handling** — When no spans are recorded, print a "no data" message instead of an empty tree. Do not throw. | Status: not_done
- [x] **Connect report.ts to profiler** — Implement `profiler.report(options?)` by calling the report renderer with the current profile. | Status: done
- [ ] **Write report tests** — Test: tree output contains all span names and durations. Test: `verbosity: 'summary'` produces single-line output. Test: `color: false` produces no ANSI escape codes. Test: overhead spans appear/disappear with `showOverhead`. Test: `minDurationMs` filters short spans. Test: empty profile prints "no data" message. Test: output goes to custom stream when provided. | Status: not_done

---

## Phase 9: Flame Chart Export (src/flame-chart.ts)

- [ ] **Implement speedscope evented profile format** — Convert the span tree to speedscope format: build `frames` array from unique span names, generate `O` (open) and `C` (close) events in chronological order, set `unit: 'milliseconds'`, set `startValue` and `endValue`. | Status: not_done
- [ ] **Implement Chrome trace event format** — Convert the span tree to Chrome DevTools trace event format: generate `ph: "B"` (begin) and `ph: "E"` (end) events, convert timestamps from milliseconds to microseconds, include span attributes in `args`, set `pid` and `tid` to 1. | Status: not_done
- [ ] **Implement profiler.toFlameChart()** — Return a `FlameChartData` object containing both `speedscope` and `chromeTrace` outputs. | Status: not_done
- [ ] **Write flame chart tests** — Test: speedscope output has valid structure (schema, version, frames, profiles). Test: all frames referenced in events exist in the frames array. Test: open/close events are balanced (every O has a matching C). Test: Chrome trace events have required fields (pid, tid, ph, ts, name). Test: Chrome timestamps are in microseconds (ms * 1000). Test: span attributes appear in Chrome trace `args`. Test: round-trip — write to temp file, read back, verify valid JSON matching schema. | Status: not_done

---

## Phase 10: Streaming Interception (src/instrument/stream.ts)

- [ ] **Implement async generator stream interceptor** — Create an `interceptStream()` function that wraps an `AsyncIterable` of chunks. Pass all chunks through unchanged to the consumer. Record `t_dispatch` before the stream starts. | Status: not_done
- [ ] **Implement TTFT recording in stream interceptor** — On the first non-empty content chunk, compute TTFT as `performance.now() - t_dispatch` and call `streamSpan.setTTFT(ttft)`. Define "non-empty" per provider: for OpenAI, `delta.content` is a non-empty string; for Anthropic, `delta.text` is non-empty or `type === 'content_block_delta'`. | Status: not_done
- [ ] **Implement TPS computation in stream interceptor** — On stream close, compute `streamingDurationMs = lastChunkTime - firstChunkTime` and `tps = outputTokens / (streamingDurationMs / 1000)`. End the streaming span with `outputTokens`, `tps`, and `chunkCount` attributes. | Status: not_done
- [ ] **Implement token counting from stream** — Prefer `usage.completion_tokens` from the final chunk (OpenAI with `stream_options.include_usage: true`). Fall back to counting non-empty content chunks as a proxy. Mark `tpsIsEstimate: true` when using the fallback. | Status: not_done
- [ ] **Implement chunk timeline recording** — When `recordChunkTimeline: true`, record `{ offset: number, tokens: number }` for each chunk. Store the timeline in the streaming span's attributes as `chunkTimeline`. | Status: not_done
- [ ] **Ensure stream transparency** — Verify that the intercepted stream behaves identically to the original: no buffering, no content modification, same async iterable interface. The profiler observes without storing content. | Status: not_done
- [ ] **Write streaming interception tests** — Test: mock stream with 5 chunks at 10ms intervals — TTFT recorded at first non-empty chunk. Test: stream with empty first chunk — TTFT triggered on second chunk. Test: stream with usage chunk — `outputTokens` read from `usage.completion_tokens`. Test: stream with no usage field — `outputTokens` estimated from chunk count, `tpsIsEstimate: true`. Test: TPS computed correctly. Test: `chunkCount` is accurate. Test: chunk timeline recorded when enabled. Test: intercepted stream yields all original chunks unchanged. | Status: not_done

---

## Phase 11: OpenAI SDK Instrumentation (src/instrument/openai.ts)

- [ ] **Implement OpenAI client Proxy** — Create a deep `Proxy` wrapping an OpenAI client instance. Intercept `client.chat.completions.create()`. Preserve full TypeScript types (return type is `OpenAI`). | Status: not_done
- [ ] **Implement non-streaming call instrumentation** — When `stream` is not `true` in the call args: create an `llm-call` span before the call, end it after the promise resolves, capture `model`, `inputTokens`, `outputTokens`, `statusCode` from the response. | Status: not_done
- [ ] **Implement streaming call instrumentation** — When `stream: true`: create an `llm-call` span, create a nested `streaming` span, wrap the returned stream with `interceptStream()` from `stream.ts`, record TTFT and TPS automatically. | Status: not_done
- [ ] **Implement provider detection** — Set `attributes.provider` to `'openai'` for OpenAI clients. | Status: not_done
- [ ] **Implement capturePromptAssembly option** — When enabled, capture the `messages` array size before the call and record it as context on the span. | Status: not_done
- [ ] **Implement captureModel option** — When enabled, read the `model` parameter from call arguments and set it as the span name or attribute. | Status: not_done
- [ ] **Implement captureTokens option** — When enabled, read `usage.prompt_tokens` and `usage.completion_tokens` from the API response. | Status: not_done
- [ ] **Implement custom spanName option** — Support `spanName` as a string or `(callArgs) => string` function for customizing the llm-call span name. Default to the model name. | Status: not_done
- [ ] **Implement error handling for API calls** — When the API call throws: record the `llm-call` span with error information (message, code, stack), set `endTime` to the moment of the error, re-throw the error. | Status: not_done
- [ ] **Write OpenAI instrumentation tests** — Test: `instrument(openaiClient)` returns a Proxy that is type-compatible with OpenAI. Test: non-streaming call creates `llm-call` span with correct attributes. Test: streaming call creates `llm-call` and nested `streaming` span with TTFT and TPS. Test: token counts captured from response `usage`. Test: API error is recorded on span and re-thrown. Test: disabled profiler returns the original client unchanged. | Status: not_done

---

## Phase 12: Anthropic SDK Instrumentation (src/instrument/anthropic.ts)

- [ ] **Implement Anthropic client Proxy** — Create a deep `Proxy` wrapping an Anthropic client instance. Intercept `client.messages.create()` and `client.messages.stream()`. Preserve TypeScript types. | Status: not_done
- [ ] **Implement non-streaming call instrumentation** — Intercept `messages.create()` (non-streaming): create `llm-call` span, capture model, input/output tokens from response `usage`, end span on response. | Status: not_done
- [ ] **Implement streaming call instrumentation** — Intercept `messages.stream()`: create `llm-call` span with nested `streaming` span. Listen for `text` events (TTFT on first), `message_start` (input_tokens), `message_delta` with `stop_reason` (output_tokens), `end` (finalize span). | Status: not_done
- [ ] **Implement Anthropic-specific TTFT definition** — TTFT triggers on the first `content_block_delta` event with non-empty `delta.text`, not on `message_start` or empty deltas. | Status: not_done
- [ ] **Implement provider detection** — Set `attributes.provider` to `'anthropic'` for Anthropic clients. | Status: not_done
- [ ] **Write Anthropic instrumentation tests** — Test: `instrument(anthropicClient)` returns type-compatible Proxy. Test: non-streaming call creates correct span. Test: streaming creates llm-call + streaming spans with TTFT and TPS. Test: token counts captured from Anthropic response format. Test: error handling. | Status: not_done

---

## Phase 13: Instrument Dispatch (src/instrument/index.ts)

- [ ] **Implement SDK auto-detection** — In `profiler.instrument(client)`, detect whether the client is an OpenAI instance (check for `client.chat?.completions?.create`), an Anthropic instance (check for `client.messages?.create`), or unknown. Route to the appropriate instrumentation module. | Status: not_done
- [ ] **Handle unsupported clients** — When `instrument()` receives a non-OpenAI, non-Anthropic object: return the original object unchanged and log a warning (via `console.warn` or similar). Do not throw. | Status: not_done
- [ ] **Handle disabled profiler** — When the profiler is disabled, `instrument()` returns the original client unchanged with no Proxy wrapping. | Status: not_done
- [ ] **Write dispatch tests** — Test: OpenAI client routes to OpenAI instrumentation. Test: Anthropic client routes to Anthropic instrumentation. Test: unknown object returns unchanged with warning. Test: disabled profiler returns original client. | Status: not_done

---

## Phase 14: OpenTelemetry OTLP Export (src/otlp.ts)

- [ ] **Implement span-to-OTLP conversion** — Convert each `Span` to an OTLP span: map `profile.id` to `traceId`, `span.id` to `spanId`, `span.parentId` to `parentSpanId`. Convert `startTime` and `endTime` to nanosecond UNIX timestamps. | Status: not_done
- [ ] **Implement attribute mapping to OTLP KeyValue format** — Flatten span attributes to OTLP `KeyValue` pairs with appropriate types (string, int, double, bool). Map LLM-specific attributes to OpenTelemetry GenAI semantic conventions: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`. Include `llm.span.type` as an attribute. | Status: not_done
- [ ] **Implement OTLP HTTP POST export** — Send the converted trace data as a JSON payload via HTTP POST to the configured `otlp.endpoint`. Include configured `otlp.headers`. Set `Content-Type: application/json`. Use `otlp.serviceName` (or profiler name) as the service resource name. | Status: not_done
- [ ] **Implement profiler.exportOtlp()** — Call the OTLP export function with the current profile. Throw `ProfilerError` if no OTLP endpoint is configured. | Status: not_done
- [ ] **Implement PROFILER_OTLP_ENDPOINT env var** — Read `PROFILER_OTLP_ENDPOINT` and `PROFILER_OTLP_SERVICE_NAME` from environment variables. Override programmatic `otlp` options. | Status: not_done
- [ ] **Write OTLP tests** — Test: span conversion produces correct OTLP structure. Test: attributes are mapped to GenAI semantic conventions. Test: mock HTTP server receives valid OTLP request. Test: `exportOtlp()` throws `ProfilerError` when no endpoint configured. Test: environment variable override works. | Status: not_done

---

## Phase 15: Decorator (src/decorator.ts)

- [ ] **Implement @profile decorator** — Create a TypeScript method decorator that wraps the decorated method with `profiler.span()`. Accept `name` and `SpanOptions` as decorator arguments. | Status: not_done
- [ ] **Implement setGlobalProfiler() and getGlobalProfiler()** — Store and retrieve a global profiler instance. The `@profile` decorator uses `getGlobalProfiler()` to find the active profiler. | Status: not_done
- [ ] **Implement no-op when no active profiler** — When `@profile` is used but no global profiler is set (or the global profiler is disabled), execute the decorated method normally with zero overhead. | Status: not_done
- [ ] **Write decorator tests** — Test: decorated method creates a span with correct name and type. Test: decorated async method records correct timing. Test: no global profiler set — method executes normally. Test: disabled profiler — method executes normally. Test: multiple decorated methods create correctly nested spans. | Status: not_done

---

## Phase 16: Public API Exports (src/index.ts)

- [ ] **Wire up all public exports** — Export from `src/index.ts`: `createProfiler`, `setGlobalProfiler`, `getGlobalProfiler`, `profile` (decorator), and all public types (`Profiler`, `Profile`, `Span`, `ActiveSpan`, `SpanType`, `SpanAttributes`, `SpanOptions`, `SpanEndOptions`, `ProfilerOptions`, `InstrumentOptions`, `ReportOptions`, `FlameChartData`, `TimingMetrics`, `ProfilerError`). | Status: not_done
- [ ] **Verify type exports** — Run `npm run build` and verify that `dist/index.d.ts` contains all expected type exports. Verify consumers can import all types without errors. | Status: not_done

---

## Phase 17: Integration Tests (src/__tests__/integration.test.ts)

- [ ] **Test full RAG chain profile** — Instrument a mock RAG pipeline (mock vector DB at 50ms, mock OpenAI client with 20-chunk stream at 10ms intervals). Verify span structure (chain -> step + step, with nested llm-call -> streaming), TTFT approximately 50ms, streaming duration approximately 190ms, terminal report renders without error. | Status: not_done
- [ ] **Test multi-turn agent loop** — Instrument a 3-turn agent loop with 2 tool calls. Verify: 3 `step` spans, 3 `llm-call` spans, 2 `tool-execution` spans. Verify `metrics.toolExecutionCount === 2`. | Status: not_done
- [ ] **Test error handling across chain** — A span wrapping a function that throws still appears in the profile with correct timing and error info. The profiler does not enter a broken state. Subsequent profiling still works. | Status: not_done
- [ ] **Test OTLP export integration** — Mock an HTTP server at localhost. Run a chain, call `exportOtlp()`, verify the server received a valid OTLP request with correct span data. | Status: not_done
- [ ] **Test flame chart file round-trip** — Write speedscope output to a temp file, read it back, verify valid JSON matching speedscope schema structure. | Status: not_done
- [ ] **Test concurrent profilers** — Two separate `Profiler` instances running concurrently (parallel chain executions in the same process). Verify each profiler's span tree contains only its own spans with no cross-contamination. | Status: not_done

---

## Phase 18: Edge Case Tests

- [ ] **Test span() with no chain wrapper** — `profiler.span()` called without a wrapping `chain` span: spans are recorded correctly with no parent; `rootSpan` is undefined; total duration computed from first/last span. | Status: not_done
- [ ] **Test span.end() before setTTFT()** — `span.end()` called before `span.setTTFT()`: TTFT is not recorded; no crash. | Status: not_done
- [ ] **Test zero-duration span** — `startTime === endTime` after rounding; duration is 0; span appears in the tree correctly. | Status: not_done
- [ ] **Test large chain (500 spans)** — Create 500 spans. Verify `getProfile()` completes in under 10ms and `toJSON()` completes in under 50ms. | Status: not_done
- [ ] **Test report on empty profile** — `profiler.report()` on a profile with no spans: prints a "no data" message, does not throw. | Status: not_done
- [ ] **Test unended span** — A span started but never ended (simulating a crash): appears in `allSpans` with `endTime: undefined`. `getProfile()` does not throw. The unended span is excluded from duration calculations. | Status: not_done
- [ ] **Test instrument() on unsupported object** — `profiler.instrument()` on a non-OpenAI, non-Anthropic object: returns original unchanged, logs a warning, does not throw. | Status: not_done
- [ ] **Test timing accuracy** — Record a span around `setTimeout(resolve, 50)`. Verify `duration` is between 48ms and 55ms. Validates correct use of `performance.now()`. | Status: not_done
- [ ] **Test nested span timing invariant** — Record nested spans and verify child span times fall within parent span times (child.startTime >= parent.startTime, child.endTime <= parent.endTime). | Status: not_done

---

## Phase 19: Performance Benchmarks

- [ ] **Implement overhead benchmark** — Create a benchmark that measures `profiler.span()` overhead: call `Promise.resolve(42)` directly 1000 times (baseline) vs. wrapped in `profiler.span()` 1000 times. Assert overhead per call is <0.1ms. | Status: not_done
- [ ] **Validate <1% overhead target** — For a mock chain with total duration >100ms, verify instrumentation overhead is less than 1% of total chain time. | Status: not_done
- [ ] **Benchmark disabled profiler** — Verify that a disabled profiler's overhead is sub-microsecond (single boolean check per span call). | Status: not_done

---

## Phase 20: Environment Variable Handling

- [ ] **Implement NO_COLOR support** — Respect the `NO_COLOR` environment variable: when set to any value, disable ANSI color codes in terminal reports. | Status: not_done
- [ ] **Implement PROFILER_MIN_SPAN_MS support** — Read `PROFILER_MIN_SPAN_MS` from environment, parse as number, override `minSpanDurationMs` option. | Status: not_done
- [ ] **Test all environment variable overrides** — Test: `PROFILER_ENABLED=false` disables profiler. Test: `PROFILER_ENABLED=0` disables profiler. Test: `PROFILER_OTLP_ENDPOINT` sets OTLP endpoint. Test: `PROFILER_OTLP_SERVICE_NAME` sets service name. Test: `PROFILER_MIN_SPAN_MS` sets minimum span duration. Test: `NO_COLOR` disables ANSI colors. | Status: not_done

---

## Phase 21: Documentation

- [ ] **Write README.md** — Create a comprehensive README with: package description, installation instructions, quickstart example (manual instrumentation), quickstart example (automatic SDK instrumentation), API reference for all public methods, configuration options table, environment variables table, flame chart export usage, OTLP export usage, decorator usage, integration examples with llm-cost-per-test and llm-vcr. | Status: not_done
- [ ] **Write JSDoc for all public APIs** — Add complete JSDoc comments to all public-facing functions, interfaces, types, and methods. Include parameter descriptions, return types, usage examples, and `@throws` annotations where applicable. | Status: not_done
- [ ] **Add inline code comments** — Add explanatory comments to non-obvious implementation details: AsyncLocalStorage context tracking, stream interception wrapping, Proxy construction, OTLP attribute mapping, overhead gap computation. | Status: not_done

---

## Phase 22: Final Verification and Publishing Prep

- [ ] **Run full test suite** — Execute `npm run test` and verify all tests pass. | Status: not_done
- [ ] **Run linter** — Execute `npm run lint` and verify no lint errors or warnings. | Status: not_done
- [ ] **Run build** — Execute `npm run build` and verify TypeScript compiles with no errors and produces correct `dist/` output. | Status: not_done
- [ ] **Verify dist output** — Check that `dist/index.js` and `dist/index.d.ts` exist and contain all expected exports. Verify `dist/index.d.ts` exposes all public types correctly. | Status: not_done
- [ ] **Verify package.json completeness** — Ensure `name`, `version`, `description`, `main`, `types`, `files`, `keywords`, `license`, `engines`, `peerDependencies`, and `publishConfig` are all correctly set. Add relevant keywords (profiler, llm, latency, flame-chart, ttft, streaming, openai, anthropic). | Status: not_done
- [x] **Version bump** — Bump version to `0.1.0` (or appropriate version) in `package.json` if not already set. | Status: done
- [ ] **Dry-run npm publish** — Run `npm publish --dry-run` to verify the package would publish correctly with the expected files. | Status: not_done
