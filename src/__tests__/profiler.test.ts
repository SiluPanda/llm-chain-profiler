import { describe, it, expect, vi } from 'vitest';
import { createProfiler } from '../profiler';

describe('createProfiler', () => {
  it('span() records duration and returns fn result', async () => {
    const profiler = createProfiler({ name: 'test' });
    const result = await profiler.span('my-span', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    });
    expect(result).toBe(42);
    const profile = profiler.getProfile();
    expect(profile.allSpans).toHaveLength(1);
    expect(profile.allSpans[0].name).toBe('my-span');
    expect(profile.allSpans[0].duration).toBeGreaterThan(0);
    expect(profile.allSpans[0].endTime).toBeDefined();
  });

  it('nested spans create parent-child relationships in tree', async () => {
    const profiler = createProfiler({ name: 'nested-test' });
    await profiler.span('parent', async () => {
      await profiler.span('child', async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    });
    const profile = profiler.getProfile();
    expect(profile.allSpans).toHaveLength(2);
    const parent = profile.allSpans.find((s) => s.name === 'parent');
    const child = profile.allSpans.find((s) => s.name === 'child');
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child!.parentId).toBe(parent!.id);
    expect(parent!.children).toHaveLength(1);
    expect(parent!.children[0].id).toBe(child!.id);
  });

  it('startSpan/end manually works', async () => {
    const profiler = createProfiler({ name: 'manual-test' });
    const span = profiler.startSpan('manual-span', { type: 'llm-call' });
    expect(span.name).toBe('manual-span');
    expect(span.id).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5));
    span.end();
    const profile = profiler.getProfile();
    expect(profile.allSpans).toHaveLength(1);
    expect(profile.allSpans[0].type).toBe('llm-call');
    expect(profile.allSpans[0].duration).toBeGreaterThan(0);
  });

  it('error in span is recorded correctly', async () => {
    const profiler = createProfiler({ name: 'error-test' });
    await expect(
      profiler.span('failing-span', async () => {
        throw new Error('something went wrong');
      }),
    ).rejects.toThrow('something went wrong');
    const profile = profiler.getProfile();
    const span = profile.allSpans.find((s) => s.name === 'failing-span');
    expect(span).toBeDefined();
    expect(span!.error).toBeDefined();
    expect(span!.error!.message).toContain('something went wrong');
    expect(span!.duration).toBeGreaterThanOrEqual(0);
  });

  it('getProfile() returns correct metrics for llm-call spans', async () => {
    const profiler = createProfiler({ name: 'metrics-test' });
    await profiler.span(
      'llm-1',
      async () => {
        await new Promise((r) => setTimeout(r, 10));
      },
      { type: 'llm-call', attributes: { inputTokens: 100, outputTokens: 50 } },
    );
    await profiler.span(
      'llm-2',
      async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
      { type: 'llm-call', attributes: { inputTokens: 200, outputTokens: 80 } },
    );
    const profile = profiler.getProfile();
    expect(profile.metrics.llmCallCount).toBe(2);
    expect(profile.metrics.totalInputTokens).toBe(300);
    expect(profile.metrics.totalOutputTokens).toBe(130);
    expect(profile.metrics.totalLlmCallDurationMs).toBeGreaterThan(0);
  });

  it('disabled profiler passes through fn without recording', async () => {
    const profiler = createProfiler({ name: 'disabled', enabled: false });
    const result = await profiler.span('should-not-record', async () => 99);
    expect(result).toBe(99);
    const profile = profiler.getProfile();
    expect(profile.allSpans).toHaveLength(0);
  });

  it('enable/disable toggle works mid-session', async () => {
    const profiler = createProfiler({ name: 'toggle-test' });
    await profiler.span('recorded', async () => 1);
    profiler.disable();
    expect(profiler.isEnabled()).toBe(false);
    await profiler.span('not-recorded', async () => 2);
    profiler.enable();
    expect(profiler.isEnabled()).toBe(true);
    const profile = profiler.getProfile();
    const names = profile.allSpans.map((s) => s.name);
    expect(names).toContain('recorded');
    expect(names).not.toContain('not-recorded');
  });

  it('reset() clears all spans', async () => {
    const profiler = createProfiler({ name: 'reset-test' });
    await profiler.span('before-reset', async () => 1);
    expect(profiler.getProfile().allSpans).toHaveLength(1);
    profiler.reset();
    expect(profiler.getProfile().allSpans).toHaveLength(0);
  });

  it('TTFT set on streaming span appears in metrics', async () => {
    const profiler = createProfiler({ name: 'ttft-test' });
    const s = profiler.startSpan('stream', { type: 'streaming' });
    s.setTTFT(123.4);
    s.end();
    const profile = profiler.getProfile();
    expect(profile.metrics.firstTtftMs).toBe(123.4);
  });

  it('addAttributes adds to existing span', async () => {
    const profiler = createProfiler({ name: 'attrs-test' });
    const s = profiler.startSpan('my-span');
    s.addAttributes({ model: 'gpt-4', temperature: 0.7 });
    s.end();
    const profile = profiler.getProfile();
    const span = profile.allSpans[0];
    expect(span.attributes.model).toBe('gpt-4');
    expect(span.attributes.temperature).toBe(0.7);
  });

  it('report() does not throw', async () => {
    const profiler = createProfiler({ name: 'report-test' });
    await profiler.span('a', async () => 1, { type: 'chain' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => profiler.report()).not.toThrow();
    expect(() => profiler.report({ verbosity: 'brief' })).not.toThrow();
    expect(() => profiler.report({ output: 'json' })).not.toThrow();
    spy.mockRestore();
  });

  it('toJSON() returns valid JSON containing profile fields', async () => {
    const profiler = createProfiler({ name: 'json-test' });
    await profiler.span('root', async () => 1, { type: 'chain' });
    const json = profiler.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('json-test');
    expect(parsed.allSpans).toHaveLength(1);
    expect(parsed.metrics).toBeDefined();
  });

  it('percentageByType sums to approximately 100 for a single root span', async () => {
    const profiler = createProfiler({ name: 'pct-test' });
    await profiler.span(
      'root',
      async () => {
        await new Promise((r) => setTimeout(r, 10));
      },
      { type: 'chain' },
    );
    const profile = profiler.getProfile();
    const total = Object.values(profile.metrics.percentageByType).reduce(
      (a, b) => a + b,
      0,
    );
    // A single span: percentageByType['chain'] should be 100
    expect(profile.metrics.percentageByType['chain']).toBe(100);
    expect(total).toBe(100);
  });

  // === Bug fix tests ===

  it('TTFT of 0ms should be recorded', async () => {
    const profiler = createProfiler({ name: 'ttft-zero-test' });
    const s = profiler.startSpan('stream', { type: 'streaming' });
    s.setTTFT(0);
    s.end();
    const profile = profiler.getProfile();
    // TTFT of 0 is a valid value (instant first token) and must be recorded.
    // Bug: `ttftMs && !firstTtft` treated 0 as falsy, so TTFT=0 was never stored.
    expect(profile.metrics.firstTtftMs).toBe(0);
  });

  it('token count of 0 should be included in totals', async () => {
    const profiler = createProfiler({ name: 'zero-input-tokens-test' });
    await profiler.span(
      'llm-1',
      async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
      { type: 'llm-call', attributes: { inputTokens: 0, outputTokens: 50 } },
    );
    const profile = profiler.getProfile();
    // outputTokens should still be counted even when inputTokens is 0.
    // Bug: `if (span.attributes.inputTokens)` skipped the span when inputTokens was 0,
    // and `if (span.attributes.outputTokens)` could also skip outputTokens=0.
    expect(profile.metrics.totalOutputTokens).toBe(50);
    expect(profile.metrics.totalInputTokens).toBe(0);
    expect(profile.metrics.llmCallCount).toBe(1);
  });

  it('formatter shows tokens when only outputTokens > 0', async () => {
    const profiler = createProfiler({ name: 'formatter-token-test' });
    await profiler.span(
      'llm-1',
      async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
      { type: 'llm-call', attributes: { inputTokens: 0, outputTokens: 75 } },
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    profiler.report();
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    spy.mockRestore();
    // Bug: `if (profile.metrics.totalInputTokens)` was falsy when inputTokens=0,
    // so the token line was skipped even though outputTokens > 0.
    expect(output).toContain('Tokens:');
    expect(output).toContain('75');
  });
});
