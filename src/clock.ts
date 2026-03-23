export function now(): number {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Number(process.hrtime.bigint()) / 1_000_000;
}
