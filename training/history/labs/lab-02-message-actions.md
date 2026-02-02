# Lab 2: Message Actions

## Objective

Learn to work with message actions for reactions, read receipts, and soft delete patterns. Message actions provide non-mutating metadata that can be added to and removed from messages without modifying the original content.

**Time Estimate:** 45-60 minutes

## Prerequisites

- Completed [Lab 1: Basic History](./lab-01-basic-history.md)
- Completed [02. Message Actions](../02-message-actions.md)
- Access to a PubNub keyset with Message Persistence enabled
- Basic knowledge of JavaScript/Node.js or your preferred SDK language

## Learning Outcomes

By the end of this lab, you will be able to:

1. Add message actions (reactions, read receipts)
2. Fetch messages with their actions
3. Aggregate actions for display
4. Remove message actions
5. Implement soft delete pattern
6. Listen for real-time action events

## Lab Setup

### Step 1: Initialize PubNub SDK

Create a new file `lab-02-actions.js`:

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-actions'
});

console.log('PubNub initialized for Message Actions Lab\n');
```

### Step 2: Publish Test Messages

Create messages that we'll add actions to:

```javascript
async function setupTestMessages(channel) {
  console.log('Setting up test messages...\n');
  
  const messages = [
    { text: 'Great work on the project!', sequence: 1 },
    { text: 'When is the meeting?', sequence: 2 },
    { text: 'Thanks for the update', sequence: 3 }
  ];
  
  const timetokens = [];
  
  for (const msg of messages) {
    const result = await pubnub.publish({
      channel: channel,
      message: {
        type: 'chat.message',
        schemaVersion: '1.0',
        eventId: `msg_${Date.now()}_${msg.sequence}`,
        ts: Date.now(),
        payload: msg
      },
      storeInHistory: true
    });
    
    timetokens.push(result.timetoken);
    console.log(`Published: "${msg.text}" (${result.timetoken})`);
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ Setup complete\n');
  
  // Wait for storage propagation
  console.log('⏳ Waiting 2 seconds for storage propagation...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return timetokens;
}

// Helper to get message timetokens
let messageTimetokens = [];

setupTestMessages('actions-lab.test')
  .then(tts => {
    messageTimetokens = tts;
    console.log('Message timetokens stored for exercises\n');
  })
  .catch(error => console.error('Setup failed:', error));
```

Run this setup first, then proceed to exercises.

## Exercise 1: Adding Reactions

### Task

Add emoji reactions to messages.

### Implementation

```javascript
async function addReactions(channel, messageTimetoken) {
  console.log('=== Exercise 1: Adding Reactions ===\n');
  console.log(`Adding reactions to message ${messageTimetoken}...\n`);
  
  // Add 👍 reaction
  console.log('Adding 👍 reaction...');
  const reaction1 = await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'reaction',
      value: '👍'
    }
  });
  console.log('✅ Added 👍');
  console.log(`   Action timetoken: ${reaction1.data.actionTimetoken}\n`);
  
  // Add ❤️ reaction
  console.log('Adding ❤️ reaction...');
  const reaction2 = await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'reaction',
      value: '❤️'
    }
  });
  console.log('✅ Added ❤️');
  console.log(`   Action timetoken: ${reaction2.data.actionTimetoken}\n`);
  
  // Simulate another user adding the same reaction
  console.log('Simulating another user adding 👍...');
  const reaction3 = await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'reaction',
      value: '👍'
    }
  });
  console.log('✅ Added second 👍');
  console.log(`   Action timetoken: ${reaction3.data.actionTimetoken}\n`);
  
  console.log('Summary: Message now has:');
  console.log('  👍 2');
  console.log('  ❤️ 1\n');
  
  return [reaction1.data, reaction2.data, reaction3.data];
}

// Run exercise (use first message from setup)
addReactions('actions-lab.test', messageTimetokens[0])
  .then(() => console.log('✓ Exercise 1 complete\n'))
  .catch(error => console.error('✗ Exercise 1 failed:', error));
```

### Expected Output

```
=== Exercise 1: Adding Reactions ===

Adding reactions to message 17069876543210000...

Adding 👍 reaction...
✅ Added 👍
   Action timetoken: 17069876600000000

Adding ❤️ reaction...
✅ Added ❤️
   Action timetoken: 17069876650000000

Simulating another user adding 👍...
✅ Added second 👍
   Action timetoken: 17069876700000000

Summary: Message now has:
  👍 2
  ❤️ 1

✓ Exercise 1 complete
```

## Exercise 2: Fetching Messages with Actions

### Task

Fetch messages and display their actions in an aggregated format.

### Implementation

```javascript
async function fetchWithActions(channel) {
  console.log('=== Exercise 2: Fetching with Actions ===\n');
  console.log(`Fetching messages from ${channel}...\n`);
  
  const result = await pubnub.fetchMessages({
    channels: [channel],
    count: 10,
    includeMessageActions: true  // Important!
  });
  
  const messages = result.channels[channel] || [];
  console.log(`✅ Fetched ${messages.length} messages\n`);
  
  // Display messages with reactions
  messages.forEach((msg, index) => {
    console.log(`Message ${index + 1}: "${msg.message.payload.text}"`);
    console.log(`  Timetoken: ${msg.timetoken}`);
    
    if (msg.actions) {
      console.log('  Actions:');
      
      // Display reactions
      if (msg.actions.reaction) {
        const reactions = aggregateReactions(msg.actions);
        Object.entries(reactions).forEach(([emoji, data]) => {
          console.log(`    ${emoji} ${data.count} (by: ${data.users.join(', ')})`);
        });
      }
      
      // Display other action types
      Object.keys(msg.actions).forEach(type => {
        if (type !== 'reaction') {
          console.log(`    [${type}]:`, msg.actions[type]);
        }
      });
    } else {
      console.log('  No actions');
    }
    
    console.log('');
  });
}

function aggregateReactions(actions) {
  const reactions = {};
  
  if (!actions || !actions.reaction) {
    return reactions;
  }
  
  Object.entries(actions.reaction).forEach(([emoji, users]) => {
    reactions[emoji] = {
      count: users.length,
      users: users.map(u => u.uuid)
    };
  });
  
  return reactions;
}

// Run exercise
fetchWithActions('actions-lab.test')
  .then(() => console.log('✓ Exercise 2 complete\n'))
  .catch(error => console.error('✗ Exercise 2 failed:', error));
```

### Expected Output

```
=== Exercise 2: Fetching with Actions ===

Fetching messages from actions-lab.test...

✅ Fetched 3 messages

Message 1: "Great work on the project!"
  Timetoken: 17069876543210000
  Actions:
    👍 2 (by: lab-user-actions, lab-user-actions)
    ❤️ 1 (by: lab-user-actions)

Message 2: "When is the meeting?"
  Timetoken: 17069876543220000
  No actions

Message 3: "Thanks for the update"
  Timetoken: 17069876543230000
  No actions

✓ Exercise 2 complete
```

## Exercise 3: Read Receipts

### Task

Implement read receipts to track which users have read messages.

### Implementation

```javascript
async function implementReadReceipts(channel, messageTimetoken, userId) {
  console.log('=== Exercise 3: Read Receipts ===\n');
  console.log(`Marking message as read by ${userId}...\n`);
  
  // Add read receipt
  const receipt = await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'receipt',
      value: 'read'
    }
  });
  
  console.log('✅ Read receipt added');
  console.log(`   Action timetoken: ${receipt.data.actionTimetoken}\n`);
  
  // Fetch message with receipts
  console.log('Fetching message to check receipts...');
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  if (message?.actions?.receipt?.read) {
    const readers = message.actions.receipt.read.map(r => r.uuid);
    console.log(`\n✅ Message read by: ${readers.join(', ')}`);
    console.log(`   Total read count: ${readers.length}\n`);
  } else {
    console.log('\n⚠️  No read receipts found\n');
  }
  
  return receipt.data;
}

// Simulate multiple users reading
async function multipleReadReceipts(channel, messageTimetoken) {
  console.log('Simulating multiple users reading the message...\n');
  
  const users = ['alice', 'bob', 'charlie'];
  
  for (const user of users) {
    // In real app, each user would have their own PubNub instance
    // For demo, we'll add multiple receipts from same instance
    await pubnub.addMessageAction({
      channel: channel,
      messageTimetoken: messageTimetoken,
      action: {
        type: 'receipt',
        value: 'read'
      }
    });
    
    console.log(`✅ ${user} marked as read`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ All users marked as read\n');
}

// Run exercise
implementReadReceipts('actions-lab.test', messageTimetokens[1], 'lab-user-actions')
  .then(() => multipleReadReceipts('actions-lab.test', messageTimetokens[1]))
  .then(() => console.log('✓ Exercise 3 complete\n'))
  .catch(error => console.error('✗ Exercise 3 failed:', error));
```

### Expected Output

```
=== Exercise 3: Read Receipts ===

Marking message as read by lab-user-actions...

✅ Read receipt added
   Action timetoken: 17069876750000000

Fetching message to check receipts...

✅ Message read by: lab-user-actions
   Total read count: 1

Simulating multiple users reading the message...

✅ alice marked as read
✅ bob marked as read
✅ charlie marked as read

✅ All users marked as read

✓ Exercise 3 complete
```

## Exercise 4: Removing Actions

### Task

Remove a specific action (un-react or un-read).

### Implementation

```javascript
async function removeAction(channel, messageTimetoken, actionType, actionValue) {
  console.log('=== Exercise 4: Removing Actions ===\n');
  console.log(`Removing ${actionType}:${actionValue} from message...\n`);
  
  // Step 1: Fetch message with actions to find the action timetoken
  console.log('Step 1: Fetching message with actions...');
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  if (!message?.actions?.[actionType]?.[actionValue]) {
    console.log(`❌ Action ${actionType}:${actionValue} not found\n`);
    return;
  }
  
  // Get the first action of this type/value
  const actionToRemove = message.actions[actionType][actionValue][0];
  console.log(`✅ Found action to remove`);
  console.log(`   Action timetoken: ${actionToRemove.actionTimetoken}`);
  console.log(`   Added by: ${actionToRemove.uuid}\n`);
  
  // Step 2: Remove the action
  console.log('Step 2: Removing action...');
  await pubnub.removeMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    actionTimetoken: actionToRemove.actionTimetoken
  });
  
  console.log('✅ Action removed\n');
  
  // Step 3: Verify removal
  console.log('Step 3: Verifying removal...');
  const verifyResult = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const verifyMessage = verifyResult.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  const stillExists = verifyMessage?.actions?.[actionType]?.[actionValue];
  
  if (stillExists) {
    const remaining = stillExists.length;
    console.log(`⚠️  Action still exists (${remaining} remaining)`);
    console.log('   This is expected if multiple users added the same action\n');
  } else {
    console.log('✅ Action completely removed\n');
  }
}

// Run exercise (remove a 👍 reaction)
removeAction('actions-lab.test', messageTimetokens[0], 'reaction', '👍')
  .then(() => console.log('✓ Exercise 4 complete\n'))
  .catch(error => console.error('✗ Exercise 4 failed:', error));
```

### Expected Output

```
=== Exercise 4: Removing Actions ===

Removing reaction:👍 from message...

Step 1: Fetching message with actions...
✅ Found action to remove
   Action timetoken: 17069876600000000
   Added by: lab-user-actions

Step 2: Removing action...
✅ Action removed

Step 3: Verifying removal...
⚠️  Action still exists (1 remaining)
   This is expected if multiple users added the same action

✓ Exercise 4 complete
```

## Exercise 5: Soft Delete Pattern

### Task

Implement soft delete for messages using message actions.

### Implementation

```javascript
async function softDeleteMessage(channel, messageTimetoken, userId) {
  console.log('=== Exercise 5: Soft Delete ===\n');
  console.log(`Soft deleting message ${messageTimetoken}...\n`);
  
  // Step 1: Add 'deleted' action
  console.log('Step 1: Marking message as deleted...');
  const deleteAction = await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    action: {
      type: 'deleted',
      value: 'true'
    }
  });
  
  console.log('✅ Message marked as deleted');
  console.log(`   Deleted by: ${userId}`);
  console.log(`   Action timetoken: ${deleteAction.data.actionTimetoken}\n`);
  
  // Step 2: Fetch and render
  console.log('Step 2: Fetching and rendering message...');
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  const rendered = renderMessage(message);
  console.log(`\nRendered message:`);
  console.log(`  Text: ${rendered.text}`);
  console.log(`  Style: ${rendered.style}`);
  if (rendered.deletedBy) {
    console.log(`  Deleted by: ${rendered.deletedBy}`);
  }
  console.log('');
  
  return deleteAction.data;
}

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

async function undeleteMessage(channel, messageTimetoken) {
  console.log('Step 3: Un-deleting message (reversing soft delete)...\n');
  
  // Fetch to get delete action timetoken
  const result = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const message = result.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  const deleteAction = message?.actions?.deleted?.['true']?.[0];
  
  if (!deleteAction) {
    console.log('❌ Message is not deleted\n');
    return;
  }
  
  // Remove the delete action
  await pubnub.removeMessageAction({
    channel: channel,
    messageTimetoken: messageTimetoken,
    actionTimetoken: deleteAction.actionTimetoken
  });
  
  console.log('✅ Message restored\n');
  
  // Verify
  const verifyResult = await pubnub.fetchMessages({
    channels: [channel],
    includeMessageActions: true
  });
  
  const verifyMessage = verifyResult.channels[channel].find(
    msg => msg.timetoken === messageTimetoken
  );
  
  const rendered = renderMessage(verifyMessage);
  console.log('Rendered message:');
  console.log(`  Text: ${rendered.text}`);
  console.log(`  Style: ${rendered.style}\n`);
}

// Run exercise
softDeleteMessage('actions-lab.test', messageTimetokens[2], 'lab-user-actions')
  .then(() => undeleteMessage('actions-lab.test', messageTimetokens[2]))
  .then(() => console.log('✓ Exercise 5 complete\n'))
  .catch(error => console.error('✗ Exercise 5 failed:', error));
```

### Expected Output

```
=== Exercise 5: Soft Delete ===

Soft deleting message 17069876543230000...

Step 1: Marking message as deleted...
✅ Message marked as deleted
   Deleted by: lab-user-actions
   Action timetoken: 17069876800000000

Step 2: Fetching and rendering message...

Rendered message:
  Text: [This message was deleted]
  Style: deleted
  Deleted by: lab-user-actions

Step 3: Un-deleting message (reversing soft delete)...

✅ Message restored

Rendered message:
  Text: Thanks for the update
  Style: normal

✓ Exercise 5 complete
```

## Exercise 6: Real-Time Action Events

### Task

Listen for action events in real-time and update UI accordingly.

### Implementation

```javascript
async function listenForActions(channel) {
  console.log('=== Exercise 6: Real-Time Action Events ===\n');
  console.log(`Setting up real-time action listener for ${channel}...\n`);
  
  // Set up listener
  pubnub.addListener({
    messageAction: (event) => {
      if (event.channel !== channel) return;
      
      console.log(`[${event.event.toUpperCase()}] Action on ${event.data.messageTimetoken}`);
      console.log(`  Type: ${event.data.type}`);
      console.log(`  Value: ${event.data.value}`);
      console.log(`  By: ${event.data.uuid}`);
      console.log(`  Action timetoken: ${event.data.actionTimetoken}\n`);
      
      if (event.event === 'added') {
        handleActionAdded(event.data);
      } else if (event.event === 'removed') {
        handleActionRemoved(event.data);
      }
    }
  });
  
  // Subscribe to channel
  pubnub.subscribe({ channels: [channel] });
  console.log('✅ Listening for action events...\n');
  console.log('Try adding/removing actions in another terminal to see events!\n');
  
  // Simulate some actions
  console.log('Simulating actions...\n');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await pubnub.addMessageAction({
    channel: channel,
    messageTimetoken: messageTimetokens[0],
    action: { type: 'reaction', value: '🎉' }
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Cleanup
  pubnub.unsubscribe({ channels: [channel] });
  pubnub.removeAllListeners();
  
  console.log('✓ Exercise 6 complete\n');
}

function handleActionAdded(action) {
  // In real app, update UI to show new reaction
  console.log(`  → UI: Increment ${action.value} count`);
}

function handleActionRemoved(action) {
  // In real app, update UI to remove reaction
  console.log(`  → UI: Decrement ${action.value} count`);
}

// Run exercise
listenForActions('actions-lab.test')
  .catch(error => console.error('✗ Exercise 6 failed:', error));
```

### Expected Output

```
=== Exercise 6: Real-Time Action Events ===

Setting up real-time action listener for actions-lab.test...

✅ Listening for action events...

Try adding/removing actions in another terminal to see events!

Simulating actions...

[ADDED] Action on 17069876543210000
  Type: reaction
  Value: 🎉
  By: lab-user-actions
  Action timetoken: 17069876850000000

  → UI: Increment 🎉 count

✓ Exercise 6 complete
```

## Lab Completion Checklist

- [ ] Added reactions to messages
- [ ] Fetched messages with actions
- [ ] Aggregated actions for display
- [ ] Implemented read receipts
- [ ] Removed specific actions
- [ ] Implemented soft delete pattern
- [ ] Restored soft-deleted messages
- [ ] Listened for real-time action events

## Key Takeaways

1. **Message Actions are non-mutating**
   - Original message stays unchanged
   - Actions can be added and removed

2. **Actions structure**
   - Type and value (e.g., reaction:👍)
   - Each action gets its own timetoken
   - Multiple users can add same action

3. **Soft delete is recommended**
   - Reversible (can undo)
   - Preserves audit trail
   - No special permissions required

4. **Real-time updates**
   - Listen for `messageAction` events
   - Update UI dynamically
   - Works alongside regular messages

5. **Best practices**
   - Aggregate reactions for display
   - Cache action timetokens for removal
   - Handle missing actions gracefully
   - Keep action types descriptive

## Challenge Exercise

Build a complete reaction system:

```javascript
class ReactionManager {
  constructor(pubnub, channel) {
    this.pubnub = pubnub;
    this.channel = channel;
    this.reactions = new Map();  // messageTimetoken -> reactions
  }
  
  async addReaction(messageTimetoken, emoji) {
    // Add reaction
    // Update local cache
    // Return result
  }
  
  async removeReaction(messageTimetoken, emoji) {
    // Find action timetoken
    // Remove reaction
    // Update local cache
  }
  
  async fetchReactions(messageTimetoken) {
    // Fetch message with actions
    // Parse and return reactions
  }
  
  setupRealtimeUpdates() {
    // Listen for action events
    // Update reactions cache
  }
  
  getReactionCount(messageTimetoken, emoji) {
    // Return count for specific emoji
  }
  
  hasUserReacted(messageTimetoken, emoji, userId) {
    // Check if user has reacted
  }
}

// Usage
const manager = new ReactionManager(pubnub, 'chat.room123');
manager.setupRealtimeUpdates();

await manager.addReaction('17069876543210000', '👍');
const count = manager.getReactionCount('17069876543210000', '👍');
```

## Next Steps

- Review [03. Advanced History](../03-advanced-history.md) for pagination and optimization
- Explore combining message actions with Functions for validation
- Build a production reaction system in your application

## Additional Resources

- [PubNub Message Actions Documentation](https://www.pubnub.com/docs/sdks/javascript/api-reference/message-actions)
- [Soft Delete Best Practices](https://www.pubnub.com/docs/general/messages/actions)
