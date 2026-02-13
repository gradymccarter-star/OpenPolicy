import Redis from 'ioredis';

// Singleton Redis client
let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return null;
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }

  return redis;
}

// Cache helpers with TTL
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (!client) return null;
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function cacheSet(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error('Cache delete pattern error:', error);
  }
}

// Helper to close connection
export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
