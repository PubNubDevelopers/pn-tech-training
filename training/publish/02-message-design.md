# Message Design

## Introduction

Properly designed messages are the foundation of maintainable, scalable real-time applications. This document covers the required message structure, schema versioning strategies, and channel naming conventions that enable your application to evolve safely over time.

## Required Message Fields

Every message published to PubNub **MUST** include four required fields. These fields enable routing, filtering, deduplication, and auditing.

### The Four Required Fields

```json
{
  "type": "domain.action",
  "schemaVersion": "1.0",
  "eventId": "evt_unique_identifier",
  "ts": 1706889600000,
  "payload": {
    "applicationData": "..."
  }
}
```

### Field Specifications

#### 1. type (Required)

**Purpose**: Message routing, filtering, and Function dispatch

**Format**: Dot-notation `domain.action`

**Examples**:
- `vote.submit` - User submits a vote
- `vote.tally` - Server publishes vote results
- `chat.message` - User sends chat message
- `chat.typing` - User typing indicator
- `game.move` - Player makes a move
- `game.state` - Authoritative game state
- `payment.confirmed` - Payment processed

**Naming Rules**:
- Use lowercase with periods as separators
- First part is domain/category
- Second part is action/event
- Maximum 2-3 segments recommended
- ASCII characters only

**Why it matters**:
- Functions can route on `message.type`
- Clients can filter messages
- Analytics can group by type
- Enables versioned message handlers

#### 2. schemaVersion (Required)

**Purpose**: Backward compatibility and schema evolution

**Format**: Semantic versioning string `"major.minor"` or `"major.minor.patch"`

**Examples**:
- `"1.0"` - Initial version
- `"1.1"` - Added optional field
- `"2.0"` - Breaking change (renamed field, changed structure)

**Versioning Strategy**:

| Change Type | Version Increment | Example |
|-------------|------------------|---------|
| Add optional field | Minor (1.0 → 1.1) | Added `avatar` field |
| Add required field | Major (1.x → 2.0) | Must update all consumers |
| Rename field | Major (1.x → 2.0) | `name` → `displayName` |
| Remove field | Major (1.x → 2.0) | Removed `deprecated` field |
| Change field type | Major (1.x → 2.0) | `count` from number to string |

**Why it matters**:
- Clients can handle multiple versions
- Safe to deploy new versions gradually
- Debugging is easier with version info
- Enables migration strategies

#### 3. eventId (Required)

**Purpose**: Deduplication, idempotency, and audit trail

**Format**: Unique identifier (UUID, ULID, or custom format)

**Recommended Formats**:

```javascript
// Option 1: UUID v4
eventId: crypto.randomUUID()  // "a3bb189e-8bf9-3888-9912-ace4e6543002"

// Option 2: Custom with timestamp
eventId: `evt_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
// "evt_user123_1706889600000_x7f2a3k9d"

// Option 3: ULID (lexicographically sortable)
eventId: ulid()  // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

**Best Practices**:
- Generate on client when possible (enables offline)
- Include timestamp for ordering/debugging
- Keep under 100 characters
- Use URL-safe characters only

**Why it matters**:
- Server-side deduplication (prevent double-processing)
- Idempotent retry handling
- Audit trail and debugging
- Correlation across systems

#### 4. ts (Required)

**Purpose**: Client timestamp for ordering and latency measurement

**Format**: Unix epoch milliseconds (JavaScript `Date.now()`)

**Example**: `1706889600000` (Friday, February 2, 2024 12:00:00 PM GMT)

**Why it matters**:
- Order messages when out-of-order delivery occurs
- Measure publish latency (client → server → subscriber)
- Debugging and troubleshooting
- Business analytics (when did user take action?)

**Important**: This is the **client timestamp**. PubNub's timetoken is the **server timestamp**.

```javascript
const message = {
  ts: Date.now(),  // Client timestamp
  // ...
};

const result = await pubnub.publish({ channel, message });
// result.timetoken is the server timestamp
```

### Complete Example

```javascript
const message = {
  // Required fields
  type: 'vote.submit',
  schemaVersion: '1.0',
  eventId: `vote_${userId}_${sessionId}_${Date.now()}`,
  ts: Date.now(),
  
  // Application-specific payload
  payload: {
    sessionId: 'session_abc123',
    optionId: 'option_1',
    voterId: 'user_456'
  }
};

await pubnub.publish({
  channel: 'vote-submit.session_abc123',
  message: message
});
```

## Payload Structure Best Practices

### Keep Payloads Flat

```javascript
// ✅ GOOD: Flat structure (1-2 levels)
{
  "type": "user.profile",
  "schemaVersion": "1.0",
  "eventId": "prof_123",
  "ts": 1706889600000,
  "payload": {
    "userId": "user123",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "admin"
  }
}

// ❌ BAD: Deep nesting (3+ levels)
{
  "type": "user.profile",
  "payload": {
    "user": {
      "identity": {
        "name": {
          "first": "Jane",
          "last": "Doe"
        },
        "contact": {
          "email": {
            "primary": "jane@example.com"
          }
        }
      }
    }
  }
}
```

**Why flat is better**:
- Easier parsing and validation
- Smaller serialized size
- Simpler to evolve schema
- Better for JSONPath filtering

### Use camelCase for Field Names

```javascript
// ✅ GOOD: camelCase (consistent with JavaScript)
{
  "userId": "user123",
  "firstName": "Jane",
  "lastSeen": 1706889600000
}

// ❌ BAD: Inconsistent naming
{
  "user_id": "user123",      // snake_case
  "FirstName": "Jane",        // PascalCase
  "last-seen": 1706889600000  // kebab-case
}
```

### Include Only Necessary Data

```javascript
// ✅ GOOD: Minimal, essential data
{
  "type": "vote.submit",
  "eventId": "vote_123",
  "payload": {
    "sessionId": "session_abc",
    "optionId": "option_1"
  }
}

// ❌ BAD: Excessive, redundant data
{
  "type": "vote.submit",
  "eventId": "vote_123",
  "payload": {
    "sessionId": "session_abc",
    "sessionName": "Product Launch Poll",  // Fetch from App Context
    "sessionOwner": "user_456",            // Fetch from App Context
    "sessionStartTime": 1706800000000,     // Not needed for submit
    "allOptions": [/* huge array */],      // Fetch from App Context
    "optionId": "option_1"
  }
}
```

**Principle**: Publish the minimum required. Fetch related data from App Context or your database.

### Never Include Secrets

```javascript
// ❌ NEVER: Sensitive data in messages
{
  "type": "payment.complete",
  "payload": {
    "cardNumber": "4111111111111111",  // NEVER!
    "cvv": "123",                       // NEVER!
    "apiKey": "sk_live_abc123",        // NEVER!
    "password": "secret123"            // NEVER!
  }
}

// ✅ CORRECT: Reference IDs only
{
  "type": "payment.complete",
  "eventId": "pay_123",
  "payload": {
    "transactionId": "txn_abc123",  // Safe reference
    "last4": "1111",                 // Masked
    "status": "completed",
    "amount": 99.99
  }
}
```

**For truly sensitive channels**: Use encryption with `cipherKey`.

## Schema Versioning Strategies

### Versioning Rules

#### Minor Version (Additive Changes)

Safe changes that don't break existing consumers:

```javascript
// Version 1.0: Original
{
  "type": "user.profile",
  "schemaVersion": "1.0",
  "payload": {
    "userId": "user123",
    "name": "Jane Doe"
  }
}

// Version 1.1: Added optional field (safe)
{
  "type": "user.profile",
  "schemaVersion": "1.1",
  "payload": {
    "userId": "user123",
    "name": "Jane Doe",
    "avatar": "https://example.com/jane.jpg"  // New optional field
  }
}
```

**Consumer Handling**:
```javascript
function handleProfile(message) {
  const { userId, name, avatar } = message.payload;
  
  // Handle both versions
  if (avatar) {
    displayProfileWithAvatar(name, avatar);
  } else {
    displayProfile(name);
  }
}
```

#### Major Version (Breaking Changes)

Changes that require consumers to update:

```javascript
// Version 1.x: Original structure
{
  "type": "user.profile",
  "schemaVersion": "1.1",
  "payload": {
    "userId": "user123",
    "name": "Jane Doe",
    "avatar": "url"
  }
}

// Version 2.0: Breaking changes
{
  "type": "user.profile",
  "schemaVersion": "2.0",
  "payload": {
    "userId": "user123",
    "displayName": "Jane Doe",  // Renamed: name → displayName
    "profile": {                 // Restructured
      "avatarUrl": "url",        // Renamed: avatar → avatarUrl
      "bio": "Hello!"            // New required field
    }
  }
}
```

**Consumer Handling (Multi-Version Support)**:
```javascript
function handleProfile(message) {
  const { schemaVersion, payload } = message;
  
  if (schemaVersion === '1.0' || schemaVersion === '1.1') {
    // Handle v1.x
    return {
      id: payload.userId,
      name: payload.name,
      avatar: payload.avatar || null
    };
  } else if (schemaVersion === '2.0') {
    // Handle v2.0
    return {
      id: payload.userId,
      name: payload.displayName,
      avatar: payload.profile.avatarUrl
    };
  } else {
    throw new Error(`Unsupported schema version: ${schemaVersion}`);
  }
}
```

### Migration Strategy

**Phase 1: Deploy Multi-Version Consumers**
1. Update all subscribers to handle both v1 and v2
2. Test thoroughly
3. Deploy to production

**Phase 2: Start Publishing v2**
4. Update publishers to send v2 messages
5. Monitor for errors
6. Keep v1 handling for safety

**Phase 3: Deprecate v1**
7. After all publishers upgraded, remove v1 handling
8. Update documentation

### Version Matrix

| Version | Status | Supports |
|---------|--------|----------|
| 1.0 | Deprecated | Legacy clients only |
| 1.1 | Maintenance | Existing deployments |
| 2.0 | Current | New features |
| 2.1 | Development | Beta testing |

## Channel Naming Conventions

### Standard Pattern: `[channelType].[channelId]`

All channels MUST follow this two-level pattern:

```
✅ CORRECT Examples:
vote-submit.session123
vote-results.session123
chat.room456
inbox.user789
game-state.match001
presence.shard-0

❌ INCORRECT Examples:
vote.session123.submit        ← 3 levels (breaks Function binding)
chat.room.456.messages        ← 4 levels
game.lobby.room.player.state  ← 5 levels
```

### Why Two Levels?

1. **Function Binding** - Works only at second level (`foo.*` works, `foo.bar.*` does NOT)
2. **Wildcard Subscribe** - Simple pattern matching
3. **Readability** - Easy to understand channel purpose
4. **Scalability** - Predictable naming for sharding

### Channel Type Naming

| Pattern | Use Case | Subscribe Pattern |
|---------|----------|-------------------|
| `chat.{roomId}` | Chat messages | `chat.*` |
| `inbox.{userId}` | Personal notifications | `inbox.*` |
| `vote-submit.{sessionId}` | Vote submissions | `vote-submit.*` |
| `vote-results.{sessionId}` | Vote results | `vote-results.*` |
| `game-state.{matchId}` | Game state | `game-state.*` |
| `presence.shard-{N}` | Presence sharding | `presence.*` |
| `typing.{roomId}` | Typing indicators | `typing.*` |
| `system.{scope}` | System messages | `system.*` |

### Channel ID Composition

For compound identifiers, embed in the channel ID, NOT as another level:

```javascript
// ✅ CORRECT: Compound ID in second level
function getShardChannel(sessionId, shardId) {
  return `vote-submit.${sessionId}-shard-${shardId}`;
  // Examples: vote-submit.session123-shard-0
  //           vote-submit.session123-shard-1
}

// Function binding works: vote-submit.*

// ❌ WRONG: Extra level breaks Function binding
function getShardChannel(sessionId, shardId) {
  return `vote-submit.${sessionId}.shard-${shardId}`;
  // Examples: vote-submit.session123.shard-0  (3 levels!)
}

// Function binding FAILS: vote-submit.*.shard-* doesn't work
```

### Separating Submission and Result Channels

**Best Practice**: Use different channel types for client submissions vs server results

```javascript
// Clients publish to submission channels
const submissionChannel = `vote-submit.${sessionId}`;

// Clients subscribe to result channels
const resultChannel = `vote-results.${sessionId}`;

// Access Manager enforces separation
const clientToken = await grantToken({
  resources: {
    channels: {
      [submissionChannel]: { write: true, read: false },  // Can submit
      [resultChannel]: { read: true, write: false }        // Can read results
    }
  }
});
```

**Benefits**:
- Clear separation of concerns
- Access Manager enforces authorization
- Server has full control over results
- Clients cannot forge authoritative events

### Channel Naming for Scale

**For High-Traffic Channels** - Shard by user or resource:

```javascript
// ❌ ANTI-PATTERN: Hot channel
const channel = 'notifications.all-users';  // 100K+ subscribers

// ✅ BETTER: Personal inbox
const channel = `inbox.${userId}`;  // 1 subscriber per channel

// ✅ ALSO GOOD: Shard by hash
const shardId = hash(userId) % 100;
const channel = `notifications.shard-${shardId}`;  // ~1K subscribers per shard
```

### Channel Name Restrictions

| Rule | Limit | Notes |
|------|-------|-------|
| **Max length** | 2,048 characters | Including separators |
| **Allowed characters** | ASCII printable | Letters, numbers, `-`, `_`, `.` |
| **Depth for Functions** | 2 levels | Wildcard binding limitation |
| **Depth for Wildcard Subscribe** | 2 levels | Beyond 2 requires disabling Wildcard Subscribe |
| **Reserved characters** | `,`, `/`, `\`, `*`, `:` | Cannot be used in names |

## Access Manager Write Permission

To publish to a channel, the Access Manager token MUST grant `write` permission.

### Token Configuration

```javascript
// Server-side token generation
const token = await pubnub.grantToken({
  ttl: 60,  // 60 minutes
  authorized_uuid: userId,
  resources: {
    channels: {
      // User can write to their submission channel
      [`vote-submit.${sessionId}`]: {
        read: false,
        write: true  // Required for publish
      },
      
      // User can read results (server publishes)
      [`vote-results.${sessionId}`]: {
        read: true,
        write: false  // Client cannot forge results
      },
      
      // User can read and write chat
      [`chat.${roomId}`]: {
        read: true,
        write: true  // Full access
      }
    }
  }
});
```

### Permission Matrix by Role

| Role | Channel | Read | Write | Notes |
|------|---------|------|-------|-------|
| **Viewer** | `vote-results.*` | ✅ | ❌ | View-only |
| **Participant** | `vote-submit.*` | ❌ | ✅ | Can vote |
| **Participant** | `vote-results.*` | ✅ | ❌ | Can see results |
| **Participant** | `chat.*` | ✅ | ✅ | Can chat |
| **Host** | `vote-control.*` | ✅ | ✅ | Full control |
| **Server** | `*` | ✅ | ✅ | Authoritative (uses secretKey) |

### Client-Side Publishing

```javascript
// Client SDK configured with token
const pubnub = new PubNub({
  publishKey: 'pub-c-xxx',
  subscribeKey: 'sub-c-xxx',
  userId: 'user123',
  authKey: clientToken  // Token with write permission
});

// Publish succeeds (has write permission)
await pubnub.publish({
  channel: 'vote-submit.session_abc',
  message: voteMessage
});

// Publish fails with 403 (no write permission)
await pubnub.publish({
  channel: 'vote-results.session_abc',  // Server-only channel
  message: resultsMessage  // 403 Forbidden
});
```

### Server-Side Publishing

```javascript
// Server SDK with secretKey (unrestricted)
const serverPubNub = new PubNub({
  publishKey: 'pub-c-xxx',
  subscribeKey: 'sub-c-xxx',
  secretKey: 'sec-c-xxx',  // Full access
  userId: 'server-backend'
});

// Server can publish to any channel
await serverPubNub.publish({
  channel: 'vote-results.session_abc',
  message: authoritativeResults  // Server is source of truth
});
```

## Message Design Checklist

Before publishing, verify:

- [ ] Message includes `type` field (dot-notation format)
- [ ] Message includes `schemaVersion` field
- [ ] Message includes `eventId` field (unique identifier)
- [ ] Message includes `ts` field (client timestamp)
- [ ] Payload is under 30 KiB
- [ ] Payload structure is flat (1-2 levels)
- [ ] Field names use camelCase
- [ ] No sensitive data in payload (or using encryption)
- [ ] Channel name follows `[channelType].[channelId]` pattern
- [ ] Channel depth is 2 levels (for Function binding)
- [ ] Access Manager token grants `write` permission
- [ ] Schema version is documented

## Summary

Key takeaways from Message Design:

- **Four required fields**: `type`, `schemaVersion`, `eventId`, `ts`
- **Schema versioning**: Minor for additive, Major for breaking
- **Channel naming**: `[channelType].[channelId]` pattern (2 levels)
- **Function binding**: Only works at second level (`foo.*`)
- **Access Manager**: Requires `write` permission to publish
- **Best practices**: Flat payloads, camelCase, minimal data

---

**Next**: [03. Advanced Publish](./03-advanced-publish.md) - Performance optimization, Signals, encryption, and troubleshooting.

**Lab**: [Lab 2: Message Patterns](./labs/lab-02-message-patterns.md) - Practice designing message schemas and channel naming.
