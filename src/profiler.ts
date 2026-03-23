import { randomUUID } from 'crypto';
import { SpanStore } from './span-store';
import { computeMetrics } from './metrics';
import { formatTerminal } from './formatters';
import { now } from './clock';
import type { Profiler, ProfilerOptions, SpanOptions, SpanEndOptions, ReportOptions, ActiveSpan } from './types';

export function createProfiler(options?: ProfilerOptions): Profiler {
  const store = new SpanStore();
  let enabled = options?.enabled !== false;
  let profileStartTime = now();
  let profileStartTimestamp = Date.now();
  const profileName = options?.name ?? 'profile';

  const profiler: Profiler = {
    async span<T>(name: string, fn: () => T | Promise<T>, spanOptions?: SpanOptions): Promise<T> {
      if (!enabled) return fn() as Promise<T>;
      const id = randomUUID();
      const parentId = spanOptions?.parentId ?? store.getCurrentParentId();
      const span = store.createSpan(id, name, spanOptions?.type ?? 'custom', parentId);
      if (spanOptions?.attributes) Object.assign(span.attributes, spanOptions.attributes);
      return store.runWithSpan(id, async () => {
        try {
          const result = await fn();
          store.endSpan(id);
          return result;
        } catch (err: unknown) {
          const error = err as Error & { code?: string };
          store.endSpan(id, {
            error: { message: String(err), code: error.code },
          });
          throw err;
        }
      });
    },

    startSpan(name: string, spanOptions?: SpanOptions): ActiveSpan {
      const id = randomUUID();
      const parentId = spanOptions?.parentId ?? store.getCurrentParentId();
      const span = store.createSpan(id, name, spanOptions?.type ?? 'custom', parentId);
      if (spanOptions?.attributes) Object.assign(span.attributes, spanOptions.attributes);
      return {
        get id() { return id; },
        get name() { return name; },
        end(endOptions?: SpanEndOptions) {
          store.endSpan(id, endOptions);
        },
        setTTFT(ttftMs: number) {
          const s = store.getSpan(id);
          if (s) s.attributes.ttftMs = ttftMs;
        },
        addAttributes(attrs: Partial<Record<string, unknown>>) {
          const s = store.getSpan(id);
          if (s) Object.assign(s.attributes, attrs);
        },
      };
    },

    getProfile() {
      const root = store.getRoot();
      const all = store.allSpans();
      const metrics = computeMetrics(all);
      return {
        id: randomUUID(),
        name: profileName,
        startTimestamp: profileStartTimestamp,
        totalDurationMs: root?.duration ?? now() - profileStartTime,
        rootSpan: root ?? {
          id: 'empty',
          name: 'empty',
          type: 'chain' as const,
          startTime: 0,
          children: [],
          attributes: {},
        },
        allSpans: all,
        metrics,
        version: '1',
      };
    },

    report(reportOptions?: ReportOptions) {
      const profile = profiler.getProfile();
      if (!reportOptions?.output || reportOptions.output === 'terminal') {
        console.log(formatTerminal(profile, reportOptions));
      } else {
        console.log(profiler.toJSON());
      }
    },

    toJSON() {
      return JSON.stringify(profiler.getProfile(), null, 2);
    },

    reset() {
      store.clear();
      profileStartTime = now();
      profileStartTimestamp = Date.now();
    },

    enable() { enabled = true; },
    disable() { enabled = false; },
    isEnabled() { return enabled; },
  };

  return profiler;
}
