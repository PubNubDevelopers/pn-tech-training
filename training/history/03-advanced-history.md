# Advanced History

## Introduction

This document covers advanced Message Persistence topics including efficient pagination strategies, multi-channel retrieval optimization, delete operations, gap filling on reconnect, and cost considerations for production deployments.

## Pagination Strategies

### Understanding Timetoken-Based Pagination

Unlike offset-based pagination (page 1, page 2), PubNub uses **cursor-based pagination** with timetokens. This provides:

- **Consistent results** - New messages don't shift pages
- **Efficient queries** - Database can use indexes
- **Precise positioning** - Start from any point in time

### Basic Pagination Pattern

```javascript
async function fetchAllMessages(channel) {
  const allMessages = [];
  let start = null;  // Start from most recent
  
  while (true) {
    const result = await pubnub.fetchMessages({
      channels: [channel],
      count: 100,
      start: start  // Cursor for pagination
    });
    
    const messages = result.channels[channel] || [];
    
    if (messages.length === 0) {
      break;  // No more messages
    }
    
    allMessages.push(...messages);
    
    // Move cursor to oldest message in this batch
    start = messages[messages.length - 1].timetoken;
    
    console.log(`Fetched ${messages.length} messages, total: ${allMessages.length}`);
  }
  
  return allMessages;
}
```

### Pagination Direction

**Forward Pagination** (oldest to newest):

```javascript
async function paginateForward(channel, startTimetoken) {
  const result = await pubnub.fetchMessages({
    channels: [channel],
    start: startTimetoken,  // Start AFTER this timetoken (exclusive)
    count: 100
  });
  
  // Messages are ordered oldest to newest
  return result.channels[channel] || [];
}
```

**Backward Pagination** (newest to oldest):

```javascript
async function paginateBackward(channel, endTimetoken) {
  const result = await pubnub.fetchMessages({
    channels: [channel],
    end: endTimetoken,  // End BEFORE this timetoken (exclusive)
    count: 100
  });
  
  // Messages still ordered oldest to newest
  // Reverse if you want newest first
  const messages = result.channels[channel] || [];
  return messages.reverse();
}
```

### Bounded Pagination

Fetch messages within a specific time range:

```javascript
async function fetchMessagesBetween(channel, startTimetoken, endTimetoken) {
  const allMessages = [];
  let cursor = startTimetoken;
  
  while (cursor < endTimetoken) {
    const result = await pubnub.fetchMessages({
      channels: [channel],
      start: cursor,
      end: endTimetoken,
      count: 100
    });
    
    const messages = result.channels[channel] || [];
    if (messages.length === 0) break;
    
    allMessages.push(...messages);
    
    // Move cursor
    cursor = messages[messages.length - 1].timetoken;
  }
  
  return allMessages;
}

// Usage: Fetch today's messages
const startOfDay = dateToTimetoken(new Date().setHours(0, 0, 0, 0));
const endOfDay = dateToTimetoken(new Date().setHours(23, 59, 59, 999));
const todayMessages = await fetchMessagesBetween('chat.room123', startOfDay, endOfDay);
```

### Incremental Loading (Infinite Scroll)

Load messages incrementally as user scrolls:

```javascript
class MessageHistory {
  constructor(channel, pubnub) {
    this.channel = channel;
    this.pubnub = pubnub;
    this.messages = [];
    this.oldestTimetoken = null;
    this.hasMore = true;
  }
  
  async loadMore(count = 50) {
    if (!this.hasMore) {
      console.log('No more messages');
      return [];
    }
    
    const result = await this.pubnub.fetchMessages({
      channels: [this.channel],
      count: count,
      start: this.oldestTimetoken
    });
    
    const newMessages = result.channels[this.channel] || [];
    
    if (newMessages.length === 0) {
      this.hasMore = false;
      return [];
    }
    
    // Prepend to messages array (older messages go first)
    this.messages = [...newMessages, ...this.messages];
    
    // Update cursor
    this.oldestTimetoken = newMessages[newMessages.length - 1].timetoken;
    
    // Check if we got fewer than requested
    if (newMessages.length < count) {
      this.hasMore = false;
    }
    
    return newMessages;
  }
  
  getMessages() {
    return this.messages;
  }
}

// Usage
const history = new MessageHistory('chat.room123', pubnub);

// Load initial batch
await history.loadMore(50);

// User scrolls up - load more
await history.loadMore(50);

// Check if more available
if (history.hasMore) {
  console.log('Can load more messages');
}
```

## Multi-Channel Retrieval

### Fetching Multiple Channels

Retrieve history from multiple channels in a single API call:

```javascript
const result = await pubnub.fetchMessages({
  channels: [
    'chat.room1',
    'chat.room2',
    'chat.room3',
    'notifications.user123',
    'alerts.system'
  ],
  count: 25  // 25 messages per channel (max for multi-channel)
});

// Access per-channel results
Object.keys(result.channels).forEach(channel => {
  const messages = result.channels[channel] || [];
  console.log(`${channel}: ${messages.length} messages`);
});
```

**Multi-Channel Limits:**
- Maximum 500 channels per call
- 25 messages per channel (vs 100 for single channel)
- Total response may be large (500 channels × 25 messages = 12,500 messages max)

### Multi-Channel with Pagination

Paginate across multiple channels:

```javascript
async function fetchAllFromMultipleChannels(channels) {
  const allResults = {};
  
  // Initialize result structure
  channels.forEach(ch => {
    allResults[ch] = [];
  });
  
  let cursors = {};  // Track cursor per channel
  let hasMore = true;
  
  while (hasMore) {
    // Build start parameter (oldest timetoken per channel)
    const channelTimetokens = channels.map(ch => cursors[ch] || null);
    
    const result = await pubnub.fetchMessages({
      channels: channels,
      count: 25,
      // Note: Multi-channel pagination is complex, consider single-channel batching
    });
    
    hasMore = false;
    
    channels.forEach(channel => {
      const messages = result.channels[channel] || [];
      
      if (messages.length > 0) {
        allResults[channel].push(...messages);
        cursors[channel] = messages[messages.length - 1].timetoken;
        hasMore = true;  // At least one channel has more
      }
    });
  }
  
  return allResults;
}
```

**Recommendation**: For heavy pagination across multiple channels, consider fetching channels sequentially rather than in parallel to avoid complexity.

### Prioritized Multi-Channel Fetch

Fetch from high-priority channels first:

```javascript
async function fetchWithPriority(channelGroups) {
  const results = {};
  
  // channelGroups = [
  //   { priority: 1, channels: ['inbox.user123', 'mentions.user123'] },
  //   { priority: 2, channels: ['chat.room1', 'chat.room2'] },
  //   { priority: 3, channels: ['notifications.system'] }
  // ]
  
  for (const group of channelGroups.sort((a, b) => a.priority - b.priority)) {
    const result = await pubnub.fetchMessages({
      channels: group.channels,
      count: 25
    });
    
    Object.assign(results, result.channels);
  }
  
  return results;
}
```

## Delete Operations

### Soft Delete (Recommended)

Use message actions for soft delete (covered in detail in [02. Message Actions](./02-message-actions.md)):

```javascript
// Mark as deleted
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'deleted',
    value: 'true'
  }
});
```

**Advantages:**
- Reversible
- Fast
- No special permissions
- Preserves audit trail

### Hard Delete API

Permanently remove messages from storage:

```javascript
// Requires secretKey initialization
const serverPubNub = new PubNub({
  publishKey: 'pub-c-xxx',
  subscribeKey: 'sub-c-xxx',
  secretKey: process.env.SECRET_KEY,  // Required for delete
  userId: 'server'
});

// Delete messages in a time range
await serverPubNub.deleteMessages({
  channel: 'chat.room123',
  start: '17069000000000000',  // Older timetoken
  end: '17069876543210000'     // Newer timetoken
});
```

**Requirements:**
- Enable "Delete-From-History" in Admin Portal
- SDK must be initialized with `secretKey`
- Server-side operation only (never expose secret key to clients)

**When to Use Hard Delete:**
- Legal/compliance requirements (GDPR, data retention policies)
- Removing illegal/harmful content
- Reducing storage costs
- Cleaning up test/development data

**When NOT to Use Hard Delete:**
- Regular message deletion (use soft delete)
- User-initiated delete (reversibility needed)
- Frequent operations (performance impact)

### Batch Delete Pattern

Delete multiple message ranges:

```javascript
async function batchDelete(channel, timetokenRanges) {
  const deletePromises = timetokenRanges.map(range =>
    serverPubNub.deleteMessages({
      channel: channel,
      start: range.start,
      end: range.end
    })
  );
  
  await Promise.all(deletePromises);
  console.log(`Deleted ${timetokenRanges.length} ranges`);
}

// Usage: Delete old messages (older than 90 days)
const ninetyDaysAgo = dateToTimetoken(
  new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
);

await batchDelete('chat.room123', [
  { start: '0', end: ninetyDaysAgo }
]);
```

### Delete by Message Type

Delete specific message types:

```javascript
async function deleteMessagesByType(channel, messageType) {
  // 1. Fetch all messages
  const allMessages = await fetchAllMessages(channel);
  
  // 2. Find messages of specific type
  const toDelete = allMessages.filter(
    msg => msg.message.type === messageType
  );
  
  // 3. Group into timetoken ranges for efficient deletion
  const ranges = groupIntoRanges(toDelete.map(m => m.timetoken));
  
  // 4. Delete each range
  for (const range of ranges) {
    await serverPubNub.deleteMessages({
      channel: channel,
      start: range.start,
      end: range.end
    });
  }
  
  console.log(`Deleted ${toDelete.length} messages of type ${messageType}`);
}

function groupIntoRanges(timetokens, maxGap = 100000000) {
  const sorted = timetokens.sort();
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    if (parseInt(sorted[i]) - parseInt(end) < maxGap) {
      end = sorted[i];
    } else {
      ranges.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  
  ranges.push({ start, end });
  return ranges;
}
```

## Gap Filling on Reconnect

### Detecting Gaps

When a client reconnects after being offline, detect missed messages:

```javascript
class HistoryGapFiller {
  constructor(pubnub) {
    this.pubnub = pubnub;
    this.lastSeenTimetokens = {};  // channel -> timetoken
  }
  
  recordPosition(channel, timetoken) {
    this.lastSeenTimetokens[channel] = timetoken;
  }
  
  async fillGap(channel) {
    const lastSeen = this.lastSeenTimetokens[channel];
    
    if (!lastSeen) {
      console.log('No previous position, fetching recent history');
      return this.fetchRecent(channel);
    }
    
    // Fetch all messages since last seen
    const missedMessages = await this.fetchSince(channel, lastSeen);
    
    console.log(`Filled gap: ${missedMessages.length} missed messages`);
    return missedMessages;
  }
  
  async fetchSince(channel, sinceTimetoken) {
    const allMessages = [];
    let start = sinceTimetoken;
    
    while (true) {
      const result = await this.pubnub.fetchMessages({
        channels: [channel],
        start: start,
        count: 100
      });
      
      const messages = result.channels[channel] || [];
      if (messages.length === 0) break;
      
      allMessages.push(...messages);
      start = messages[messages.length - 1].timetoken;
    }
    
    return allMessages;
  }
  
  async fetchRecent(channel, count = 50) {
    const result = await this.pubnub.fetchMessages({
      channels: [channel],
      count: count
    });
    
    return result.channels[channel] || [];
  }
}

// Usage
const gapFiller = new HistoryGapFiller(pubnub);

// When receiving messages, record position
pubnub.addListener({
  message: (event) => {
    gapFiller.recordPosition(event.channel, event.timetoken);
    processMessage(event.message);
  }
});

// On reconnect
pubnub.addListener({
  status: async (statusEvent) => {
    if (statusEvent.category === 'PNReconnectedCategory') {
      const channels = pubnub.getSubscribedChannels();
      
      for (const channel of channels) {
        const missedMessages = await gapFiller.fillGap(channel);
        missedMessages.forEach(msg => processMessage(msg.message));
      }
    }
  }
});
```

### Optimized Gap Filling

Fill gaps only when necessary:

```javascript
async function smartGapFill(channel, lastSeen) {
  // First, check how many messages we missed
  const counts = await pubnub.messageCounts({
    channels: [channel],
    channelTimetokens: [lastSeen]
  });
  
  const missedCount = counts.channels[channel] || 0;
  
  if (missedCount === 0) {
    console.log('No missed messages');
    return [];
  }
  
  if (missedCount <= 100) {
    // Can fetch in single request
    const result = await pubnub.fetchMessages({
      channels: [channel],
      start: lastSeen,
      count: 100
    });
    return result.channels[channel] || [];
  } else {
    // Need pagination
    console.log(`${missedCount} missed messages, paginating...`);
    return fetchAllSince(channel, lastSeen);
  }
}
```

## Performance Optimization

### Caching Strategies

Reduce API calls by caching history:

```javascript
class CachedHistory {
  constructor(pubnub, cacheDuration = 60000) {
    this.pubnub = pubnub;
    this.cache = new Map();
    this.cacheDuration = cacheDuration;
  }
  
  async fetch(channel, count = 50) {
    const cacheKey = `${channel}_${count}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      console.log('Cache hit');
      return cached.messages;
    }
    
    console.log('Cache miss, fetching...');
    const result = await this.pubnub.fetchMessages({
      channels: [channel],
      count: count
    });
    
    const messages = result.channels[channel] || [];
    
    this.cache.set(cacheKey, {
      messages: messages,
      timestamp: Date.now()
    });
    
    return messages;
  }
  
  invalidate(channel) {
    // Remove all cache entries for channel
    for (const key of this.cache.keys()) {
      if (key.startsWith(channel)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### Lazy Loading

Load history only when needed:

```javascript
class LazyHistory {
  constructor(channel, pubnub) {
    this.channel = channel;
    this.pubnub = pubnub;
    this.loaded = false;
    this.messages = [];
  }
  
  async ensureLoaded() {
    if (this.loaded) return;
    
    const result = await this.pubnub.fetchMessages({
      channels: [this.channel],
      count: 50
    });
    
    this.messages = result.channels[this.channel] || [];
    this.loaded = true;
  }
  
  async getMessages() {
    await this.ensureLoaded();
    return this.messages;
  }
}

// Usage: History loaded on demand
const history = new LazyHistory('chat.room123', pubnub);

// First access triggers load
const messages = await history.getMessages();

// Subsequent access uses cached data
const sameMessages = await history.getMessages();  // No API call
```

### Batching Requests

Batch multiple channel fetches:

```javascript
async function batchFetch(channels, batchSize = 50) {
  const results = {};
  
  // Process in batches
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    
    const result = await pubnub.fetchMessages({
      channels: batch,
      count: 25
    });
    
    Object.assign(results, result.channels);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < channels.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}
```

## Cost Considerations

### Transaction Costs

Understanding what counts as a transaction:

| Operation | Transaction Count | Notes |
|-----------|-------------------|-------|
| `fetchMessages()` (single channel) | 1 transaction | Regardless of count |
| `fetchMessages()` (multi-channel) | 1 transaction per channel | 10 channels = 10 transactions |
| `messageCounts()` | 1 transaction | Regardless of channel count |
| `addMessageAction()` | 1 transaction | Per action |
| `removeMessageAction()` | 1 transaction | Per action |
| `deleteMessages()` | 1 transaction | Per API call |

### Optimization for Cost

```javascript
// ❌ EXPENSIVE: Fetching history on every page load
async function showChat() {
  const history = await pubnub.fetchMessages({
    channels: ['chat.room123'],
    count: 50
  });  // 1 transaction per page load
  
  displayMessages(history.channels['chat.room123']);
}

// ✅ CHEAPER: Cache and reuse
const historyCache = new Map();

async function showChatOptimized(channel) {
  if (historyCache.has(channel)) {
    displayMessages(historyCache.get(channel));
    return;
  }
  
  const history = await pubnub.fetchMessages({
    channels: [channel],
    count: 50
  });  // 1 transaction, but cached
  
  historyCache.set(channel, history.channels[channel]);
  displayMessages(history.channels[channel]);
}
```

### Storage Costs

Retention affects storage costs:

- 1-7 days: Lower cost
- 30 days: Moderate cost
- 3-12 months: Higher cost
- Unlimited: Highest cost

**Recommendation**: Choose retention based on actual needs, not "just in case."

## Helper Utilities

### Timetoken Conversion

```javascript
// Convert Date to timetoken
function dateToTimetoken(date) {
  return String(date.getTime() * 10000);
}

// Convert timetoken to Date
function timetokenToDate(timetoken) {
  return new Date(parseInt(timetoken) / 10000);
}

// Get current timetoken
function nowTimetoken() {
  return dateToTimetoken(new Date());
}

// Usage
const startOfToday = dateToTimetoken(new Date().setHours(0, 0, 0, 0));
const messageDate = timetokenToDate('17069876543210000');
console.log(messageDate);  // 2024-02-02T12:34:56.321Z
```

### Message Filtering

```javascript
// Filter messages by type
function filterByType(messages, type) {
  return messages.filter(msg => msg.message.type === type);
}

// Filter messages by date range
function filterByDateRange(messages, startDate, endDate) {
  const start = dateToTimetoken(startDate);
  const end = dateToTimetoken(endDate);
  
  return messages.filter(msg => {
    const tt = msg.timetoken;
    return tt >= start && tt <= end;
  });
}

// Filter messages by user
function filterByUser(messages, userId) {
  return messages.filter(msg => msg.uuid === userId);
}
```

## Summary

Key takeaways from Advanced History:

- **Pagination** - Use timetoken-based cursors for efficient pagination
- **Multi-channel** - Fetch up to 500 channels, 25 messages each
- **Soft delete preferred** - Use message actions for reversible deletion
- **Hard delete** - Requires secretKey, use for compliance/legal requirements
- **Gap filling** - Fetch missed messages after reconnect using last seen timetoken
- **Cache strategically** - Reduce API calls and costs
- **Batch requests** - Process multiple channels efficiently
- **Monitor costs** - Transactions and storage scale with usage

---

**Previous**: [02. Message Actions](./02-message-actions.md) - Reactions, read receipts, soft delete

**Labs**: Practice these concepts:
- [Lab 1: Basic History](./labs/lab-01-basic-history.md) - Fetching and pagination
- [Lab 2: Message Actions](./labs/lab-02-message-actions.md) - Actions and soft delete
