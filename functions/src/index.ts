import { onRequest } from 'firebase-functions/v2/https';
import { createTossApiHandler } from './toss.js';

const REQUEST_LIMIT = 90;
const REQUEST_WINDOW_MS = 60_000;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

const isRateLimited = (clientKey: string) => {
  const now = Date.now();
  const current = requestWindows.get(clientKey);
  if (!current || current.resetAt <= now) {
    requestWindows.set(clientKey, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > REQUEST_LIMIT;
};

const apiHandler = createTossApiHandler(process.env);

/** Same-origin endpoint served through Firebase Hosting at /api/toss/**. */
export const tossApi = onRequest(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 5,
  },
  async (request, response) => {
    const clientKey = request.ip ?? request.header('x-forwarded-for') ?? 'unknown';
    if (isRateLimited(clientKey)) {
      response.status(429).json({ message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    await apiHandler(request, response);
  },
);
