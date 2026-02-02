---
name: Friends Presence Design Pattern
overview: Design a scalable friends/presence system using App Context for relationship storage and a hybrid presence architecture with personal inbox channels for real-time friend status updates, supporting 100,000s of concurrent users with 100s-1000s of friends each.
todos:
  - id: problem-requirements
    content: Write Problem Statement and Requirements sections with scale tiers
    status: pending
  - id: architecture
    content: Write Architecture section with detailed diagram and component descriptions
    status: pending
  - id: channel-topology
    content: Write Channel Topology with presence shard strategy and naming conventions
    status: pending
  - id: app-context
    content: Write App Context Model with UUID, Channel, and Membership schemas for friends
    status: pending
  - id: message-contracts
    content: Write all Message Contracts (friend.online, friend.offline, friends.sync, status.count)
    status: pending
  - id: functions
    content: Write Functions section with After Presence handler and notification logic
    status: pending
  - id: notification-worker
    content: Write External Notification Worker design for batched friend updates
    status: pending
  - id: security
    content: Write Security section with PAM tokens for inbox and presence channels
    status: pending
  - id: failure-modes
    content: Write Failure Modes covering reconnection storms, flapping, and fan-out overload
    status: pending
  - id: scaling-notes
    content: Write Scaling Notes with shard sizing and external DB guidance
    status: pending
  - id: observability
    content: Write Observability section with metrics for presence and notifications
    status: pending
  - id: testing
    content: Write Testing section with load test scenarios for friend notifications
    status: pending
  - id: checklist-mistakes
    content: Write Implementation Checklist and Common Mistakes sections
    status: pending
isProject: false
---

# Friends/Presence Design Pattern

## Problem Statement

Enable users to:

1. See **total concurrent users online** (approximate, updated periodically)
2. See **which of their friends are online/offline** in real-time

At scale: **500K+ concurrent users**, each with **500-1000 bidirectional friends**.

### Why Naive Approaches Fail


| Approach                                    | Problem                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Subscribe to each friend's presence channel | 500 friends × 500K users = 250M subscriptions; PubNub channel limits ~100-200/connection |
| Poll friend status via API                  | 500K users polling 500 friends = 250M queries continuously                               |
| Single global presence channel              | Cannot differentiate friends from non-friends                                            |


---

## Proposed Architecture: Hybrid Presence with Personal Inboxes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER CLIENTS                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                  │
│  │ User A  │  │ User B  │  │ User C  │  ...500K users                   │
│  └────┬────┘  └────┬────┘  └────┬────┘                                  │
│       │            │            │                                        │
│       │ Subscribe: │            │                                        │
│       │ • inbox.userA          │                                        │
│       │ • presence.shard-{N}   │                                        │
│       │ • status.global        │                                        │
└───────┼────────────┼────────────┼────────────────────────────────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PUBNUB CHANNELS                                  │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ presence.shard-0 │  │ presence.shard-1 │  │ presence.shard-N │       │
│  │ (Presence ON)    │  │ (Presence ON)    │  │ (Presence ON)    │       │
│  │ ~5K users each   │  │ ~5K users each   │  │ ~5K users each   │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
│           │                     │                     │                  │
│           └─────────────────────┼─────────────────────┘                  │
│                                 ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │               PUBNUB FUNCTION (After Presence)                    │   │
│  │  • Detect join/leave/timeout events                               │   │
│  │  • Update App Context UUID (online status)                        │   │
│  │  • Queue friend notification jobs                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                 │                                        │
│                                 ▼                                        │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐     │
│  │ status.global    │  │ Personal Inbox Channels                  │     │
│  │ (periodic count) │  │ inbox.userA, inbox.userB, inbox.userC... │     │
│  │ ~10s interval    │  │ (friend status push)                     │     │
│  └──────────────────┘  └──────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           APP CONTEXT                                    │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐                       │
│  │ UUID Metadata       │  │ Channel Metadata    │                       │
│  │ • online: boolean   │  │ • friends.{userId}  │                       │
│  │ • lastSeen: ts      │  │   (friend list)     │                       │
│  │ • shardId: N        │  │                     │                       │
│  └─────────────────────┘  └─────────────────────┘                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Membership (Friend Relationships)                                │    │
│  │ Channel: friends.userA → Members: [userB, userC, userD...]      │    │
│  │ Channel: friends.userB → Members: [userA, userE, userF...]      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Presence Sharding (Solves Channel Limit Problem)

- Assign each user to **one presence shard** via consistent hashing: `shardId = hash(userId) % 100`
- Each shard has ~5K users (500K / 100 shards)
- Users subscribe to their assigned shard for presence
- **Benefit**: Each user subscribes to only 3-4 channels total, not 500+

### 2. Personal Inbox Channels (Solves Fan-out Problem)

- Each user subscribes to `inbox.{userId}`
- When User A goes online, server pushes to each friend's inbox
- **Fan-out managed server-side** with batching and rate limiting
- Avoids client-side subscription explosion

### 3. App Context for Relationships (Solves Query Problem)

- Friend relationships stored as Membership: User B is member of `friends.userA`
- Bidirectional: If A friends B, both `friends.userA` and `friends.userB` have membership entries
- Queryable for friend list retrieval and friend lookup

### 4. Global Count via Aggregation Channel

- `status.global` channel receives periodic broadcasts (~10s interval)
- Server aggregates HereNow across all presence shards
- Clients display approximate count (not exact)

---

## Channel Topology


| Channel Pattern      | Purpose                            | Presence | Subscribers             |
| -------------------- | ---------------------------------- | -------- | ----------------------- |
| `presence.shard-{N}` | Presence detection (100 shards)    | YES      | Users assigned to shard |
| `inbox.{userId}`     | Personal friend status updates     | NO       | Single user             |
| `status.global`      | Global online count broadcasts     | NO       | All users               |
| `friends.{userId}`   | App Context only (not for pub/sub) | NO       | N/A                     |


---

## App Context Model

### UUID Metadata (User Profile + Status)

```json
{
  "uuid": "user_abc123",
  "name": "Jane Doe",
  "custom": {
    "schemaVersion": "1.0.0",
    "online": true,
    "lastSeen": "2026-01-31T10:05:00Z",
    "shardId": 42,
    "friendCount": 523
  }
}
```

### Channel Metadata (Friend List Container)

```json
{
  "channel": "friends.user_abc123",
  "name": "Jane's Friends",
  "custom": {
    "schemaVersion": "1.0.0",
    "ownerId": "user_abc123",
    "friendCount": 523
  }
}
```

### Membership (Friend Relationship)

```json
{
  "channel": "friends.user_abc123",
  "uuid": "user_def456",
  "custom": {
    "schemaVersion": "1.0.0",
    "addedAt": "2026-01-15T08:00:00Z",
    "status": "accepted"
  }
}
```

---

## Data Flow: User Goes Online

```
1. User A connects
   └─► Subscribe to: inbox.userA, presence.shard-42, status.global

2. presence.shard-42 fires "join" event
   └─► After Presence Function triggered

3. Function: Update App Context
   └─► Set UUID userA: { online: true, lastSeen: now }

4. Function: Queue friend notifications
   └─► Get members of friends.userA (500 friends)
   └─► For each friend, queue message to inbox.{friendId}

5. Notification Worker (batched)
   └─► Publish to inbox.userB: { type: "friend.online", friend: "userA" }
   └─► Publish to inbox.userC: { type: "friend.online", friend: "userA" }
   └─► ... (batched in groups of 50-100)

6. Friend clients receive updates via their inbox
```

---

## Critical Scalability Mechanisms

### 1. Notification Batching

When User A (with 1000 friends) goes online:

- DON'T: Fire 1000 publishes synchronously in Function
- DO: Queue job to external worker, batch publishes in groups of 50

### 2. Throttling Status Changes

- Debounce rapid online/offline toggles (client reconnection storms)
- Only notify friends if status was stable for >5 seconds
- Use App Context `lastSeen` to detect flapping

### 3. Initial Friend Status Load

When User A connects and needs current friend status:

- Option A: Batch query App Context UUID metadata for all friends
- Option B: Server returns online friends list via inbox channel on connect
- **Recommended**: Option B (server push) to avoid 500 API calls per user

### 4. Shard Sizing

- 100 shards × ~5K users each = 500K concurrent
- If scaling to 1M+, add shards or use hierarchical sharding
- Presence HereNow per shard stays manageable

---

## Message Contracts

### friend.online (inbox)

```json
{
  "type": "friend.online",
  "schemaVersion": "1.0.0",
  "eventId": "evt_presence_abc123_1706698523",
  "ts": "2026-01-31T10:05:23Z",
  "payload": {
    "userId": "user_abc123",
    "name": "Jane Doe"
  }
}
```

### friend.offline (inbox)

```json
{
  "type": "friend.offline",
  "schemaVersion": "1.0.0",
  "eventId": "evt_presence_abc123_1706698823",
  "ts": "2026-01-31T10:10:23Z",
  "payload": {
    "userId": "user_abc123",
    "lastSeen": "2026-01-31T10:10:20Z"
  }
}
```

### friends.sync (inbox - initial load)

```json
{
  "type": "friends.sync",
  "schemaVersion": "1.0.0",
  "eventId": "evt_sync_user456_1706698500",
  "ts": "2026-01-31T10:05:00Z",
  "payload": {
    "onlineFriends": ["user_abc123", "user_def456", "user_ghi789"],
    "totalFriends": 523,
    "totalOnline": 47
  }
}
```

### status.count (global)

```json
{
  "type": "status.count",
  "schemaVersion": "1.0.0",
  "eventId": "evt_global_count_1706698530",
  "ts": "2026-01-31T10:05:30Z",
  "payload": {
    "onlineCount": 487234,
    "delta": 1523,
    "calculatedAt": "2026-01-31T10:05:28Z"
  }
}
```

---

## External Components Required

The **friend notification fan-out** cannot be handled entirely within PubNub Functions due to:

- Rate limits on publishes per Function execution
- Timeout limits for 500+ friend notifications
- Need for batching and throttling

### Recommended External Service

- **Queue**: AWS SQS, Redis Streams, or similar
- **Worker**: Lambda, Cloud Functions, or dedicated service
- **Pattern**: Function queues job → Worker batches notifications

### Alternative: Pure PubNub Approach (Lower Scale)

For <100K users or <100 friends per user:

- Function can publish directly to inbox channels
- Use `Promise.all` with batches of 20
- Accept higher latency for large friend lists

---

## File to Create

Create `[friends-presence/README.md](friends-presence/README.md)` following the full canonical template with:

- Complete App Context schemas
- All message contracts
- Functions code for presence handling
- PAM token strategy
- Failure modes and edge cases
- Testing checklist
- Common mistakes

---

## Key Tradeoffs


| Decision                      | Benefit                                | Cost                                                   |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Presence sharding             | Limits subscriptions to ~4/user        | Requires shard assignment logic                        |
| Personal inbox channels       | Eliminates N×M subscription problem    | Requires server-side fan-out                           |
| External notification worker  | Handles large friend lists efficiently | Additional infrastructure                              |
| App Context for relationships | Queryable, consistent                  | Not designed for social graph queries at extreme scale |


---

## When to Use External Graph Database

If friend counts regularly exceed **5,000 per user** or you need complex friend-of-friend queries:

- Consider Neo4j, Amazon Neptune, or Dgraph for relationship storage
- Use App Context for caching "recent/active" friend subset
- External DB handles friend list retrieval, PubNub handles real-time updates

