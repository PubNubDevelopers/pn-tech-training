# Message Actions

## Introduction

Message Actions provide metadata that can be attached to published messages without modifying the original message. They enable features like reactions (emoji), read receipts, soft delete, threading, and custom annotations.

Unlike editing or deleting messages directly, message actions preserve the original message while adding contextual information that can be queried, filtered, and removed independently.

## What are Message Actions?

**Message Actions** are lightweight metadata objects attached to existing messages via their timetoken. Each action consists of:

- **Type** - Category of action (e.g., "reaction", "receipt", "deleted")
- **Value** - Specific instance (e.g., "👍", "read", "true")
- **Message timetoken** - Which message this action applies to
- **Action timetoken** - When the action was added
- **UUID** - Who added the action

### Key Characteristics

| Characteristic | Description |
|----------------|-------------|
| **Non-mutating** | Original message stays unchanged |
| **Reversible** | Actions can be added and removed |
| **Queryable** | Retrieved with `fetchMessages()` |
| **Timestamped** | Each action has its own timetoken |
| **User-scoped** | Track who added each action |

### Message Actions vs Editing Messages

| Approach | Message Actions | Direct Edit |
|----------|----------------|-------------|
| **Original preserved** | Yes | No |
| **Reversible** | Yes | No (unless versioned) |
| **History** | Full audit trail | Overwritten |
| **Multiple users** | Each user can act independently | Last write wins |
| **Recommendation** | ✅ Recommended | ❌ Not supported by PubNub |

**Key Point**: PubNub does not support editing messages directly. Use message actions for all post-publish modifications.

## Use Cases

### 1. Reactions (Emoji)

Allow users to react to messages with emoji:

```javascript
// User reacts with 👍
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'reaction',
    value: '👍'
  }
});

// User reacts with ❤️
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'reaction',
    value: '❤️'
  }
});
```

**Display Example:**
```
User: "Great work everyone!"
👍 5   ❤️ 3   🎉 2
```

### 2. Read Receipts

Track which users have read a message:

```javascript
// Mark message as read
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'receipt',
    value: 'read'
  }
});
```

**Display Example:**
```
Message: "Meeting at 3pm"
Read by: Alice, Bob, Charlie (3/5)
```

### 3. Soft Delete

Mark messages as deleted without permanently removing them:

```javascript
// Mark message as deleted
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'deleted',
    value: 'true'
  }
});
```

**Display Example:**
```
[This message was deleted]
```

**Why Soft Delete?**
- Reversible (can undo)
- Audit trail preserved
- Faster than hard delete
- No special permissions required

### 4. Threading (Replies)

Link replies to parent messages:

```javascript
// Reply to a message
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',  // Parent message
  action: {
    type: 'thread',
    value: '17069876600000000'  // Reply message timetoken
  }
});
```

### 5. Bookmarks/Favorites

Mark important messages:

```javascript
// Bookmark a message
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'bookmark',
    value: 'true'
  }
});
```

### 6. Custom Annotations

Add any custom metadata:

```javascript
// Flag for moderation
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'flag',
    value: 'spam'
  }
});

// Add priority
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'priority',
    value: 'high'
  }
});
```

## Adding Message Actions

### Basic Syntax

```javascript
const result = await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: {
    type: 'reaction',
    value: '👍'
  }
});

console.log('Action added:', result.data);
// {
//   type: 'reaction',
//   value: '👍',
//   messageTimetoken: '17069876543210000',
//   actionTimetoken: '17069876600000000',
//   uuid: 'user456'
// }
```

### Action Timetoken

Each action gets its own timetoken when added:

- **Message timetoken** - When the original message was published
- **Action timetoken** - When this action was added

This allows:
- Ordering actions chronologically
- Removing specific actions later
- Tracking when reactions/receipts occurred

### Duplicate Actions

Multiple users can add the same action:

```javascript
// User A reacts with 👍
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: { type: 'reaction', value: '👍' }
});

// User B also reacts with 👍
await pubnub.addMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  action: { type: 'reaction', value: '👍' }
});

// Result: 👍 2
```

### Action Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Actions per message** | No hard limit | Practical limit ~100-200 |
| **Action type length** | 50 characters | Recommended: 20 chars |
| **Action value length** | 50 characters | Recommended: 20 chars |
| **Stored in history** | Yes | Retrieved with `fetchMessages()` |

## Fetching Messages with Actions

### Include Actions in Fetch

```javascript
const result = await pubnub.fetchMessages({
  channels: ['chat.room123'],
  count: 25,
  includeMessageActions: true  // Enable actions
});

const messages = result.channels['chat.room123'];
messages.forEach(msg => {
  console.log('Message:', msg.message);
  console.log('Actions:', msg.actions);
});
```

### Action Response Structure

```javascript
{
  message: {
    type: 'chat.message',
    payload: { text: 'Great work!' }
  },
  timetoken: '17069876543210000',
  actions: {
    reaction: {
      '👍': [
        {
          uuid: 'user123',
          actionTimetoken: '17069876600000000'
        },
        {
          uuid: 'user456',
          actionTimetoken: '17069876650000000'
        }
      ],
      '❤️': [
        {
          uuid: 'user789',
          actionTimetoken: '17069876700000000'
        }
      ]
    },
    receipt: {
      'read': [
        {
          uuid: 'user123',
          actionTimetoken: '17069876800000000'
        }
      ]
    }
  }
}
```

**Structure Breakdown:**
```
actions: {
  [type]: {
    [value]: [
      { uuid, actionTimetoken },
      ...
    ]
  }
}
```

### Aggregating Actions

Count reactions for display:

```javascript
function aggregateReactions(actions) {
  const reactions = {};
  
  if (!actions || !actions.reaction) {
    return reactions;
  }
  
  // Count each reaction value
  Object.entries(actions.reaction).forEach(([emoji, users]) => {
    reactions[emoji] = {
      count: users.length,
      users: users.map(u => u.uuid)
    };
  });
  
  return reactions;
}

// Usage
const msg = messages[0];
const reactions = aggregateReactions(msg.actions);
console.log(reactions);
// {
//   '👍': { count: 2, users: ['user123', 'user456'] },
//   '❤️': { count: 1, users: ['user789'] }
// }
```

### Checking User's Actions

Determine if current user has reacted:

```javascript
function hasUserReacted(actions, currentUserId, reactionValue) {
  if (!actions?.reaction?.[reactionValue]) {
    return false;
  }
  
  return actions.reaction[reactionValue].some(
    action => action.uuid === currentUserId
  );
}

// Usage
const hasLiked = hasUserReacted(msg.actions, 'user123', '👍');
if (hasLiked) {
  console.log('User already liked this message');
}
```

## Removing Message Actions

### Remove Specific Action

To remove an action, you need:
- Channel
- Message timetoken
- Action timetoken (from when action was added)

```javascript
// Remove a specific reaction
await pubnub.removeMessageAction({
  channel: 'chat.room123',
  messageTimetoken: '17069876543210000',
  actionTimetoken: '17069876600000000'
});
```

### Remove User's Own Action

Common pattern: User wants to un-react or un-bookmark:

```javascript
async function removeUserAction(channel, messageTimetoken, actionType, actionValue, userId) {
  // First, fetch message with actions to find the action timetoken
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  if (!message?.actions?.[actionType]?.[actionValue]) {
    console.log('Action not found');
    return;
  }
  
  // Find user's action
  const userAction = message.actions[actionType][actionValue].find(
    action => action.uuid === userId
  );
  
  if (!userAction) {
    console.log('User has not added this action');
    return;
  }
  
  // Remove it
  await pubnub.removeMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    actionTimetoken: userAction.actionTimetoken
  });
  
  console.log('Action removed');
}

// Usage: User un-likes a message
await removeUserAction(
  'chat.room123',
  '17069876543210000',
  'reaction',
  '👍',
  'user123'
);
```

### Bulk Remove Pattern

Remove all actions of a type:

```javascript
async function removeAllActionsOfType(channel, messageTimetoken, actionType) {
  // Fetch message with actions
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  if (!message?.actions?.[actionType]) {
    console.log('No actions of this type');
    return;
  }
  
  // Remove all action values of this type
  const removePromises = [];
  Object.values(message.actions[actionType]).forEach(actionList => {
    actionList.forEach(action => {
      removePromises.push(
        pubnub.removeMessageAction({
          channel: channel,
          messageTimetoken: messageTimetoken,
          actionTimetoken: action.actionTimetoken
        })
      );
    });
  });
  
  await Promise.all(removePromises);
  console.log(`Removed ${removePromises.length} actions`);
}

// Usage: Remove all reactions from a message
await removeAllActionsOfType('chat.room123', '17069876543210000', 'reaction');
```

## Soft Delete Pattern

### Implementing Soft Delete

Soft delete preserves messages while marking them as deleted:

```javascript
async function softDeleteMessage(channel, messageTimetoken, userId) {
  // Add 'deleted' action
  await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'deleted',
      value: 'true'
    }
  });
  
  console.log(`Message ${messageTimetoken} marked as deleted by ${userId}`);
}
```

### Displaying Soft-Deleted Messages

```javascript
function renderMessage(message) {
  // Check if deleted
  const isDeleted = message.actions?.deleted?.['true'];
  
  if (isDeleted) {
    return {
      text: '[This message was deleted]',
      style: 'deleted',
      deletedBy: isDeleted[0].uuid,
      deletedAt: isDeleted[0].actionTimetoken
    };
  }
  
  return {
    text: message.message.payload.text,
    style: 'normal'
  };
}
```

### Un-deleting Messages

Because soft delete is just an action, it can be reversed:

```javascript
async function undeleteMessage(channel, messageTimetoken) {
  // Fetch message to get deletion action timetoken
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  const deleteAction = message?.actions?.deleted?.['true']?.[0];
  
  if (!deleteAction) {
    console.log('Message is not deleted');
    return;
  }
  
  // Remove the deletion action
  await pubnub.removeMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    actionTimetoken: deleteAction.actionTimetoken
  });
  
  console.log('Message restored');
}
```

### Soft Delete vs Hard Delete

| Feature | Soft Delete (Message Actions) | Hard Delete (deleteMessages API) |
|---------|------------------------------|----------------------------------|
| **Reversible** | Yes | No |
| **Audit trail** | Preserved | Lost |
| **Permission** | Standard publish | Requires secretKey |
| **Speed** | Fast (add action) | Slower (database operation) |
| **Cost** | Standard transaction | Standard transaction |
| **Recommendation** | ✅ Default choice | Use sparingly |

## Action Type Conventions

### Recommended Action Types

| Type | Values | Use Case |
|------|--------|----------|
| `reaction` | Emoji (👍, ❤️, 😂, etc.) | User reactions |
| `receipt` | `read`, `delivered` | Read receipts, delivery confirmation |
| `deleted` | `true` | Soft delete marker |
| `edited` | Edit timestamp | Mark edited (store actual edit elsewhere) |
| `thread` | Reply message timetoken | Threading/replies |
| `bookmark` | `true` | User bookmarks |
| `flag` | `spam`, `inappropriate`, `offtopic` | Moderation flags |
| `priority` | `high`, `medium`, `low` | Message priority |
| `translation` | Language code (`es`, `fr`, `de`) | Translation markers |

### Custom Action Types

You can define any custom types for your application:

```javascript
// Customer support ticket status
await pubnub.addMessageAction({
  channel: 'support.tickets',
  messageTimetoken: ticketTimetoken,
  action: {
    type: 'ticket-status',
    value: 'resolved'
  }
});

// Game turn indicator
await pubnub.addMessageAction({
  channel: 'game.room123',
  messageTimetoken: moveTimetoken,
  action: {
    type: 'turn',
    value: 'player2'
  }
});
```

## Real-Time Action Events

### Listening for Actions

Subscribe to action events in real-time:

```javascript
pubnub.addListener({
  messageAction: (event) => {
    console.log('Action event:', event);
    
    // Event structure:
    // {
    //   channel: 'chat.room123',
    //   publisher: 'user456',
    //   event: 'added' or 'removed',
    //   data: {
    //     type: 'reaction',
    //     value: '👍',
    //     messageTimetoken: '17069876543210000',
    //     actionTimetoken: '17069876600000000',
    //     uuid: 'user456'
    //   }
    // }
    
    if (event.event === 'added') {
      updateReactionUI(event.data);
    } else if (event.event === 'removed') {
      removeReactionUI(event.data);
    }
  }
});

// Must subscribe to channel to receive action events
pubnub.subscribe({ channels: ['chat.room123'] });
```

### Live Reaction Updates

```javascript
function setupLiveReactions(channel) {
  pubnub.addListener({
    messageAction: (event) => {
      if (event.channel !== channel) return;
      
      const { type, value, messageTimetoken } = event.data;
      
      if (type === 'reaction') {
        if (event.event === 'added') {
          incrementReactionCount(messageTimetoken, value);
        } else if (event.event === 'removed') {
          decrementReactionCount(messageTimetoken, value);
        }
      }
    }
  });
}

function incrementReactionCount(messageTimetoken, emoji) {
  const element = document.querySelector(
    `[data-message="${messageTimetoken}"] [data-reaction="${emoji}"]`
  );
  
  if (element) {
    const count = parseInt(element.textContent) || 0;
    element.textContent = count + 1;
  }
}
```

## Best Practices

### 1. Use Descriptive Types

```javascript
// ✅ GOOD: Clear, descriptive types
{ type: 'reaction', value: '👍' }
{ type: 'receipt', value: 'read' }
{ type: 'flag', value: 'spam' }

// ❌ BAD: Vague types
{ type: 'meta', value: 'data' }
{ type: 'action', value: 'thing' }
```

### 2. Keep Values Short

```javascript
// ✅ GOOD: Short, simple values
{ type: 'priority', value: 'high' }
{ type: 'status', value: 'resolved' }

// ❌ BAD: Long, complex values
{ type: 'note', value: 'This is a very long description that should be a message instead' }
```

### 3. Aggregate for Display

Don't show individual actions—aggregate them:

```javascript
// ✅ GOOD: Aggregated display
"👍 5   ❤️ 3   🎉 2"

// ❌ BAD: Listing individuals
"User1 👍, User2 👍, User3 👍, User4 👍, User5 👍"
```

### 4. Cache Action Timetokens

When removing actions, cache the action timetoken:

```javascript
// ✅ GOOD: Store action timetoken when adding
const result = await pubnub.addMessageAction({...});
localStorage.setItem(`action_${messageTimetoken}`, result.data.actionTimetoken);

// Remove later without fetching
const actionTimetoken = localStorage.getItem(`action_${messageTimetoken}`);
await pubnub.removeMessageAction({
  channel, messageTimetoken, actionTimetoken
});

// ❌ BAD: Fetch entire message history just to remove one action
```

### 5. Handle Missing Actions Gracefully

```javascript
// ✅ GOOD: Defensive checking
const reactions = msg.actions?.reaction || {};
const likeCount = reactions['👍']?.length || 0;

// ❌ BAD: Assumes actions exist
const likeCount = msg.actions.reaction['👍'].length;  // May crash
```

## Summary

Key takeaways from Message Actions:

- **Message Actions** add metadata to messages without modifying originals
- **Non-mutating and reversible** - Preserves message integrity
- **Common uses** - Reactions, read receipts, soft delete, threading, bookmarks
- **Action structure** - Type, value, message timetoken, action timetoken, UUID
- **Fetch with actions** - Use `includeMessageActions: true`
- **Soft delete recommended** - Reversible, preserves audit trail
- **Real-time updates** - Listen for action events via `messageAction` listener
- **Best practices** - Descriptive types, short values, aggregate for display

---

**Next**: [03. Advanced History](./03-advanced-history.md) - Learn pagination, multi-channel patterns, and optimization

**Lab**: [Lab 2: Message Actions](./labs/lab-02-message-actions.md) - Practice adding reactions and implementing read receipts
