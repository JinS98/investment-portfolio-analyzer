export function createExpiringRequestCache<T>(limit = 100) {
  const values = new Map<string, { expiresAt: number; value: T }>();
  const pending = new Map<string, Promise<T>>();

  const evictOldest = () => {
    if (values.size >= limit) values.delete(values.keys().next().value!);
  };

  return {
    async getOrLoad(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
      const cached = values.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      if (cached) values.delete(key);

      const current = pending.get(key);
      if (current) return current;

      const request = load()
        .then((value) => {
          evictOldest();
          values.set(key, { expiresAt: Date.now() + ttlMs, value });
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, request);
      return request;
    },
  };
}
