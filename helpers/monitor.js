const INTERVAL_MS = 2 * 60 * 1000;

function logMemory() {
  const { rss, heapUsed } = process.memoryUsage();
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  console.log(`[mem] ${ts}  rss=${(rss / 1e6).toFixed(0)}MB  heap=${(heapUsed / 1e6).toFixed(0)}MB`);
}

export function logStage(label) {
  const { rss } = process.memoryUsage();
  console.log(`[mem] ${label.padEnd(16)} ${(rss / 1e6).toFixed(0)}MB`);
}

export function startMonitor(onMemoryThreshold) {
  logMemory();
  setInterval(() => {
    logMemory();
    if (onMemoryThreshold) onMemoryThreshold();
  }, INTERVAL_MS);

  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.message);
    if (err instanceof WebAssembly.RuntimeError || err.message?.includes('memory access out of bounds')) {
      console.error('[fatal] WebAssembly RuntimeError — exiting for clean restart');
      process.exit(1);
    }
  });
}
