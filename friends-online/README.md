# Friends Online Design Pattern

> **Version**: 2.0.0  
> **Last Updated**: 2026-01-31  
> **Relationship Model**: Bidirectional (mutual friendship)  
> **Update Latency**: Real-time (< 2 seconds)  
> **Architecture**: Channel Groups (optimized for publish efficiency)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Architecture](#3-architecture)
4. [Channel Topology](#4-channel-topology)
5. [App Context Model](#5-app-context-model)
6. [Event / Message Contracts](#6-event--message-contracts)
7. [Functions / Server Logic](#7-functions--server-logic)
8. [Channel Group Management](#8-channel-group-management)
9. [Security (PAM / Tokens)](#9-security-pam--tokens)
10. [Failure Modes & Edge Cases](#10-failure-modes--edge-cases)
11. [Scaling Notes](#11-scaling-notes)
12. [Observability](#12-observability)
13. [Testing](#13-testing)
14. [Implementation Checklist](#14-implementation-checklist)
15. [Common Mistakes](#15-common-mistakes)

---

## 1. Problem Statement

Enable users to:
1. See **total concurrent users online** (approximate count, updated periodically)
2. See **which of their friends are currently online or offline** in real-time

At scale:
- **500K+ concurrent users**
- **500-1000 bidirectional friends per user**
- **Real-time updates** (< 2 seconds latency for friend status changes)

### Why Naive Approaches Fail

| Approach | Implementation | Why It Fails |
|----------|----------------|--------------|
| **Subscribe to each friend's presence** | User subscribes to `presence.friend1`, `presence.friend2`, ... `presence.friend500` | PubNub limits ~100-200 channels per connection; 500K users × 500 friends = 250M subscriptions |
| **Poll friend status via API** | Client queries friend status every few seconds | 500K users × 500 friends = 250M API calls continuously; unacceptable load |
| **Single global presence channel** | All users on one presence channel | Cannot differentiate friends from non-friends; HereNow returns all users |
| **Personal inbox with fan-out** | Server publishes to each friend's inbox | 1 user online = 500 publishes; expensive and slow at scale |

### The Solution: Channel Groups

Instead of publishing to N inboxes when a user goes online, we:
1. Each user publishes their status to **their own status channel** (`status.{userId}`)
2. Friends subscribe to that channel **via a Channel Group** (`cg-friends-{userId}`)
3. **1 publish reaches all friends** who have that channel in their group

**Result**: 500x reduction in publish volume compared to inbox-based fan-out.

### Key Challenges Addressed

- **Fan-out explosion**: Eliminated - 1 publish per status change regardless of friend count
- **Subscription limits**: Channel Groups handle the subscription aggregation
- **Publish costs**: Dramatically reduced (1 vs N publishes)
- **Reconnection storms**: Debouncing + single publish means minimal amplification
- **Status flapping**: Debounce prevents notification spam

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Users can see approximate total online user count |
| FR-2 | Users can see which of their friends are currently online |
| FR-3 | Users receive real-time notifications when friends come online |
| FR-4 | Users receive real-time notifications when friends go offline |
| FR-5 | Users can add/remove friends (bidirectional, requires acceptance) |
| FR-6 | On initial connection, users receive current friend online status |
| FR-7 | Friend relationships are stored persistently |
| FR-8 | Users can query their friend list |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Friend status change notification latency | < 2 seconds p99 |
| NFR-2 | Global count update frequency | Every 10 seconds |
| NFR-3 | Initial friend status load time | < 3 seconds |
| NFR-4 | Maximum friends per user | 2,000 (single group) / 20,000 (multi-group) |
| NFR-5 | Concurrent users supported | 500K - 1M+ |
| NFR-6 | Publishes per status change | 1 (constant, regardless of friend count) |

### 2.3 Scale Tiers

| Tier | Concurrent Users | Friends/User | Recommended Pattern |
|------|------------------|--------------|---------------------|
| Small | < 10K | < 100 | Direct presence subscription (simplified) |
| Medium | 10K - 100K | 100 - 500 | Single channel group per user |
| Large | 100K - 500K | 500 - 2000 | Single channel group per user |
| Very Large | 500K - 1M+ | 2000 - 20000 | Multiple channel groups per user |

---

## 3. Architecture

### 3.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER CLIENTS                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │ User A  │  │ User B  │  │ User C  │  │ User D  │  │ User E  │  ...500K      │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘               │
│       │            │            │            │            │                      │
│       │ Subscribe to:          │            │            │                      │
│       │ • Channel Group:       │            │            │                      │
│       │   cg-friends-userA     │            │            │                      │
│       │   (contains status.B,  │            │            │                      │
│       │    status.C, etc.)     │            │            │                      │
│       │ • presence.shard-42    │            │            │                      │
│       │ • status.global        │            │            │                      │
└───────┼────────────┼────────────┼────────────┼────────────┼──────────────────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            PUBNUB CHANNELS                                       │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    PRESENCE SHARD CHANNELS (100 shards)                   │   │
│  │  ┌─────────────────┐  ┌─────────────────┐       ┌─────────────────┐      │   │
│  │  │ presence.shard-0│  │ presence.shard-1│  ...  │presence.shard-99│      │   │
│  │  │ Presence: ON    │  │ Presence: ON    │       │ Presence: ON    │      │   │
│  │  │ ~5K users each  │  │ ~5K users each  │       │ ~5K users each  │      │   │
│  │  └────────┬────────┘  └────────┬────────┘       └────────┬────────┘      │   │
│  │           │                    │                         │               │   │
│  │           └────────────────────┼─────────────────────────┘               │   │
│  │                                ▼                                         │   │
│  │              Presence Events (join/leave/timeout)                        │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                   │                                              │
│                                   ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    PUBNUB FUNCTION (After Presence)                       │   │
│  │                                                                           │   │
│  │  1. Detect join/leave/timeout events                                      │   │
│  │  2. Debounce rapid status changes (flap protection)                       │   │
│  │  3. Update App Context UUID metadata (online status)                      │   │
│  │  4. Publish ONCE to user's status channel                                 │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                   │                                              │
│           ┌───────────────────────┴───────────────────────┐                      │
│           ▼                                               ▼                      │
│  ┌─────────────────┐                    ┌──────────────────────────────────┐    │
│  │  status.global  │                    │  STATUS CHANNELS                 │    │
│  │                 │                    │                                  │    │
│  │  Periodic count │                    │  status.userA  ←── User A       │    │
│  │  broadcasts     │                    │  status.userB  ←── User B       │    │
│  │  (~10s interval)│                    │  status.userC  ←── User C       │    │
│  └─────────────────┘                    │  ...                             │    │
│                                         └──────────────────────────────────┘    │
│                                                        │                         │
│                                                        │ Friends receive via     │
│                                                        │ Channel Groups          │
│                                                        ▼                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         CHANNEL GROUPS                                    │   │
│  │                                                                           │   │
│  │  cg-friends-userA contains: [status.userB, status.userC, status.userD]   │   │
│  │  cg-friends-userB contains: [status.userA, status.userE, status.userF]   │   │
│  │  cg-friends-userC contains: [status.userA, status.userB, status.userG]   │   │
│  │  ...                                                                      │   │
│  │                                                                           │   │
│  │  When User B publishes to status.userB:                                  │   │
│  │    → User A receives (via cg-friends-userA)                              │   │
│  │    → User C receives (via cg-friends-userC)                              │   │
│  │    → All friends receive with 1 PUBLISH                                  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              APP CONTEXT                                         │
│                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────────┐   │
│  │  UUID Metadata          │  │  Channel Metadata                           │   │
│  │  (User Profile+Status)  │  │  (Friend List Container)                    │   │
│  │                         │  │                                             │   │
│  │  • uuid: user_abc123    │  │  • channel: friends.user_abc123             │   │
│  │  • online: true/false   │  │  • friendCount: 523                         │   │
│  │  • lastSeen: timestamp  │  │  • ownerId: user_abc123                     │   │
│  │  • shardId: 42          │  │                                             │   │
│  └─────────────────────────┘  └─────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  Membership (Friend Relationships)                                        │   │
│  │                                                                           │   │
│  │  friends.user_abc123 → Members: [user_def456, user_ghi789, ...]          │   │
│  │  friends.user_def456 → Members: [user_abc123, user_jkl012, ...]          │   │
│  │                                                                           │   │
│  │  (Bidirectional: A friends B means A is member of friends.B              │   │
│  │   AND B is member of friends.A)                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 How Channel Groups Enable Efficient Fan-out

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     CHANNEL GROUP FAN-OUT MECHANISM                              │
│                                                                                  │
│   User B goes online                                                            │
│         │                                                                        │
│         ▼                                                                        │
│   ┌─────────────┐                                                               │
│   │ Presence    │ Detects join event on presence.shard-17                       │
│   │ Shard       │                                                               │
│   └──────┬──────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌─────────────┐                                                               │
│   │ PubNub      │ 1. Update App Context (userB.online = true)                   │
│   │ Function    │ 2. Publish ONCE to status.userB                               │
│   └──────┬──────┘                                                               │
│          │                                                                       │
│          │  SINGLE PUBLISH                                                       │
│          ▼                                                                       │
│   ┌──────────────────┐                                                          │
│   │   status.userB   │                                                          │
│   └────────┬─────────┘                                                          │
│            │                                                                     │
│            │  PubNub routes to all subscribers                                  │
│            │  (Channel Groups handle the fan-out internally)                    │
│            │                                                                     │
│    ┌───────┴───────┬───────────────┬───────────────┬───────────────┐           │
│    │               │               │               │               │           │
│    ▼               ▼               ▼               ▼               ▼           │
│  User A          User C          User D          User E         ...500        │
│                                                                   friends      │
│  (subscribed via (subscribed via (subscribed via (subscribed via              │
│  cg-friends-     cg-friends-     cg-friends-     cg-friends-                  │
│  userA which     userC which     userD which     userE which                  │
│  contains        contains        contains        contains                      │
│  status.userB)   status.userB)   status.userB)   status.userB)                │
│                                                                                 │
│   RESULT: 1 publish reaches 500 friends                                        │
│   (vs 500 publishes with inbox approach)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Components

| Component | Responsibility | PubNub Feature |
|-----------|----------------|----------------|
| Presence Shard Channels | Detect user online/offline via PubNub Presence | Presence |
| Status Channels | Broadcast user's status to friends | Pub/Sub |
| Channel Groups | Aggregate friends' status channels for subscription | Channel Groups |
| Global Status Channel | Broadcast approximate online count | Pub/Sub |
| After Presence Function | Process presence events, publish status | Functions |
| Friend Management Function | Manage channel group membership | Functions |
| UUID Metadata | Store user profile and online status | App Context |
| Channel Metadata | Store friend list container metadata | App Context |
| Membership | Store friend relationships | App Context |

### 3.4 Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| **1 publish = all friends notified** | Status channels + Channel Groups eliminate N-way fan-out |
| **Limit subscriptions per user** | Each user subscribes to 1 channel group + 2 channels |
| **Server-managed groups** | Functions maintain channel group membership on friend changes |
| **Presence sharding** | 100 shards distribute presence load; ~5K users per shard |
| **Debounce status changes** | Prevent notification spam from flapping connections |

---

## 4. Channel Topology

### 4.1 Channel and Channel Group Naming Convention

**Channels** follow the 2-level `[channelType].[channelId]` pattern:

```
presence.shard-{N}     # Presence detection (N = 0-99)
status.{userId}        # User's status broadcast channel
status.global          # Global online count broadcasts
friends.{userId}       # App Context only (not for pub/sub)
```

**Channel Groups** use dashes for naming:

```
cg-friends-{userId}    # Contains all friends' status channels
```

### 4.2 Channel Purpose Matrix

| Channel / Group | Type | Publishers | Subscribers | Message Types | Presence |
|-----------------|------|------------|-------------|---------------|----------|
| `presence.shard-{N}` | Channel | System (presence) | Users in shard | N/A (presence only) | YES |
| `status.{userId}` | Channel | User (via Function) | Friends (via groups) | friend.online, friend.offline | NO |
| `status.global` | Channel | Aggregation Service | All users | status.count | NO |
| `cg-friends-{userId}` | Channel Group | N/A | Single user | N/A (aggregates status channels) | NO |
| `friends.{userId}` | App Context | N/A | N/A | N/A | NO |

### 4.3 Presence Shard Assignment

Users are assigned to a presence shard using consistent hashing:

```javascript
function getPresenceShardChannel(userId, shardCount = 100) {
  const hash = hashCode(userId);
  const shardId = Math.abs(hash) % shardCount;
  return `presence.shard-${shardId}`;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}
```

### 4.4 Channel Group Structure

Each user has a channel group containing their friends' status channels:

```
User A's Channel Group: cg-friends-userA
├── status.userB    (Friend B's status channel)
├── status.userC    (Friend C's status channel)
├── status.userD    (Friend D's status channel)
└── ... up to 2000 channels per group
```

When User A subscribes to `cg-friends-userA`, they automatically receive messages from all channels in the group.

### 4.5 Channel Group Limits and Multi-Group Strategy

| Limit | Value | Implication |
|-------|-------|-------------|
| Channels per group | 2,000 | Users with > 2,000 friends need multiple groups |
| Groups per subscribe | 10 | Max 20,000 friends (10 × 2,000) |

**For users with > 2,000 friends**:

```javascript
// Shard channel groups by friend index
function getChannelGroupNames(userId, friendCount) {
  const groupCount = Math.ceil(friendCount / 2000);
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push(`cg-friends-${userId}-${i}`);
  }
  return groups;
}

// Example: User with 5,000 friends subscribes to:
// cg-friends-userA-0 (channels 1-2000)
// cg-friends-userA-1 (channels 2001-4000)
// cg-friends-userA-2 (channels 4001-5000)
```

### 4.6 Function Binding Strategy

| Function Binding Pattern | Matches | Purpose |
|-------------------------|---------|---------|
| `presence.shard-*` | All presence shards | Process join/leave/timeout events, publish to status channels |

---

## 5. App Context Model

### 5.1 UUID Metadata (User Profile + Online Status)

```json
{
  "uuid": "user_abc123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "profileUrl": "https://example.com/profiles/jane.jpg",
  "custom": {
    "schemaVersion": "1.0.0",
    "type": "user",
    "online": true,
    "lastSeen": "2026-01-31T10:05:00Z",
    "lastOnline": "2026-01-31T10:05:00Z",
    "lastOffline": "2026-01-31T09:30:00Z",
    "shardId": 42,
    "friendCount": 523,
    "statusMessage": "Available",
    "createdAt": "2025-06-15T08:00:00Z"
  }
}
```

**Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| `online` | boolean | Current online status |
| `lastSeen` | ISO timestamp | Last activity timestamp (updated on actions) |
| `lastOnline` | ISO timestamp | When user most recently came online |
| `lastOffline` | ISO timestamp | When user most recently went offline |
| `shardId` | integer | Assigned presence shard (0-99) |
| `friendCount` | integer | Cached count of friends |
| `statusMessage` | string | Optional user-set status |

### 5.2 Channel Metadata (Friend List Container)

```json
{
  "channel": "friends.user_abc123",
  "name": "Jane's Friends",
  "description": "Friend list for user_abc123",
  "custom": {
    "schemaVersion": "1.0.0",
    "type": "friend_list",
    "ownerId": "user_abc123",
    "friendCount": 523,
    "maxFriends": 5000,
    "createdAt": "2025-06-15T08:00:00Z",
    "updatedAt": "2026-01-31T10:00:00Z"
  }
}
```

### 5.3 Membership (Friend Relationship)

```json
{
  "channel": "friends.user_abc123",
  "uuid": "user_def456",
  "custom": {
    "schemaVersion": "1.0.0",
    "type": "friend",
    "status": "accepted",
    "addedAt": "2026-01-15T08:00:00Z",
    "addedBy": "user_def456",
    "nickname": "Johnny",
    "favorite": false,
    "muted": false
  }
}
```

**Bidirectional Friendship**:

When User A and User B become friends:
1. Create membership: `friends.user_abc123` ← `user_def456`
2. Create membership: `friends.user_def456` ← `user_abc123`
3. Add `status.user_def456` to channel group `cg-friends-user_abc123`
4. Add `status.user_abc123` to channel group `cg-friends-user_def456`
5. Increment `friendCount` on both UUID metadata records

### 5.4 App Context vs Channel Groups vs External Storage

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| User profile | App Context (UUID) | Queryable, canonical identity |
| Online status | App Context (UUID) | Queryable for initial load, late-joiner sync |
| Friend relationships | App Context (Membership) | Queryable, supports getMembers/getMemberships |
| Friend status subscriptions | Channel Groups | Efficient real-time delivery |
| Friend status events | Pub/Sub (ephemeral) | Real-time delivery via status channels |
| Friend activity history | External DB (optional) | Long-term analytics, audit |

### 5.5 App Context Query Patterns

**Get all friends of a user**:
```javascript
const response = await pubnub.objects.getChannelMembers({
  channel: `friends.${userId}`,
  include: {
    UUIDFields: true,
    customUUIDFields: true
  },
  limit: 100,
  page: { next: cursor }
});
```

**Get online status of all friends** (for initial sync):
```javascript
const response = await pubnub.objects.getChannelMembers({
  channel: `friends.${userId}`,
  include: {
    UUIDFields: true,
    customUUIDFields: true // Includes online status
  }
});
const onlineFriends = response.data.filter(m => m.uuid.custom?.online);
```

---

## 6. Event / Message Contracts

### 6.1 Status Channel Messages (User → Friends via Channel Groups)

#### friend.online

Published to `status.{userId}` when user comes online.

```json
{
  "type": "friend.online",
  "schemaVersion": "1.0.0",
  "eventId": "evt_online_user_abc123_1706698523000",
  "ts": "2026-01-31T10:05:23.000Z",
  "payload": {
    "userId": "user_abc123",
    "name": "Jane Doe",
    "profileUrl": "https://example.com/profiles/jane.jpg",
    "statusMessage": "Available"
  }
}
```

#### friend.offline

Published to `status.{userId}` when user goes offline.

```json
{
  "type": "friend.offline",
  "schemaVersion": "1.0.0",
  "eventId": "evt_offline_user_abc123_1706698823000",
  "ts": "2026-01-31T10:10:23.000Z",
  "payload": {
    "userId": "user_abc123",
    "name": "Jane Doe",
    "lastSeen": "2026-01-31T10:10:20.000Z"
  }
}
```

### 6.2 Friends Management Messages (Server → User)

#### friend.added

Published to `status.{newFriendId}` and received by the other user. Also used for direct notification.

```json
{
  "type": "friend.added",
  "schemaVersion": "1.0.0",
  "eventId": "evt_added_user_xyz789_1706698600000",
  "ts": "2026-01-31T10:06:40.000Z",
  "payload": {
    "userId": "user_xyz789",
    "name": "Alice Wonder",
    "profileUrl": "https://example.com/profiles/alice.jpg",
    "online": true,
    "addedAt": "2026-01-31T10:06:40.000Z"
  }
}
```

#### friend.removed

Published when a friend relationship is removed.

```json
{
  "type": "friend.removed",
  "schemaVersion": "1.0.0",
  "eventId": "evt_removed_user_xyz789_1706698700000",
  "ts": "2026-01-31T10:08:20.000Z",
  "payload": {
    "userId": "user_xyz789",
    "removedAt": "2026-01-31T10:08:20.000Z"
  }
}
```

### 6.3 Global Status Channel Messages (Server → All)

#### status.count

Periodic broadcast of approximate online user count.

```json
{
  "type": "status.count",
  "schemaVersion": "1.0.0",
  "eventId": "evt_count_1706698530000",
  "ts": "2026-01-31T10:05:30.000Z",
  "payload": {
    "onlineCount": 487234,
    "deltaFromLast": 1523,
    "peakToday": 512000,
    "calculatedAt": "2026-01-31T10:05:28.000Z",
    "shardsCounted": 100
  }
}
```

### 6.4 Payload Size Constraints

| Message Type | Max Payload Size | Typical Size |
|--------------|------------------|--------------|
| friend.online | < 1 KB | 300-500 bytes |
| friend.offline | < 1 KB | 200-400 bytes |
| friend.added | < 1 KB | 400-600 bytes |
| status.count | < 1 KB | 200-300 bytes |

**Recommendations**:
- Keep profile URLs short or use CDN with short paths
- Truncate status messages to 100 characters

---

## 7. Functions / Server Logic

### 7.1 After Presence Handler (Status Publisher)

```javascript
// Function: presence-status-handler
// Trigger: After Presence on presence.shard-*
// Purpose: Process presence events, update status, publish to status channel

export default async (request) => {
  const pubnub = require('pubnub');
  const kvstore = require('kvstore');
  
  const { action, uuid, channel, timestamp, occupancy } = request.message;
  
  // Ignore state-change events (only handle join/leave/timeout)
  if (!['join', 'leave', 'timeout'].includes(action)) {
    return request.ok();
  }
  
  const userId = uuid;
  const isOnline = action === 'join';
  const eventTime = new Date(timestamp * 1000).toISOString();
  
  // 1. Debounce check - prevent flapping notifications
  const debounceKey = `debounce:${userId}`;
  const lastChange = await kvstore.get(debounceKey);
  
  if (lastChange) {
    const timeSinceLastChange = Date.now() - lastChange.timestamp;
    if (timeSinceLastChange < 5000) { // 5 second debounce
      // Too soon after last change - skip publish but update status
      console.log(`Debounced status change for ${userId}`);
      await updateUserStatus(userId, isOnline, eventTime);
      return request.ok();
    }
  }
  
  // 2. Record this status change for debouncing
  await kvstore.set(debounceKey, {
    timestamp: Date.now(),
    status: isOnline ? 'online' : 'offline'
  }, 60); // 60 second TTL
  
  // 3. Update App Context UUID metadata
  await updateUserStatus(userId, isOnline, eventTime);
  
  // 4. Get user details for notification
  const userDetails = await getUserDetails(userId);
  if (!userDetails) {
    console.error(`User not found: ${userId}`);
    return request.ok();
  }
  
  // 5. Build status message
  const statusMessage = isOnline ? {
    type: 'friend.online',
    schemaVersion: '1.0.0',
    eventId: `evt_online_${userId}_${Date.now()}`,
    ts: eventTime,
    payload: {
      userId: userId,
      name: userDetails.name,
      profileUrl: userDetails.profileUrl,
      statusMessage: userDetails.custom?.statusMessage
    }
  } : {
    type: 'friend.offline',
    schemaVersion: '1.0.0',
    eventId: `evt_offline_${userId}_${Date.now()}`,
    ts: eventTime,
    payload: {
      userId: userId,
      name: userDetails.name,
      lastSeen: eventTime
    }
  };
  
  // 6. Publish ONCE to user's status channel
  // All friends receive this via their channel groups
  await pubnub.publish({
    channel: `status.${userId}`,
    message: statusMessage
  });
  
  console.log(`Published ${isOnline ? 'online' : 'offline'} status for ${userId}`);
  
  return request.ok();
};

// Helper: Update user online status in App Context
async function updateUserStatus(userId, isOnline, eventTime) {
  const pubnub = require('pubnub');
  
  try {
    // Get current metadata
    const current = await pubnub.objects.getUUIDMetadata({
      uuid: userId,
      include: { customFields: true }
    });
    
    const custom = current.data.custom || {};
    
    // Update status fields
    custom.online = isOnline;
    custom.lastSeen = eventTime;
    if (isOnline) {
      custom.lastOnline = eventTime;
    } else {
      custom.lastOffline = eventTime;
    }
    
    // Save updated metadata
    await pubnub.objects.setUUIDMetadata({
      uuid: userId,
      data: {
        custom: custom
      }
    });
  } catch (error) {
    console.error(`Failed to update status for ${userId}:`, error);
  }
}

// Helper: Get user details from App Context
async function getUserDetails(userId) {
  const pubnub = require('pubnub');
  
  try {
    const response = await pubnub.objects.getUUIDMetadata({
      uuid: userId,
      include: { customFields: true }
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to get user details for ${userId}:`, error);
    return null;
  }
}
```

### 7.2 Global Count Aggregator (Scheduled Function)

```javascript
// Function: global-count-aggregator
// Trigger: Scheduled (every 10 seconds)
// Purpose: Aggregate online count across all shards

export default async (request) => {
  const pubnub = require('pubnub');
  const kvstore = require('kvstore');
  
  const SHARD_COUNT = 100;
  let totalOnline = 0;
  let shardsQueried = 0;
  
  // Query occupancy for each shard
  // Note: In production, batch or parallelize these calls
  for (let i = 0; i < SHARD_COUNT; i++) {
    try {
      const response = await pubnub.hereNow({
        channels: [`presence.shard-${i}`],
        includeState: false,
        includeUUIDs: false
      });
      
      totalOnline += response.totalOccupancy || 0;
      shardsQueried++;
    } catch (error) {
      console.error(`Failed to query shard ${i}:`, error);
    }
  }
  
  // Get previous count for delta calculation
  const previousCount = await kvstore.get('global:online_count') || { count: 0 };
  const delta = totalOnline - previousCount.count;
  
  // Get or update peak
  const peakData = await kvstore.get('global:peak_today') || { peak: 0, date: new Date().toDateString() };
  const today = new Date().toDateString();
  let peak = peakData.date === today ? peakData.peak : 0;
  if (totalOnline > peak) {
    peak = totalOnline;
    await kvstore.set('global:peak_today', { peak, date: today }, 86400);
  }
  
  // Store current count
  await kvstore.set('global:online_count', { count: totalOnline }, 60);
  
  // Broadcast to global channel
  const message = {
    type: 'status.count',
    schemaVersion: '1.0.0',
    eventId: `evt_count_${Date.now()}`,
    ts: new Date().toISOString(),
    payload: {
      onlineCount: totalOnline,
      deltaFromLast: delta,
      peakToday: peak,
      calculatedAt: new Date().toISOString(),
      shardsCounted: shardsQueried
    }
  };
  
  await pubnub.publish({
    channel: 'status.global',
    message: message
  });
  
  console.log(`Published global count: ${totalOnline} (delta: ${delta})`);
  
  return request.ok();
};
```

### 7.3 Functions Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Single publish** | Status change = 1 publish to status.{userId}; Channel Groups handle fan-out |
| **Debouncing** | 5-second window prevents publish spam from flapping connections |
| **Idempotency** | Event IDs include timestamp; clients can dedupe if needed |
| **Fast path** | Status update happens even if publish is debounced |
| **No external dependencies** | No external worker needed; PubNub handles everything |

---

## 8. Channel Group Management

### 8.1 Overview

Channel Groups must be updated when friend relationships change. This is handled by PubNub Functions to ensure consistency.

### 8.2 Friend Request Acceptance Handler

```javascript
// Function: friend-acceptance-handler
// Trigger: After Publish on friend-requests.*
// Purpose: Update channel groups when friendship is established

export default async (request) => {
  const pubnub = require('pubnub');
  const message = request.message;
  
  // Only handle acceptance messages
  if (message.type !== 'friend.request.accepted') {
    return request.ok();
  }
  
  const { userA, userB } = message.payload;
  
  try {
    // 1. Add userB's status channel to userA's channel group
    await pubnub.channelGroups.addChannels({
      channelGroup: `cg-friends-${userA}`,
      channels: [`status.${userB}`]
    });
    
    // 2. Add userA's status channel to userB's channel group
    await pubnub.channelGroups.addChannels({
      channelGroup: `cg-friends-${userB}`,
      channels: [`status.${userA}`]
    });
    
    // 3. Create App Context memberships (bidirectional)
    await pubnub.objects.setChannelMembers({
      channel: `friends.${userA}`,
      uuids: [{ id: userB, custom: { addedAt: new Date().toISOString(), status: 'accepted' } }]
    });
    
    await pubnub.objects.setChannelMembers({
      channel: `friends.${userB}`,
      uuids: [{ id: userA, custom: { addedAt: new Date().toISOString(), status: 'accepted' } }]
    });
    
    // 4. Update friend counts
    await incrementFriendCount(userA);
    await incrementFriendCount(userB);
    
    // 5. Get current online status of each user
    const userADetails = await pubnub.objects.getUUIDMetadata({ uuid: userA, include: { customFields: true } });
    const userBDetails = await pubnub.objects.getUUIDMetadata({ uuid: userB, include: { customFields: true } });
    
    // 6. Notify userA about userB (send to userA's status channel, but they need to receive it)
    // Since userA just added userB, they won't receive status.userB yet until they reconnect
    // So we publish a friend.added directly to their status channel as a notification
    await pubnub.publish({
      channel: `status.${userA}`,
      message: {
        type: 'friend.added',
        schemaVersion: '1.0.0',
        eventId: `evt_added_${userB}_${Date.now()}`,
        ts: new Date().toISOString(),
        payload: {
          userId: userB,
          name: userBDetails.data.name,
          profileUrl: userBDetails.data.profileUrl,
          online: userBDetails.data.custom?.online || false,
          addedAt: new Date().toISOString()
        }
      }
    });
    
    // 7. Notify userB about userA
    await pubnub.publish({
      channel: `status.${userB}`,
      message: {
        type: 'friend.added',
        schemaVersion: '1.0.0',
        eventId: `evt_added_${userA}_${Date.now()}`,
        ts: new Date().toISOString(),
        payload: {
          userId: userA,
          name: userADetails.data.name,
          profileUrl: userADetails.data.profileUrl,
          online: userADetails.data.custom?.online || false,
          addedAt: new Date().toISOString()
        }
      }
    });
    
    console.log(`Friendship established: ${userA} <-> ${userB}`);
    
  } catch (error) {
    console.error(`Failed to establish friendship: ${error}`);
  }
  
  return request.ok();
};

async function incrementFriendCount(userId) {
  const pubnub = require('pubnub');
  
  const current = await pubnub.objects.getUUIDMetadata({ uuid: userId, include: { customFields: true } });
  const custom = current.data.custom || {};
  custom.friendCount = (custom.friendCount || 0) + 1;
  
  await pubnub.objects.setUUIDMetadata({
    uuid: userId,
    data: { custom }
  });
}
```

### 8.3 Friend Removal Handler

```javascript
// Function: friend-removal-handler
// Trigger: After Publish on friend-management.*
// Purpose: Update channel groups when friendship is removed

export default async (request) => {
  const pubnub = require('pubnub');
  const message = request.message;
  
  // Only handle removal messages
  if (message.type !== 'friend.remove') {
    return request.ok();
  }
  
  const { userA, userB } = message.payload;
  
  try {
    // 1. Remove userB's status channel from userA's channel group
    await pubnub.channelGroups.removeChannels({
      channelGroup: `cg-friends-${userA}`,
      channels: [`status.${userB}`]
    });
    
    // 2. Remove userA's status channel from userB's channel group
    await pubnub.channelGroups.removeChannels({
      channelGroup: `cg-friends-${userB}`,
      channels: [`status.${userA}`]
    });
    
    // 3. Remove App Context memberships (bidirectional)
    await pubnub.objects.removeChannelMembers({
      channel: `friends.${userA}`,
      uuids: [userB]
    });
    
    await pubnub.objects.removeChannelMembers({
      channel: `friends.${userB}`,
      uuids: [userA]
    });
    
    // 4. Update friend counts
    await decrementFriendCount(userA);
    await decrementFriendCount(userB);
    
    // 5. Notify both users
    const removalMessage = {
      type: 'friend.removed',
      schemaVersion: '1.0.0',
      ts: new Date().toISOString(),
      payload: {
        removedAt: new Date().toISOString()
      }
    };
    
    await pubnub.publish({
      channel: `status.${userA}`,
      message: { ...removalMessage, eventId: `evt_removed_${userB}_${Date.now()}`, payload: { ...removalMessage.payload, userId: userB } }
    });
    
    await pubnub.publish({
      channel: `status.${userB}`,
      message: { ...removalMessage, eventId: `evt_removed_${userA}_${Date.now()}`, payload: { ...removalMessage.payload, userId: userA } }
    });
    
    console.log(`Friendship removed: ${userA} <-> ${userB}`);
    
  } catch (error) {
    console.error(`Failed to remove friendship: ${error}`);
  }
  
  return request.ok();
};

async function decrementFriendCount(userId) {
  const pubnub = require('pubnub');
  
  const current = await pubnub.objects.getUUIDMetadata({ uuid: userId, include: { customFields: true } });
  const custom = current.data.custom || {};
  custom.friendCount = Math.max(0, (custom.friendCount || 0) - 1);
  
  await pubnub.objects.setUUIDMetadata({
    uuid: userId,
    data: { custom }
  });
}
```

### 8.4 Channel Group Listing (For Debugging)

```javascript
// List all channels in a user's friend group
async function listFriendChannels(userId) {
  const response = await pubnub.channelGroups.listChannels({
    channelGroup: `cg-friends-${userId}`
  });
  
  console.log(`Channels in cg-friends-${userId}:`, response.channels);
  return response.channels;
}
```

### 8.5 Channel Group Management Principles

| Principle | Implementation |
|-----------|----------------|
| **Atomic updates** | Add/remove both directions in same Function execution |
| **Consistency** | App Context and Channel Groups updated together |
| **Idempotent** | Adding existing channel or removing non-existent channel is safe |
| **Server-controlled** | Only Functions can modify channel groups (not clients) |

---

## 9. Security (PAM / Tokens)

### 9.1 Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| **User** | Regular authenticated user | Subscribe to own channel group, read presence shard, read global status |
| **Admin** | System administrator | Full access for debugging and management |

### 9.2 Token Grant Strategy

#### User Token

```json
{
  "ttl": 3600,
  "authorized_uuid": "user_abc123",
  "resources": {
    "channels": {
      "status.user_abc123": { "read": true, "write": false },
      "presence.shard-42": { "read": true, "write": false },
      "status.global": { "read": true, "write": false }
    },
    "groups": {
      "cg-friends-user_abc123": { "read": true, "manage": false }
    }
  },
  "meta": {
    "role": "user",
    "shardId": 42
  }
}
```

**Key points**:
- Users can subscribe to their own channel group
- Users cannot manage (add/remove channels from) channel groups
- Users cannot publish to status channels (Functions do this)
- Presence shard is read-only (presence state managed by PubNub)

### 9.3 Token Lifecycle

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Client   │     │   Auth Server   │     │     PubNub      │
│                 │     │   (Your API)    │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. Login/Auth        │                       │
         │──────────────────────▶│                       │
         │                       │                       │
         │                       │  2. Determine shard   │
         │                       │     shardId = hash(   │
         │                       │       userId) % 100   │
         │                       │                       │
         │                       │  3. Grant token with  │
         │                       │     channel group     │
         │                       │──────────────────────▶│
         │                       │                       │
         │                       │  4. Signed token      │
         │                       │◀──────────────────────│
         │                       │                       │
         │  5. Token + shardId   │                       │
         │◀──────────────────────│                       │
         │                       │                       │
         │  6. Subscribe to:                             │
         │     channelGroups:                            │
         │       [cg-friends-{userId}]                   │
         │     channels:                                 │
         │       [presence.shard-{N}, status.global]     │
         │──────────────────────────────────────────────▶│
```

### 9.4 Security Best Practices

| Practice | Implementation |
|----------|----------------|
| **Least privilege** | Users cannot publish to status channels; only Functions can |
| **No group management** | Users cannot add/remove channels from groups; only server can |
| **Shard isolation** | Users can only subscribe to their assigned shard |
| **Short TTLs for users** | 1-hour tokens; refresh before expiry |
| **Server-side shard assignment** | Shard ID computed server-side, not client-controlled |

### 9.5 Abuse Prevention

| Threat | Mitigation |
|--------|------------|
| **Status spam** | Only Functions can publish to status channels |
| **Presence spoofing** | Presence is system-managed; users cannot fake online status |
| **Channel group manipulation** | Users cannot manage channel groups; server-only |
| **Friend enumeration** | Channel group contents not exposed to users |
| **Token theft** | Short TTLs; bind to device fingerprint if needed |

---

## 10. Failure Modes & Edge Cases

### 10.1 Failure Mode Analysis

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **Channel Group add fails** | New friend won't see status updates | Function error log | Retry; reconciliation job |
| **App Context unavailable** | Status updates fail | Function returns error | Retry; eventual consistency on recovery |
| **Presence shard overloaded** | Delayed presence events | High latency on HereNow | Add more shards; rebalance users |
| **Client reconnection storm** | Massive presence event spike | High Function invocation rate | Debouncing filters most events |
| **User with 2000+ friends** | Multiple channel groups needed | Friend count check | Auto-create additional groups |

### 10.2 Reconnection Storm Handling

**Problem**: Network issues cause thousands of users to reconnect simultaneously.

**Impact without mitigation**:
- Thousands of join events in seconds
- Each join triggers 1 publish (much better than N publishes!)
- Still need to manage Function execution rate

**Mitigation strategy**:

```javascript
// In After Presence Function
const DEBOUNCE_WINDOW_MS = 5000;
const STORM_THRESHOLD = 100; // events per second per shard

// Check if we're in a reconnection storm
const stormKey = `storm:${channel}`;
const stormData = await kvstore.get(stormKey) || { count: 0, windowStart: Date.now() };

const now = Date.now();
if (now - stormData.windowStart < 1000) {
  stormData.count++;
} else {
  stormData.count = 1;
  stormData.windowStart = now;
}
await kvstore.set(stormKey, stormData, 60);

if (stormData.count > STORM_THRESHOLD) {
  // In storm mode - skip publish, just update status
  console.warn(`Storm detected on ${channel}, skipping publish`);
  await updateUserStatus(userId, isOnline, eventTime);
  return request.ok();
}
```

### 10.3 Status Flapping

**Problem**: User's connection is unstable, causing rapid online/offline toggling.

**Impact without mitigation**:
- Friends receive many notifications in a minute
- Poor user experience

**Mitigation**: 5-second debounce window (see Function code in section 7.1).

### 10.4 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **User with 0 friends** | Skip publish; update status only |
| **Channel group empty** | Safe; no error on subscribe |
| **Duplicate add to channel group** | Safe; PubNub handles idempotently |
| **Remove non-existent channel from group** | Safe; PubNub handles gracefully |
| **User has 2001 friends** | Create `cg-friends-{userId}-1` for overflow |
| **Friend added while offline** | On reconnect, user's group already includes new friend |

### 10.5 Consistency Model

This design uses **eventual consistency**:

| Component | Consistency | Rationale |
|-----------|-------------|-----------|
| App Context status | Strongly consistent | Single source of truth for online status |
| Status channel delivery | Eventually consistent | PubNub best-effort delivery |
| Channel Groups | Eventually consistent | Add/remove propagates quickly but not instant |
| Global count | Eventually consistent | Approximate count is sufficient |
| Friend list | Strongly consistent | Relationship changes are infrequent |

---

## 11. Scaling Notes

### 11.1 Cost Comparison: Channel Groups vs Inbox Fan-out

| Scenario | Inbox Approach (N publishes) | Channel Group Approach (1 publish) |
|----------|------------------------------|-----------------------------------|
| User with 500 friends goes online | 500 publishes | 1 publish |
| 1000 users go online (500 friends each) | 500,000 publishes | 1,000 publishes |
| 100K users online, 10% status change/hour | 5B publishes/hour | 10M publishes/hour |

**Result**: **500x reduction in publish volume**

### 11.2 Scale Tier Recommendations

#### Small Scale (< 50K concurrent users)

```
Configuration:
- 10 presence shards
- Single channel group per user
- No external services needed

Optimizations:
- None required
- Focus on correctness
```

#### Medium Scale (50K - 200K concurrent users)

```
Configuration:
- 50 presence shards
- Single channel group per user
- Monitor Function execution rates

Optimizations:
- Implement debouncing
- Monitor channel group sizes
```

#### Large Scale (200K - 500K concurrent users)

```
Configuration:
- 100 presence shards
- Single channel group per user (up to 2000 friends)
- Full debouncing and storm protection

Optimizations:
- Monitoring and alerting on all components
- Consider multi-group for users with 2000+ friends
```

#### Very Large Scale (500K - 1M+ concurrent users)

```
Configuration:
- 200-500 presence shards
- Multi-group support for high friend counts
- External graph database for friend queries (optional)

Optimizations:
- Hierarchical sharding
- Regional deployment for latency
```

### 11.3 Presence Shard Sizing

**Target**: ~5,000 users per shard

| Concurrent Users | Shard Count | Users per Shard |
|------------------|-------------|-----------------|
| 50K | 10 | 5,000 |
| 100K | 20 | 5,000 |
| 250K | 50 | 5,000 |
| 500K | 100 | 5,000 |
| 1M | 200 | 5,000 |

### 11.4 Channel Group Limits

| Limit | Value | Strategy |
|-------|-------|----------|
| Channels per group | 2,000 | Create additional groups for overflow |
| Groups per subscribe | 10 | Supports up to 20,000 friends |
| Add/remove rate | ~100/sec | Batch friend imports if needed |

### 11.5 Latency Analysis

**Scenario**: User with 1,000 friends goes online

| Step | Time (estimated) |
|------|------------------|
| Presence event fires | 0ms |
| Function execution | 50-200ms |
| App Context update | 50-100ms |
| Single publish | 10-50ms |
| PubNub routes to subscribers | 50-100ms |
| **Total latency** | **~200-500ms** |

**Comparison with inbox approach**: Inbox would require 3-5 seconds for 1000 friends. Channel Groups deliver in < 500ms.

---

## 12. Observability

### 12.1 Logging Strategy

| Log Level | Events | Example |
|-----------|--------|---------|
| **INFO** | Status changes, channel group updates | `User online: userId=abc123, shardId=42` |
| **WARN** | Debounced events, group size warnings | `Status debounced: userId=abc123, reason=flapping` |
| **ERROR** | Publish failures, channel group errors | `Failed to add channel to group: cg-friends-abc123` |
| **DEBUG** | Full message payloads (dev only) | `Processing presence event: {...}` |

### 12.2 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `presence.events` | Counter | Presence events by type (join/leave/timeout) |
| `presence.events.debounced` | Counter | Events filtered by debounce |
| `presence.events.storm` | Counter | Events filtered by storm protection |
| `status.published` | Counter | Status messages published |
| `status.publish.latency` | Histogram | Time from event to publish |
| `channelgroup.add` | Counter | Channels added to groups |
| `channelgroup.remove` | Counter | Channels removed from groups |
| `channelgroup.size` | Gauge | Average channels per group |
| `global.count` | Gauge | Current global online count |

### 12.3 Tracing

**Trace ID propagation**:
- Function generates `eventId` from presence event
- `eventId` included in status message
- Clients can log `eventId` for correlation

**Example trace**:
```
[10:05:23.000] PRESENCE  eventId=pres_abc123_1706698523 action=join userId=user_abc123 shardId=42
[10:05:23.100] FUNCTION  eventId=pres_abc123_1706698523 action=debounce_check result=pass
[10:05:23.150] FUNCTION  eventId=pres_abc123_1706698523 action=update_status status=online
[10:05:23.200] FUNCTION  eventId=pres_abc123_1706698523 action=publish channel=status.user_abc123
[10:05:23.250] PUBNUB    message delivered to 523 subscribers via channel groups
```

### 12.4 Dashboards

**1. Presence Activity**
- Events per second by type (line chart)
- Events per shard (heatmap)
- Debounce/storm filter rate (line chart)

**2. Status Publishing**
- Publishes per second (line chart)
- Publish latency p50/p95/p99 (line chart)
- Publish errors (counter)

**3. Channel Groups**
- Average group size (gauge)
- Add/remove operations per minute (line chart)
- Groups with > 1500 channels (alert threshold)

**4. Global Status**
- Global online count (gauge)
- Peak today (gauge)

### 12.5 Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Publish errors high | > 1% error rate | Warning | Check Function logs |
| Channel group full | Group has > 1900 channels | Warning | Monitor for overflow |
| Storm protection triggered | > 10 times/hour | Warning | Investigate connectivity |
| Function timeout rate | > 0.1% | Warning | Optimize Function or add capacity |

---

## 13. Testing

### 13.1 Unit Tests

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Valid join event | Presence join event | Status updated, message published to status channel |
| Valid leave event | Presence leave event | Status updated, message published |
| Debounced event | Two events < 5s apart | Second event updates status only, no publish |
| Flapping detection | 5 events in 10s | Later events suppressed |
| Storm detection | 200 events/second | Events update status only |
| Channel group add | New friendship | Channel added to both groups |
| Channel group remove | Friendship removed | Channel removed from both groups |

### 13.2 Integration Tests

| Test Scenario | Steps | Verification |
|---------------|-------|--------------|
| **End-to-end online** | User A connects → Friend B receives notification | B receives friend.online via channel group |
| **End-to-end offline** | User A disconnects → Friend B receives notification | B receives friend.offline via channel group |
| **New friend** | A and B become friends | Channel groups updated, both notified |
| **Remove friend** | A removes B | Channel groups updated, both notified |
| **Debounce test** | User connects, disconnects, connects in 3s | Only one status publish |
| **Large friend list** | User with 1500 friends connects | All 1500 friends notified via single publish |
| **Concurrent users** | 100 users connect simultaneously | All friends notified correctly |

### 13.3 Load Tests

| Test | Configuration | Success Criteria |
|------|---------------|------------------|
| **Sustained load** | 100 status changes/second for 1 hour | < 500ms p99 notification latency |
| **Spike test** | 1000 users connect in 10 seconds | All notifications delivered within 5s |
| **Soak test** | Normal load for 24 hours | No memory leaks, consistent latency |
| **Friend list scale** | 100 users with 2000 friends each connect | All notifications within 2s |

### 13.4 Chaos Tests

| Test | Injection | Expected Behavior |
|------|-----------|-------------------|
| **Function timeout** | Slow App Context calls | Timeout, status update retried on next event |
| **Channel group API failure** | Block channel group operations | Friendships may be inconsistent; reconciliation needed |
| **High latency publish** | Add 500ms publish latency | Notifications delayed but delivered |

### 13.5 Test Data Generators

```javascript
// Generate test users with friend relationships
async function generateTestUsers(count, avgFriendsPerUser) {
  const users = [];
  
  for (let i = 0; i < count; i++) {
    const userId = `test_user_${i}`;
    const shardId = Math.abs(hashCode(userId)) % 100;
    
    // Create UUID metadata
    await pubnub.objects.setUUIDMetadata({
      uuid: userId,
      data: {
        name: `Test User ${i}`,
        custom: {
          schemaVersion: '1.0.0',
          online: false,
          shardId: shardId,
          friendCount: 0
        }
      }
    });
    
    // Create friend list channel
    await pubnub.objects.setChannelMetadata({
      channel: `friends.${userId}`,
      data: {
        name: `${userId}'s Friends`,
        custom: {
          schemaVersion: '1.0.0',
          ownerId: userId
        }
      }
    });
    
    users.push(userId);
  }
  
  // Create random friendships (with channel group updates)
  for (const userId of users) {
    const friendCount = Math.floor(Math.random() * avgFriendsPerUser * 2);
    const friendIds = users
      .filter(u => u !== userId)
      .sort(() => Math.random() - 0.5)
      .slice(0, friendCount);
    
    for (const friendId of friendIds) {
      await createFriendship(userId, friendId);
    }
  }
  
  return users;
}

// Create friendship with channel group updates
async function createFriendship(userA, userB) {
  // Add to channel groups
  await pubnub.channelGroups.addChannels({
    channelGroup: `cg-friends-${userA}`,
    channels: [`status.${userB}`]
  });
  
  await pubnub.channelGroups.addChannels({
    channelGroup: `cg-friends-${userB}`,
    channels: [`status.${userA}`]
  });
  
  // Create memberships
  await pubnub.objects.setChannelMembers({
    channel: `friends.${userA}`,
    uuids: [{ id: userB }]
  });
  
  await pubnub.objects.setChannelMembers({
    channel: `friends.${userB}`,
    uuids: [{ id: userA }]
  });
}

// Simulate user coming online
async function simulateUserOnline(userId, pubnubClient) {
  const shardId = Math.abs(hashCode(userId)) % 100;
  
  await pubnubClient.subscribe({
    channels: [
      `presence.shard-${shardId}`,
      'status.global'
    ],
    channelGroups: [`cg-friends-${userId}`],
    withPresence: true
  });
}
```

---

## 14. Implementation Checklist

### 14.1 Phase 1: Foundation

- [ ] Define App Context schemas (UUID, Channel, Membership)
- [ ] Create channel and channel group naming convention documentation
- [ ] Implement shard assignment function (hash-based)
- [ ] Set up PAM token generation with channel group permissions
- [ ] Create presence shard channels (100 shards)

### 14.2 Phase 2: Presence Detection

- [ ] Implement After Presence Function
- [ ] Add debounce logic for status changes
- [ ] Add storm detection and protection
- [ ] Update App Context UUID on status change
- [ ] Publish to status channel on status change
- [ ] Test presence events across shards

### 14.3 Phase 3: Channel Group Setup

- [ ] Create channel group naming convention (`cg-friends-{userId}`)
- [ ] Implement channel group creation on user registration
- [ ] Test subscribe to channel group
- [ ] Verify messages received via channel group

### 14.4 Phase 4: Friend Management

- [ ] Implement friend acceptance handler (adds to channel groups)
- [ ] Implement friend removal handler (removes from channel groups)
- [ ] Create App Context memberships (bidirectional)
- [ ] Add friend count caching in UUID metadata
- [ ] Test full friendship lifecycle

### 14.5 Phase 5: Initial Sync

- [ ] Implement friends list query via App Context
- [ ] Add online status to friend list response
- [ ] Client requests friend list on connect
- [ ] Handle pagination for large friend lists

### 14.6 Phase 6: Global Count

- [ ] Implement scheduled global count aggregator
- [ ] Set up status.global channel
- [ ] Add peak tracking
- [ ] Optimize HereNow queries for scale

### 14.7 Phase 7: Observability

- [ ] Add structured logging to all Functions
- [ ] Implement metrics collection
- [ ] Create monitoring dashboards
- [ ] Set up alerts for critical conditions
- [ ] Document runbook for common issues

### 14.8 Phase 8: Hardening

- [ ] Load test at 2x expected scale
- [ ] Chaos test failure modes
- [ ] Security review of token grants
- [ ] Performance optimize hot paths
- [ ] Document operational procedures

---

## 15. Common Mistakes

### 15.1 Architecture Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Subscribing to each friend's status channel directly** | Doesn't scale beyond ~100 friends | Use channel groups to aggregate |
| **Publishing to each friend's inbox** | 500 publishes vs 1 publish | Publish to own status channel; friends receive via groups |
| **Client-managed channel groups** | Security risk; inconsistency | Server-side Functions manage groups |
| **Using Presence state for friend status** | State is per-channel, not global | Store status in App Context UUID |
| **Single presence channel for all users** | Cannot scale HereNow | Shard presence channels |

### 15.2 Channel Group Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Letting users manage their own groups** | Can add arbitrary channels | Server-only group management |
| **Not handling 2000 channel limit** | Group full errors | Create overflow groups |
| **Synchronous group updates on friendship** | Slow user experience | Async Function handles updates |
| **Not initializing groups on user creation** | Subscribe fails | Create empty group on registration |

### 15.3 Security Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Users can publish to status channels** | Spam and spoofing | Only Functions can publish |
| **Users can manage channel groups** | Can subscribe to anyone's status | Server-only management |
| **Long-lived user tokens** | Token theft risk | 1-hour TTL with refresh |

### 15.4 Implementation Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Not including eventId** | Cannot trace issues | Every message has eventId |
| **No schema versioning** | Breaking changes break clients | Include schemaVersion |
| **Ignoring timeout events** | User appears online indefinitely | Handle timeout same as leave |
| **Not updating App Context on status change** | Late joiners see stale status | Always update UUID.custom.online |
| **Blocking calls in Function** | Timeout, poor performance | Use async patterns |

### 15.5 Operational Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **No channel group size monitoring** | Silent failures at 2000 | Alert on groups > 1500 |
| **No publish latency tracking** | Unaware of degradation | Track and alert on p99 |
| **No load testing** | Surprises at scale | Test at 2x expected load |
| **No runbook** | Slow incident response | Document common issues and fixes |

---

## Appendix A: MCP Server Integration

### A.1 MCP-Sourced Data

| Data | MCP Benefit | Fallback |
|------|-------------|----------|
| PubNub configuration (keys, limits) | Single source of truth | Environment variables |
| App Context schemas | Validation against defined schema | Hardcoded validation |
| Presence shard configuration | Consistent shard count | Config file |
| Channel group limits | Authoritative limits | Hardcoded values |

### A.2 MCP Usage in This Design

- **pnconfig**: Read keyset configuration for token generation
- **App Context schemas**: Validate UUID and Membership schemas
- **Shard configuration**: Source shard count and sizing from MCP
- **Channel group limits**: Source limits for overflow handling

### A.3 Application vs MCP Responsibility

| Responsibility | Owner |
|----------------|-------|
| Presence event handling | Application (Functions) |
| Channel group management | Application (Functions) |
| Status publishing | Application (Functions) |
| Schema validation | MCP-backed (authoritative) |
| Token generation | Application (auth server) |
| Configuration | MCP (read-only source) |

---

## Appendix B: Client Implementation Guide

### B.1 Initialization

```javascript
// Client initialization
const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'user_abc123',
  authKey: 'TOKEN_FROM_AUTH_SERVER' // PAM token
});

// Get shard assignment from auth server response
const shardId = authResponse.shardId; // e.g., 42

// Subscribe to channel group (friends' status) and channels
pubnub.subscribe({
  channels: [
    `presence.shard-${shardId}`,  // Own presence shard
    'status.global'               // Global online count
  ],
  channelGroups: [
    `cg-friends-user_abc123`      // All friends' status channels
  ]
});
```

### B.2 Message Handling

```javascript
pubnub.addListener({
  message: (event) => {
    const { channel, message } = event;
    
    // Messages from friends' status channels arrive here
    if (channel.startsWith('status.') && channel !== 'status.global') {
      switch (message.type) {
        case 'friend.online':
          handleFriendOnline(message.payload);
          break;
        case 'friend.offline':
          handleFriendOffline(message.payload);
          break;
        case 'friend.added':
          handleFriendAdded(message.payload);
          break;
        case 'friend.removed':
          handleFriendRemoved(message.payload);
          break;
      }
    } else if (channel === 'status.global') {
      if (message.type === 'status.count') {
        updateGlobalCount(message.payload.onlineCount);
      }
    }
  }
});

function handleFriendOnline(payload) {
  const { userId, name, profileUrl } = payload;
  // Update UI: Add to online friends list
  onlineFriends.set(userId, { name, profileUrl });
  renderFriendsList();
}

function handleFriendOffline(payload) {
  const { userId, lastSeen } = payload;
  // Update UI: Remove from online friends list
  onlineFriends.delete(userId);
  offlineFriends.set(userId, { lastSeen });
  renderFriendsList();
}

function handleFriendAdded(payload) {
  const { userId, name, profileUrl, online } = payload;
  // New friend added - add to appropriate list
  if (online) {
    onlineFriends.set(userId, { name, profileUrl });
  } else {
    offlineFriends.set(userId, { name, profileUrl });
  }
  renderFriendsList();
}

function handleFriendRemoved(payload) {
  const { userId } = payload;
  // Friend removed - remove from lists
  onlineFriends.delete(userId);
  offlineFriends.delete(userId);
  renderFriendsList();
}
```

### B.3 Initial Friend Status Load

```javascript
// On app startup, fetch current friend status from App Context
async function loadFriendStatus() {
  const response = await pubnub.objects.getChannelMembers({
    channel: `friends.${myUserId}`,
    include: {
      UUIDFields: true,
      customUUIDFields: true
    },
    limit: 100
  });
  
  for (const member of response.data) {
    const friend = member.uuid;
    if (friend.custom?.online) {
      onlineFriends.set(friend.id, {
        name: friend.name,
        profileUrl: friend.profileUrl
      });
    } else {
      offlineFriends.set(friend.id, {
        name: friend.name,
        profileUrl: friend.profileUrl,
        lastSeen: friend.custom?.lastSeen
      });
    }
  }
  
  renderFriendsList();
}
```

### B.4 Graceful Disconnection

```javascript
// Clean up on app close
function cleanup() {
  pubnub.unsubscribeAll();
  pubnub.stop();
}

// Handle visibility change (mobile)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // App in background - presence timeout will handle status
  } else {
    // App returned to foreground - reconnect
    pubnub.reconnect();
  }
});
```

---

## Validation Checklist

- [x] Channel strategy defined (presence shards + status channels + channel groups)
- [x] App Context model defined (UUID, Channel, Membership schemas)
- [x] Security model defined (user tokens with channel group permissions)
- [x] Idempotency & dedupe addressed (debounce, event IDs)
- [x] Failure modes addressed (storms, flapping, group limits)
- [x] Scaling & fanout risks addressed (1 publish via channel groups)
- [x] Observability plan included (metrics, logging, tracing)
- [x] Testing checklist included (unit, integration, load, chaos)
- [x] MCP usage considered and documented
