/**
 * Small dependency-free, in-memory rate limiter for public endpoints.
 * It protects one Node process only; multi-instance deployments need a shared store.
 */
export function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 60,
  maxKeys = 10_000,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  now = () => Date.now(),
} = {}) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new TypeError('windowMs must be a positive safe integer.');
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) throw new TypeError('maxRequests must be a positive safe integer.');
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new TypeError('maxKeys must be a positive safe integer.');

  const buckets = new Map();
  return function rateLimit(req, res, next) {
    const timestamp = now();
    let key = String(keyGenerator(req) || 'unknown').slice(0, 256);
    if (!buckets.has(key) && buckets.size >= maxKeys) {
      for (const [candidate, bucket] of buckets) {
        if (bucket.resetAt <= timestamp) buckets.delete(candidate);
      }
      if (!buckets.has(key) && buckets.size >= maxKeys) key = '__rate_limit_overflow__';
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) bucket = { count: 0, resetAt: timestamp + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfter));
    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }
    return next();
  };
}
