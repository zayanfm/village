import Redis from 'ioredis';

// Connects to the VOLATILE cache (compose: redis-server --save "" --appendonly
// no). Anything stored here is gone on restart and never hits disk — which is
// exactly the contract for Temporary journal drafts.
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/** Namespaced per youth so a token's `sub` fully determines the key. */
export const draftKey = (youthId: string) => `journal:temp:${youthId}`;
