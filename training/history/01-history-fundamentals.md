# History Fundamentals

## Introduction

Message Persistence (commonly called "History") stores published messages for later retrieval. Unlike real-time message delivery through Subscribe, history provides durable storage and replay capabilities for messages that have already been published.

This document covers the essential concepts every Solution Architect needs to know about retrieving and managing message history.

## What is Message Persistence?

**Message Persistence** is PubNub's service for storing published messages in a queryable database. Messages can be retrieved later using the Fetch or History APIs, enabling patterns like:

- Chat history on join
- Offline message catch-up
- Audit trails and compliance logging
- Message replay for debugging

### Key Characteristics

| Characteristic | Description |
|----------------|-------------|
| **Storage trigger** | Automatic when `storeInHistory: true` (default if enabled on keyset) |
| **Retrieval method** | Fetch API (`fetchMessages()`, `messageCounts()`) |
| **Ordering** | By timetoken (server timestamp) |
| **Retention** | Configurable: 1 day to unlimited |
| **Query interface** | Timetoken-based range queries |

### When to Use Message Persistence

Use Message Persistence when you need to:

- **Display chat history** when users join channels
- **Catch up on missed messages** after reconnection or being offline
- **Provide audit trails** for compliance (votes, transactions, support chats)
- **Enable message search** within channels
- **Replay events** for debugging or analysis

### When NOT to Use Message Persistence

Don't store messages for:

- **Ephemeral data** (typing indicators, cursor positions, presence heartbeats)
- **High-frequency updates** (real-time sensor data that changes constantly)
- **Temporary states** (in-progress calculations, UI state)
- **Publish verification** (use timetoken response instead - more on this later)

## Storage Configuration

### Keyset-Level Retention

Retention is configured per keyset in the Admin Portal:

**Available Retention Periods:**
- 1 day (Free tier)
- 7 days (Free tier default for test keysets)
- 30 days (Paid)
- 3 months (Paid)
- 6 months (Paid)
- 1 year (Paid)
- Unlimited (Paid)

**Important**: Retention settings are **immutable per message**. If you change retention from 7 days to 30 days, existing messages keep their original 7-day retention. Only new messages get 30-day retention.

### Publish-Time Storage Control

Control storage on a per-message basis:

```javascript
// Store message (uses keyset retention)
await pubnub.publish({
  channel: 'chat.room123',
  message: chatMessage,
  storeInHistory: true  // Default if persistence enabled on keyset
});

// Don't store message (ephemeral)
await pubnub.publish({
  channel: 'typing.room123',
  message: typingIndicator,
  storeInHistory: false  // Real-time only, not stored
});
```

### Per-Message TTL Override

Override keyset retention for individual messages:

```javascript
// Short-lived: 1 hour (60 minutes)
await pubnub.publish({
  channel: 'session.alerts',
  message: { text: 'Session expiring soon' },
  storeInHistory: true,
  ttl: 60
});

// Medium-lived: 24 hours (1440 minutes)
await pubnub.publish({
  channel: 'chat.room123',
  message: { text: 'Hello!' },
  storeInHistory: true,
  ttl: 1440
});

// Use keyset default retention
await pubnub.publish({
  channel: 'chat.room123',
  message: { text: 'Default retention' },
  storeInHistory: true,
  ttl: 0  // 0 = use keyset default
});
```

**TTL Units**: Minutes (not seconds or milliseconds)

## What Gets Stored

Not all message types are stored in history:

| Message Type | Stored? | Description |
|--------------|---------|-------------|
| **Regular messages (type 0)** | Yes | Standard publish messages |
| **Signals (type 1)** | No | Ephemeral, 64-byte limit messages |
| **App Context events (type 2)** | No | UUID/Channel metadata changes |
| **Message Actions (type 3)** | Yes | Reactions, read receipts, etc. |
| **File messages (type 4)** | Yes | File upload metadata |

**Key Takeaway**: If you use Signals for high-frequency indicators (typing, cursors), they won't appear in history—this is by design.

## Fetching Message History

### Basic Fetch API

The `fetchMessages()` method retrieves stored messages:

```javascript
// Fetch last 25 messages (default count)
const result = await pubnub.fetchMessages({
  channels: ['chat.room123']
});

// Access messages
const messages = result.channels['chat.room123'];
messages.forEach(msg => {
  console.log(msg.timetoken, msg.message);
});
```

### Fetch with Count

```javascript
// Fetch last 50 messages
const result = await pubnub.fetchMessages({
  channels: ['chat.room123'],
  count: 50  // 1-100 for single channel
});
```

### Fetch Limits (MCP-Verified)

| Scenario | Limit | Notes |
|----------|-------|-------|
| **Single channel** | 100 messages per call | Specify `count: 100` |
| **Multi-channel** | 25 messages per channel | Up to 500 channels total |
| **Pagination** | Unlimited (via timetoken cursor) | Fetch in batches |

### Response Structure

```javascript
{
  channels: {
    'chat.room123': [
      {
        message: {
          type: 'chat.message',
          schemaVersion: '1.0',
          eventId: 'msg_123',
          ts: 1706889600000,
          payload: { text: 'Hello!' }
        },
        timetoken: '17069876543210000',
        messageType: 0,
        uuid: 'user456'
      },
      // ... more messages
    ]
  }
}
```

**Key Fields:**
- `message` - The published message content
- `timetoken` - Server timestamp (17 digits)
- `messageType` - Type indicator (0=regular, 3=action, 4=file)
- `uuid` - Publisher's user ID

### Timetoken-Based Range Queries

Fetch messages between specific times:

```javascript
// Get messages between two timetokens
const result = await pubnub.fetchMessages({
  channels: ['chat.room123'],
  start: '17069000000000000',  // Older timetoken (exclusive)
  end: '17069876543210000',    // Newer timetoken (inclusive)
  count: 100
});
```

**Timetoken Direction:**
- `start` - Older timetoken (beginning of range, exclusive)
- `end` - Newer timetoken (end of range, inclusive)
- Messages returned are ordered oldest to newest

### Multi-Channel Fetch

Retrieve history from multiple channels in one API call:

```javascript
const result = await pubnub.fetchMessages({
  channels: ['chat.room1', 'chat.room2', 'chat.room3'],
  count: 25  // 25 messages per channel (max)
});

// Access per-channel results
const room1Messages = result.channels['chat.room1'] || [];
const room2Messages = result.channels['chat.room2'] || [];
const room3Messages = result.channels['chat.room3'] || [];
```

**Multi-Channel Limits:**
- 25 messages per channel
- Up to 500 channels per call
- Each channel gets its own 25-message allocation

## Message Counts API

Get unread counts without fetching full messages:

```javascript
// Count messages since a specific timetoken
const counts = await pubnub.messageCounts({
  channels: ['chat.room1', 'chat.room2', 'inbox.user123'],
  channelTimetokens: [
    '17069000000000000',  // Last seen in room1
    '17069100000000000',  // Last seen in room2
    '17069200000000000'   // Last seen in inbox
  ]
});

console.log(counts.channels);
// {
//   'chat.room1': 15,
//   'chat.room2': 3,
//   'inbox.user123': 42
// }
```

**Use Cases:**
- Badge counts (unread message indicators)
- Notification counts
- Determining if catch-up is needed

**Limits:**
- Up to 100 channels per call
- Returns only counts, not message content
- More efficient than fetching full messages

## Critical Concept: Storage Propagation Timing

### The Problem

Published messages are **not immediately available** in history. There is a propagation delay between when a message is published and when it appears in queryable storage.

**Propagation Time:**
- Typically: 10-500 milliseconds
- Can vary: Network conditions, geographic distribution, load
- Not guaranteed: Eventually consistent, not immediate

### Why This Matters

Many developers try to verify a publish succeeded by immediately fetching history:

```javascript
// ❌ WRONG: This will usually fail
const publishResult = await pubnub.publish({
  channel: 'chat.room123',
  message: myMessage,
  storeInHistory: true
});

// Immediately try to fetch
const history = await pubnub.fetchMessages({
  channels: ['chat.room123'],
  count: 1
});

// Message often NOT found yet!
console.log(history.channels['chat.room123']);  // Might be empty or missing your message
```

### The Right Approach

**Trust the timetoken response from publish:**

```javascript
// ✅ CORRECT: Timetoken IS your confirmation
const result = await pubnub.publish({
  channel: 'chat.room123',
  message: myMessage,
  storeInHistory: true
});

console.log('✅ Published successfully:', result.timetoken);
// This timetoken IS proof the message was published and will be stored
// Don't check history to verify!
```

### Common Misconceptions

**Misconception 1**: "If I use async/await, the message will be in history"
- **Reality**: Propagation is independent of async/await timing
- **Result**: Sometimes works, sometimes doesn't—unreliable

**Misconception 2**: "I'll add a 1-2 second delay, then fetch"
- **Reality**: This usually works but is impractical
- **Problem**: Delays block execution, poor user experience, not production-ready

**Misconception 3**: "History fetch failing means publish failed"
- **Reality**: Publish succeeded, storage propagation just hasn't completed
- **Result**: False negative—message is published and will appear in history soon

### What History IS For

Message Persistence is designed for:
1. **Catch-up on join** - Load previous messages when entering a channel
2. **Offline sync** - Retrieve messages missed while disconnected
3. **Audit trails** - Review historical conversations or events
4. **Message replay** - Debugging, compliance, analytics

Message Persistence is **NOT** designed for:
- Publish verification (use timetoken response)
- Immediate post-publish validation
- Real-time confirmation

This concept is explored hands-on in [Lab 1: Exercise 3](./labs/lab-01-basic-history.md#exercise-3-publish-history-timing-critical).

## Common Patterns

### Pattern 1: History on Join

Most common pattern for chat applications:

```javascript
async function joinChatRoom(roomId) {
  const channel = `chat.${roomId}`;
  
  // Step 1: Fetch recent history
  console.log('Loading history...');
  const history = await pubnub.fetchMessages({
    channels: [channel],
    count: 50
  });
  
  // Step 2: Display historical messages
  const messages = history.channels[channel] || [];
  messages.forEach(msg => {
    displayMessage(msg.message, { isHistorical: true });
  });
  
  // Step 3: Subscribe for new real-time messages
  pubnub.subscribe({ channels: [channel] });
  
  // Step 4: Set up listener for incoming messages
  pubnub.addListener({
    message: (event) => {
      if (event.channel === channel) {
        displayMessage(event.message, { isHistorical: false });
      }
    }
  });
  
  console.log('✅ Joined room with history');
}
```

### Pattern 2: Offline Catch-Up

Retrieve messages missed while offline:

```javascript
async function catchUpAfterReconnect(channel, lastSeenTimetoken) {
  // Fetch all messages since last seen
  const result = await pubnub.fetchMessages({
    channels: [channel],
    start: lastSeenTimetoken,  // Start from last seen (exclusive)
    count: 100
  });
  
  const missedMessages = result.channels[channel] || [];
  console.log(`Caught up on ${missedMessages.length} missed messages`);
  
  // Process missed messages
  missedMessages.forEach(msg => {
    processMessage(msg.message);
  });
  
  // Update last seen
  if (missedMessages.length > 0) {
    const latestTimetoken = missedMessages[missedMessages.length - 1].timetoken;
    saveLastSeenTimetoken(channel, latestTimetoken);
  }
}
```

### Pattern 3: Unread Badge Counts

Show unread message counts efficiently:

```javascript
async function updateUnreadCounts(userId) {
  // Get user's channels
  const channels = await getUserChannels(userId);
  
  // Get last seen timetokens
  const lastSeen = await getLastSeenTimetokens(userId, channels);
  
  // Fetch counts (not full messages)
  const counts = await pubnub.messageCounts({
    channels: channels,
    channelTimetokens: channels.map(ch => lastSeen[ch] || '0')
  });
  
  // Update UI badges
  Object.entries(counts.channels).forEach(([channel, count]) => {
    updateBadge(channel, count);
  });
}
```

### Pattern 4: Audit Trail

Retrieve complete message history for compliance:

```javascript
async function exportChannelHistory(channel, startDate, endDate) {
  const allMessages = [];
  let start = dateToTimetoken(startDate);
  const end = dateToTimetoken(endDate);
  
  while (start < end) {
    const result = await pubnub.fetchMessages({
      channels: [channel],
      start: start,
      end: end,
      count: 100
    });
    
    const messages = result.channels[channel] || [];
    if (messages.length === 0) break;
    
    allMessages.push(...messages);
    
    // Move cursor to oldest message in batch
    start = messages[messages.length - 1].timetoken;
  }
  
  return allMessages;
}

function dateToTimetoken(date) {
  return String(date.getTime() * 10000);
}
```

## Store Decision Matrix

When should messages be stored vs kept ephemeral?

| Use Case | Store? | Retention | Rationale |
|----------|--------|-----------|-----------|
| **Chat messages** | Yes | 7-30 days | History on join, search |
| **Typing indicators** | No | N/A | Ephemeral only, no replay value |
| **Vote submissions** | Yes | Unlimited | Audit trail, compliance |
| **Vote results** | Yes | 30-90 days | Historical record |
| **Cursor positions** | No | N/A | Real-time only |
| **System alerts** | Yes | 1 year+ | Compliance, debugging |
| **Presence updates** | No | N/A | Use Presence service |
| **Game moves** | Yes | 30 days | Replay capability |
| **Session tokens** | No | N/A | Security—never store |
| **Notifications** | Yes | 7-30 days | Offline catch-up |

## Performance Considerations

### Fetch Latency

Typical latency for history retrieval:

| Scenario | Typical Latency |
|----------|----------------|
| Single channel, 25 messages | 50-150ms |
| Single channel, 100 messages | 100-250ms |
| Multi-channel (10 channels) | 150-300ms |
| With message actions | +20-50ms |

### Optimization Tips

1. **Fetch only what you need** - Use `count` parameter appropriately
2. **Use message counts for badges** - Don't fetch full messages just for counts
3. **Cache history locally** - Reduce redundant API calls
4. **Paginate efficiently** - Don't fetch entire history at once
5. **Consider retention costs** - Unlimited retention costs more than 30 days

## Error Handling

### Common Errors

```javascript
try {
  const result = await pubnub.fetchMessages({
    channels: ['chat.room123'],
    count: 100
  });
} catch (error) {
  const statusCode = error.status?.statusCode;
  
  if (statusCode === 403) {
    console.error('Forbidden: Check Access Manager permissions');
    // Need 'read' permission for history
    
  } else if (statusCode === 400) {
    console.error('Bad Request: Check parameters');
    // Invalid timetoken format or count > 100
    
  } else {
    console.error('Fetch failed:', error.message);
  }
}
```

### Best Practices

1. **Always handle empty results** - `result.channels[channelName]` might be undefined
2. **Validate timetokens** - Ensure 17-digit format
3. **Check retention settings** - Messages older than retention won't be returned
4. **Handle Access Manager** - Ensure users have `read` permission
5. **Log fetch attempts** - For debugging pagination issues

## Summary

Key takeaways from History Fundamentals:

- **Message Persistence** stores published messages for later retrieval
- **Retention** ranges from 1 day to unlimited (configured per keyset)
- **fetchMessages()** retrieves up to 100 messages (single channel) or 25 per channel (multi-channel)
- **messageCounts()** gets unread counts without fetching full messages
- **Storage propagation** means messages aren't immediately available after publish
- **Timetoken response** from publish IS your confirmation—don't verify via history
- **History is for replay** - catch-up on join, offline sync, audit trails
- **Not all message types** are stored (Signals, App Context events are not)

---

**Next**: [02. Message Actions](./02-message-actions.md) - Learn about reactions, read receipts, and soft deletes

**Lab**: [Lab 1: Basic History](./labs/lab-01-basic-history.md) - Practice fetching history and understand storage timing
