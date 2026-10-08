import { onRequest } from 'firebase-functions/v2/https';
import { createRequestLimiter } from './rateLimit.js';
import { createTossApiHandler } from './toss.js';

const isRateLimited = createRequestLimiter();
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
    const clientKey = request.ip ?? 'unknown';
    if (isRateLimited(clientKey)) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '60');
      response.status(429).json({ message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    await apiHandler(request, response);
  },
);
