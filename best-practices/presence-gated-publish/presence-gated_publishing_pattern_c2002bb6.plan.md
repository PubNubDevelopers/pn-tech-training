---
name: Presence-Gated Publishing Pattern
overview: Design a scalable architecture for presence-gated publishing in a gaming application, where the server checks if a user is online before publishing ephemeral game updates, reducing wasted publishes by up to 66%.
todos:
  - id: document-pattern
    content: Create presence-gated-publishing/README.md following the canonical use case template
    status: pending
  - id: architecture-diagram
    content: Add detailed architecture diagrams for all three approaches
    status: pending
  - id: webhook-handlers
    content: Implement complete webhook handler code with batching support
    status: pending
  - id: publish-gate-service
    content: Implement the PresenceGatedPublisher service class
    status: pending
  - id: redis-schema
    content: Document Redis data model and TTL strategy
    status: pending
  - id: reconciliation-job
    content: Implement periodic reconciliation job for drift correction
    status: pending
  - id: metrics-observability
    content: Define metrics, dashboards, and alerting strategy
    status: pending
  - id: testing-plan
    content: Create test cases for storm scenarios and edge cases
    status: pending
isProject: false
---

# Presence-Gated Publishing Pattern

## Problem Analysis

Your PubNub usage chart shows a 3:1 ratio of publishes to subscribes, indicating ~66% of your published messages go to offline users. For ephemeral game state updates, this represents pure waste.

```
Current State:
- Server publishes game update to user's channel
- User is offline (not subscribed)
- Message delivered to empty channel
- Cost incurred, no value delivered
```

---

## API Capabilities Verification (MCP-Sourced)

### hereNow API

- **Classification**: Edge Transaction (single PoP, not globally replicated)
- **Pricing**: Included in MAU plan - no separate per-call charge
- **Rate Limits**: No documented hard limits, but abnormal traffic may trigger temporary throttling
- **Latency**: ~50-200ms depending on channel occupancy and `includeUUIDs` parameter

### Announce Max Configuration

- **Default**: 20 occupants
- **Range**: 0 to 100 (contact support for higher)
- **Effect of 0**: Forces ALL channels into Interval Mode immediately
- **Admin Portal Location**: Keyset > Presence > Announce Max

### Presence Webhook Payloads (Events and Actions)


| Event Type | Payload Fields                                                            | Trigger Condition                        |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Join       | `userId`, `channel`, `occupancy`, `timestamp`                             | User subscribes to channel               |
| Leave      | `userId`, `channel`, `occupancy`, `timestamp`                             | User unsubscribes                        |
| Timeout    | `userId`, `channel`, `occupancy`, `timestamp`                             | User inactive for presenceTimeout period |
| Interval   | `channel`, `occupancy`, `usersJoined[]`, `usersLeft[]`, `usersTimedout[]` | Periodic (configured interval)           |


### Presence Deltas

- **Enabled via**: Admin Portal > Presence > Presence Deltas
- **Provides**: `join[]`, `leave[]`, `timeout[]` arrays in interval events
- **Limit**: 32KB payload max; if exceeded, `hereNowRefresh: true` flag set

---

## Approach Analysis

### Approach 1: Naive Polling (hereNow Before Every Publish)

```
Server Flow:
1. Game event generated for user X
2. Call hereNow({ channels: ['game.userX'] })
3. If occupancy > 0, publish message
4. If occupancy == 0, skip publish
```

**Cost Analysis:**


| Metric              | Without Gating | With hereNow Polling        |
| ------------------- | -------------- | --------------------------- |
| Publishes/sec       | 1000           | ~333 (only to online users) |
| hereNow calls/sec   | 0              | 1000                        |
| Total API calls/sec | 1000           | 1333                        |
| Net savings         | -              | **-33% (WORSE)**            |


**Verdict: This trades one transaction for another and adds latency.**

**Pros:**

- Simple implementation
- Always accurate (real-time check)
- No state management required

**Cons:**

- Adds 50-200ms latency per publish
- Increases total transaction count by 33% (in your 3:1 scenario)
- Does not scale - linear API calls with message volume
- May trigger rate limiting under load

**Recommendation: REJECT for high-volume use cases.**

---

### Approach 2: Stateful Server with Real-time Webhooks (Scenario A)

```
Architecture:
+----------------+      +------------------+      +----------------+
|    PubNub      | ---> |  Webhook Server  | ---> |  Redis/Cache   |
| (Presence)     |      |  (Your Backend)  |      |  onlineUsers   |
+----------------+      +------------------+      +----------------+
                                                         |
                                                         v
+----------------+      +------------------+      +----------------+
|  Game Server   | <--- |  Publish Gate    | <--- |  Check Cache   |
|  (Updates)     |      |  if user online  |      |  O(1) lookup   |
+----------------+      +------------------+      +----------------+
```

**Configuration:**

- Events and Actions webhooks for: `User started subscription`, `User stopped subscription`, `User timed out`
- Announce Max: Leave at default (20) or higher

**Webhook Handler:**

```javascript
// Webhook endpoint: POST /presence-webhook
app.post('/presence-webhook', async (req, res) => {
  const { data } = req.body;
  
  for (const event of data) {
    const { userId, channel } = event;
    const schema = req.body.schema;
    
    if (schema.includes('joined')) {
      await redis.sadd('online_users', `${channel}:${userId}`);
    } else if (schema.includes('left') || schema.includes('timedout')) {
      await redis.srem('online_users', `${channel}:${userId}`);
    }
  }
  
  res.status(200).send('OK');
});
```

**Publish Gate Logic:**

```javascript
async function publishIfOnline(channel, userId, message) {
  const isOnline = await redis.sismember('online_users', `${channel}:${userId}`);
  
  if (isOnline) {
    await pubnub.publish({ channel, message });
    return { published: true };
  }
  
  return { published: false, reason: 'user_offline' };
}
```

**Pros:**

- Near real-time accuracy (webhook latency only)
- Individual user tracking
- Cache lookup is O(1) - microseconds
- Eliminates ~66% of wasted publishes immediately
- No polling overhead

**Cons:**

- High webhook volume during mass disconnects/reconnects (storm events)
- Webhook delivery has eventual consistency (~100-500ms delay)
- Server must handle webhook bursts (thousands/second possible)
- State can drift if webhooks fail (need reconciliation)

**Scale Characteristics:**


| Users | Join/Leave events/hour | Webhook calls/hour |
| ----- | ---------------------- | ------------------ |
| 10K   | ~20K (2 avg per user)  | ~20K               |
| 100K  | ~200K                  | ~200K              |
| 1M    | ~2M                    | ~2M                |


**Risk: Mass Reconnect Storm**
If network issues cause 100K users to reconnect in 10 seconds:

- 100K join webhooks in 10 seconds = 10K webhooks/sec
- Your webhook server must absorb this burst

---

### Approach 3: Interval-Only Mode (Scenario B - Announce Max = 0)

```
Configuration:
- Announce Max: 0 (forces all channels to interval mode)
- Presence Interval: 10-30 seconds (configurable)
- Presence Deltas: ENABLED (critical for this pattern)
```

**Architecture:**

```
+----------------+      +------------------+      +----------------+
|    PubNub      | ---> |  Interval        | ---> |  Redis/Cache   |
| (Interval)     |      |  Webhook Server  |      |  onlineUsers   |
+----------------+      +------------------+      +----------------+
        |
        | Every N seconds: occupancy + deltas
        v
+---------------------------------------------------------------+
| Webhook Payload (with Deltas enabled):                        |
| {                                                             |
|   "channel": "game.user123",                                  |
|   "occupancy": 1,                                             |
|   "usersJoined": ["user123"],                                 |
|   "usersLeft": [],                                            |
|   "usersTimedout": []                                         |
| }                                                             |
+---------------------------------------------------------------+
```

**Webhook Handler:**

```javascript
app.post('/presence-interval-webhook', async (req, res) => {
  const { data } = req.body;
  
  for (const event of data) {
    const { channel, usersJoined = [], usersLeft = [], usersTimedout = [] } = event;
    
    // Add joined users
    for (const userId of usersJoined) {
      await redis.sadd('online_users', `${channel}:${userId}`);
    }
    
    // Remove left/timed-out users
    for (const userId of [...usersLeft, ...usersTimedout]) {
      await redis.srem('online_users', `${channel}:${userId}`);
    }
    
    // Handle hereNowRefresh flag (delta overflow)
    if (event.hereNowRefresh) {
      await reconcileChannelOccupancy(channel);
    }
  }
  
  res.status(200).send('OK');
});
```

**Pros:**

- Dramatically reduced webhook volume (1 per channel per interval vs 1 per event)
- Natural batching smooths out bursts
- Lower server load during storms
- More predictable webhook traffic

**Cons:**

- Staleness window: Up to `presenceInterval` seconds of inaccuracy
- User joins: May receive messages for up to N seconds before being marked online
- User leaves: May miss messages for up to N seconds after leaving
- More complex delta processing
- `hereNowRefresh` flag requires fallback to hereNow API

**Scale Characteristics (10-second interval):**


| Users | Channels | Webhooks/interval | Webhooks/hour |
| ----- | -------- | ----------------- | ------------- |
| 10K   | 10K      | 10K               | 3.6M          |
| 100K  | 100K     | 100K              | 36M           |
| 1M    | 1M       | 1M                | 360M          |


**Key Insight:** With 1:1 user:channel mapping, you get 1 interval webhook per user-channel per interval. This can still be high volume, but it's **predictable** and **batchable**.

---

## Comparative Analysis


| Factor                  | Polling (hereNow)         | Real-time Webhooks          | Interval Mode              |
| ----------------------- | ------------------------- | --------------------------- | -------------------------- |
| **Accuracy**            | Perfect (real-time)       | Near real-time (~100-500ms) | Eventual (~10-30s window)  |
| **Latency Added**       | 50-200ms per publish      | ~0ms (cache lookup)         | ~0ms (cache lookup)        |
| **API Cost**            | +33% (worse)              | Neutral                     | Neutral                    |
| **Publish Savings**     | ~66%                      | ~66%                        | ~60-66% (staleness impact) |
| **Server Load**         | None                      | High during storms          | Predictable, lower peaks   |
| **Complexity**          | Low                       | Medium                      | Medium-High                |
| **Failure Mode**        | Graceful (publish anyway) | State drift possible        | State drift + staleness    |
| **Reconciliation Need** | None                      | Periodic recommended        | Required (hereNowRefresh)  |


---

## Recommended Architecture: Hybrid Approach

For a high-volume gaming use case, I recommend a **Hybrid Stateful Server** that combines the benefits of both webhook approaches:

### Design Principles

1. **Real-time webhooks for critical transitions** (join events specifically)
2. **Interval mode as a reconciliation mechanism** (catch missed events)
3. **Optimistic publishing with TTL-based cache** (handle edge cases gracefully)
4. **Graceful degradation** (publish on cache miss rather than drop)

### Configuration

```
Admin Portal Settings:
- Presence: ENABLED
- Announce Max: 20 (or higher based on typical channel occupancy)
- Presence Interval: 30 seconds
- Presence Deltas: ENABLED

Events & Actions:
- Webhook for: User started subscription (Join)
- Webhook for: User stopped subscription (Leave)  
- Webhook for: User timed out
- Webhook for: Interval occupancy counted (reconciliation)
- Batching: Enabled, 100 items / 5 seconds
```

### Architecture Diagram

```
+-------------------+     +------------------+     +------------------+
|     PubNub        |     |   Webhook        |     |     Redis        |
|   (Presence)      |---->|   Server         |---->|   Cluster        |
|                   |     |                  |     |                  |
| Events:           |     | Endpoints:       |     | Data Structure:  |
| - Join            |     | - /join          |     | SET online_users |
| - Leave           |     | - /leave         |     | HMAP user_meta   |
| - Timeout         |     | - /timeout       |     |                  |
| - Interval        |     | - /interval      |     | TTL: 5 minutes   |
+-------------------+     +------------------+     +------------------+
                                                           |
                                                           v
+-------------------+     +------------------+     +------------------+
|   Game Server     |     |   Publish Gate   |     |   Cache Check    |
|   (Your App)      |---->|   Service        |---->|   + Fallback     |
|                   |     |                  |     |                  |
| Generates:        |     | Logic:           |     | 1. Check SET     |
| - Game updates    |     | - Check cache    |     | 2. If miss +     |
| - State changes   |     | - Publish/skip   |     |    critical:     |
| - Notifications   |     | - Log decision   |     |    hereNow()     |
+-------------------+     +------------------+     +------------------+
```

### Implementation

**Redis Data Model:**

```javascript
// Primary: Set of online users with channel context
// Key: online:{channel}
// Members: userId values
// TTL: 5 minutes (auto-cleanup for missed leave events)

// Secondary: User metadata for debugging
// Key: user:{userId}
// Fields: lastSeen, joinedAt, channel
```

**Publish Gate Service:**

```javascript
class PresenceGatedPublisher {
  constructor(pubnub, redis) {
    this.pubnub = pubnub;
    this.redis = redis;
    this.metrics = new Metrics();
  }

  async publish(channel, userId, message, options = {}) {
    const startTime = Date.now();
    
    // 1. Check cache (O(1) - microseconds)
    const cacheKey = `online:${channel}`;
    const isOnline = await this.redis.sismember(cacheKey, userId);
    
    // 2. Decision logic
    if (isOnline) {
      // User confirmed online - publish
      await this.pubnub.publish({ channel, message });
      this.metrics.increment('publish.sent');
      return { published: true, source: 'cache_hit' };
    }
    
    // 3. Handle cache miss based on message priority
    if (options.critical) {
      // For critical messages, verify with hereNow
      const presence = await this.pubnub.hereNow({ 
        channels: [channel],
        includeUUIDs: true 
      });
      
      const actuallyOnline = presence.channels[channel]?.occupants
        ?.some(o => o.uuid === userId);
      
      if (actuallyOnline) {
        // Cache was stale - update and publish
        await this.redis.sadd(cacheKey, userId);
        await this.pubnub.publish({ channel, message });
        this.metrics.increment('publish.sent_after_herenow');
        return { published: true, source: 'herenow_verified' };
      }
    }
    
    // 4. User offline - skip publish
    this.metrics.increment('publish.suppressed');
    return { 
      published: false, 
      reason: 'user_offline',
      latency: Date.now() - startTime 
    };
  }
}
```

**Webhook Handlers with Batching Support:**

```javascript
// Join webhook - immediate cache update
app.post('/webhook/join', async (req, res) => {
  const events = req.body.data || [req.body];
  
  const pipeline = redis.pipeline();
  for (const event of events) {
    const { userId, channel } = event;
    pipeline.sadd(`online:${channel}`, userId);
    pipeline.expire(`online:${channel}`, 300); // 5 min TTL
    pipeline.hset(`user:${userId}`, {
      channel,
      joinedAt: event.timestamp,
      lastSeen: Date.now()
    });
  }
  
  await pipeline.exec();
  metrics.increment('webhook.join', events.length);
  res.status(200).send('OK');
});

// Leave/Timeout webhook - immediate removal
app.post('/webhook/leave', async (req, res) => {
  const events = req.body.data || [req.body];
  
  const pipeline = redis.pipeline();
  for (const event of events) {
    const { userId, channel } = event;
    pipeline.srem(`online:${channel}`, userId);
    pipeline.del(`user:${userId}`);
  }
  
  await pipeline.exec();
  metrics.increment('webhook.leave', events.length);
  res.status(200).send('OK');
});

// Interval webhook - reconciliation
app.post('/webhook/interval', async (req, res) => {
  const events = req.body.data || [req.body];
  
  for (const event of events) {
    const { channel, usersJoined = [], usersLeft = [], usersTimedout = [] } = event;
    
    // Process deltas
    if (usersJoined.length > 0) {
      await redis.sadd(`online:${channel}`, ...usersJoined);
    }
    
    const toRemove = [...usersLeft, ...usersTimedout];
    if (toRemove.length > 0) {
      await redis.srem(`online:${channel}`, ...toRemove);
    }
    
    // Handle overflow - need full reconciliation
    if (event.hereNowRefresh) {
      await reconcileChannel(channel);
    }
  }
  
  metrics.increment('webhook.interval', events.length);
  res.status(200).send('OK');
});

// Full reconciliation for a channel
async function reconcileChannel(channel) {
  const presence = await pubnub.hereNow({
    channels: [channel],
    includeUUIDs: true
  });
  
  const actualUsers = presence.channels[channel]?.occupants
    ?.map(o => o.uuid) || [];
  
  // Replace set with actual users
  const pipeline = redis.pipeline();
  pipeline.del(`online:${channel}`);
  if (actualUsers.length > 0) {
    pipeline.sadd(`online:${channel}`, ...actualUsers);
    pipeline.expire(`online:${channel}`, 300);
  }
  await pipeline.exec();
  
  metrics.increment('reconciliation.channel');
}
```

---

## Cost-Effectiveness Analysis

**Assumptions:**

- 100K MAU
- 1M game updates/hour (before gating)
- 66% of users offline at any time (based on your 3:1 ratio)

**Without Presence Gating:**


| Metric              | Value         |
| ------------------- | ------------- |
| Publishes/hour      | 1,000,000     |
| Effective publishes | 333,333 (33%) |
| Wasted publishes    | 666,667 (67%) |


**With Hybrid Presence Gating:**


| Metric                | Value     |
| --------------------- | --------- |
| Cache checks/hour     | 1,000,000 |
| Actual publishes/hour | ~350,000  |
| Webhook events/hour   | ~200,000  |
| Publish reduction     | **~65%**  |
| Net API reduction     | **~45%**  |


---

## Failure Modes and Mitigations


| Failure                  | Impact                                         | Mitigation                                      |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Webhook delivery failure | Stale cache (users marked offline when online) | TTL-based expiry + periodic reconciliation job  |
| Redis unavailable        | Cannot check presence                          | Fallback: publish anyway (graceful degradation) |
| Webhook server overload  | Event backlog                                  | Enable webhook batching, scale horizontally     |
| Mass reconnect storm     | Burst of join events                           | Webhook batching smooths peaks                  |
| hereNowRefresh overflow  | Incomplete delta                               | Automatic full reconciliation via hereNow       |


---

## Observability

**Key Metrics to Track:**


| Metric                                      | Purpose              | Alert Threshold                     |
| ------------------------------------------- | -------------------- | ----------------------------------- |
| `publish.suppressed` / `publish.sent` ratio | Gating effectiveness | < 50% suppression = investigate     |
| `webhook.lag`                               | Event freshness      | > 1 second = investigate            |
| `cache.miss_rate`                           | Cache accuracy       | > 5% = reconciliation issue         |
| `reconciliation.triggered`                  | Overflow frequency   | > 10/min = review interval settings |


---

## Final Recommendation

For your gaming application with high publish volume and 1:1 user channels:

1. **Implement the Hybrid Stateful Server approach**
2. **Enable real-time webhooks** for join/leave/timeout events
3. **Enable interval mode** with deltas for reconciliation
4. **Use Redis** with TTL-based expiry as your presence cache
5. **Implement graceful degradation** - publish on cache miss for critical messages
6. **Add reconciliation job** running every 5 minutes to catch drift

This approach will reduce your publish volume by ~65% while maintaining sub-millisecond publish decision latency and handling edge cases gracefully.