# Channel Patterns

## Introduction

PubNub provides several powerful patterns for subscribing to channels efficiently: single channel, multi-channel, wildcard subscriptions, channel groups, and client-side filtering. Understanding when and how to use each pattern is essential for building scalable real-time applications.

This document covers channel subscription strategies and their trade-offs.

## Channel Naming Conventions

Before exploring subscription patterns, let's review channel naming best practices.

### Standard Naming Pattern

**Format:** `[channelType].[channelID]`

**Examples:**
```
chat.room123
vote.session456
inbox.user789
group.event123.room456
```

### Channel Naming Rules

| Rule | Description | Example |
|------|-------------|---------|
| **ASCII only** | Use only ASCII characters | `chat.room123` ✅, `chat.room123✨` ❌ |
| **Dot separator** | Use `.` after type prefix for wildcard support | `chat.room123` ✅ |
| **Composable IDs** | Can combine multiple entities | `group.event123.room456` |
| **Depth limit** | Wildcards work only at 2nd level | `chat.*` ✅, `chat.room.*` ❌ |
| **Max length** | 2,048 characters total | Practical limit ~100 chars |

### Why the Dot Separator Matters

```javascript
// ✅ CORRECT: Dot after prefix enables wildcards
'chat.room123'  → Can subscribe to 'chat.*'

// ❌ WRONG: No dot separator
'chatroom123'   → Cannot use wildcards

// ✅ CORRECT: Multi-level with dots
'group.event123.room456'  → Can subscribe to 'group.*'
```

**Key Insight:** Always use `.` after the channel type to enable wildcard subscriptions and Function bindings.

## Single Channel Subscribe

The simplest subscription pattern.

### Basic Example

```javascript
// Subscribe to one channel
pubnub.subscribe({
  channels: ['chat.room123']
});

// Listener handles messages
pubnub.addListener({
  message: (event) => {
    console.log('Message from', event.channel);
    console.log('Content:', event.message);
  }
});
```

### REST API

```
GET https://ps.pndsn.com/v2/subscribe/sub-c-xxx/chat.room123/0?tt=0&uuid=user123
```

### When to Use

- Simple use cases with one active conversation
- Focused subscriptions (e.g., user's inbox)
- Testing and development

### Limitations

- Must subscribe/unsubscribe for each channel separately
- Managing many channels requires multiple subscribe calls
- No aggregation benefits

## Multi-Channel Subscribe

Subscribe to multiple channels in a single request.

### Basic Example

```javascript
// Subscribe to multiple channels at once
pubnub.subscribe({
  channels: [
    'chat.room123',
    'chat.room456',
    'notifications.user789',
    'alerts.system'
  ]
});

// Single listener receives messages from all channels
pubnub.addListener({
  message: (event) => {
    console.log('Message from', event.channel);
    
    // Route by channel
    if (event.channel.startsWith('chat.')) {
      handleChatMessage(event);
    } else if (event.channel.startsWith('notifications.')) {
      handleNotification(event);
    }
  }
});
```

### REST API

```
GET https://ps.pndsn.com/v2/subscribe/sub-c-xxx/chat.room123,chat.room456,alerts.system/0?tt=0&uuid=user123
                                                 |________________________________________|
                                                 Comma-separated channel list
```

### Dynamic Channel Management

```javascript
// Add channels to existing subscription
pubnub.subscribe({
  channels: ['chat.room789']  // Added to current subscription
});

// Remove specific channels
pubnub.unsubscribe({
  channels: ['chat.room123']  // Removed, others remain active
});

// Unsubscribe from all
pubnub.unsubscribeAll();
```

### When to Use

- User participates in multiple conversations
- Dashboard monitoring multiple data sources
- Applications with several active contexts

### Practical Limits

| Scenario | Recommended Limit | Notes |
|----------|-------------------|-------|
| **Mobile apps** | 10-20 channels | Battery and bandwidth considerations |
| **Web apps** | 30-50 channels | Single connection handles all |
| **High-performance** | 50-100 channels | Monitor connection stability |
| **Beyond 100** | Use channel groups | Better performance and management |

## Wildcard Subscribe

Subscribe to channels matching a pattern.

### Pattern Syntax

**Supported:** `channelType.*` (one level only)

```javascript
// Subscribe to all chat rooms
pubnub.subscribe({
  channels: ['chat.*']
});

// Receives messages from:
// - chat.room123
// - chat.room456
// - chat.roomABC
```

### Depth Limitation

**Important:** Wildcards only work at the **second level**.

```javascript
// ✅ WORKS: Second level wildcard
'chat.*'           → Matches chat.room123, chat.room456

// ❌ DOES NOT WORK: Third level wildcard
'chat.room.*'      → Will NOT match chat.room.thread123

// ✅ WORKS: Second level with multi-part IDs
'group.*'          → Matches group.event123, group.event123.room456
```

### Identifying Specific Channels

```javascript
pubnub.addListener({
  message: (event) => {
    console.log('Subscription:', event.subscription);  // "chat.*"
    console.log('Actual channel:', event.channel);     // "chat.room123"
    
    // Extract room ID
    const roomId = event.channel.split('.')[1];  // "room123"
    updateRoom(roomId, event.message);
  }
});
```

### Use Cases

| Use Case | Pattern | Benefit |
|----------|---------|---------|
| **Chat app** | `chat.*` | User joins/leaves rooms dynamically |
| **User notifications** | `inbox.*` | All inboxes for admin monitoring |
| **Event streams** | `events.*` | Subscribe to all event types |
| **Game lobbies** | `lobby.*` | Monitor all game lobbies |

### Limitations

1. **Depth:** Only works at second level
2. **Functions:** Wildcard limitations for Function binding (only 2 levels)
3. **Performance:** Receiving messages from many channels can impact performance
4. **No filtering:** Receives ALL messages from matching channels

### REST API

```
GET https://ps.pndsn.com/v2/subscribe/sub-c-xxx/chat.*/0?tt=0&uuid=user123
                                                 |_____|
                                                 Wildcard pattern
```

## Channel Groups

Server-side aggregation of channels into named groups.

### What are Channel Groups?

A **channel group** is a server-side collection of channel names that can be subscribed to as a unit.

**Benefits:**
- Subscribe to hundreds of channels with one subscription
- Dynamic membership (add/remove channels without resubscribing)
- Cleaner client code
- Better performance for large channel sets

### Creating Channel Groups

```javascript
// Add channels to a group
await pubnub.channelGroups.addChannels({
  channelGroup: 'user_123_channels',
  channels: [
    'chat.room1',
    'chat.room2',
    'notifications.user123',
    'inbox.user123'
  ]
});

console.log('✅ Channel group created');
```

### Subscribing to Channel Groups

```javascript
// Subscribe to channel group
pubnub.subscribe({
  channelGroups: ['user_123_channels']
});

// Listener receives messages from all channels in the group
pubnub.addListener({
  message: (event) => {
    console.log('Channel:', event.channel);              // Actual channel name
    console.log('Subscription:', event.subscription);    // Channel group name
  }
});
```

### Managing Channel Groups

```javascript
// Add more channels to existing group
await pubnub.channelGroups.addChannels({
  channelGroup: 'user_123_channels',
  channels: ['chat.room3']
});

// Remove channels from group
await pubnub.channelGroups.removeChannels({
  channelGroup: 'user_123_channels',
  channels: ['chat.room1']
});

// List channels in a group
const result = await pubnub.channelGroups.listChannels({
  channelGroup: 'user_123_channels'
});
console.log('Channels:', result.channels);

// Delete entire group
await pubnub.channelGroups.deleteGroup({
  channelGroup: 'user_123_channels'
});
```

### REST API

**Subscribe to channel group:**
```
GET https://ps.pndsn.com/v2/subscribe/sub-c-xxx/,/0?channel-group=user_123_channels&tt=0&uuid=user123
                                                 |                  |___________________|
                                                 Empty channel list  Channel group parameter
```

**Add channels to group:**
```
GET https://ps.pndsn.com/v2/channel-registration/sub-key/sub-c-xxx/channel-group/user_123_channels?add=chat.room1,chat.room2&uuid=admin
```

### Channel Group Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Channels per group** | 2,000 | Hard limit |
| **Groups per keyset** | Unlimited | Practical limit ~10,000 |
| **Group name length** | 92 characters | Same as UUID limit |

### When to Use Channel Groups

**Use channel groups when:**
- Managing >50 channels per user
- Channels don't follow predictable patterns
- Need dynamic membership without resubscribing
- Want server-side channel management

**Don't use channel groups when:**
- <20 channels (multi-channel subscribe is simpler)
- Channels follow patterns (use wildcards instead)
- Need Function bindings (channel groups don't support Functions)

### Channel Groups vs Wildcards

| Feature | Wildcards | Channel Groups |
|---------|-----------|----------------|
| **Setup** | None | Must create group first |
| **Pattern matching** | Automatic | Manual channel list |
| **Depth** | Limited to 2 levels | Any channel names |
| **Channel limit** | Unlimited (matches pattern) | 2,000 per group |
| **Function binding** | Supported | Not supported |
| **Management** | Static pattern | Dynamic membership |
| **Use case** | Predictable naming | Arbitrary channel sets |

## Filter Expressions

Client-side filtering of messages based on metadata.

### How Filtering Works

1. Publisher includes `meta` parameter when publishing
2. Subscriber sets `filter-expr` when subscribing
3. PubNub evaluates expression on each message
4. Only matching messages are delivered to subscriber

### Basic Example

**Publisher:**
```javascript
// Publish with metadata
await pubnub.publish({
  channel: 'alerts.system',
  message: { text: 'Server restarting' },
  meta: {
    priority: 'high',
    region: 'us-east',
    category: 'maintenance'
  }
});
```

**Subscriber:**
```javascript
// Subscribe with filter
pubnub.subscribe({
  channels: ['alerts.system'],
  filterExpression: "priority == 'high'"
});

// Only receives messages where meta.priority == 'high'
```

### Filter Expression Syntax

**Operators:**
- `==` - Equals
- `!=` - Not equals
- `>`, `<`, `>=`, `<=` - Comparisons (numbers only)
- `&&` - Logical AND
- `||` - Logical OR

**Examples:**

```javascript
// Single condition
filterExpression: "priority == 'high'"

// Multiple conditions (AND)
filterExpression: "priority == 'high' && region == 'us-east'"

// Multiple conditions (OR)
filterExpression: "priority == 'high' || priority == 'critical'"

// Numeric comparison
filterExpression: "score >= 100"

// Complex expression
filterExpression: "(priority == 'high' || priority == 'critical') && region == 'us-east'"
```

### Use Cases

| Use Case | Filter Expression | Benefit |
|----------|-------------------|---------|
| **Priority filtering** | `priority == 'high'` | Only critical alerts |
| **Region-specific** | `region == 'us-west'` | Reduce irrelevant data |
| **User-specific** | `targetUser == 'user123'` | Shared channel, filtered delivery |
| **Category filtering** | `category == 'sales'` | Topic-based filtering |

### REST API

```
GET https://ps.pndsn.com/v2/subscribe/sub-c-xxx/alerts.system/0?tt=0&uuid=user123&filter-expr=priority%20%3D%3D%20%27high%27
                                                                                    |___________________________________|
                                                                                    URL-encoded: "priority == 'high'"
```

### Performance Considerations

**Filtering happens at the edge:**
- Reduces bandwidth to client
- Saves processing on client
- Does NOT reduce PubNub transaction count (publish still counts)

**When to use:**
- Shared channels with different subscriber interests
- Bandwidth-constrained clients (mobile)
- Reducing client-side processing

**When NOT to use:**
- Different channels would be better (more efficient)
- Complex filtering logic (do client-side)
- Transaction cost is concern (all publishes count)

### Limitations

- Filter expressions evaluated per message
- Does not reduce transaction count
- Limited expression complexity
- Metadata not stored in history (filtering only applies to real-time)

## Pattern Comparison

| Pattern | Setup Complexity | Scalability | Dynamic | Functions Support |
|---------|------------------|-------------|---------|-------------------|
| **Single channel** | Trivial | Low (1 channel) | Manual subscribe | Yes |
| **Multi-channel** | Easy | Medium (<50) | Add/remove channels | Yes |
| **Wildcards** | Trivial | High | Pattern-based | Yes (limited) |
| **Channel groups** | Moderate | Very high (2000) | Modify group | No |
| **Filter expressions** | Moderate | High | Change expression | N/A |

## Best Practices

### 1. Use Wildcards for Predictable Patterns

```javascript
// ✅ GOOD: Predictable room naming
pubnub.subscribe({ channels: ['chat.*'] });

// ❌ BAD: Manual list when pattern exists
pubnub.subscribe({ 
  channels: ['chat.room1', 'chat.room2', 'chat.room3'] 
});
```

### 2. Use Channel Groups for >50 Channels

```javascript
// ✅ GOOD: Large channel set
await pubnub.channelGroups.addChannels({
  channelGroup: 'user_123_all',
  channels: arrayOf100Channels
});
pubnub.subscribe({ channelGroups: ['user_123_all'] });

// ❌ BAD: 100 individual channels
pubnub.subscribe({ channels: arrayOf100Channels });
```

### 3. Filter at Channel Level First

```javascript
// ✅ GOOD: Separate channels
pubnub.subscribe({ channels: ['alerts.high', 'alerts.critical'] });

// ❌ ACCEPTABLE: Filter expression if channels aren't option
pubnub.subscribe({ 
  channels: ['alerts.all'],
  filterExpression: "priority == 'high' || priority == 'critical'"
});
```

### 4. Name Channels for Wildcard Support

```javascript
// ✅ GOOD: Wildcard-friendly naming
'chat.room123'      → Subscribe to 'chat.*'
'inbox.user456'     → Subscribe to 'inbox.*'

// ❌ BAD: No separator
'chatroom123'       → Cannot use wildcards
```

## Summary

Key takeaways from Channel Patterns:

- **Single channel** - Simple use cases, one channel at a time
- **Multi-channel** - Subscribe to 10-50 channels simultaneously
- **Wildcards** - Pattern-based subscriptions (e.g., `chat.*`), only 2 levels deep
- **Channel groups** - Server-side aggregation, best for >50 channels
- **Filter expressions** - Client-side filtering using message metadata
- **Choose channels first** - Use filtering only when separate channels aren't practical
- **Name channels with dots** - Enables wildcard subscriptions

---

**Next**: [03. Advanced Subscribe](./03-advanced-subscribe.md) - Reconnection strategies and connection management

**Related**: [Lab 1: Basic Subscribe](./labs/lab-01-basic-subscribe.md) - Practice multi-channel subscriptions
