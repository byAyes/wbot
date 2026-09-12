/**
 * RateLimiter - Generic sliding-window rate limiter
 * Used for: AI messages, Hall of Shame, download commands
 */
const logger = require('./logger');

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10;
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.map = new Map(); // userId -> [{ timestamp }]
  }

  /**
   * Checks if a user is allowed to make a request
   * @param {string} userId
   * @returns {object} { allowed: boolean, remaining: number, resetIn: number }
   */
  check(userId) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get user's requests within the window
    let requests = this.map.get(userId) || [];
    requests = requests.filter(ts => ts > windowStart);

    const allowed = requests.length < this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - requests.length);

    // Calculate when the oldest request will expire (next available slot)
    let resetIn = 0;
    if (requests.length > 0 && !allowed) {
      const oldestRequest = Math.min(...requests);
      resetIn = oldestRequest + this.windowMs - now;
    }

    if (allowed) {
      requests.push(now);
      this.map.set(userId, requests);
    }

    return { allowed, remaining, resetIn };
  }

  /**
   * Gets the number of remaining requests for a user
   * @param {string} userId
   * @returns {number}
   */
  getRemaining(userId) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = (this.map.get(userId) || []).filter(ts => ts > windowStart);
    return Math.max(0, this.maxRequests - requests.length);
  }

  /**
   * Resets the rate limit for a user
   * @param {string} userId
   */
  reset(userId) {
    this.map.delete(userId);
  }

  /**
   * Cleanup old entries periodically
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [userId, requests] of this.map.entries()) {
      const filtered = requests.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.map.delete(userId);
      } else {
        this.map.set(userId, filtered);
      }
    }
  }
}

// Pre-configured limiters
const limiters = {
  // AI chat: 10 messages per minute per user
  ai: new RateLimiter({ maxRequests: 10, windowMs: 60000 }),
  // Hall of Shame: 1 nomination per 30 seconds per user
  hos: new RateLimiter({ maxRequests: 1, windowMs: 30000 }),
  // Downloads: 5 per minute per user
  download: new RateLimiter({ maxRequests: 5, windowMs: 60000 }),
  // General commands: 30 per minute per user
  general: new RateLimiter({ maxRequests: 30, windowMs: 60000 }),
};

// Cleanup every 5 minutes
setInterval(() => {
  Object.values(limiters).forEach(limiter => limiter.cleanup());
}, 5 * 60 * 1000);

/**
 * Gets a rate limiter by name
 * @param {string} name
 * @returns {RateLimiter}
 */
function getLimiter(name) {
  return limiters[name] || limiters.general;
}

/**
 * Formats a rate limit message
 * @param {object} result - Result from RateLimiter.check()
 * @param {string} unit - 'msg' | 'nominación' | 'comando'
 * @returns {string}
 */
function formatRateLimitMessage(result, unit = 'msg') {
  const seconds = Math.ceil(result.resetIn / 1000);
  return `⏳ Rate limit alcanzado. Espera ${seconds}s antes de otro ${unit}. (${result.remaining} restantes)`;
}

module.exports = {
  RateLimiter,
  getLimiter,
  formatRateLimitMessage,
  limiters,
};