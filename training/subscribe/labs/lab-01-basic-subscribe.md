# Lab 1: Basic Subscribe with Listeners

## Objective

Learn to subscribe to PubNub channels with proper listener configuration, handle messages from multiple channels, and monitor connection status.

**Time Estimate:** 30-45 minutes

## Prerequisites

- Completed [01. Subscribe Fundamentals](../01-subscribe-fundamentals.md)
- Access to a PubNub keyset
- Basic knowledge of JavaScript/Node.js or your preferred SDK language
- Text editor or IDE

## Learning Outcomes

By the end of this lab, you will be able to:

1. Subscribe to a PubNub channel with message listeners
2. Handle messages from multiple channels
3. Monitor connection status with status listeners
4. Dynamically add and remove channels from subscription

## Lab Setup

### Step 1: Initialize PubNub SDK

Create a new file `lab-01-subscribe.js`:

```javascript
const PubNub = require('pubnub');

// Initialize PubNub
const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-subscribe-001'
});

console.log('PubNub initialized');
```

### Step 2: Get Configuration

You'll need from the PubNub Admin Portal:
- **Publish Key** (starts with `pub-c-`)
- **Subscribe Key** (starts with `sub-c-`)

## Exercise 1: First Subscribe

### Task

Subscribe to a channel and receive messages with a message listener.

### Background

The listener pattern requires adding listeners **BEFORE** calling `subscribe()`. If you subscribe first, messages may arrive before your listener is ready to handle them.

### Implementation

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-001'
});

console.log('🚀 Setting up first subscription...\n');

// Step 1: Add message listener BEFORE subscribing
pubnub.addListener({
  message: (event) => {
    console.log('📨 Message received!');
    console.log('  Channel:', event.channel);
    console.log('  Publisher:', event.publisher);
    console.log('  Timetoken:', event.timetoken);
    console.log('  Message:', JSON.stringify(event.message, null, 2));
    console.log('');
  }
});

// Step 2: Subscribe to channel
const channel = 'test.lab01.subscribe';
console.log(`✅ Subscribing to: ${channel}\n`);

pubnub.subscribe({
  channels: [channel]
});

console.log('👂 Listening for messages...');
console.log('📝 Open another terminal and publish a message to this channel\n');

// Keep process running
console.log('Press Ctrl+C to exit');
```

### Testing Your Subscription

**Terminal 1 (Subscriber):**
```bash
node lab-01-subscribe.js
```

**Terminal 2 (Publisher):**
```javascript
// test-publish.js
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-publisher-001'
});

async function publishTestMessage() {
  const result = await pubnub.publish({
    channel: 'test.lab01.subscribe',
    message: {
      type: 'test.message',
      schemaVersion: '1.0',
      eventId: `msg_${Date.now()}`,
      ts: Date.now(),
      payload: {
        text: 'Hello from Lab 01!',
        from: 'Publisher Terminal'
      }
    }
  });
  
  console.log('✅ Message published');
  console.log('📍 Timetoken:', result.timetoken);
  process.exit(0);
}

publishTestMessage();
```

```bash
node test-publish.js
```

### Expected Output (Terminal 1)

```
🚀 Setting up first subscription...

✅ Subscribing to: test.lab01.subscribe

👂 Listening for messages...
📝 Open another terminal and publish a message to this channel

Press Ctrl+C to exit
📨 Message received!
  Channel: test.lab01.subscribe
  Publisher: lab-publisher-001
  Timetoken: 17069876543210000
  Message: {
  "type": "test.message",
  "schemaVersion": "1.0",
  "eventId": "msg_1706987654321",
  "ts": 1706987654321,
  "payload": {
    "text": "Hello from Lab 01!",
    "from": "Publisher Terminal"
  }
}
```

### Verification Questions

1. What happens if you call `subscribe()` before `addListener()`?
   - **Answer:** Messages may arrive before your listener is set up, causing missed messages.

2. What information is available in the message event?
   - **Answer:** channel, publisher, timetoken, message, subscription, userMetadata

3. How long does the subscriber wait for messages?
   - **Answer:** Indefinitely (long-poll with 280-second server timeout, automatically renews)

## Exercise 2: Multi-Channel Subscribe

### Task

Subscribe to multiple channels and identify which channel each message came from.

### Implementation

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-002'
});

console.log('🚀 Multi-Channel Subscribe\n');

// Add listener with channel identification
pubnub.addListener({
  message: (event) => {
    console.log('📨 Message received!');
    console.log(`  📍 Channel: ${event.channel}`);
    
    // Route by channel
    if (event.channel.startsWith('chat.')) {
      console.log('  💬 This is a chat message');
    } else if (event.channel.startsWith('alerts.')) {
      console.log('  ⚠️  This is an alert');
    } else if (event.channel.startsWith('notifications.')) {
      console.log('  🔔 This is a notification');
    }
    
    console.log('  Message:', event.message);
    console.log('');
  }
});

// Subscribe to multiple channels at once
const channels = [
  'chat.room123',
  'alerts.system',
  'notifications.user456'
];

console.log('✅ Subscribing to channels:');
channels.forEach(ch => console.log(`   - ${ch}`));
console.log('');

pubnub.subscribe({ channels });

console.log('👂 Listening on all channels...');
console.log('📝 Publish to any of these channels to test\n');
console.log('Press Ctrl+C to exit');
```

### Testing Multi-Channel

**Publisher script** (test different channels):

```javascript
// test-multi-publish.js
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-publisher-002'
});

async function publishToMultipleChannels() {
  // Publish to chat channel
  await pubnub.publish({
    channel: 'chat.room123',
    message: { type: 'chat.message', payload: { text: 'Hello chat!' } }
  });
  console.log('✅ Published to chat.room123');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Publish to alerts channel
  await pubnub.publish({
    channel: 'alerts.system',
    message: { type: 'alert', payload: { level: 'warning', text: 'System alert!' } }
  });
  console.log('✅ Published to alerts.system');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Publish to notifications channel
  await pubnub.publish({
    channel: 'notifications.user456',
    message: { type: 'notification', payload: { text: 'You have a notification!' } }
  });
  console.log('✅ Published to notifications.user456');
  
  process.exit(0);
}

publishToMultipleChannels();
```

### Expected Output

```
📨 Message received!
  📍 Channel: chat.room123
  💬 This is a chat message
  Message: { type: 'chat.message', payload: { text: 'Hello chat!' } }

📨 Message received!
  📍 Channel: alerts.system
  ⚠️  This is an alert
  Message: { type: 'alert', payload: { level: 'warning', text: 'System alert!' } }

📨 Message received!
  📍 Channel: notifications.user456
  🔔 This is a notification
  Message: { type: 'notification', payload: { text: 'You have a notification!' } }
```

### Discussion Questions

1. How do you identify which channel a message came from?
   - **Answer:** Use `event.channel` property in the message listener

2. Can you subscribe to more channels after the initial subscribe?
   - **Answer:** Yes! Call `subscribe()` again with additional channels - they're added to existing subscription

3. Do you need separate listeners for each channel?
   - **Answer:** No, one listener receives messages from all subscribed channels

## Exercise 3: Status Events

### Task

Monitor connection status and handle different status categories.

### Implementation

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-003'
});

console.log('🚀 Connection Status Monitoring\n');

// Add comprehensive listener
pubnub.addListener({
  message: (event) => {
    console.log('📨 Message:', event.message);
  },
  
  status: (event) => {
    console.log('📊 Status Event:');
    console.log(`  Category: ${event.category}`);
    console.log(`  Operation: ${event.operation}`);
    
    switch (event.category) {
      case 'PNConnectedCategory':
        console.log('  ✅ Connected to PubNub');
        console.log('  Subscribed channels:', event.subscribedChannels);
        break;
        
      case 'PNReconnectedCategory':
        console.log('  🔄 Reconnected after disconnection');
        console.log('  💡 Consider catching up with history');
        break;
        
      case 'PNDisconnectedCategory':
        console.log('  ⚠️  Disconnected from PubNub');
        console.log('  SDK will automatically attempt reconnection');
        break;
        
      case 'PNNetworkIssuesCategory':
        console.log('  ⚠️  Network issues detected');
        console.log('  Retrying automatically...');
        break;
        
      case 'PNAccessDeniedCategory':
        console.log('  🚫 Access denied - check token');
        break;
        
      case 'PNTimeoutCategory':
        console.log('  ⏱️  Request timeout - retrying...');
        break;
        
      default:
        console.log('  ℹ️  Other status:', event.category);
    }
    
    console.log('');
  }
});

// Subscribe
const channel = 'test.lab01.status';
console.log(`Subscribing to: ${channel}\n`);

pubnub.subscribe({ channels: [channel] });

console.log('👂 Monitoring connection status...');
console.log('📝 Try disconnecting/reconnecting network to see status changes\n');
console.log('Press Ctrl+C to exit');
```

### Expected Output

```
🚀 Connection Status Monitoring

Subscribing to: test.lab01.status

👂 Monitoring connection status...
📝 Try disconnecting/reconnecting network to see status changes

📊 Status Event:
  Category: PNConnectedCategory
  Operation: PNSubscribeOperation
  ✅ Connected to PubNub
  Subscribed channels: [ 'test.lab01.status' ]

(If you disconnect network:)

📊 Status Event:
  Category: PNNetworkIssuesCategory
  Operation: PNSubscribeOperation
  ⚠️  Network issues detected
  Retrying automatically...

(When network restored:)

📊 Status Event:
  Category: PNReconnectedCategory
  Operation: PNSubscribeOperation
  🔄 Reconnected after disconnection
  💡 Consider catching up with history
```

### Testing Status Events

1. Start the script
2. Observe `PNConnectedCategory`
3. Disconnect network/WiFi
4. Observe `PNNetworkIssuesCategory` or `PNDisconnectedCategory`
5. Reconnect network
6. Observe `PNReconnectedCategory`

### Discussion Questions

1. Which status event indicates successful connection?
   - **Answer:** `PNConnectedCategory`

2. What should you do when receiving `PNReconnectedCategory`?
   - **Answer:** Fetch missed messages from history using last received timetoken

3. Does the SDK automatically retry on `PNNetworkIssuesCategory`?
   - **Answer:** Yes, automatic retry with exponential backoff

## Challenge Exercise: Dynamic Subscription Management

### Task

Build a simple channel manager that dynamically adds and removes channels based on user input.

### Requirements

1. Start with one subscribed channel
2. Allow adding new channels
3. Allow removing channels
4. Display currently subscribed channels
5. Handle messages from all active channels

### Template

```javascript
const PubNub = require('pubnub');
const readline = require('readline');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-challenge'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Set up listener
pubnub.addListener({
  message: (event) => {
    console.log(`\n📨 [${event.channel}] ${JSON.stringify(event.message)}`);
    showPrompt();
  },
  
  status: (event) => {
    if (event.category === 'PNConnectedCategory') {
      console.log('✅ Connected');
    }
  }
});

// Initial subscribe
pubnub.subscribe({ channels: ['test.room1'] });

function showPrompt() {
  console.log('\nCommands:');
  console.log('  add <channel>    - Subscribe to channel');
  console.log('  remove <channel> - Unsubscribe from channel');
  console.log('  list             - Show subscribed channels');
  console.log('  exit             - Quit');
  
  rl.question('\n> ', (input) => {
    const [cmd, ...args] = input.trim().split(' ');
    
    switch (cmd) {
      case 'add':
        const addChannel = args[0];
        if (addChannel) {
          pubnub.subscribe({ channels: [addChannel] });
          console.log(`✅ Subscribed to ${addChannel}`);
        }
        break;
        
      case 'remove':
        const removeChannel = args[0];
        if (removeChannel) {
          pubnub.unsubscribe({ channels: [removeChannel] });
          console.log(`❌ Unsubscribed from ${removeChannel}`);
        }
        break;
        
      case 'list':
        const channels = pubnub.getSubscribedChannels();
        console.log('📋 Subscribed channels:', channels);
        break;
        
      case 'exit':
        console.log('👋 Goodbye!');
        pubnub.unsubscribeAll();
        process.exit(0);
        return;
        
      default:
        console.log('❓ Unknown command');
    }
    
    showPrompt();
  });
}

console.log('🚀 Dynamic Channel Manager');
console.log('📍 Initially subscribed to: test.room1\n');
showPrompt();
```

### Expected Behavior

```
🚀 Dynamic Channel Manager
📍 Initially subscribed to: test.room1

Commands:
  add <channel>    - Subscribe to channel
  remove <channel> - Unsubscribe from channel
  list             - Show subscribed channels
  exit             - Quit

> list
📋 Subscribed channels: [ 'test.room1' ]

> add test.room2
✅ Subscribed to test.room2

> list
📋 Subscribed channels: [ 'test.room1', 'test.room2' ]

> remove test.room1
❌ Unsubscribed from test.room1

> list
📋 Subscribed channels: [ 'test.room2' ]
```

## Lab Completion Checklist

- [ ] Successfully subscribed to a channel with message listener
- [ ] Received and displayed messages from subscription
- [ ] Subscribed to multiple channels simultaneously
- [ ] Identified which channel each message came from
- [ ] Monitored connection status with status listener
- [ ] Handled `PNConnectedCategory` and `PNReconnectedCategory` events
- [ ] Dynamically added channels to subscription
- [ ] Dynamically removed channels from subscription
- [ ] Used `getSubscribedChannels()` to list active subscriptions

## Discussion Questions

1. **Why is it important to add listeners before subscribing?**
   - Prevents race condition where messages arrive before listener is ready
   - Ensures no messages are missed
   - SDK may buffer some messages, but best practice is listeners-first

2. **What's the difference between `unsubscribe()` and `unsubscribeAll()`?**
   - `unsubscribe({ channels: [...] })` - Removes specific channels
   - `unsubscribeAll()` - Removes all subscriptions
   - Use `unsubscribe` for selective cleanup, `unsubscribeAll` for complete cleanup

3. **Can you have multiple listeners on the same PubNub instance?**
   - Yes! You can call `addListener()` multiple times
   - All listeners receive all events
   - Useful for modular code (different handlers for different purposes)

4. **What happens to queued messages during reconnection?**
   - PubNub doesn't queue messages server-side for disconnected clients
   - Must use History API to catch up on missed messages
   - Track last received timetoken for catch-up

## Next Steps

- Proceed to [Lab 2: Subscribe Loop](./lab-02-subscribe-loop.md) - Advanced: Implement the long-poll protocol from scratch
- Review [02. Channel Patterns](../02-channel-patterns.md) for wildcards and channel groups
- Explore [03. Advanced Subscribe](../03-advanced-subscribe.md) for reconnection strategies

## Additional Resources

- [PubNub Subscribe API Documentation](https://www.pubnub.com/docs/sdks/javascript/api-reference/subscribe)
- [PubNub Listener API](https://www.pubnub.com/docs/sdks/javascript/api-reference/listeners)
- [Connection Status Categories](https://www.pubnub.com/docs/sdks/javascript/api-reference/status-events)
