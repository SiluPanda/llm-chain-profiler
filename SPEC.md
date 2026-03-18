# llm-chain-profiler -- Specification

## 1. Overview

`llm-chain-profiler` is a local-first, flame-chart-style latency profiler for LLM chains. It instruments the individual timing phases that make up an LLM chain execution -- prompt assembly, API call dispatch, time-to-first-token (TTFT), streaming duration, tool execution, post-processing, and inter-step overhead -- and produces structured timing breakdowns that answer the question every LLM developer eventually asks: where is the time actually going?

The gap this package fills is specific and well-defined. Observability platforms for LLM applications -- Langfuse, LangSmith, Helicone, Arize Phoenix -- all provide tracing and timing data through hosted web dashboards. They require routing API traffic through a proxy or SDK integration, and they surface timing information in a cloud UI where it is organized as a trace waterfall. This is powerful for production observability but wrong for the development workflow where a developer is sitting at their laptop, iterating on a chain, and asking: "Why does this RAG pipeline take 4 seconds? Is the latency in the retrieval step, the prompt construction, the API call itself, or the post-processing?" That question needs a local answer, immediately, with no account creation, no data upload, and no browser tab. `llm-chain-profiler` provides exactly this: run your chain, get a detailed flame-chart-style breakdown printed to your terminal or exported as a JSON/speedscope file, with sub-millisecond resolution timing on every phase.

The anatomy of LLM chain latency is well-understood but rarely measured in detail at the local level. A single turn in a multi-step chain can include: constructing the prompt from templates and retrieved context (prompt assembly, 1-100ms for non-trivial templates), dispatching the API request over the network (network round-trip, 20-200ms before the first token arrives), waiting for the model to produce the first token (TTFT, the most user-visible latency metric in streaming applications, can range from 50ms to several seconds), receiving the streaming response token by token (streaming duration, directly proportional to output length and model throughput), deserializing and parsing the response (typically 1-10ms), calling external tools as directed by the model (tool execution, anywhere from 10ms for a local function to 5+ seconds for an external API), waiting for a subsequent step in the chain to start (inter-step overhead, often overlooked, can accumulate significantly), and running post-processing logic on the output (post-processing, varies widely). Without instrumentation, these phases blur together into a single wall-clock number. With `llm-chain-profiler`, each phase is an individually timed span in a hierarchical tree that maps directly onto the developer's mental model of the chain.

`llm-chain-profiler` provides a programmatic TypeScript API with two instrumentation modes: manual span wrapping (the developer explicitly wraps blocks of code with `profiler.span(name, fn)` calls) and automatic SDK instrumentation (the developer passes their OpenAI or Anthropic client to `profiler.instrument(client)` and the profiler intercepts calls automatically). Streaming is handled as a first-class case: the profiler intercepts the stream to record TTFT (the time from request dispatch to the first data chunk) and TPS (tokens per second across the streaming duration). Reports are available as terminal trees with indentation and color-coded percentages, JSON objects, speedscope-compatible flame chart files, and Chrome DevTools trace event files. The profiler is designed for zero production overhead when disabled and under 1% overhead when enabled.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `createProfiler(options?)` factory function that returns a `Profiler` instance encapsulating all timing state and configuration.
- Provide a `profiler.span(name, fn, options?)` method that wraps a synchronous or asynchronous function with a named timing span, records start and end times with sub-millisecond resolution, and nests correctly with parent spans to form a hierarchical span tree.
- Provide `profiler.startSpan(name, options?)` / `span.end()` methods for manual instrumentation of code that cannot be expressed as a single function call (e.g., event-driven code, streams, callbacks).
- Provide a `profiler.instrument(client, options?)` method that wraps an OpenAI or Anthropic SDK client with automatic span recording, producing `llm-call`, `streaming`, and `prompt-assembly` spans without requiring the developer to modify their chain code.
- Implement first-class streaming profiling: intercept the streaming response to record TTFT (time from request dispatch to the arrival of the first non-empty token chunk), accumulate chunk timestamps for TPS calculation, and record streaming end time as a child span of the `llm-call` span.
- Provide a `profiler.getProfile()` method that returns a complete `Profile` object containing the full span tree, all timing metrics, and metadata.
- Provide a `profiler.report()` method that prints a human-readable terminal tree to stdout, showing span names, durations, percentages of total time, TTFT, TPS, and token counts, with ANSI color coding.
- Provide a `profiler.toFlameChart()` method that returns flame chart data in speedscope profile format and Chrome DevTools trace event format.
- Provide a `profiler.toJSON()` method that serializes the complete profile to a JSON string.
- Support the decorator pattern (`@profile`) for TypeScript class methods.
- Support OpenTelemetry OTLP export: emit spans as OTLP-compatible trace data that can be sent to any OpenTelemetry collector.
- Implement a `profiler.reset()` method that clears all recorded spans, enabling reuse across multiple chain invocations without creating a new profiler instance.
- Provide a `profiler.enable()` / `profiler.disable()` pair for zero-overhead no-op mode when profiling is not desired (e.g., production deployments).
- Ship complete TypeScript type definitions for all public APIs, configuration options, span types, and report formats.
- Target Node.js 18 and above. Zero mandatory runtime dependencies beyond Node.js built-ins.

### Non-Goals

- **Not a hosted observability platform.** `llm-chain-profiler` produces local reports and local files. It does not send data to any cloud service, does not provide a web dashboard, and does not require an account. For hosted tracing, use Langfuse or LangSmith.
- **Not a continuous production monitor.** `llm-chain-profiler` is a development and debugging tool. It profiles a single chain execution and returns a report. It does not aggregate timing data across many production requests, compute percentiles across a time window, or alert on latency regressions in live traffic. For production monitoring, use an observability platform.
- **Not a load tester.** `llm-chain-profiler` measures one chain execution at a time. It does not simulate concurrent users, measure throughput under load, or compute statistical distributions across many runs. Use k6 or Artillery for load testing.
- **Not a cost profiler.** `llm-chain-profiler` measures time. It does not compute token costs, track token usage, or produce cost breakdowns. For token cost tracking, use `llm-cost-per-test` from this monorepo.
- **Not an LLM provider.** `llm-chain-profiler` does not call any LLM API directly. It instruments code that makes LLM calls via existing SDKs. Bring your own OpenAI or Anthropic client.
- **Not a prompt management tool.** `llm-chain-profiler` measures the time taken to assemble and execute prompts. It does not store, version, or evaluate prompt content.
- **Not a full distributed tracing system.** `llm-chain-profiler` instruments a single Node.js process. It does not propagate trace context across service boundaries via HTTP headers, does not correlate spans across microservices, and does not aggregate traces from multiple processes. For distributed tracing, configure an OpenTelemetry SDK with a real collector.
- **Not a replacement for OpenTelemetry.** `llm-chain-profiler`'s OTLP export is a convenience for developers who already have an OTel collector, not a substitute for a full OpenTelemetry instrumentation strategy.

---

## 3. Target Users and Use Cases

### LLM Application Developers Debugging Latency

The primary user is a developer who has built a chain -- a RAG pipeline, an agent loop, a multi-step reasoning workflow -- and it is slower than expected. The developer wraps the chain with `profiler.span('chain', fn)`, instruments their OpenAI client with `profiler.instrument(openai)`, and runs the chain once. The terminal report shows exactly which phase is slow: is it the vector database retrieval taking 800ms? Is it TTFT at 1.2 seconds because the prompt is 8,000 tokens and the model is spinning up KV-cache computation? Is it tool execution taking 2 seconds because an external API is slow? Without profiling, these are guesses. With `llm-chain-profiler`, they are measurements.

### Prompt Engineers Optimizing Chain Performance

Prompt engineers who have achieved correct chain behavior and are now optimizing for speed. They measure the baseline chain timing with `profiler.getProfile()`, make a change (shorten the system prompt, switch models, cache a retrieval step), measure again, and compare the JSON outputs to see whether the change helped and where. The before/after comparison of flame charts shows which spans changed and by how much.

### Teams Running Latency Regression Tests in CI

Engineering teams that want to ensure new code changes do not regress chain latency. A CI step runs the chain against a fixed input (using `llm-vcr` for replay if live API calls are too slow or expensive), checks `profile.totalDurationMs` and `profile.spans.find(s => s.name === 'llm-call')?.duration` against stored thresholds, and fails the build if latency exceeds acceptable bounds. The `profiler.toJSON()` output is saved as an artifact for comparison.

### Streaming Application Developers Diagnosing TTFT

Developers building chat interfaces, streaming completions UIs, or any application where the user sees tokens arriving in real time. TTFT is the most user-perceptible latency metric in these applications -- the delay from "user pressed submit" to "first character appears on screen". `llm-chain-profiler` measures TTFT precisely by intercepting the streaming response and recording the timestamp of the first data chunk relative to the moment the request was dispatched. Developers can identify whether TTFT is dominated by network RTT, model startup time, or excessive prompt length driving up prefill computation.

### Developers Comparing Chain Architectures

A developer evaluating two architectural approaches (e.g., parallel tool calls vs. sequential, cached retrieval vs. fresh retrieval, one large call vs. multiple small calls) can profile both architectures and compare their flame charts side by side. The JSON output enables programmatic comparison: "architecture A has a total chain time of 2.1s with 1.8s in the llm-call span; architecture B has 3.4s total but 0.4s in llm-call because the model is smaller, with 2.8s split across parallel tool calls." The flame chart visualizations make the structural difference immediately obvious.

### Platform Teams Establishing Latency Budgets

Platform teams building shared LLM infrastructure (shared prompt templates, shared retrieval systems, shared agent frameworks) who want to establish and enforce latency budgets for each component. By profiling representative chains, they can determine how many milliseconds each component is "entitled to" and write automated tests that fail if a component exceeds its budget.

---

## 4. Core Concepts

### The "Where Does the Time Go?" Problem

A chain execution is an opaque blob of wall-clock time until it is instrumented. Consider a RAG pipeline with a quoted 3.5-second end-to-end latency. That 3.5 seconds might be decomposed as: 12ms for prompt template rendering, 340ms for the retrieval query to the vector database, 28ms for re-ranking and formatting the retrieved chunks into the prompt, 1,850ms TTFT (waiting for the model to produce the first output token), 920ms streaming duration (the model producing 150 tokens at approximately 163 TPS), 45ms for response parsing and extraction, and 305ms for a secondary tool call to fetch a URL mentioned in the output. Without instrumentation, the developer cannot distinguish between "the model is slow" and "retrieval is slow" and "the prompt is too long and is driving up TTFT." These require fundamentally different interventions. Measuring them separately is the prerequisite to fixing them.

### Profile

A profile is the complete timing record for one chain execution. It has a unique ID, a start timestamp, a total duration, a hierarchical tree of spans, and aggregate timing metrics computed from that tree. A profile is serializable to JSON and is the primary data structure produced by `llm-chain-profiler`.

### Span

A span is a single timed operation within a chain execution. Every span has:
- A unique ID
- An optional parent span ID (root spans have no parent)
- A name identifying the operation
- A type categorizing what kind of operation it is
- A start time recorded at high resolution via `performance.now()` (sub-millisecond precision)
- An end time recorded when the operation completes
- A computed duration in milliseconds
- Type-specific attributes (e.g., an `llm-call` span records the model name, input token count, and output token count; a `streaming` span records TTFT and TPS)
- An array of child spans

Spans are hierarchical: a `chain` span may contain multiple `step` spans, each of which contains a `prompt-assembly` span, an `llm-call` span, and a `post-processing` span. The `llm-call` span contains a `streaming` span (if the response was streamed) or completes atomically (if the response was non-streaming). The `llm-call` span may also contain `tool-execution` child spans if the model invoked tools during the call.

### Trace

A trace is a collection of spans from a single chain execution, organized as a tree rooted at the top-level span. The terms "profile" and "trace" are related: a profile contains a trace (the span tree) plus metadata. OpenTelemetry uses the term "trace" for the same concept. `llm-chain-profiler` uses "profile" in its user-facing API because it more accurately conveys the performance measurement intent.

### TTFT (Time To First Token)

TTFT is the elapsed time from when the API request is dispatched to when the first non-empty token chunk arrives in the streaming response. It is the key latency metric for user-perceived responsiveness in streaming applications. TTFT is affected by:
- **Network RTT**: The round-trip time between the client and the API endpoint. Typically 20-100ms for major cloud providers from major cities, up to 300ms+ for cross-continental connections.
- **Request queue time**: Time spent waiting in the model provider's inference queue during high-demand periods.
- **Prefill computation time**: The time the model takes to process the input tokens (the prompt) before generating the first output token. Prefill time scales approximately linearly with prompt token count. A 500-token prompt prefills much faster than a 50,000-token prompt.
- **KV cache warmup**: For models with KV caching (prefix caching), a cold cache requires full prefill computation; a warm cache can skip the prefill for cached prefixes, dramatically reducing TTFT.

TTFT is distinct from total API latency. A 150ms TTFT followed by a 2.5-second streaming duration gives a total API latency of 2.65 seconds, but the user sees the first token in 150ms. Optimizing TTFT (e.g., via prompt compression or caching) improves user experience even if total latency is unchanged.

### TPS (Tokens Per Second)

TPS is the rate at which the model produces output tokens during the streaming phase. It is computed as `outputTokenCount / streamingDurationSeconds`. TPS reflects the model's decode throughput -- the speed at which it auto-regressively generates each new token. It is largely outside the developer's control (it is a property of the model and the provider's infrastructure), but it varies by model (smaller models are generally faster), by provider load, and by response length (very short responses may show higher TPS due to startup overhead not dominating). TPS is useful for establishing expectations: a model that normally delivers 60 TPS and is suddenly delivering 15 TPS indicates provider-side degradation.

### Flame Chart

A flame chart is a visualization of hierarchical timing data where each operation is rendered as a horizontal bar whose width is proportional to its duration and whose horizontal position represents when it started relative to the overall timeline. Operations are stacked vertically according to their nesting depth: parent spans appear above child spans. The resulting visualization looks like a series of flames (horizontal bars of varying widths stacked to form irregular towers), making it easy to see which operations dominate the total time and how they relate structurally to each other.

`llm-chain-profiler` produces flame chart data in two formats compatible with existing flame chart viewers: speedscope (a local web application that renders flame graphs from JSON files) and Chrome DevTools (which has a built-in trace viewer that accepts the Chrome trace event format). Both formats are generated from the same underlying span data by transforming span start/end times into the required format.

### Inter-Step Overhead

Inter-step overhead is the time between one step's completion and the next step's start. It is not the time spent inside any explicitly instrumented span -- it is the gap between them. In a chain with three sequential steps, there are two inter-step gaps. Overhead accumulates in code paths that run between steps: logging, state updates, conditional routing logic, callback chains, and framework overhead. In chains with many short steps, inter-step overhead can dominate. `llm-chain-profiler` makes inter-step overhead visible by computing the gap between sibling spans at the same nesting level and including it in the report as an `overhead` span.

---

## 5. Span Model

### Span Interface

```typescript
interface Span {
  /** Unique identifier for this span, UUID v4. */
  id: string;

  /** ID of the parent span. Undefined for the root span. */
  parentId?: string;

  /** Human-readable name for this span (e.g., 'retrieve-context', 'generate-answer'). */
  name: string;

  /** The type category of this span. */
  type: SpanType;

  /**
   * Start time as a DOMHighResTimeStamp from performance.now().
   * This is a relative time in milliseconds since the profiler was created.
   * Use profile.startTimestamp for the absolute wall-clock start time.
   */
  startTime: number;

  /**
   * End time as a DOMHighResTimeStamp from performance.now().
   * Undefined if the span has not ended yet (still in progress).
   */
  endTime?: number;

  /**
   * Duration in milliseconds. Computed as endTime - startTime.
   * Undefined if the span has not ended yet.
   */
  duration?: number;

  /** Span-type-specific attributes. */
  attributes: SpanAttributes;

  /** Child spans, in order of their start time. */
  children: Span[];

  /**
   * Error information if the span's operation threw an error.
   * The span is still recorded when an error occurs, with endTime set to
   * the moment the error was thrown and this field populated.
   */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}
```

### SpanType

```typescript
type SpanType =
  | 'chain'          // Top-level span representing an entire chain execution
  | 'step'           // A logical step within a chain (e.g., 'retrieve', 'generate', 'rerank')
  | 'llm-call'       // A single LLM API request/response cycle
  | 'streaming'      // The streaming phase of an llm-call (TTFT + streaming duration)
  | 'tool-execution' // Execution of a single tool called by the model
  | 'prompt-assembly'// Constructing the prompt from templates, context, and history
  | 'post-processing'// Processing the model's output (parsing, extraction, validation)
  | 'overhead'       // Synthetic span representing inter-step gaps
  | 'custom'         // User-defined span type for any other operation
  ;
```

### SpanAttributes

Each span type carries type-specific attributes. The `attributes` field is typed as a union discriminated by the span's `type`:

```typescript
type SpanAttributes =
  | ChainAttributes
  | StepAttributes
  | LlmCallAttributes
  | StreamingAttributes
  | ToolExecutionAttributes
  | PromptAssemblyAttributes
  | PostProcessingAttributes
  | OverheadAttributes
  | CustomAttributes
  ;

interface ChainAttributes {
  /** Total number of LLM API calls in this chain execution. */
  llmCallCount: number;

  /** Total input tokens across all LLM calls. */
  totalInputTokens: number;

  /** Total output tokens across all LLM calls. */
  totalOutputTokens: number;

  /** Names of all models called during the chain execution. */
  models: string[];

  /** Caller-provided metadata (e.g., chain name, version, environment). */
  metadata?: Record<string, unknown>;
}

interface StepAttributes {
  /** Step index within the parent chain (0-based). */
  stepIndex?: number;

  /** Caller-provided metadata. */
  metadata?: Record<string, unknown>;
}

interface LlmCallAttributes {
  /** The model name as passed to the API (e.g., 'gpt-4o', 'claude-opus-4-20250514'). */
  model: string;

  /** Number of input tokens (prompt tokens). Read from the API response's usage field. */
  inputTokens?: number;

  /** Number of output tokens (completion tokens). Read from the API response's usage field. */
  outputTokens?: number;

  /** Whether the response was streamed. */
  streaming: boolean;

  /** The API provider (inferred from the SDK or endpoint). */
  provider?: 'openai' | 'anthropic' | 'google' | 'azure-openai' | 'unknown';

  /** HTTP status code of the API response. */
  statusCode?: number;

  /** Whether the LLM called any tools during this turn. */
  toolCallCount?: number;
}

interface StreamingAttributes {
  /**
   * Time To First Token: elapsed milliseconds from when the API request
   * was dispatched to when the first non-empty token chunk was received.
   */
  ttftMs: number;

  /**
   * Total number of output tokens received during streaming.
   * Derived from token chunk counting or the final usage field.
   */
  outputTokens?: number;

  /**
   * Tokens per second during the streaming phase.
   * Computed as outputTokens / (streamingDurationMs / 1000).
   */
  tps?: number;

  /** Number of SSE chunks received during streaming. */
  chunkCount?: number;
}

interface ToolExecutionAttributes {
  /** The name of the tool as registered with the model (e.g., 'search', 'calculator'). */
  toolName: string;

  /** The tool call ID from the API response. */
  toolCallId?: string;

  /** Whether the tool execution succeeded or failed. */
  succeeded: boolean;

  /** Caller-provided tool result size in bytes (optional). */
  resultSizeBytes?: number;
}

interface PromptAssemblyAttributes {
  /**
   * Estimated token count of the assembled prompt.
   * Caller-provided; the profiler does not tokenize internally.
   */
  estimatedTokenCount?: number;

  /** Number of messages in the assembled prompt (for chat models). */
  messageCount?: number;

  /** Caller-provided notes (e.g., 'included 5 context chunks', 'used 2-shot examples'). */
  notes?: string;
}

interface PostProcessingAttributes {
  /** Description of what post-processing was performed (e.g., 'JSON parse', 'entity extraction'). */
  operation?: string;
}

interface OverheadAttributes {
  /** The name of the preceding span (span before the gap). */
  afterSpan: string;

  /** The name of the following span (span after the gap). */
  beforeSpan: string;
}

interface CustomAttributes {
  /** Arbitrary caller-provided key-value pairs. */
  [key: string]: unknown;
}
```

### Span Hierarchy Examples

A simple single-turn chain:

```
chain "rag-pipeline"                           [0ms ... 2850ms]
  step "retrieve"                              [0ms ... 380ms]
    custom "embed-query"                       [0ms ... 45ms]
    custom "vector-search"                     [45ms ... 380ms]
  overhead (after: retrieve, before: generate) [380ms ... 398ms]
  step "generate"                              [398ms ... 2850ms]
    prompt-assembly "build-prompt"             [398ms ... 435ms]
    llm-call "gpt-4o"                          [435ms ... 2835ms]
      streaming "response-stream"              [435ms ... 2835ms]
        (ttftMs: 1240, tps: 68.2)
    post-processing "extract-answer"           [2835ms ... 2850ms]
```

A multi-turn agent loop with tool calls:

```
chain "agent-loop"                             [0ms ... 5210ms]
  step "turn-1"                                [0ms ... 1950ms]
    prompt-assembly "assemble"                 [0ms ... 12ms]
    llm-call "claude-opus-4-20250514"          [12ms ... 1890ms]
      streaming "response-stream"              [12ms ... 1890ms]
        (ttftMs: 820, tps: 52.1)
      tool-execution "search"                  [1890ms ... 1940ms]
    post-processing "parse-tool-result"        [1940ms ... 1950ms]
  overhead (after: turn-1, before: turn-2)     [1950ms ... 1962ms]
  step "turn-2"                                [1962ms ... 5210ms]
    prompt-assembly "assemble"                 [1962ms ... 1978ms]
    llm-call "claude-opus-4-20250514"          [1978ms ... 5200ms]
      streaming "response-stream"              [1978ms ... 5200ms]
        (ttftMs: 1100, tps: 49.8)
    post-processing "extract-final-answer"     [5200ms ... 5210ms]
```

---

## 6. LLM-Specific Timing Metrics

Each timing metric below describes: what it measures, how `llm-chain-profiler` captures it, and why it matters for debugging and optimization.

### Prompt Assembly Time

**What**: The time spent constructing the prompt -- rendering templates, loading context from a retrieval system, formatting conversation history, inserting few-shot examples, and building the final message array before it is sent to the API.

**How captured**: The developer wraps their prompt construction code in a `profiler.span('build-prompt', fn, { type: 'prompt-assembly' })` call, or uses `profiler.startSpan('build-prompt', { type: 'prompt-assembly' })` / `span.end()` around the code block. The profiler records the wall-clock duration of this wrapper.

**Why it matters**: Prompt assembly is often assumed to be negligible but can be significant in RAG pipelines where the context includes large retrieved documents, or in multi-turn conversations where conversation history grows unboundedly. Template rendering with large contexts can take 50-200ms. When prompt assembly time grows across chain invocations (e.g., because conversation history accumulates), it signals that history truncation or summarization is needed.

### TTFT (Time To First Token)

**What**: The elapsed time from when the HTTP request reaches the API endpoint's ingress to when the first non-whitespace token chunk is received by the client. `llm-chain-profiler` measures this as the elapsed time from `performance.now()` captured immediately before the streaming request is initiated to `performance.now()` captured when the first non-empty chunk event fires on the response stream.

**How captured**: The profiler intercepts the SDK's streaming response. For OpenAI, it intercepts the `ReadableStream` returned by `openai.chat.completions.create({ stream: true })`. For Anthropic, it intercepts the `MessageStream` returned by `anthropic.messages.stream()`. The profiler wraps the stream in a `TransformStream` (or equivalent) that records the timestamp of the first data chunk. For manually instrumented streaming, the developer calls `span.setTTFT()` when they process the first token in their custom streaming handler.

**Why it matters**: TTFT is the dominant component of user-perceived latency in streaming applications. Users see the interface "thinking" from when they submit their query until the first character appears. A 2-second TTFT feels very different from a 200ms TTFT, even if total chain time is the same. TTFT is actionable: it is reduced by shortening prompts (less prefill computation), using prompt caching for repeated prefixes, or routing requests to lower-latency regions.

### Streaming Duration

**What**: The elapsed time from the first token chunk to the last token chunk -- the period during which the model is producing output tokens and they are being transmitted to the client.

**How captured**: The same stream interception that records TTFT also records the timestamp of the last chunk event (the stream's `done` event). Streaming duration = last chunk timestamp - first chunk timestamp.

**Why it matters**: Streaming duration is proportional to output length divided by TPS. If streaming duration is unexpectedly long, the cause is either (a) the model is producing more output tokens than expected (check `outputTokens` in the `streaming` span attributes) or (b) TPS has degraded (check `tps`). These have different remedies: the former suggests constraining the output with instructions or `max_tokens`; the latter suggests checking provider status or trying a different model.

### TPS (Tokens Per Second)

**What**: The rate at which output tokens are produced during the streaming phase. Computed as `outputTokens / (streamingDurationMs / 1000)`.

**How captured**: `outputTokens` is determined by counting token chunks in the stream. For OpenAI streams with `stream_options.include_usage: true`, the final chunk provides the exact `completion_tokens` count; otherwise, chunks are counted. For Anthropic streams, the `message_delta` event provides `output_tokens`. The streaming duration is measured as described above.

**Why it matters**: TPS varies by model (larger models are typically slower) and by provider load. Recording TPS enables the developer to detect provider-side degradation: if a model that normally delivers 70 TPS is delivering 20 TPS, the provider's infrastructure is under load. TPS also sets expectations for streaming UX: a model delivering 80 TPS will produce 200 output tokens in 2.5 seconds; knowing this helps set `max_tokens` appropriately for the desired streaming experience.

### Total API Latency

**What**: The full duration of the `llm-call` span -- from when the request is dispatched to when the response is fully received (or the stream is fully consumed). Total API latency = TTFT + streaming duration for streamed responses. For non-streaming responses, it is simply the round-trip time.

**How captured**: The `llm-call` span's start time is recorded immediately before the SDK call, and its end time is recorded immediately after the response is fully consumed (stream closed or synchronous response returned). No additional instrumentation is needed; the `startSpan`/`span.end()` pair in the automatic SDK instrumentation handles this.

**Why it matters**: Total API latency is the sum of all server-side work: the network RTT, the queue wait, the prefill, and the decode. It is the most commonly reported latency metric but the least actionable in isolation. Separating it into TTFT (prefill-dominated) and streaming duration (decode-dominated) makes it actionable.

### Tool Execution Time

**What**: The elapsed time for a single tool call execution -- from when the profiler begins executing the tool function to when it returns.

**How captured**: The developer wraps their tool execution code with `profiler.span(toolName, fn, { type: 'tool-execution', attributes: { toolName, toolCallId } })`, or the automatic SDK instrumentation wraps tool invocations when it can identify them. For agents using the OpenAI function calling API, the profiler detects tool call responses and can automatically create `tool-execution` spans when the developer's tool execution code is passed to `profiler.instrument()`.

**Why it matters**: Tool calls are frequently the slowest part of an agent loop because they involve I/O: web search, database queries, API calls, file operations. A single slow tool call can dominate the chain's latency. By profiling each tool call individually, the developer can identify which tools are the bottleneck and whether parallelizing tool calls would help.

### Post-Processing Time

**What**: The elapsed time for any computation performed on the model's output after it has been fully received -- JSON parsing, entity extraction, validation, format normalization, downstream processing.

**How captured**: The developer wraps their post-processing code with `profiler.span(name, fn, { type: 'post-processing' })`.

**Why it matters**: Post-processing is often assumed to be instantaneous but can be significant for large outputs (e.g., parsing a 50KB JSON response, running a complex regex over a multi-page output, computing embeddings for the response text). Post-processing time growing over time (as outputs grow) signals the need for streaming processing (process as tokens arrive rather than after the stream closes) or more efficient parsing.

### Inter-Step Overhead

**What**: The wall-clock time between the end of one span and the start of the next sibling span at the same nesting level. This time is not attributed to any explicitly instrumented span -- it is time spent in framework glue code, async scheduling, logging, conditional routing, and other untracked work between steps.

**How captured**: Computed automatically by `llm-chain-profiler` from the span tree. When a parent span contains multiple children, the gaps between children are computed as `children[i+1].startTime - children[i].endTime`. These gaps are surfaced as synthetic `overhead` spans in the rendered report and included in the flame chart.

**Why it matters**: In chains with many short steps, inter-step overhead accumulates. A chain that runs 20 steps, each of which takes 50ms, has 19 inter-step gaps. If each gap is 5ms of Node.js scheduling and logging overhead, the total overhead is 95ms -- nearly doubling the apparent latency from step 10 (which starts at ~555ms) compared to what a naive calculation suggests. Identifying large inter-step gaps directs the developer to optimize the framework code between steps.

### Total Chain Time

**What**: The total wall-clock duration of the root `chain` span, from the first instrumented operation to the last.

**How captured**: The duration of the root span in the span tree.

**Why it matters**: Total chain time is the number the user experiences. All other metrics are decompositions of this number. A correctly instrumented chain satisfies the invariant: `totalChainTime ≈ sum(all_span_durations) + sum(inter-step_overhead_gaps)`.

---

## 7. Instrumentation

### Manual Span Wrapping

The most explicit instrumentation mode. The developer wraps any block of code with a `profiler.span()` call:

```typescript
import { createProfiler } from 'llm-chain-profiler';

const profiler = createProfiler();

async function runChain(query: string): Promise<string> {
  return profiler.span('rag-pipeline', async () => {
    // Retrieval step
    const context = await profiler.span('retrieve', () => vectorDb.search(query), {
      type: 'step',
    });

    // Prompt assembly
    const messages = await profiler.span('build-prompt', () => buildMessages(query, context), {
      type: 'prompt-assembly',
      attributes: { estimatedTokenCount: countTokens(messages), messageCount: messages.length },
    });

    // LLM call (manual instrumentation; automatic is preferred for this type)
    const t0 = performance.now();
    const startSpan = profiler.startSpan('openai-call', { type: 'llm-call' });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
    });
    let firstChunk = true;
    let outputText = '';
    const streamSpan = profiler.startSpan('response-stream', {
      type: 'streaming',
      parentId: startSpan.id,
    });
    for await (const chunk of response) {
      if (firstChunk) {
        streamSpan.setTTFT(performance.now() - t0);
        firstChunk = false;
      }
      outputText += chunk.choices[0]?.delta?.content ?? '';
    }
    streamSpan.end({ attributes: { outputTokens: countOutputTokens(outputText) } });
    startSpan.end();

    // Post-processing
    return profiler.span('extract-answer', () => extractAnswer(outputText), {
      type: 'post-processing',
    });
  }, { type: 'chain' });
}
```

### Automatic SDK Instrumentation

For common cases, `profiler.instrument(client)` wraps an LLM SDK client and creates spans automatically:

```typescript
import { createProfiler } from 'llm-chain-profiler';
import OpenAI from 'openai';

const profiler = createProfiler();
const openai = profiler.instrument(new OpenAI());
// openai is a Proxy that behaves identically to the original client
// but creates llm-call and streaming spans automatically.

async function runChain(query: string): Promise<string> {
  return profiler.span('rag-pipeline', async () => {
    const context = await profiler.span('retrieve', () => vectorDb.search(query));
    const messages = buildMessages(query, context);
    // This call automatically creates an 'llm-call' span and a nested 'streaming' span
    // with TTFT, TPS, and token counts.
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
    });
    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? '';
    }
    return extractAnswer(text);
  }, { type: 'chain' });
}
```

The instrumented client intercepts:
- `client.chat.completions.create()` (OpenAI): Creates an `llm-call` span. If `stream: true`, creates a nested `streaming` span and measures TTFT and TPS.
- `client.messages.create()` (Anthropic): Creates an `llm-call` span for non-streaming calls.
- `client.messages.stream()` (Anthropic): Creates an `llm-call` span with a nested `streaming` span.

The instrumented client is a deep `Proxy`. It preserves full TypeScript types: `profiler.instrument(client: OpenAI)` returns `OpenAI`. The caller experiences no API differences.

### Streaming Interception

For streaming responses, the profiler wraps the response stream in a `TransformStream` (for web streams) or an async generator wrapper (for Node.js streams) that:

1. Records `t_dispatch = performance.now()` immediately before the stream is initiated.
2. Passes chunks through unchanged to the consumer.
3. On the first non-empty chunk: computes TTFT = `performance.now() - t_dispatch` and records it on the `streaming` span.
4. On each chunk: increments the chunk counter and accumulates output tokens (counting `delta.content` characters, or reading the `usage` field from the final chunk when available).
5. On stream close: records the end time, computes TPS = `outputTokens / streamingDurationSeconds`, and ends the `streaming` span with the final attributes.

This wrapping is transparent to the consumer: the stream they receive behaves identically to the unwrapped stream. The profiler never buffers the full stream content -- it observes without storing.

### Automatic TTFT Measurement in Streaming

TTFT requires careful definition. Some providers send an initial empty chunk before any content (e.g., a role announcement or a metadata chunk). `llm-chain-profiler` defines TTFT as the time to the first chunk that contains non-empty token content (`delta.content` is a non-empty string for OpenAI; `delta.text` is non-empty for Anthropic; or `type === 'content_block_delta'` with non-empty `delta` for Anthropic). Empty or metadata chunks are passed through but do not trigger the TTFT timestamp.

### Decorator Pattern

For TypeScript class methods, the `@profile` decorator provides a declarative alternative to explicit `profiler.span()` calls:

```typescript
import { profile } from 'llm-chain-profiler';

class RagPipeline {
  @profile('retrieve', { type: 'step' })
  async retrieve(query: string): Promise<Document[]> {
    return this.vectorDb.search(query);
  }

  @profile('generate', { type: 'step' })
  async generate(query: string, context: Document[]): Promise<string> {
    // ...
  }
}
```

The decorator requires an active profiler to be set via `profiler.setAsActive()` or a global `setGlobalProfiler(profiler)` call. When no profiler is active, decorated methods execute normally with no overhead.

### startSpan / end Pattern

For event-driven code, callbacks, or situations where the wrappable function boundary does not align with the timing boundary, the `startSpan` / `end` pattern is used:

```typescript
const span = profiler.startSpan('tool-execution', {
  type: 'tool-execution',
  attributes: { toolName: 'web-search', toolCallId: call.id },
});

try {
  const result = await webSearch(call.function.arguments.query);
  span.end({ attributes: { succeeded: true, resultSizeBytes: JSON.stringify(result).length } });
  return result;
} catch (error) {
  span.end({ error: { message: error.message, stack: error.stack } });
  throw error;
}
```

---

## 8. API Surface

### Installation

```bash
npm install llm-chain-profiler
```

### Core Exports

```typescript
import {
  createProfiler,
  setGlobalProfiler,
  getGlobalProfiler,
  profile,           // Decorator
} from 'llm-chain-profiler';
```

### `createProfiler(options?)`

Factory function that creates a `Profiler` instance.

```typescript
function createProfiler(options?: ProfilerOptions): Profiler;
```

**Options**:

```typescript
interface ProfilerOptions {
  /**
   * Human-readable name for this profiler instance, used in report headers.
   * Default: 'llm-chain-profiler'.
   */
  name?: string;

  /**
   * Whether profiling is enabled. When false, all span operations are no-ops
   * with zero overhead, and getProfile() returns an empty profile.
   * Default: true.
   * Can be overridden with the PROFILER_ENABLED environment variable.
   */
  enabled?: boolean;

  /**
   * Clock resolution mode.
   * 'performance': uses performance.now() (sub-millisecond, relative to process start).
   * 'hrtime': uses process.hrtime.bigint() (nanosecond precision, but higher overhead).
   * Default: 'performance'.
   */
  clockMode?: 'performance' | 'hrtime';

  /**
   * Whether to automatically compute and insert overhead spans between siblings.
   * Default: true.
   */
  computeOverhead?: boolean;

  /**
   * Minimum duration in milliseconds for a span to appear in reports.
   * Spans shorter than this threshold are still recorded but omitted from
   * terminal reports. Does not affect JSON output or flame chart export.
   * Default: 0 (show all spans).
   */
  minSpanDurationMs?: number;

  /**
   * OpenTelemetry OTLP export configuration.
   * When provided, completed profiles are exported as OTLP trace data.
   */
  otlp?: OtlpExportOptions;
}

interface OtlpExportOptions {
  /** OTLP collector endpoint (e.g., 'http://localhost:4318/v1/traces'). */
  endpoint: string;

  /** HTTP headers for the OTLP export request (e.g., authorization). */
  headers?: Record<string, string>;

  /** Service name for the trace resource. Default: profiler name. */
  serviceName?: string;
}
```

**Usage**:

```typescript
const profiler = createProfiler({ name: 'rag-pipeline', enabled: process.env.NODE_ENV !== 'production' });
```

### `Profiler` Interface

```typescript
interface Profiler {
  /**
   * Wraps an async or sync function with a named span.
   * The span starts before fn() is called and ends when fn() returns or throws.
   * Correctly handles nested calls: if another span is active on the same profiler
   * when this is called, the new span is automatically a child of the active span.
   *
   * @param name - Human-readable span name.
   * @param fn - The function to time.
   * @param options - Optional span options.
   * @returns The return value of fn().
   */
  span<T>(name: string, fn: () => T | Promise<T>, options?: SpanOptions): Promise<T>;

  /**
   * Starts a span manually. The caller is responsible for calling span.end().
   * Use this for event-driven code or when the timing boundary does not align
   * with a single function call.
   *
   * @param name - Human-readable span name.
   * @param options - Optional span options.
   * @returns An ActiveSpan with an end() method.
   */
  startSpan(name: string, options?: SpanOptions): ActiveSpan;

  /**
   * Wraps an LLM SDK client with automatic span recording.
   * Returns a Proxy that behaves identically to the original client
   * but creates llm-call, streaming, and other spans automatically.
   *
   * Supported: OpenAI SDK client, Anthropic SDK client.
   * For other clients, use manual instrumentation.
   *
   * @param client - The LLM SDK client to instrument.
   * @param options - Optional instrumentation options.
   * @returns A typed Proxy wrapping the original client.
   */
  instrument<T extends object>(client: T, options?: InstrumentOptions): T;

  /**
   * Returns the complete profile for the current (or most recently completed)
   * chain execution. This includes the full span tree, timing metrics, and metadata.
   *
   * Can be called at any time, including while a chain is still executing.
   * In-progress spans will have endTime and duration as undefined.
   */
  getProfile(): Profile;

  /**
   * Prints a human-readable terminal tree report to the specified output.
   * Includes span names, durations, percentages of total time, TTFT, TPS,
   * and token counts. Uses ANSI color codes unless disabled.
   *
   * @param options - Optional report options (output stream, color, verbosity).
   */
  report(options?: ReportOptions): void;

  /**
   * Returns a FlameChartData object containing the profile data in both
   * speedscope format and Chrome DevTools trace event format.
   */
  toFlameChart(): FlameChartData;

  /**
   * Serializes the complete profile to a JSON string.
   * The output can be deserialized back to a Profile object.
   */
  toJSON(): string;

  /**
   * Exports the profile as OpenTelemetry OTLP trace data.
   * Sends an HTTP POST to the configured OTLP endpoint.
   * Requires otlp configuration in ProfilerOptions.
   *
   * @throws ProfilerError if no OTLP endpoint is configured.
   */
  exportOtlp(): Promise<void>;

  /**
   * Resets all recorded spans and timing data.
   * The profiler is ready to record a new chain execution after reset().
   * Does not change configuration options.
   */
  reset(): void;

  /**
   * Enables the profiler. When enabled, all span operations record timing data.
   * This is the default state.
   */
  enable(): void;

  /**
   * Disables the profiler. When disabled, all span operations are no-ops
   * with negligible overhead. getProfile() returns an empty profile.
   */
  disable(): void;

  /**
   * Returns whether the profiler is currently enabled.
   */
  isEnabled(): boolean;

  /**
   * Sets this profiler as the global profiler, used by the @profile decorator.
   */
  setAsActive(): void;
}
```

### `ActiveSpan` Interface

```typescript
interface ActiveSpan {
  /** The span's unique ID. Pass to SpanOptions.parentId to make a span a child of this span. */
  readonly id: string;

  /** The span's name. */
  readonly name: string;

  /**
   * Ends the span and records its end time.
   * Calling end() more than once is a no-op (the second call is silently ignored).
   *
   * @param options - Optional end options (final attributes, error).
   */
  end(options?: SpanEndOptions): void;

  /**
   * Records the TTFT (Time To First Token) for this span.
   * Only meaningful for 'streaming' spans; ignored on other span types.
   *
   * @param ttftMs - TTFT in milliseconds.
   */
  setTTFT(ttftMs: number): void;

  /**
   * Adds or merges additional attributes into this span.
   * Can be called multiple times (attributes are merged, not replaced).
   */
  addAttributes(attributes: Partial<SpanAttributes>): void;
}

interface SpanOptions {
  /** Span type. Default: 'custom'. */
  type?: SpanType;

  /**
   * Explicit parent span ID.
   * By default, the profiler infers the parent from the current execution context
   * using AsyncLocalStorage. Use this to override the inferred parent.
   */
  parentId?: string;

  /** Initial attributes for the span. */
  attributes?: Partial<SpanAttributes>;
}

interface SpanEndOptions {
  /** Final attributes to merge into the span's attributes. */
  attributes?: Partial<SpanAttributes>;

  /** Error information if the span's operation failed. */
  error?: { message: string; code?: string; stack?: string };
}
```

### `InstrumentOptions`

```typescript
interface InstrumentOptions {
  /**
   * Whether to automatically create prompt-assembly spans by capturing the
   * messages array before the call. Requires the messages array to be
   * accessible before the call is dispatched.
   * Default: true.
   */
  capturePromptAssembly?: boolean;

  /**
   * Whether to capture the model name from call parameters.
   * Default: true.
   */
  captureModel?: boolean;

  /**
   * Whether to capture token counts from the API response.
   * Default: true.
   */
  captureTokens?: boolean;

  /**
   * The span name to use for LLM call spans.
   * Default: the model name (e.g., 'gpt-4o').
   */
  spanName?: string | ((callArgs: unknown) => string);
}
```

### `Profile` Type

```typescript
interface Profile {
  /** Unique identifier for this profile, UUID v4. */
  id: string;

  /** Human-readable name (from ProfilerOptions.name). */
  name: string;

  /** ISO 8601 timestamp of when profiling started (absolute wall-clock time). */
  startTimestamp: string;

  /**
   * Total chain duration in milliseconds.
   * Equal to the duration of the root span (if one exists), or the span
   * of time from the first recorded span to the last ended span.
   * Undefined if no spans have ended yet.
   */
  totalDurationMs?: number;

  /** The root span (type: 'chain'), if one was created. */
  rootSpan?: Span;

  /** All spans in insertion order (including nested spans, flattened). */
  allSpans: Span[];

  /** Aggregate timing metrics computed from the span tree. */
  metrics: TimingMetrics;

  /** Profile format version for deserialization compatibility. */
  version: number;
}

interface TimingMetrics {
  /** Total chain duration. Equal to Profile.totalDurationMs. */
  totalDurationMs?: number;

  /** Sum of all llm-call span durations. */
  totalLlmCallDurationMs: number;

  /** Sum of all tool-execution span durations. */
  totalToolExecutionDurationMs: number;

  /** Sum of all prompt-assembly span durations. */
  totalPromptAssemblyDurationMs: number;

  /** Sum of all post-processing span durations. */
  totalPostProcessingDurationMs: number;

  /** Sum of all overhead span durations (inter-step gaps). */
  totalOverheadDurationMs: number;

  /** TTFT from the first streaming span, in milliseconds. */
  firstTtftMs?: number;

  /** Average TPS across all streaming spans. */
  averageTps?: number;

  /** Total input tokens across all llm-call spans. */
  totalInputTokens: number;

  /** Total output tokens across all llm-call spans. */
  totalOutputTokens: number;

  /** Total number of llm-call spans. */
  llmCallCount: number;

  /** Total number of tool-execution spans. */
  toolExecutionCount: number;

  /**
   * Percentage breakdown by span type.
   * Keys are SpanType values. Values are the percentage of totalDurationMs
   * (0-100). Includes 'overhead' for inter-step gaps.
   */
  percentageByType: Partial<Record<SpanType | 'overhead', number>>;
}
```

### `FlameChartData` Type

```typescript
interface FlameChartData {
  /**
   * Speedscope profile format (https://github.com/jlfwong/speedscope).
   * Can be written to a .speedscope.json file and opened in speedscope.app.
   */
  speedscope: SpedscopeProfile;

  /**
   * Chrome DevTools trace event format.
   * Can be written to a .json file and loaded in chrome://tracing or the
   * Performance panel of Chrome DevTools.
   */
  chromeTrace: ChromeTraceEvent[];
}
```

### `ReportOptions`

```typescript
interface ReportOptions {
  /**
   * Output stream for the report.
   * Default: process.stdout.
   */
  output?: NodeJS.WritableStream;

  /**
   * Whether to use ANSI color codes.
   * Default: true when stdout is a TTY and NO_COLOR is not set.
   */
  color?: boolean;

  /**
   * Verbosity level.
   * 'summary': one-line summary (total time, TTFT, TPS, token counts).
   * 'tree': full indented tree with durations and percentages (default).
   * 'detailed': tree plus span attributes and metadata.
   */
  verbosity?: 'summary' | 'tree' | 'detailed';

  /**
   * Whether to show overhead spans in the tree.
   * Default: true.
   */
  showOverhead?: boolean;

  /**
   * Minimum span duration in milliseconds to show in the tree.
   * Spans below this threshold are collapsed into their parent.
   * Default: 0 (show all spans).
   */
  minDurationMs?: number;
}
```

---

## 9. Report Formats

### Terminal Tree Report

The default report format. Rendered to stdout using ANSI escape codes for color and bold text. When stdout is not a TTY (e.g., CI output, pipe to file), colors are disabled automatically.

```
llm-chain-profiler: rag-pipeline  2850ms total
══════════════════════════════════════════════════════════════════════

  ● chain: rag-pipeline                                  2850ms  100.0%
    ● step: retrieve                                      380ms   13.3%
      ● custom: embed-query                                45ms    1.6%
      ● custom: vector-search                             335ms   11.8%
    ◌ overhead (retrieve → generate)                       18ms    0.6%
    ● step: generate                                      2452ms   86.0%
      ● prompt-assembly: build-prompt                       37ms    1.3%
        (messageCount: 8, estimatedTokenCount: 4200)
      ● llm-call: gpt-4o                                  2400ms   84.2%
        (inputTokens: 4200, outputTokens: 148, streaming: true)
        ● streaming: response-stream                       2400ms   84.2%
          (TTFT: 1240ms, TPS: 68.2, chunks: 151)
      ● post-processing: extract-answer                     15ms    0.5%

  Summary
  ───────────────────────────────────────────────────
  Total chain time:        2850ms
  LLM call time:           2400ms  (84.2%)
  - TTFT:                  1240ms  (first token)
  - Streaming:             1160ms  (after first token)
  - TPS:                   68.2 tokens/sec
  Retrieval time:           380ms  (13.3%)
  Prompt assembly:           37ms   (1.3%)
  Post-processing:           15ms   (0.5%)
  Overhead:                  18ms   (0.6%)

  Tokens: 4,200 in / 148 out  |  1 LLM call  |  0 tool calls
```

**Color coding**:
- Spans consuming >50% of total time are rendered in yellow.
- Spans consuming >80% of total time are rendered in red.
- Overhead spans are rendered in dim gray.
- TTFT values are rendered in cyan.
- Token counts are rendered in dim.

**When `verbosity: 'summary'`**:
```
rag-pipeline  2850ms  (TTFT: 1240ms, TPS: 68.2, 4200/148 tokens, 1 LLM call)
```

### JSON Output

`profiler.toJSON()` serializes the complete `Profile` object to a JSON string. The format is stable across versions (breaking changes increment `profile.version`):

```json
{
  "id": "a3f7b2c1-...",
  "name": "rag-pipeline",
  "version": 1,
  "startTimestamp": "2026-03-18T10:00:00.000Z",
  "totalDurationMs": 2850,
  "metrics": {
    "totalDurationMs": 2850,
    "totalLlmCallDurationMs": 2400,
    "totalToolExecutionDurationMs": 0,
    "totalPromptAssemblyDurationMs": 37,
    "totalPostProcessingDurationMs": 15,
    "totalOverheadDurationMs": 18,
    "firstTtftMs": 1240,
    "averageTps": 68.2,
    "totalInputTokens": 4200,
    "totalOutputTokens": 148,
    "llmCallCount": 1,
    "toolExecutionCount": 0,
    "percentageByType": {
      "llm-call": 84.2,
      "step": 99.3,
      "custom": 13.3,
      "prompt-assembly": 1.3,
      "post-processing": 0.5,
      "overhead": 0.6
    }
  },
  "rootSpan": { /* full Span tree */ },
  "allSpans": [ /* flattened array of all Span objects */ ]
}
```

### Flame Chart Export

`profiler.toFlameChart()` returns a `FlameChartData` object. The caller is responsible for writing the data to a file.

**Speedscope format**:

Speedscope uses a "sampled" or "evented" profile format. `llm-chain-profiler` uses the evented format (open/close events per frame), which maps naturally onto start/end span pairs:

```json
{
  "$schema": "https://www.speedscope.app/file-format-schema.json",
  "version": "0.0.1",
  "shared": {
    "frames": [
      { "name": "chain: rag-pipeline" },
      { "name": "step: retrieve" },
      { "name": "custom: embed-query" }
    ]
  },
  "profiles": [
    {
      "type": "evented",
      "name": "rag-pipeline",
      "unit": "milliseconds",
      "startValue": 0,
      "endValue": 2850,
      "events": [
        { "type": "O", "frame": 0, "at": 0 },
        { "type": "O", "frame": 1, "at": 0 },
        { "type": "O", "frame": 2, "at": 0 },
        { "type": "C", "frame": 2, "at": 45 },
        { "type": "C", "frame": 1, "at": 380 },
        { "type": "C", "frame": 0, "at": 2850 }
      ]
    }
  ]
}
```

**Chrome trace event format**:

Chrome DevTools' trace event format uses `ph: "B"` (begin) and `ph: "E"` (end) events, with timestamps in microseconds:

```json
[
  { "pid": 1, "tid": 1, "ph": "B", "ts": 0,       "name": "chain: rag-pipeline", "args": {} },
  { "pid": 1, "tid": 1, "ph": "B", "ts": 0,       "name": "step: retrieve",      "args": {} },
  { "pid": 1, "tid": 1, "ph": "E", "ts": 380000,  "name": "step: retrieve",      "args": {} },
  { "pid": 1, "tid": 1, "ph": "E", "ts": 2850000, "name": "chain: rag-pipeline", "args": {} }
]
```

Timestamps are in microseconds (multiply span times in milliseconds by 1000). Span attributes are included in the `args` field.

**Usage**:

```typescript
import { writeFileSync } from 'node:fs';
import { createProfiler } from 'llm-chain-profiler';

const profiler = createProfiler();
// ... run chain ...

const flameChart = profiler.toFlameChart();

// Open in speedscope.app (drag-and-drop the file, or serve with: npx speedscope profile.speedscope.json)
writeFileSync('profile.speedscope.json', JSON.stringify(flameChart.speedscope));

// Open in Chrome DevTools: chrome://tracing → Load
writeFileSync('profile.chrome-trace.json', JSON.stringify(flameChart.chromeTrace));
```

### OpenTelemetry OTLP Export

When `otlp` is configured in `ProfilerOptions`, `profiler.exportOtlp()` converts the profile to OTLP trace data and sends it via HTTP POST to the configured collector endpoint.

The mapping from `llm-chain-profiler` spans to OTLP spans:
- Each `Span` becomes an OTLP `Span` with a `traceId` (the profile ID), a `spanId` (the span ID), and a `parentSpanId`.
- `startTime` and `endTime` are converted to nanosecond UNIX timestamps.
- `attributes` are flattened to OTLP `KeyValue` attributes with appropriate types.
- `SpanType` is included as the `llm.span.type` attribute.
- LLM-specific attributes (`model`, `inputTokens`, `outputTokens`, `ttftMs`, `tps`) are mapped to the OpenTelemetry Semantic Conventions for LLM systems (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`).

```typescript
const profiler = createProfiler({
  name: 'my-chain',
  otlp: {
    endpoint: 'http://localhost:4318/v1/traces',
    headers: { 'Authorization': 'Bearer my-token' },
    serviceName: 'my-chain-service',
  },
});

// After running the chain:
await profiler.exportOtlp();
// Sends the trace to the configured collector.
```

### One-Line Summary

Available via `profiler.report({ verbosity: 'summary' })` or by reading `profile.metrics` directly:

```
rag-pipeline  2850ms  TTFT=1240ms  TPS=68.2  4200in/148out  1 call  0 tools
```

---

## 10. Streaming Profiling

### Stream Interception Architecture

For streaming responses, `llm-chain-profiler` must observe the stream without buffering it. The interception wraps the original stream source with a lightweight observer layer:

For OpenAI's `Stream<ChatCompletionChunk>` (an async iterable):

```typescript
// Internal implementation sketch (not public API)
async function* interceptStream(
  original: AsyncIterable<ChatCompletionChunk>,
  streamSpan: ActiveSpan,
  dispatchTime: number,
): AsyncIterable<ChatCompletionChunk> {
  let firstToken = true;
  let outputTokens = 0;
  let chunkCount = 0;

  for await (const chunk of original) {
    chunkCount++;
    const content = chunk.choices[0]?.delta?.content;
    if (content && firstToken) {
      streamSpan.setTTFT(performance.now() - dispatchTime);
      firstToken = false;
    }
    // Accumulate token count from usage field (final chunk) or by estimation
    if (chunk.usage?.completion_tokens !== undefined) {
      outputTokens = chunk.usage.completion_tokens;
    } else if (content) {
      // Rough approximation: count chunks as proxy for token count
      outputTokens++;
    }
    yield chunk; // Pass through unchanged
  }

  const streamDurationMs = performance.now() - dispatchTime;
  streamSpan.end({
    attributes: {
      outputTokens,
      tps: outputTokens / (streamDurationMs / 1000),
      chunkCount,
    },
  });
}
```

For Anthropic's `MessageStream` (event emitter + async iterable):

The profiler wraps the stream and listens for:
- `text` events: first text event triggers TTFT recording.
- `message_start` event: captures `usage.input_tokens`.
- `message_delta` event with `stop_reason`: captures `usage.output_tokens`.
- `end` event: finalizes the streaming span.

### TTFT Precision

`performance.now()` has sub-millisecond resolution in Node.js (typically 100 microsecond precision or better depending on the platform). The capture point for `t_dispatch` (the moment the request is initiated) is immediately before the SDK call:

```typescript
// Inside profiler.instrument() interception, pseudocode
const dispatchTime = performance.now();
const stream = await originalCreate(args);  // <-- t_dispatch is before this
return interceptStream(stream, streamSpan, dispatchTime);
```

This means `t_dispatch` includes the time for Node.js to set up the HTTP connection and begin the request, but does not include time in the SDK's pre-request processing (auth header construction, payload serialization). In practice, the SDK's pre-request processing is 0.1-1ms and is negligible relative to TTFT values that are typically 200ms-3000ms. The profiler documents this in its JSDoc comments for complete accuracy.

### TPS Calculation

TPS is computed at stream close:

```
tps = outputTokens / (streamingDurationMs / 1000)
```

where `streamingDurationMs = lastChunkTime - firstChunkTime` (not `lastChunkTime - dispatchTime`). This correctly measures the model's decode throughput excluding the prefill (TTFT) phase. TPS is a property of the decode phase; including the prefill would conflate two distinct operations.

When `outputTokens` is not available from the stream's usage field and must be approximated from chunk counting, the span's `attributes.tps` field is marked as an estimate via an `attributes.tpsIsEstimate: true` flag. The terminal report annotates estimated TPS with a tilde: `~68.2 TPS (est.)`.

### Chunk Timeline

For `verbosity: 'detailed'` reports, `llm-chain-profiler` can optionally record the timestamp of every chunk. This produces a chunk timeline that shows whether token generation was steady or bursty:

```typescript
const profiler = createProfiler({ recordChunkTimeline: true });
```

When enabled, the `streaming` span's attributes include a `chunkTimeline` array of `{ offset: number, tokens: number }` entries. This data is included in the JSON output and can be visualized as a token generation rate chart.

---

## 11. Configuration

### All Options with Defaults

```typescript
const defaults: ProfilerOptions = {
  name: 'llm-chain-profiler',
  enabled: true,               // Override with PROFILER_ENABLED=false
  clockMode: 'performance',    // 'performance' | 'hrtime'
  computeOverhead: true,       // Auto-compute inter-step overhead spans
  minSpanDurationMs: 0,        // Show all spans in reports
  recordChunkTimeline: false,  // Don't record per-chunk timestamps by default
  otlp: undefined,             // No OTLP export by default
};
```

### Environment Variables

| Variable | Purpose | Values |
|---|---|---|
| `PROFILER_ENABLED` | Enable or disable the profiler | `true`, `false`, `1`, `0` |
| `PROFILER_OTLP_ENDPOINT` | OTLP collector endpoint | URL string |
| `PROFILER_OTLP_SERVICE_NAME` | OTLP service name | String |
| `PROFILER_MIN_SPAN_MS` | Minimum span duration for terminal report | Number (milliseconds) |
| `NO_COLOR` | Disable ANSI color in terminal reports | Any value (standard convention) |

Environment variables override options passed to `createProfiler()`. This enables CI-specific configuration (e.g., enabling OTLP export only in CI) without modifying application code.

### Configuration Resolution Order

1. Built-in defaults (lowest priority).
2. Options passed to `createProfiler()`.
3. Environment variables (highest priority).

### Disabling in Production

`llm-chain-profiler` is designed to be left in application code and disabled in production via the `enabled` option or `PROFILER_ENABLED=false`. When disabled:
- `profiler.span(name, fn)` calls `fn()` directly and returns its result, with no timing overhead.
- `profiler.startSpan()` returns a no-op `ActiveSpan` whose methods are empty functions.
- `profiler.instrument(client)` returns the original client unchanged.
- `profiler.getProfile()` returns an empty profile.

The overhead of a disabled profiler is a single boolean check per `span()` call and a property access per `startSpan()` call. This overhead is negligible (sub-microsecond) and acceptable in production code where the profiler has been intentionally left in place.

---

## 12. Integration with the npm-master Ecosystem

### llm-cost-per-test

`llm-cost-per-test` tracks per-test LLM API costs. It complements `llm-chain-profiler`'s latency profiling: cost data answers "what did this chain cost?" while profiling data answers "where did the time go?" The two packages share a common instrumentation pattern (SDK client wrapping via `Proxy`). They can be composed:

```typescript
import { trackLLMCost } from 'llm-cost-per-test';
import { createProfiler } from 'llm-chain-profiler';

const profiler = createProfiler({ name: 'my-chain' });
// First instrument with profiler (outermost wrapper), then cost tracker (inner):
const openai = trackLLMCost(profiler.instrument(new OpenAI()));
// Both profiling spans and cost records are captured for each API call.
```

The ordering matters: the profiler's instrumentation should be the outermost wrapper so that its timing measurement starts before the cost tracker's interception overhead. The difference is negligible in practice but this ordering is the convention.

### llm-vcr

`llm-vcr` records and replays LLM API calls for deterministic testing. When `llm-vcr` replays a cassette, the API call returns immediately from a local cache rather than going to the network. This means profiling a replayed chain will show near-zero TTFT and streaming duration -- the timings reflect replay speed, not real API behavior. For latency regression testing in CI, two approaches are recommended:

1. **Profile the first real run, save the profile**: On the recording pass (when `llm-vcr` is in `record` mode and making real API calls), run `profiler.toJSON()` and save the profile alongside the cassette. Use this saved profile as the latency baseline.

2. **Profile non-LLM spans only during replay**: Disable LLM call span recording during replay by checking `vcr.mode === 'replay'`, but keep profiling for prompt assembly, retrieval, post-processing, and other non-LLM steps. This enables regression testing of everything except the LLM call itself.

### prompt-drift

`prompt-drift` detects when LLM output distributions shift over time. `llm-chain-profiler` complements this by tracking whether chain latency also shifts. A model update that changes outputs (detected by `prompt-drift`) may also change TTFT or TPS (detected by `llm-chain-profiler`). By running both tools, teams can characterize a provider model update along two dimensions: behavioral drift (what changed in the outputs) and latency drift (what changed in the timing).

---

## 13. Testing Strategy

### Unit Tests

**Span recording tests**:
- `profiler.span(name, fn)`: span is created with correct name, type defaults to 'custom', start and end times are set, duration is correct.
- `profiler.span(name, fn)` with async fn: endTime is recorded after the promise resolves, not immediately.
- `profiler.span(name, fn)` where fn throws: span is recorded with error information and `endTime` set to the moment of throw; the error propagates to the caller.
- `profiler.startSpan(name)` / `span.end()`: span is created, remains open until `end()` is called, `endTime` is recorded correctly.
- `span.end()` called twice: second call is silently ignored; duration reflects the first `end()` call.
- Nested spans via `profiler.span()` inside another `profiler.span()`: child span has correct `parentId`; parent span's `children` array includes the child.
- Concurrent async spans: two `profiler.span()` calls running concurrently both record correctly; parent-child relationships are correct via `AsyncLocalStorage`.

**Span tree tests**:
- `profiler.getProfile().allSpans`: contains all spans in the correct order.
- `profiler.getProfile().rootSpan`: is the top-level span if one was created via `{ type: 'chain' }`.
- `profiler.getProfile().metrics.totalDurationMs`: equals the root span's duration.
- Overhead computation: two sibling spans with a gap produce an `overhead` span with the correct duration.

**Streaming profiling tests**:
- Mock an OpenAI `Stream<ChatCompletionChunk>` that emits 5 chunks with 10ms between each.
- Verify `ttftMs` is recorded when the first non-empty content chunk is emitted.
- Verify streaming span `endTime` is recorded when the stream closes.
- Verify `tps` is computed correctly from `outputTokens` and `streamingDurationMs`.
- Mock a stream where the first chunk has empty content: TTFT is not triggered; TTFT is triggered on the second chunk.
- Mock a stream with a usage chunk: `outputTokens` is read from `usage.completion_tokens`.
- Mock a stream with no usage field: `outputTokens` is estimated from chunk count.

**SDK instrumentation tests**:
- `profiler.instrument(openaiClient)`: returns a Proxy that is TypeScript-compatible with `OpenAI`.
- Non-streaming call: `llm-call` span is created; `endTime` is recorded after promise resolves; `inputTokens` and `outputTokens` are captured from the response.
- Streaming call: `llm-call` span and nested `streaming` span are created; streaming span records TTFT and TPS.
- API call that throws: `llm-call` span is recorded with error information; error propagates.
- Disabled profiler: `profiler.instrument(client)` returns the original client unchanged.

**Report tests**:
- `profiler.report()` with a fully populated profile: correct terminal output structure (no exceptions thrown, output contains span names and durations).
- `profiler.report({ verbosity: 'summary' })`: single-line output.
- `profiler.report({ color: false })`: no ANSI escape codes in output.
- `profiler.toJSON()`: produces valid JSON; `JSON.parse(profiler.toJSON())` matches `profiler.getProfile()` structurally.
- `profiler.toFlameChart().speedscope`: valid speedscope format (all frames referenced in events exist in the frames array; open/close events are balanced).
- `profiler.toFlameChart().chromeTrace`: valid Chrome trace format (all events have required fields; timestamps are in microseconds).

**Profiler lifecycle tests**:
- `profiler.reset()`: after reset, `profiler.getProfile().allSpans` is empty.
- `profiler.disable()`: `profiler.span(name, fn)` calls fn() and returns its result; no spans are recorded.
- `profiler.enable()` after `profiler.disable()`: spans are recorded again.
- `PROFILER_ENABLED=false` environment variable: profiler behaves as if `enabled: false`.

**Timing accuracy tests**:
- Record a span around a `setTimeout(resolve, 50)` call. Verify `duration` is between 48ms and 55ms (allowing for timer resolution and scheduling jitter). This test validates that `performance.now()` is being used correctly.
- Record nested spans: verify that child span times fall within parent span times.

### Integration Tests

- **Full RAG chain profile**: Instrument a mock RAG pipeline (mock vector DB returning in 50ms, mock OpenAI client emitting a 20-chunk stream with 10ms inter-chunk delay). Run the chain. Verify the profile contains the expected span structure, TTFT is approximately 50ms (first chunk delay), streaming duration is approximately 190ms (19 more chunks × 10ms), and the terminal report renders without errors.
- **Multi-turn agent loop profile**: Instrument a 3-turn agent loop with 2 tool calls. Verify the span tree has 3 `step` spans, 3 `llm-call` spans, and 2 `tool-execution` spans. Verify `metrics.toolExecutionCount === 2`.
- **Error handling**: A span wrapping a function that throws still appears in the profile with correct timing and error information; the profiler does not enter a broken state after an error.
- **OTLP export**: Mock an HTTP server at `http://localhost:4318/v1/traces`. Run a chain, call `profiler.exportOtlp()`, verify the server received a valid OTLP request with the correct span data.
- **Flame chart file round-trip**: Write speedscope output to a temp file, read it back, verify it is valid JSON matching the speedscope schema.
- **Concurrent profilers**: Two separate `Profiler` instances running concurrently (simulating two parallel chain executions in the same process). Verify each profiler's span tree contains only its own spans.

### Edge Cases

- `profiler.span()` called with no wrapping `chain` span: spans are recorded correctly with no parent; `rootSpan` is undefined; total duration is computed from the first and last spans.
- `span.end()` called before `span.setTTFT()`: TTFT is not recorded; no crash.
- Zero-duration span: `startTime === endTime` after rounding; duration is 0; span appears in the tree.
- Very large chain (500 spans): `profiler.getProfile()` completes in under 10ms; `profiler.toJSON()` completes in under 50ms.
- `profiler.report()` on an empty profile (no spans recorded): prints a "no data" message; does not throw.
- Span started but never ended (e.g., due to a crash): appears in `allSpans` with `endTime: undefined`; `profiler.getProfile()` does not throw; the unended span is excluded from duration calculations.
- `profiler.instrument()` on a non-OpenAI, non-Anthropic object: returns the original object unchanged; logs a warning.

---

## 14. Performance

### Profiling Overhead Target

`llm-chain-profiler`'s instrumentation overhead must be less than 1% of the total chain execution time for any chain with a total duration greater than 100ms. This target is easily achievable because LLM chains are I/O-bound -- the time is spent waiting for network responses, not in CPU computation. Even a 1ms overhead per span is negligible relative to a 200ms TTFT.

### Implementation choices for low overhead

- **`performance.now()` over `Date.now()`**: `performance.now()` is a monotonic clock with sub-millisecond resolution. It is slightly faster than `Date.now()` in tight loops and eliminates clock skew from system time adjustments.
- **`process.hrtime.bigint()` optional mode**: Available as an alternative for nanosecond-precision timing. Higher overhead per call (~100ns vs ~10ns for `performance.now()`), but negligible in the context of LLM API latencies.
- **AsyncLocalStorage for parent span inference**: `AsyncLocalStorage.getStore()` is a single property access on a native module. Its overhead is approximately 50-100 nanoseconds per call. This is used to infer the current parent span without requiring the developer to pass span context explicitly.
- **No bufferring of stream content**: The streaming interception layer observes chunks as they pass through the transform without copying or buffering them. Memory overhead is one chunk at a time (typically 10-100 bytes).
- **Lazy report generation**: Terminal reports and flame chart data are generated on demand when `profiler.report()` or `profiler.toFlameChart()` is called, not during span recording. Span recording is append-only to an array.

### Overhead Measurement

The test suite includes a benchmark that measures the overhead of `profiler.span()` calls:

```typescript
// Baseline: call fn() directly 1000 times
const baseline = await time(() => Promise.resolve(42), 1000);

// With profiler: call profiler.span('test', fn) 1000 times
const withProfiler = await time(() => profiler.span('test', () => Promise.resolve(42)), 1000);

// Overhead per span call must be < 0.1ms
expect(withProfiler.perCallMs - baseline.perCallMs).toBeLessThan(0.1);
```

---

## 15. Dependencies

### Runtime Dependencies

Zero mandatory runtime dependencies. All timing APIs (`performance.now()`, `process.hrtime.bigint()`, `AsyncLocalStorage`) are Node.js built-ins available since Node.js 16.

Optional peer dependencies:
- `openai` (any version): Required for automatic OpenAI client instrumentation via `profiler.instrument()`. If not installed, the `instrument()` method falls back to a generic proxy that works with any client object but without OpenAI-specific streaming interception.
- `@anthropic-ai/sdk` (any version): Required for automatic Anthropic client instrumentation.

Both peer dependencies are optional. The package works fully for manual instrumentation without any LLM SDK installed.

### Development Dependencies

- `typescript`: TypeScript compiler.
- `vitest`: Test runner.
- `eslint`: Linter.
- `@types/node`: Node.js type definitions.

---

## 16. File Structure

```
llm-chain-profiler/
├── package.json
├── tsconfig.json
├── SPEC.md
├── README.md
└── src/
    ├── index.ts              # Public API re-exports
    ├── profiler.ts           # Profiler class and createProfiler() factory
    ├── span.ts               # Span, ActiveSpan, SpanOptions types and implementations
    ├── types.ts              # Profile, TimingMetrics, SpanType, FlameChartData, etc.
    ├── clock.ts              # Timing abstraction (performance.now / hrtime.bigint)
    ├── context.ts            # AsyncLocalStorage-based span context (parent inference)
    ├── metrics.ts            # Profile metrics computation (aggregates, percentages)
    ├── report.ts             # Terminal tree report renderer
    ├── flame-chart.ts        # Speedscope and Chrome trace format converters
    ├── otlp.ts               # OpenTelemetry OTLP HTTP export
    ├── decorator.ts          # @profile TypeScript decorator
    ├── instrument/
    │   ├── index.ts          # profiler.instrument() dispatch (detects SDK type)
    │   ├── openai.ts         # OpenAI client instrumentation proxy
    │   ├── anthropic.ts      # Anthropic client instrumentation proxy
    │   └── stream.ts         # Streaming interception (TTFT, TPS, chunk counting)
    └── __tests__/
        ├── profiler.test.ts        # Core profiler unit tests
        ├── span.test.ts            # Span recording and tree structure tests
        ├── streaming.test.ts       # Streaming profiling and TTFT tests
        ├── instrument.test.ts      # SDK instrumentation tests
        ├── report.test.ts          # Terminal report rendering tests
        ├── flame-chart.test.ts     # Flame chart format tests
        ├── otlp.test.ts            # OTLP export tests
        ├── metrics.test.ts         # Metrics computation tests
        └── integration.test.ts     # End-to-end chain profiling tests
```

---

## 17. Implementation Roadmap

### Phase 1: Core Span Recording

Implement the foundational span recording infrastructure. All subsequent phases depend on this.

1. **`clock.ts`**: Implement the timing abstraction. Export `now(): number` that calls `performance.now()`. Implement the `hrtime` mode as an option. Write tests that verify monotonicity and resolution.

2. **`context.ts`**: Implement `AsyncLocalStorage`-based span context. Export `getCurrentSpan(): ActiveSpan | undefined` and `runWithSpan(span, fn)`. Write tests verifying that nested async calls correctly inherit the parent span.

3. **`span.ts`**: Implement the `ActiveSpan` class with `end()`, `setTTFT()`, `addAttributes()`. Implement `Span` as the immutable record type. Write tests for all `ActiveSpan` methods.

4. **`profiler.ts`**: Implement `createProfiler()` and the `Profiler` class. Implement `span()` using `context.ts` for parent inference. Implement `startSpan()`. Implement `reset()`, `enable()`, `disable()`. Write the core unit tests.

Milestone: `createProfiler()`, `profiler.span()`, `profiler.startSpan()`, and `profiler.getProfile()` work correctly for synchronous and asynchronous code.

### Phase 2: Metrics and Reporting

Implement profile metrics computation and the terminal tree report.

5. **`metrics.ts`**: Implement `computeMetrics(spans): TimingMetrics`. Include overhead gap computation. Write tests for all metric computations.

6. **`report.ts`**: Implement `renderTree(profile, options)`. Implement the indented tree format with ANSI colors and percentage bars. Implement the summary block. Implement the `verbosity: 'summary'` one-liner. Write snapshot tests for the rendered output.

7. **`profiler.ts` update**: Connect `metrics.ts` and `report.ts`. Implement `profiler.report()`.

Milestone: `profiler.report()` produces a correctly formatted terminal tree with accurate metrics.

### Phase 3: Flame Chart Export

8. **`flame-chart.ts`**: Implement `toSpeedscopeProfile(profile)` and `toChromeTrace(profile)`. Write tests that validate the output against the format specifications (balanced open/close events, correct timestamps, all referenced frames exist).

9. **`profiler.ts` update**: Implement `profiler.toFlameChart()` and `profiler.toJSON()`.

Milestone: Flame chart files can be generated, written to disk, and successfully loaded in speedscope.app and Chrome DevTools.

### Phase 4: SDK Instrumentation and Streaming

10. **`instrument/stream.ts`**: Implement the async generator stream interceptor for TTFT and TPS recording. Test against mock streams.

11. **`instrument/openai.ts`**: Implement the OpenAI client Proxy. Handle `chat.completions.create` for both streaming and non-streaming. Use `stream.ts` for streaming interception.

12. **`instrument/anthropic.ts`**: Implement the Anthropic client Proxy. Handle `messages.create` and `messages.stream()`.

13. **`instrument/index.ts`**: Implement `profiler.instrument()` with SDK auto-detection.

Milestone: `profiler.instrument(openaiClient)` automatically creates `llm-call` and `streaming` spans with correct TTFT, TPS, and token counts.

### Phase 5: OpenTelemetry OTLP Export

14. **`otlp.ts`**: Implement OTLP span conversion and HTTP POST export. Map `Span` fields to OTLP attributes per the GenAI semantic conventions. Test against a mock HTTP server.

15. **`profiler.ts` update**: Implement `profiler.exportOtlp()`.

Milestone: A profile can be exported to a local Jaeger or Grafana Tempo collector running on localhost.

### Phase 6: Decorator and Polish

16. **`decorator.ts`**: Implement the `@profile` TypeScript decorator and `setGlobalProfiler()` / `getGlobalProfiler()`. Write tests.

17. **Documentation**: Write the README with quickstart examples for all major use cases. Ensure all public API methods have complete JSDoc.

18. **Performance benchmarks**: Implement the overhead measurement benchmark. Verify the <1% overhead target is met for chains over 100ms.

Milestone: All phases complete. `npm run test`, `npm run lint`, and `npm run build` all pass. Package is ready for v0.1.0 publication.

---

## 18. Example Use Cases

### Example 1: Profiling a RAG Chain

A developer has a RAG pipeline that takes 3-4 seconds. They want to know where the time is going.

```typescript
import { createProfiler } from 'llm-chain-profiler';
import OpenAI from 'openai';
import { vectorDb } from './db';

const profiler = createProfiler({ name: 'rag-pipeline' });
const openai = profiler.instrument(new OpenAI());

async function ragQuery(question: string): Promise<string> {
  return profiler.span('rag-pipeline', async () => {
    // Retrieval phase
    const docs = await profiler.span('retrieve', () => vectorDb.search(question), {
      type: 'step',
    });

    // Prompt assembly
    const messages = await profiler.span('build-prompt', () => buildMessages(question, docs), {
      type: 'prompt-assembly',
      attributes: { messageCount: 3, estimatedTokenCount: 2800 },
    });

    // LLM call (automatically profiled via instrumented client)
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
    });

    let answer = '';
    for await (const chunk of stream) {
      answer += chunk.choices[0]?.delta?.content ?? '';
    }

    // Post-processing
    return profiler.span('extract', () => extractStructuredAnswer(answer), {
      type: 'post-processing',
    });
  }, { type: 'chain' });
}

const answer = await ragQuery('What are the key findings in Q3?');
profiler.report();
```

**Terminal output reveals**: Retrieval is 2.1 seconds (67% of total time). LLM call is 0.9 seconds. The bottleneck is not the LLM -- it is the vector database query. The developer's next action is to add a retrieval cache, not to switch to a faster model.

### Example 2: Finding a TTFT Bottleneck

A developer building a chat interface notices that the first token takes over 2 seconds despite the streaming UI being otherwise smooth.

```typescript
import { createProfiler } from 'llm-chain-profiler';
import Anthropic from '@anthropic-ai/sdk';

const profiler = createProfiler({ name: 'chat-turn' });
const anthropic = profiler.instrument(new Anthropic());

async function chatTurn(messages: MessageParam[]): Promise<string> {
  return profiler.span('chat-turn', async () => {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      messages,
    });
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        text += event.delta.text;
      }
    }
    return text;
  }, { type: 'chain' });
}

// After running the chat turn:
const profile = profiler.getProfile();
const streamingSpan = profile.allSpans.find(s => s.type === 'streaming');
console.log(`TTFT: ${streamingSpan?.attributes.ttftMs}ms`);
console.log(`TPS: ${streamingSpan?.attributes.tps}`);
profiler.report({ verbosity: 'detailed' });
```

**Terminal output reveals**: TTFT is 2.1 seconds. TPS is 48 (normal). The problem is prefill latency, not decode latency. The developer inspects the `messageCount` in the prompt assembly span and discovers the conversation history has grown to 38 messages and 40,000 tokens. The TTFT is dominated by the time to prefill 40K tokens. The solution is to implement history truncation or summarization.

### Example 3: Comparing Two Chain Architectures

A team is evaluating whether to use sequential tool calls or parallel tool calls in their agent.

```typescript
import { createProfiler } from 'llm-chain-profiler';
import { writeFileSync } from 'node:fs';

// Architecture A: Sequential tool calls
const profilerA = createProfiler({ name: 'sequential' });
const resultA = await runAgentSequential(query, profilerA);
const profileA = JSON.parse(profilerA.toJSON());
writeFileSync('profile-sequential.json', profilerA.toJSON());

// Architecture B: Parallel tool calls
const profilerB = createProfiler({ name: 'parallel' });
const resultB = await runAgentParallel(query, profilerB);
writeFileSync('profile-parallel.json', profilerB.toJSON());

// Programmatic comparison
const seqMetrics = profileA.metrics;
const parMetrics = JSON.parse(profilerB.toJSON()).metrics;
console.log(`Sequential total: ${seqMetrics.totalDurationMs}ms, tool time: ${seqMetrics.totalToolExecutionDurationMs}ms`);
console.log(`Parallel total:   ${parMetrics.totalDurationMs}ms, tool time: ${parMetrics.totalToolExecutionDurationMs}ms`);
// Sequential total: 4200ms, tool time: 2800ms
// Parallel total:   2100ms, tool time: 2800ms (same work, half the wall time)
```

The comparison shows that both architectures execute the same total tool work (2800ms), but parallel execution halves the wall-clock time because the tool calls overlap. The flame charts make this structural difference visually obvious when opened in speedscope.

### Example 4: CI Latency Regression Gate

A CI step profiles a chain against a fixed input and fails if critical latency metrics exceed thresholds.

```typescript
import { createProfiler } from 'llm-chain-profiler';
import { withCassette } from 'llm-vcr'; // Replay from cassette, no real API calls

async function runLatencyCheck() {
  const profiler = createProfiler({ name: 'ci-latency-check' });

  await withCassette('latency-test-fixture', async () => {
    // profiler is instrumented; llm-vcr replays timing from cassette metadata
    await runProductionChain(testInput, profiler);
  });

  const profile = profiler.getProfile();
  const metrics = profile.metrics;

  // Assert on non-LLM timings (LLM timings from cassette don't reflect real latency)
  const retrievalSpan = profile.allSpans.find(s => s.name === 'retrieve');
  if (retrievalSpan?.duration && retrievalSpan.duration > 500) {
    console.error(`LATENCY REGRESSION: retrieval took ${retrievalSpan.duration}ms (threshold: 500ms)`);
    process.exitCode = 1;
  }

  const promptAssemblySpan = profile.allSpans.find(s => s.type === 'prompt-assembly');
  if (promptAssemblySpan?.duration && promptAssemblySpan.duration > 100) {
    console.error(`LATENCY REGRESSION: prompt assembly took ${promptAssemblySpan.duration}ms (threshold: 100ms)`);
    process.exitCode = 1;
  }

  // Save profile for comparison artifacts
  writeFileSync('latency-profile.json', profiler.toJSON());
  profiler.report();
}

runLatencyCheck();
```

This test catches regressions in retrieval and prompt assembly time without requiring real LLM API calls in CI, and saves the profile as a build artifact for engineers to inspect when a regression is detected.
