const REQUEST_LIMIT = 90;
const REQUEST_WINDOW_MS = 60_000;
const MAX_CLIENTS = 10_000;

export function createRequestLimiter(now = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (clientKey: string) => {
    const currentTime = now();
    const current = windows.get(clientKey);
    if (current && current.resetAt > currentTime) {
      current.count += 1;
      return current.count > REQUEST_LIMIT;
    }

    if (windows.size >= MAX_CLIENTS) {
      for (const [key, window] of windows) {
        if (window.resetAt <= currentTime) windows.delete(key);
      }
      if (windows.size >= MAX_CLIENTS && !current) return true;
    }

    windows.set(clientKey, { count: 1, resetAt: currentTime + REQUEST_WINDOW_MS });
    return false;
  };
}
