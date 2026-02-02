# Voting Design Pattern

> **Version**: 1.0.0  
> **Last Updated**: 2026-01-31  
> **Authority Model**: Host-only  
> **Retention**: Audit-required (individual vote verification)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Requirements](#2-requirements)
3. [Architecture](#3-architecture)
4. [Channel Topology](#4-channel-topology)
5. [App Context Model](#5-app-context-model)
6. [Event / Message Contracts](#6-event--message-contracts)
7. [Functions / Server Logic](#7-functions--server-logic)
8. [Security (PAM / Tokens)](#8-security-pam--tokens)
9. [Failure Modes & Edge Cases](#9-failure-modes--edge-cases)
10. [Scaling Notes](#10-scaling-notes)
11. [Observability](#11-observability)
12. [Testing](#12-testing)
13. [Implementation Checklist](#13-implementation-checklist)
14. [Common Mistakes](#14-common-mistakes)

---

## 1. Problem Statement

Enable real-time voting where a **host** creates a vote, participants submit choices, and results are aggregated and revealed—all with:

- Sub-second latency for vote acknowledgment
- Accurate tallying without double-counting
- Full audit trail of individual votes for compliance/verification
- Scalability from small rooms to broadcast-scale events

**Key challenges**:
- Ensuring exactly-once vote processing (idempotency)
- Preventing vote manipulation by malicious clients
- Handling late joiners and vote state synchronization
- Scaling aggregation without hot-channel bottlenecks

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Host can create a vote with question and options |
| FR-2 | Host can open voting (start accepting votes) |
| FR-3 | Host can close voting (stop accepting votes) |
| FR-4 | Host can reveal results to all participants |
| FR-5 | Participants can submit exactly one vote per vote session |
| FR-6 | Participants see real-time vote counts (if enabled) |
| FR-7 | Late joiners can see current vote state |
| FR-8 | Individual votes are stored for audit/verification |
| FR-9 | Participants receive acknowledgment of vote receipt |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Vote submission latency | < 500ms p99 |
| NFR-2 | Results update latency | < 1s p99 |
| NFR-3 | Duplicate vote rejection | 100% accuracy |
| NFR-4 | Vote integrity | Zero lost votes |
| NFR-5 | Audit completeness | Every vote traceable |

### 2.3 Scale Tiers (Reference)

| Tier | Concurrent Voters | Votes/sec | Recommended Pattern |
|------|-------------------|-----------|---------------------|
| Small | < 1K | < 10 | Single channel, client-side tally |
| Medium | 1K - 100K | 10 - 1K | Single channel, Function-based aggregation |
| Large | 100K - 1M+ | 1K - 10K+ | Sharded channels, distributed aggregation |
| Variable | Elastic | Variable | Auto-sharding with dynamic fanout |

---

## 3. Architecture

### 3.1 Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PARTICIPANTS                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ Client  │  │ Client  │  │ Client  │  │ Client  │  │ Client  │  ...      │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           │
│       │            │            │            │            │                  │
└───────┼────────────┼────────────┼────────────┼────────────┼──────────────────┘
        │            │            │            │            │
        │ vote.submit│            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PUBNUB FUNCTIONS                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Before Publish Handler                                               │   │
│  │  • Validate vote structure                                            │   │
│  │  • Check vote session is OPEN                                         │   │
│  │  • Check user hasn't already voted (dedupe)                           │   │
│  │  • Enrich with server timestamp                                       │   │
│  │  • Record vote to audit log (KV Store or external)                    │   │
│  │  • Update aggregated tally                                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        │ Validated & enriched
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PUBNUB CHANNELS                                   │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │ vote-control        │    │ vote-results        │                         │
│  │   .{sessionId}      │    │   .{sessionId}      │                         │
│  │                     │    │                     │                         │
│  │ • vote.created      │    │ • vote.tally        │                         │
│  │ • vote.opened       │    │ • vote.results      │                         │
│  │ • vote.closed       │    │                     │                         │
│  │ • vote.revealed     │    │                     │                         │
│  └─────────────────────┘    └─────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐                 │
│  │ vote-submit         │    │ vote-submit                 │  (Large scale)  │
│  │   .{sessionId}      │    │   .{sessionId}-shard-{N}    │                 │
│  │                     │    │                             │                 │
│  │ • vote.submit       │    │ • vote.submit               │                 │
│  │ • vote.ack          │    │ • vote.ack                  │                 │
│  └─────────────────────┘    └─────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
        │                            │
        ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APP CONTEXT                                     │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │ Channel Metadata    │    │ UUID Metadata       │                         │
│  │                     │    │                     │                         │
│  │ • Vote session      │    │ • User profile      │                         │
│  │   state & config    │    │ • Vote eligibility  │                         │
│  │ • Current tally     │    │                     │                         │
│  │ • Options list      │    │                     │                         │
│  └─────────────────────┘    └─────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │ Membership          │                                                    │
│  │                     │                                                    │
│  │ • hasVoted flag     │                                                    │
│  │ • votedOption       │                                                    │
│  │ • votedAt           │                                                    │
│  └─────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL AUDIT STORE                                 │
│                      (Required for Audit Compliance)                         │
│                                                                              │
│  • Individual vote records with full provenance                              │
│  • Immutable append-only log                                                 │
│  • Query by session, user, time range                                        │
│  • Options: PostgreSQL, DynamoDB, BigQuery, etc.                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                 HOST                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Host Client (Elevated Permissions)                                  │    │
│  │  • Create vote sessions                                              │    │
│  │  • Open/Close voting                                                 │    │
│  │  • Reveal results                                                    │    │
│  │  • View audit logs                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Components

| Component | Responsibility | PubNub Feature |
|-----------|----------------|----------------|
| Host Client | Vote lifecycle management | Pub/Sub (publish to control channel) |
| Participant Client | Vote submission, results display | Pub/Sub (subscribe + publish) |
| Control Channel | Broadcast vote state changes | Pub/Sub |
| Submit Channel | Receive vote submissions | Pub/Sub |
| Results Channel | Broadcast live tallies | Pub/Sub |
| Before Publish Function | Validate, dedupe, audit, aggregate | Functions |
| Vote Session State | Canonical vote configuration | App Context (Channel) |
| Vote Record | Individual vote tracking | App Context (Membership) + External DB |
| Audit Store | Immutable vote log | External Database |

---

## 4. Channel Topology

### 4.1 Channel Naming Convention

All channels follow the 2-level `[channelType].[channelId]` pattern:

```
vote-control.{sessionId}              # Host → Participants: lifecycle events
vote-submit.{sessionId}               # Participants → Server: vote submissions
vote-results.{sessionId}              # Server → Participants: live tallies
vote-submit.{sessionId}-shard-{N}     # (Large scale) Sharded submission
```

**Key benefits of 2-level naming**:
- Enables Function wildcard binding per channel type (`vote-control.*`, `vote-submit.*`, `vote-results.*`)
- Consistent with PubNub best practices for wildcard subscribe
- Sharding uses compound `channelId` to stay at 2 levels

### 4.2 Channel Purpose Matrix

| Channel | Publishers | Subscribers | Message Types | Persistence |
|---------|------------|-------------|---------------|-------------|
| `vote-control.{sessionId}` | Host only | All | created, opened, closed, revealed | Yes (7 days) |
| `vote-submit.{sessionId}` | Participants | Function only | submit, ack | No |
| `vote-results.{sessionId}` | Function only | All | tally, results | Yes (1 day) |
| `vote-submit.{sessionId}-shard-{N}` | Participants (assigned) | Function only | submit, ack | No |

### 4.3 Channel Partitioning Strategy

**Small/Medium Scale (< 100K voters)**:
- Single `vote-submit.{sessionId}` channel
- Function processes all votes synchronously

**Large Scale (100K+ voters)**:
- Shard into N partitions: `vote-submit.{sessionId}-shard-0`, `vote-submit.{sessionId}-shard-1`, ... `vote-submit.{sessionId}-shard-{N-1}`
- Assign users to shards via consistent hashing: `shardId = hash(userId) % N`
- Each shard has independent Function processing
- Aggregation Function merges shard tallies periodically
- All shards use single Function binding: `vote-submit.*`

**Shard Count Guidelines**:

| Voters | Votes/sec | Recommended Shards |
|--------|-----------|-------------------|
| < 100K | < 1K | 1 (no sharding) |
| 100K - 500K | 1K - 5K | 4 - 8 |
| 500K - 1M | 5K - 10K | 8 - 16 |
| 1M+ | 10K+ | 16 - 32+ |

### 4.4 Function Binding Strategy

The 2-level channel naming enables efficient Function wildcard binding per channel type:

| Function Binding Pattern | Matches | Purpose |
|-------------------------|---------|---------|
| `vote-control.*` | All control channels | (Optional) Validate host commands, audit lifecycle events |
| `vote-submit.*` | All submit channels (including shards) | **Required:** Validate votes, dedupe, aggregate tallies |
| `vote-results.*` | All results channels | (Optional) Monitor tally broadcasts, rate limiting |

**Key advantages**:
- Single `vote-submit.*` binding handles all shards automatically
- No need to register Functions per session or shard
- Consistent processing logic across all sessions
- Wildcard subscribe works at client level: `vote-control.*` to monitor all sessions

**Example Function Registration**:
```javascript
// PubNub Function: vote-submit-handler
// Channel binding: vote-submit.*
// Event: Before Publish

export default (request) => {
  // Handles all vote submissions across all sessions and shards
  const channel = request.channels[0]; // e.g., "vote-submit.abc123-shard-2"
  // Extract sessionId and shardId from channel name
  // Process vote...
};
```

---

## 5. App Context Model

### 5.1 Channel Metadata (Vote Session)

```json
{
  "channel": "vote-control.abc123",
  "name": "Q1 2026 Feature Priority Vote",
  "description": "Vote on which feature to prioritize",
  "custom": {
    "schemaVersion": "1.0.0",
    "sessionId": "abc123",
    "type": "vote_session",
    "status": "open",
    "question": "Which feature should we build next?",
    "options": [
      { "id": "opt_1", "label": "Dark Mode", "order": 1 },
      { "id": "opt_2", "label": "Mobile App", "order": 2 },
      { "id": "opt_3", "label": "API v2", "order": 3 }
    ],
    "config": {
      "allowChangeVote": false,
      "showLiveTally": true,
      "anonymousResults": false,
      "maxVotesPerUser": 1
    },
    "tally": {
      "opt_1": 0,
      "opt_2": 0,
      "opt_3": 0,
      "total": 0
    },
    "hostId": "host_user_123",
    "createdAt": "2026-01-31T10:00:00Z",
    "openedAt": null,
    "closedAt": null,
    "revealedAt": null,
    "shardCount": 1
  }
}
```

### 5.2 UUID Metadata (User)

```json
{
  "uuid": "user_456",
  "name": "Jane Participant",
  "email": "jane@example.com",
  "custom": {
    "schemaVersion": "1.0.0",
    "type": "participant",
    "roles": ["voter"],
    "createdAt": "2026-01-15T08:00:00Z"
  }
}
```

### 5.3 Membership (Vote Record - PubNub Side)

```json
{
  "channel": "vote-control.abc123",
  "uuid": "user_456",
  "custom": {
    "schemaVersion": "1.0.0",
    "hasVoted": true,
    "votedOption": "opt_2",
    "votedAt": "2026-01-31T10:05:23Z",
    "voteId": "vote_789xyz",
    "ackReceived": true
  }
}
```

### 5.4 App Context vs History vs External Storage

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Vote session config | App Context (Channel) | Queryable, canonical state, late-joiner sync |
| Live tally | App Context (Channel) | Queryable, late-joiner sync |
| User profile | App Context (UUID) | Identity, queryable |
| Has user voted? | App Context (Membership) | Fast lookup, dedupe |
| Individual vote details | External DB | Audit compliance, immutable log, query flexibility |
| Vote events stream | History | Replay, debugging (not for audit) |

---

## 6. Event / Message Contracts

### 6.1 Control Channel Messages (Host → Participants)

#### vote.created

```json
{
  "type": "vote.created",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_001",
  "ts": "2026-01-31T10:00:00.000Z",
  "sessionId": "abc123",
  "payload": {
    "question": "Which feature should we build next?",
    "options": [
      { "id": "opt_1", "label": "Dark Mode", "order": 1 },
      { "id": "opt_2", "label": "Mobile App", "order": 2 },
      { "id": "opt_3", "label": "API v2", "order": 3 }
    ],
    "config": {
      "allowChangeVote": false,
      "showLiveTally": true,
      "anonymousResults": false
    },
    "hostId": "host_user_123"
  }
}
```

#### vote.opened

```json
{
  "type": "vote.opened",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_002",
  "ts": "2026-01-31T10:01:00.000Z",
  "sessionId": "abc123",
  "payload": {
    "openedAt": "2026-01-31T10:01:00.000Z",
    "closesAt": null
  }
}
```

#### vote.closed

```json
{
  "type": "vote.closed",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_003",
  "ts": "2026-01-31T10:10:00.000Z",
  "sessionId": "abc123",
  "payload": {
    "closedAt": "2026-01-31T10:10:00.000Z",
    "totalVotes": 1523
  }
}
```

#### vote.revealed

```json
{
  "type": "vote.revealed",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_004",
  "ts": "2026-01-31T10:11:00.000Z",
  "sessionId": "abc123",
  "payload": {
    "results": {
      "opt_1": { "count": 412, "percentage": 27.1 },
      "opt_2": { "count": 687, "percentage": 45.1 },
      "opt_3": { "count": 424, "percentage": 27.8 }
    },
    "totalVotes": 1523,
    "winner": "opt_2"
  }
}
```

### 6.2 Submit Channel Messages (Participant → Server)

#### vote.submit

```json
{
  "type": "vote.submit",
  "schemaVersion": "1.0.0",
  "requestId": "req_user456_abc123_1706698523",
  "ts": "2026-01-31T10:05:23.000Z",
  "sessionId": "abc123",
  "payload": {
    "optionId": "opt_2",
    "userId": "user_456"
  }
}
```

> **Note**: `requestId` format ensures idempotency: `req_{userId}_{sessionId}_{clientTimestamp}`

### 6.3 Results Channel Messages (Server → Participants)

#### vote.ack

```json
{
  "type": "vote.ack",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_vote_789xyz",
  "ts": "2026-01-31T10:05:23.150Z",
  "sessionId": "abc123",
  "payload": {
    "requestId": "req_user456_abc123_1706698523",
    "userId": "user_456",
    "status": "accepted",
    "voteId": "vote_789xyz"
  }
}
```

#### vote.ack (rejection)

```json
{
  "type": "vote.ack",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_rej_002",
  "ts": "2026-01-31T10:05:24.000Z",
  "sessionId": "abc123",
  "payload": {
    "requestId": "req_user456_abc123_1706698524",
    "userId": "user_456",
    "status": "rejected",
    "reason": "already_voted",
    "existingVoteId": "vote_789xyz"
  }
}
```

#### vote.tally (periodic broadcast)

```json
{
  "type": "vote.tally",
  "schemaVersion": "1.0.0",
  "eventId": "evt_abc123_tally_015",
  "ts": "2026-01-31T10:05:30.000Z",
  "sessionId": "abc123",
  "payload": {
    "tally": {
      "opt_1": 142,
      "opt_2": 234,
      "opt_3": 156
    },
    "total": 532,
    "delta": {
      "opt_1": 12,
      "opt_2": 18,
      "opt_3": 9
    }
  }
}
```

### 6.4 Payload Size Constraints

| Message Type | Max Payload Size | Typical Size |
|--------------|------------------|--------------|
| vote.created | < 8 KB | 500 bytes - 2 KB |
| vote.submit | < 1 KB | 200 - 400 bytes |
| vote.ack | < 1 KB | 200 - 400 bytes |
| vote.tally | < 4 KB | 500 bytes - 1 KB |
| vote.revealed | < 8 KB | 500 bytes - 2 KB |

**Recommendations**:
- Keep option labels short (< 100 chars)
- Limit options to 20 per vote session
- Use IDs, not full objects, in vote.submit

---

## 7. Functions / Server Logic

### 7.1 Before Publish Handler (Vote Submission)

```javascript
// Function: vote-submit-handler
// Trigger: Before Publish on vote-submit.*

export default (request) => {
  const message = request.message;
  const pubnub = require('pubnub');
  const kvstore = require('kvstore');
  
  // 1. Validate message structure
  if (!isValidVoteSubmit(message)) {
    return request.abort({ 
      error: 'invalid_message',
      details: 'Missing required fields' 
    });
  }
  
  const { sessionId, payload } = message;
  const { userId, optionId } = payload;
  const requestId = message.requestId;
  
  // 2. Check idempotency (have we seen this requestId?)
  const processedKey = `processed:${requestId}`;
  return kvstore.get(processedKey).then((existing) => {
    if (existing) {
      // Already processed - return cached response
      return publishAck(pubnub, sessionId, existing);
    }
    
    // 3. Get vote session state
    return getVoteSession(sessionId).then((session) => {
      
      // 4. Validate session is open
      if (session.status !== 'open') {
        return rejectVote(pubnub, sessionId, requestId, userId, 'session_not_open');
      }
      
      // 5. Validate option exists
      if (!session.options.find(o => o.id === optionId)) {
        return rejectVote(pubnub, sessionId, requestId, userId, 'invalid_option');
      }
      
      // 6. Check if user already voted (dedupe)
      const voteKey = `vote:${sessionId}:${userId}`;
      return kvstore.get(voteKey).then((existingVote) => {
        if (existingVote) {
          return rejectVote(pubnub, sessionId, requestId, userId, 'already_voted', existingVote.voteId);
        }
        
        // 7. Record vote
        const voteId = generateVoteId();
        const voteRecord = {
          voteId,
          sessionId,
          userId,
          optionId,
          requestId,
          ts: new Date().toISOString(),
          serverTs: Date.now()
        };
        
        // 8. Store vote record (for dedupe)
        return kvstore.set(voteKey, voteRecord, 86400).then(() => {
          
          // 9. Store processed requestId (idempotency)
          return kvstore.set(processedKey, { voteId, status: 'accepted' }, 3600).then(() => {
            
            // 10. Increment tally (atomic counter)
            const tallyKey = `tally:${sessionId}:${optionId}`;
            return kvstore.incrCounter(tallyKey, 1).then(() => {
              
              // 11. Update App Context membership
              return updateMembership(sessionId, userId, voteRecord).then(() => {
                
                // 12. Write to audit log (async, fire-and-forget to external)
                writeAuditLog(voteRecord);
                
                // 13. Publish acknowledgment
                return acceptVote(pubnub, sessionId, requestId, userId, voteId);
              });
            });
          });
        });
      });
    });
  }).catch((error) => {
    console.error('Vote processing error:', error);
    return request.abort({ error: 'internal_error' });
  });
};

// Helper functions
function isValidVoteSubmit(msg) {
  return msg.type === 'vote.submit' 
    && msg.schemaVersion 
    && msg.requestId 
    && msg.sessionId
    && msg.payload?.userId 
    && msg.payload?.optionId;
}

function generateVoteId() {
  return 'vote_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function acceptVote(pubnub, sessionId, requestId, userId, voteId) {
  return pubnub.publish({
    channel: `vote-results.${sessionId}`,
    message: {
      type: 'vote.ack',
      schemaVersion: '1.0.0',
      eventId: `evt_${sessionId}_${voteId}`,
      ts: new Date().toISOString(),
      sessionId,
      payload: { requestId, userId, status: 'accepted', voteId }
    }
  });
}

function rejectVote(pubnub, sessionId, requestId, userId, reason, existingVoteId = null) {
  return pubnub.publish({
    channel: `vote-results.${sessionId}`,
    message: {
      type: 'vote.ack',
      schemaVersion: '1.0.0',
      eventId: `evt_${sessionId}_rej_${Date.now()}`,
      ts: new Date().toISOString(),
      sessionId,
      payload: { requestId, userId, status: 'rejected', reason, existingVoteId }
    }
  });
}
```

### 7.2 Tally Broadcast Function (Periodic)

```javascript
// Function: vote-tally-broadcaster
// Trigger: Scheduled (every 5 seconds) OR After Publish on submit channels

export default (request) => {
  const kvstore = require('kvstore');
  const pubnub = require('pubnub');
  
  // Get active sessions (from KV or App Context)
  return getActiveSessions().then((sessions) => {
    return Promise.all(sessions.map((session) => {
      if (!session.config.showLiveTally) return Promise.resolve();
      
      // Aggregate tallies from all shards
      return aggregateTally(session.sessionId, session.options).then((tally) => {
        return pubnub.publish({
          channel: `vote-results.${session.sessionId}`,
          message: {
            type: 'vote.tally',
            schemaVersion: '1.0.0',
            eventId: `evt_${session.sessionId}_tally_${Date.now()}`,
            ts: new Date().toISOString(),
            sessionId: session.sessionId,
            payload: { tally, total: Object.values(tally).reduce((a, b) => a + b, 0) }
          }
        });
      });
    }));
  });
};
```

### 7.3 Functions Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Idempotency** | `requestId` checked before processing; cached results returned for duplicates |
| **Determinism** | No random decisions; same input always produces same output |
| **Fast path** | Dedupe check before expensive operations |
| **Fail safe** | Abort on validation failure; never partially process |
| **Audit trail** | Every accepted vote logged to external store |
| **Bounded execution** | No loops; all async operations have timeouts |

### 7.4 Retry Semantics

| Failure Type | Retry Behavior | Client Action |
|--------------|----------------|---------------|
| Network timeout | Auto-retry (PubNub SDK) | Wait for ack or retry with same `requestId` |
| Function error | No retry | Client receives error; can retry with same `requestId` |
| KV store error | Function returns error | Client retries; idempotency prevents duplicates |
| Validation error | No retry | Client receives rejection; must fix and resubmit |

---

## 8. Security (PAM / Tokens)

### 8.1 Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| **Host** | Creates and manages vote sessions | Full control on owned sessions |
| **Participant** | Votes in sessions | Submit votes, read results |
| **Viewer** | Observes only | Read-only on results |
| **Auditor** | Compliance verification | Read audit logs, verify votes |

### 8.2 Token Grant Strategy

#### Host Token

```json
{
  "ttl": 3600,
  "authorized_uuid": "host_user_123",
  "resources": {
    "channels": {
      "vote-control.abc123": { "read": true, "write": true },
      "vote-results.abc123": { "read": true, "write": false },
      "vote-submit.abc123": { "read": false, "write": false }
    }
  },
  "patterns": {
    "channels": {
      "vote-control.*": { "read": true, "write": false },
      "vote-results.*": { "read": true, "write": false }
    }
  },
  "meta": {
    "role": "host",
    "sessionId": "abc123"
  }
}
```

#### Participant Token

```json
{
  "ttl": 3600,
  "authorized_uuid": "user_456",
  "resources": {
    "channels": {
      "vote-control.abc123": { "read": true, "write": false },
      "vote-results.abc123": { "read": true, "write": false },
      "vote-submit.abc123": { "read": false, "write": true }
    }
  },
  "meta": {
    "role": "participant",
    "sessionId": "abc123"
  }
}
```

#### Viewer Token (Read-Only)

```json
{
  "ttl": 3600,
  "authorized_uuid": "viewer_789",
  "resources": {
    "channels": {
      "vote-control.abc123": { "read": true, "write": false },
      "vote-results.abc123": { "read": true, "write": false }
    }
  },
  "meta": {
    "role": "viewer",
    "sessionId": "abc123"
  }
}
```

### 8.3 Token Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│ Auth Server │────▶│   PubNub    │
│  (Login)    │     │ (Your API)  │     │  (Grant)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │  1. Authenticate  │                   │
       │  with credentials │                   │
       │──────────────────▶│                   │
       │                   │  2. Request token │
       │                   │  with role/scope  │
       │                   │──────────────────▶│
       │                   │                   │
       │                   │  3. Signed token  │
       │                   │◀──────────────────│
       │  4. Token         │                   │
       │◀──────────────────│                   │
       │                   │                   │
       │  5. Connect to PubNub with token      │
       │──────────────────────────────────────▶│
```

### 8.4 Security Best Practices

| Practice | Implementation |
|----------|----------------|
| **Least privilege** | Participants cannot write to control channel |
| **Short TTLs** | 1-hour tokens; refresh before expiry |
| **Server-side validation** | Functions validate votes, not clients |
| **No client trust** | Vote counts computed server-side only |
| **Audit everything** | Every vote recorded with user identity |
| **Rate limiting** | Max 1 vote per user per session (enforced in Function) |

### 8.5 Abuse Prevention

| Threat | Mitigation |
|--------|------------|
| **Vote stuffing** | Dedupe by userId in Function + App Context Membership |
| **Replay attacks** | `requestId` idempotency; short TTL on processed records |
| **Token theft** | Short TTLs; bind token to IP/device fingerprint |
| **Bot voting** | CAPTCHA before token grant; behavioral analysis |
| **Result manipulation** | Clients cannot publish to results channel |

---

## 9. Failure Modes & Edge Cases

### 9.1 Failure Mode Analysis

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **Network partition (client)** | Vote not submitted | No ack received | Client retries with same `requestId` |
| **Network partition (function)** | Function cannot reach KV | Function error | Auto-retry; client retries |
| **KV store unavailable** | Dedupe check fails | Function error | Fail closed (reject vote); alert |
| **Function timeout** | Vote may be partially processed | Timeout error | Idempotent retry; reconciliation job |
| **Duplicate submission** | N/A (handled) | `requestId` exists | Return cached ack |
| **Late vote (session closed)** | Vote rejected | Status check | Client shows "voting closed" |
| **Invalid option** | Vote rejected | Validation | Client shows error |
| **Token expired** | Publish rejected | 403 error | Client refreshes token |

### 9.2 Race Conditions

| Race Condition | Scenario | Mitigation |
|----------------|----------|------------|
| **Vote during close** | User submits as host closes | Function checks status atomically; close wins |
| **Concurrent duplicate** | Same user, two requests, same millisecond | KV `set` with conditional (if not exists) |
| **Tally read during update** | Tally broadcast during vote processing | Eventual consistency acceptable; use atomic counters |
| **Session update during vote** | Host changes options while user votes | Validate optionId exists; reject if not |

### 9.3 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Zero votes** | Display "No votes cast"; prevent division by zero |
| **Tie** | Define tie-breaker rule (first to reach count, or declare tie) |
| **Single voter** | Allow; results show 100% for one option |
| **Host disconnects** | Session remains in current state; moderator can take over (if supported) |
| **All participants disconnect** | Session remains; Presence shows 0 occupancy |
| **Very long vote session** | Token refresh required; KV TTLs must exceed session duration |

### 9.4 Replay Handling

**Scenario**: Client reconnects and replays vote submission.

**Handling**:
1. Client resends `vote.submit` with original `requestId`
2. Function checks `processed:{requestId}` in KV store
3. If exists, return cached ack (no duplicate processing)
4. If not exists, process as new vote

**Retention**: Processed `requestId` entries retained for 1 hour (longer than any reasonable session).

---

## 10. Scaling Notes

### 10.1 Scale Tier Recommendations

#### Small Scale (< 1K voters, < 10 votes/sec)

```
Configuration:
- Single submit channel
- Client-side or Function-based aggregation
- No sharding required
- Standard PubNub Functions

Optimizations:
- None required
- Focus on correctness over performance
```

#### Medium Scale (1K - 100K voters, 10 - 1K votes/sec)

```
Configuration:
- Single submit channel
- Function-based aggregation with atomic counters
- App Context for tally storage
- Periodic tally broadcast (every 2-5 seconds)

Optimizations:
- Batch tally updates (aggregate in memory, flush periodically)
- Use KV store counters for atomic increments
- Consider read replicas for tally reads
```

#### Large Scale (100K - 1M+ voters, 1K - 10K+ votes/sec)

```
Configuration:
- Sharded submit channels (4-32 shards)
- Distributed aggregation (per-shard tallies)
- External database for audit log
- Aggregation service merges shard tallies

Optimizations:
- Consistent hashing for shard assignment
- Separate aggregation Function (scheduled, not per-message)
- Pre-warm connections and Functions
- Consider external state store (Redis) for high-frequency counters
```

### 10.2 Sharding Implementation

```javascript
// Client-side shard assignment
function getShardChannel(sessionId, userId, shardCount) {
  const hash = hashCode(userId);
  const shardId = Math.abs(hash) % shardCount;
  // Use compound channelId to stay at 2 levels
  return `vote-submit.${sessionId}-shard-${shardId}`;
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

### 10.3 Fanout Risk Analysis

| Channel | Subscribers | Messages/sec | Risk | Mitigation |
|---------|-------------|--------------|------|------------|
| `vote-control.*` | All (N) | Low (< 1/min) | Low | None needed |
| `vote-results.*` | All (N) | Medium (1/5s) | Medium | Batch updates; reduce frequency at scale |
| `vote-submit.*` | Function only | High (votes/sec) | Low | Sharding distributes load |

### 10.4 Rate Limits

| Operation | Limit | Enforcement |
|-----------|-------|-------------|
| Votes per user per session | 1 | Function (KV dedupe) |
| Vote submissions per second (per shard) | 1,000 | PubNub rate limits + Function |
| Tally broadcasts per second | 1 | Scheduled Function |
| Token refreshes per user per hour | 10 | Auth server |

---

## 11. Observability

### 11.1 Logging Strategy

| Log Level | Events | Example |
|-----------|--------|---------|
| **INFO** | Vote accepted, session state changes | `Vote accepted: voteId=xyz, sessionId=abc, userId=456` |
| **WARN** | Vote rejected, duplicate detected | `Duplicate vote rejected: userId=456, sessionId=abc` |
| **ERROR** | Function failures, KV errors | `KV store error: operation=get, key=vote:abc:456` |
| **DEBUG** | Full message payloads (dev only) | `Processing vote: {...}` |

### 11.2 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `votes.submitted` | Counter | Total votes submitted |
| `votes.accepted` | Counter | Votes successfully processed |
| `votes.rejected` | Counter | Votes rejected (by reason) |
| `votes.duplicates` | Counter | Duplicate submissions caught |
| `vote.latency` | Histogram | Time from submit to ack |
| `session.active` | Gauge | Currently open sessions |
| `session.participants` | Gauge | Participants per session |
| `tally.updates` | Counter | Tally broadcast count |

### 11.3 Tracing

**Trace ID Propagation**:
- Client generates `requestId` (acts as trace ID)
- Function logs `requestId` with all operations
- Audit log includes `requestId`
- Ack includes original `requestId`

**Example Trace**:
```
[10:05:23.000] CLIENT  requestId=req_456_abc_123 action=submit optionId=opt_2
[10:05:23.050] FUNC    requestId=req_456_abc_123 action=validate status=pass
[10:05:23.080] FUNC    requestId=req_456_abc_123 action=dedupe status=new
[10:05:23.100] FUNC    requestId=req_456_abc_123 action=record voteId=vote_xyz
[10:05:23.120] FUNC    requestId=req_456_abc_123 action=tally option=opt_2 newCount=235
[10:05:23.140] FUNC    requestId=req_456_abc_123 action=ack status=accepted
[10:05:23.150] CLIENT  requestId=req_456_abc_123 action=ack_received voteId=vote_xyz
```

### 11.4 Audit Trail

**Audit Log Schema** (External Database):

```sql
CREATE TABLE vote_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id         VARCHAR(50) NOT NULL,
  session_id      VARCHAR(50) NOT NULL,
  user_id         VARCHAR(50) NOT NULL,
  option_id       VARCHAR(50) NOT NULL,
  request_id      VARCHAR(100) NOT NULL,
  client_ts       TIMESTAMP NOT NULL,
  server_ts       TIMESTAMP NOT NULL DEFAULT NOW(),
  client_ip       INET,
  user_agent      TEXT,
  token_id        VARCHAR(100),
  
  -- Indexes
  INDEX idx_session (session_id),
  INDEX idx_user (user_id),
  INDEX idx_request (request_id),
  
  -- Constraints
  UNIQUE (session_id, user_id)  -- One vote per user per session
);
```

### 11.5 Dashboards

**Recommended Panels**:

1. **Live Voting Activity**
   - Votes/second (line chart)
   - Active sessions (gauge)
   - Active participants (gauge)

2. **Vote Processing Health**
   - Accept/reject ratio (pie chart)
   - Rejection reasons breakdown (bar chart)
   - Processing latency p50/p95/p99 (line chart)

3. **Session Overview**
   - Sessions by state (open/closed/revealed)
   - Votes per session distribution
   - Session duration histogram

4. **Error Tracking**
   - Function errors/minute
   - KV store latency
   - Token refresh failures

---

## 12. Testing

### 12.1 Unit Tests

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Valid vote submit | Well-formed message | Vote accepted, ack returned |
| Missing requestId | Message without requestId | Validation error |
| Invalid optionId | optionId not in session | Rejection: invalid_option |
| Session not open | Vote when status=closed | Rejection: session_not_open |
| Duplicate vote | Same userId, same session | Rejection: already_voted |
| Idempotent retry | Same requestId twice | Same ack both times |

### 12.2 Integration Tests

| Test Scenario | Steps | Verification |
|---------------|-------|--------------|
| **End-to-end vote** | Create session → Open → Submit vote → Close → Reveal | Vote in results, audit log entry |
| **Duplicate handling** | Submit same vote twice | Second request returns cached ack |
| **Late joiner sync** | Join after votes cast | Receives current tally via App Context |
| **Token refresh** | Vote, wait for expiry, vote again | Both votes processed after refresh |
| **Host controls** | Open → Close → Attempt vote | Vote rejected after close |

### 12.3 Load Tests

| Test | Configuration | Success Criteria |
|------|---------------|------------------|
| **Sustained load** | 1K votes/sec for 10 min | < 500ms p99 latency, 0 lost votes |
| **Burst load** | 10K votes in 10 sec | All votes processed, < 2s drain time |
| **Scale up** | Ramp 0 → 10K voters over 5 min | Linear latency, no errors |
| **Shard rebalance** | Add shards during active voting | No vote loss, brief latency spike acceptable |

### 12.4 Chaos Tests

| Test | Injection | Expected Behavior |
|------|-----------|-------------------|
| **KV store latency** | Add 500ms delay | Votes queued, eventually processed |
| **KV store failure** | Return errors for 30s | Votes rejected, alert fired, recovery when KV returns |
| **Function timeout** | Slow external call | Timeout, client retries, idempotency prevents duplicates |
| **Network partition** | Drop 50% of packets | Retries succeed, no duplicates |

### 12.5 Test Data Generators

```javascript
// Generate test vote submission
function generateVoteSubmit(sessionId, userId, optionId) {
  return {
    type: 'vote.submit',
    schemaVersion: '1.0.0',
    requestId: `req_${userId}_${sessionId}_${Date.now()}`,
    ts: new Date().toISOString(),
    sessionId,
    payload: { userId, optionId }
  };
}

// Generate N concurrent voters
async function simulateVoters(sessionId, options, count) {
  const voters = Array.from({ length: count }, (_, i) => `user_${i}`);
  const votes = voters.map(userId => {
    const optionId = options[Math.floor(Math.random() * options.length)].id;
    return generateVoteSubmit(sessionId, userId, optionId);
  });
  
  // Submit all concurrently
  return Promise.all(votes.map(vote => submitVote(vote)));
}
```

---

## 13. Implementation Checklist

### 13.1 Phase 1: Foundation

- [ ] Define vote session App Context schema
- [ ] Create channel naming convention
- [ ] Implement PAM token generation (host, participant, viewer)
- [ ] Set up KV store keys for dedupe and tally
- [ ] Create basic Before Publish Function (validation only)

### 13.2 Phase 2: Core Voting

- [ ] Implement vote submission handler in Function
- [ ] Add dedupe logic (requestId + userId)
- [ ] Implement atomic tally counters
- [ ] Add vote acknowledgment publishing
- [ ] Update App Context Membership on vote

### 13.3 Phase 3: Host Controls

- [ ] Implement vote.created flow
- [ ] Implement vote.opened flow
- [ ] Implement vote.closed flow
- [ ] Implement vote.revealed flow
- [ ] Add session state validation in Function

### 13.4 Phase 4: Audit & Compliance

- [ ] Set up external audit database
- [ ] Implement audit log writes from Function
- [ ] Add query endpoints for audit retrieval
- [ ] Implement vote verification flow

### 13.5 Phase 5: Scaling

- [ ] Implement shard assignment logic
- [ ] Create per-shard submit channels
- [ ] Implement tally aggregation across shards
- [ ] Add shard count to session configuration
- [ ] Load test with target scale

### 13.6 Phase 6: Observability

- [ ] Add structured logging to Functions
- [ ] Implement metrics collection
- [ ] Create monitoring dashboard
- [ ] Set up alerts for error rates
- [ ] Document runbook for common issues

### 13.7 Phase 7: Hardening

- [ ] Chaos test all failure modes
- [ ] Implement circuit breakers for external calls
- [ ] Add rate limiting at auth server
- [ ] Security review of token grants
- [ ] Penetration test vote submission flow

---

## 14. Common Mistakes

### 14.1 Architecture Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Trusting client vote counts** | Clients can send fake tallies | Server-side aggregation only |
| **Using Presence for vote tracking** | Presence is ephemeral, not authoritative | App Context Membership for vote state |
| **Single channel at large scale** | Hot channel, message ordering issues | Shard submit channels |
| **No idempotency key** | Duplicate votes on retry | Always use `requestId` |

### 14.2 Security Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Participants can write to control** | Vote manipulation | Read-only for participants |
| **Long-lived tokens** | Token theft risk | Short TTL (1 hour), refresh |
| **No rate limiting** | Vote stuffing attacks | Dedupe + rate limit in Function |
| **Audit log in PubNub History only** | Not queryable, limited retention | External immutable database |

### 14.3 Implementation Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **Blocking calls in Function** | Timeout, poor UX | Async with timeouts |
| **No schema versioning** | Breaking changes break clients | Always include `schemaVersion` |
| **Relying on message order** | PubNub doesn't guarantee order | Design for out-of-order; use timestamps |
| **No retry handling** | Lost votes on transient failures | Idempotent design, client retries |

### 14.4 Operational Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| **No monitoring** | Silent failures | Metrics, alerts, dashboards |
| **No load testing** | Surprises at scale | Test at 2x expected load |
| **Infinite History retention** | Cost, not compliant | Define retention policy |
| **No runbook** | Slow incident response | Document common issues and fixes |

---

## Appendix A: MCP Server Integration

### A.1 MCP-Sourced Data

| Data | MCP Benefit | Fallback |
|------|-------------|----------|
| PubNub configuration (keys, limits) | Single source of truth | Environment variables |
| App Context schemas | Validation against defined schema | Hardcoded validation |
| Function configuration | Consistent deployment | Manual deployment |

### A.2 MCP Usage in This Design

- **pnconfig**: Read keyset configuration for token generation
- **App Context schemas**: Validate vote session and membership schemas
- **Rate limits**: Source from MCP to avoid hardcoding

### A.3 Application vs MCP Responsibility

| Responsibility | Owner |
|----------------|-------|
| Vote business logic | Application (Functions) |
| Schema validation | MCP-backed (authoritative) |
| Token generation | Application (auth server) |
| Channel naming | Application (follows convention) |
| Configuration | MCP (read-only source) |

---

## Appendix B: Message Schema Reference

### B.1 All Message Types

| Type | Direction | Channel | Purpose |
|------|-----------|---------|---------|
| `vote.created` | Host → All | `.control` | Announce new vote session |
| `vote.opened` | Host → All | `.control` | Voting is now open |
| `vote.closed` | Host → All | `.control` | Voting is now closed |
| `vote.revealed` | Host → All | `.control` | Results revealed |
| `vote.submit` | Participant → Server | `.submit` | Cast a vote |
| `vote.ack` | Server → Participant | `.results` | Vote receipt confirmation |
| `vote.tally` | Server → All | `.results` | Live vote counts |

### B.2 Schema Version History

| Version | Changes | Compatible |
|---------|---------|------------|
| 1.0.0 | Initial release | N/A |

---

## Validation Checklist

- [x] Channel strategy defined
- [x] App Context model defined
- [x] Security model defined
- [x] Idempotency & dedupe addressed
- [x] Failure modes addressed
- [x] Scaling & fanout risks addressed
- [x] Observability plan included
- [x] Testing checklist included
- [x] MCP usage considered and documented
