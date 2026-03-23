import { AsyncLocalStorage } from 'async_hooks';
import { now } from './clock';
import type { Span, SpanType, SpanEndOptions } from './types';

export class SpanStore {
  private spans = new Map<string, Span>();
  private rootSpan: Span | null = null;
  private storage = new AsyncLocalStorage<string>();

  createSpan(id: string, name: string, type: SpanType, parentId?: string): Span {
    const span: Span = {
      id,
      name,
      type,
      parentId,
      startTime: now(),
      children: [],
      attributes: {},
    };
    this.spans.set(id, span);
    if (parentId) {
      this.spans.get(parentId)?.children.push(span);
    } else if (!this.rootSpan) {
      this.rootSpan = span;
    }
    return span;
  }

  getCurrentParentId(): string | undefined {
    return this.storage.getStore();
  }

  runWithSpan<T>(spanId: string, fn: () => T): T {
    return this.storage.run(spanId, fn);
  }

  endSpan(id: string, endOptions?: SpanEndOptions): void {
    const span = this.spans.get(id);
    if (!span) return;
    span.endTime = now();
    span.duration = span.endTime - span.startTime;
    if (endOptions?.error) span.error = endOptions.error;
    if (endOptions?.attributes) Object.assign(span.attributes, endOptions.attributes);
  }

  getSpan(id: string): Span | undefined {
    return this.spans.get(id);
  }

  getRoot(): Span | null {
    return this.rootSpan;
  }

  allSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  clear(): void {
    this.spans.clear();
    this.rootSpan = null;
  }
}
