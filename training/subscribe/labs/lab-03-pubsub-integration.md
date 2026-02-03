# Lab 3: Publish-Subscribe Integration

## Objective

Build complete end-to-end messaging flows demonstrating how Publish and Subscribe work together, including timing relationships, history catch-up, and bidirectional communication.

**Time Estimate:** 45-60 minutes

## Prerequisites

- Completed [Module 1: Publish Service](../../publish/README.md)
- Completed [01. Subscribe Fundamentals](../01-subscribe-fundamentals.md)
- Completed [04. Publish-Subscribe Flow](../04-publish-subscribe-flow.md)
- Completed [Lab 1: Basic Subscribe](./lab-01-basic-subscribe.md)
- Access to a PubNub keyset with Message Persistence enabled

## Learning Outcomes

By the end of this lab, you will be able to:

1. Demonstrate the difference between subscribing before vs after publishing
2. Implement the history-on-join pattern (fetch history + subscribe)
3. Build bidirectional communication with proper deduplication
4. Handle optimistic UI updates with server confirmation
5. Implement offline catch-up patterns

## Lab Setup

Create a new directory for this lab:

```bash
mkdir lab-03-pubsub
cd lab-03-pubsub
npm init -y
npm install pubnub
```

## Exercise 1: Basic Send/Receive

### Task

Demonstrate real-time message delivery when subscriber is active before publish.

### Implementation

**Terminal 1: Subscriber (subscriber.js)**

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'subscriber-001'
});

const CHANNEL = 'test.sendreceive';

console.log('Exercise 1: Basic Send/Receive');
console.log('🎧 SUBSCRIBER TERMINAL\n');

pubnub.addListener({
  message: (event) => {
    const time = new Date().toLocaleTimeString();
    console.log(`\n[${time}] 📨 Message received!`);
    console.log(`  Channel: ${event.channel}`);
    console.log(`  Timetoken: ${event.timetoken}`);
    console.log(`  Message:`, JSON.stringify(event.message, null, 2));
  },
  
  status: (event) => {
    if (event.category === 'PNConnectedCategory') {
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] ✅ Connected and subscribed to: ${CHANNEL}`);
      console.log(`\n👂 Waiting for messages...`);
      console.log(`📝 Switch to publisher terminal and send messages\n`);
    }
  }
});

console.log(`Subscribing to: ${CHANNEL}...\n`);
pubnub.subscribe({ channels: [CHANNEL] });

// Keep running
console.log('Press Ctrl+C to exit');
```

**Terminal 2: Publisher (publisher.js)**

```javascript
const PubNub = require('pubnub');
const readline = require('readline');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'publisher-001'
});

const CHANNEL = 'test.sendreceive';

console.log('Exercise 1: Basic Send/Receive');
console.log('📢 PUBLISHER TERMINAL\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function publishMessage(text) {
  try {
    const message = {
      type: 'chat.message',
      schemaVersion: '1.0',
      eventId: `msg_${Date.now()}`,
      ts: Date.now(),
      payload: { text }
    };
    
    const time = new Date().toLocaleTimeString();
    console.log(`\n[${time}] 📤 Publishing message...`);
    
    const result = await pubnub.publish({
      channel: CHANNEL,
      message: message
    });
    
    console.log(`[${time}] ✅ Published`);
    console.log(`  Timetoken: ${result.timetoken}`);
    
  } catch (error) {
    console.error('❌ Publish failed:', error.message);
  }
}

function prompt() {
  rl.question('\nEnter message (or "exit"): ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('👋 Goodbye!');
      process.exit(0);
    }
    
    await publishMessage(input);
    prompt();
  });
}

console.log('Type messages to send to subscriber\n');
prompt();
```

### Running the Exercise

1. **Start subscriber first:** `node subscriber.js`
2. **Wait for "Connected"** message
3. **Start publisher:** `node publisher.js`
4. **Send messages** and observe real-time delivery

### Expected Behavior

```
// Subscriber terminal:
[14:32:15] ✅ Connected and subscribed to: test.sendreceive
👂 Waiting for messages...

[14:32:23] 📨 Message received!
  Channel: test.sendreceive
  Timetoken: 17069876543210000
  Message: {
  "type": "chat.message",
  "payload": {
    "text": "Hello from publisher!"
  }
}
```

### Key Observation

Messages are delivered **in real-time** because subscriber was connected before publishing occurred.

## Exercise 2: Message Flow Timing

### Task

Observe message order and understand timing relationships.

### Implementation

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'timing-test-user'
});

const CHANNEL = 'test.timing';

console.log('Exercise 2: Message Flow Timing\n');

let subscribeTimetoken = null;
const publishTimetokens = [];
const receivedTimetokens = [];

pubnub.addListener({
  message: (event) => {
    receivedTimetokens.push(event.timetoken);
    console.log(`📨 Received message ${receivedTimetokens.length}`);
    console.log(`   Timetoken: ${event.timetoken}`);
    console.log(`   Content: ${event.message.payload.text}\n`);
    
    // After receiving all messages, analyze order
    if (receivedTimetokens.length === 5) {
      analyzeOrder();
    }
  },
  
  status: (event) => {
    if (event.category === 'PNConnectedCategory') {
      console.log('✅ Subscribed\n');
      
      // Give connection a moment to stabilize
      setTimeout(publishSequence, 1000);
    }
  }
});

async function publishSequence() {
  console.log('📤 Publishing 5 messages rapidly...\n');
  
  for (let i = 1; i <= 5; i++) {
    const result = await pubnub.publish({
      channel: CHANNEL,
      message: {
        type: 'test.message',
        schemaVersion: '1.0',
        eventId: `msg_${i}`,
        ts: Date.now(),
        payload: {
          text: `Message ${i}`,
          sequence: i
        }
      }
    });
    
    publishTimetokens.push(result.timetoken);
    console.log(`  Published message ${i}, timetoken: ${result.timetoken}`);
    
    // Small delay between publishes
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n✅ All messages published\n');
}

function analyzeOrder() {
  console.log('📊 Order Analysis:\n');
  
  console.log('Published timetokens:');
  publishTimetokens.forEach((tt, idx) => {
    console.log(`  ${idx + 1}. ${tt}`);
  });
  
  console.log('\nReceived timetokens:');
  receivedTimetokens.forEach((tt, idx) => {
    console.log(`  ${idx + 1}. ${tt}`);
  });
  
  // Check if order matches
  let inOrder = true;
  for (let i = 0; i < publishTimetokens.length; i++) {
    if (publishTimetokens[i] !== receivedTimetokens[i]) {
      inOrder = false;
      break;
    }
  }
  
  console.log(`\n${inOrder ? '✅' : '❌'} Messages received in publish order: ${inOrder}`);
  console.log('💡 Note: Order is highly likely but not guaranteed at extreme scale\n');
  
  process.exit(0);
}

// Start test
console.log('Subscribing to channel...\n');
pubnub.subscribe({ channels: [CHANNEL] });
```

### Expected Output

```
Exercise 2: Message Flow Timing

Subscribing to channel...

✅ Subscribed

📤 Publishing 5 messages rapidly...

  Published message 1, timetoken: 17069876543210000
  Published message 2, timetoken: 17069876543210100
  Published message 3, timetoken: 17069876543210200
  Published message 4, timetoken: 17069876543210300
  Published message 5, timetoken: 17069876543210400

✅ All messages published

📨 Received message 1
   Timetoken: 17069876543210000
   Content: Message 1

📨 Received message 2
   Timetoken: 17069876543210100
   Content: Message 2

(... messages 3-5 ...)

📊 Order Analysis:

Published timetokens:
  1. 17069876543210000
  2. 17069876543210100
  3. 17069876543210200
  4. 17069876543210300
  5. 17069876543210400

Received timetokens:
  1. 17069876543210000
  2. 17069876543210100
  3. 17069876543210200
  4. 17069876543210300
  5. 17069876543210400

✅ Messages received in publish order: true
💡 Note: Order is highly likely but not guaranteed at extreme scale
```

### Discussion

- **17-digit timetoken precision** makes ordering highly reliable
- Messages typically arrive in order
- At very high rates (>1000 msg/sec), ordering not guaranteed
- Use application-level sequence numbers if strict ordering required

## Exercise 3: History Catch-Up Pattern

### Task

Demonstrate the standard pattern: publish messages, then join with history fetch.

### Implementation

**Step 1: Publisher (publish-first.js)**

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'early-publisher'
});

const CHANNEL = 'test.catchup';

async function publishHistoricalMessages() {
  console.log('Exercise 3: History Catch-Up Pattern');
  console.log('📤 Publishing 10 messages BEFORE subscriber joins...\n');
  
  for (let i = 1; i <= 10; i++) {
    await pubnub.publish({
      channel: CHANNEL,
      message: {
        type: 'chat.message',
        schemaVersion: '1.0',
        eventId: `msg_${i}`,
        ts: Date.now(),
        payload: {
          text: `Historical message ${i}`,
          number: i
        }
      },
      storeInHistory: true  // Ensure stored
    });
    
    console.log(`  ✅ Published message ${i}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ All messages published and stored in history');
  console.log('📝 Now run the subscriber to see history catch-up\n');
  process.exit(0);
}

publishHistoricalMessages();
```

**Step 2: Subscriber with History (subscribe-with-history.js)**

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'late-subscriber'
});

const CHANNEL = 'test.catchup';

async function joinWithCatchUp() {
  console.log('Exercise 3: History Catch-Up Pattern');
  console.log('🎧 Subscriber joining AFTER messages were published\n');
  
  // Step 1: Fetch recent history
  console.log('📚 Step 1: Fetching history...\n');
  
  const history = await pubnub.fetchMessages({
    channels: [CHANNEL],
    count: 25
  });
  
  const messages = history.channels[CHANNEL] || [];
  console.log(`✅ Retrieved ${messages.length} historical messages:\n`);
  
  // Step 2: Display historical messages
  messages.forEach((msg, idx) => {
    console.log(`  ${idx + 1}. [HISTORY] ${msg.message.payload.text}`);
  });
  
  console.log('\n📡 Step 2: Subscribing for real-time messages...\n');
  
  // Step 3: Subscribe for new messages
  pubnub.addListener({
    message: (event) => {
      console.log(`\n📨 [REAL-TIME] ${event.message.payload.text}`);
    },
    
    status: (event) => {
      if (event.category === 'PNConnectedCategory') {
        console.log('✅ Subscribed - now receiving real-time messages');
        console.log('📝 Publish new messages to see real-time delivery\n');
      }
    }
  });
  
  pubnub.subscribe({ channels: [CHANNEL] });
}

console.log('Press Ctrl+C to exit\n');
joinWithCatchUp();
```

### Running the Exercise

1. **Run publisher first:** `node publish-first.js`
2. **Wait for all messages published**
3. **Run subscriber:** `node subscribe-with-history.js`
4. **Observe:** Historical messages fetched, then real-time subscription active

### Expected Output

```
// Publisher:
📤 Publishing 10 messages BEFORE subscriber joins...
  ✅ Published message 1
  ✅ Published message 2
  ...
  ✅ Published message 10
✅ All messages published

// Subscriber (started after):
🎧 Subscriber joining AFTER messages were published

📚 Step 1: Fetching history...
✅ Retrieved 10 historical messages:

  1. [HISTORY] Historical message 1
  2. [HISTORY] Historical message 2
  ...
  10. [HISTORY] Historical message 10

📡 Step 2: Subscribing for real-time messages...
✅ Subscribed - now receiving real-time messages

(New messages arrive in real-time:)
📨 [REAL-TIME] New message after subscribe
```

### Key Pattern

```javascript
// Standard pattern for joining with history
async function joinChannel(channel) {
  // 1. Fetch history first
  const history = await pubnub.fetchMessages({ channels: [channel], count: 50 });
  displayHistory(history);
  
  // 2. Subscribe for real-time
  pubnub.subscribe({ channels: [channel] });
}
```

## Exercise 4: Bidirectional Chat

### Task

Build a simple chat where two clients both publish and subscribe.

### Implementation

```javascript
const PubNub = require('pubnub');
const readline = require('readline');

// Each client has unique user ID
const MY_USER_ID = process.argv[2] || `user_${Math.random().toString(36).substr(2, 9)}`;

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: MY_USER_ID
});

const CHANNEL = 'test.chat';

console.log(`Exercise 4: Bidirectional Chat`);
console.log(`User ID: ${MY_USER_ID}\n`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Set up listener
pubnub.addListener({
  message: (event) => {
    // Skip own messages (we already displayed them optimistically)
    if (event.publisher === MY_USER_ID) {
      return;
    }
    
    // Display message from other user
    console.log(`\n[${event.publisher}]: ${event.message.payload.text}`);
    prompt();
  },
  
  status: (event) => {
    if (event.category === 'PNConnectedCategory') {
      console.log('✅ Connected to chat\n');
      prompt();
    }
  }
});

async function sendMessage(text) {
  // Display immediately (optimistic UI)
  console.log(`[You]: ${text}`);
  
  try {
    await pubnub.publish({
      channel: CHANNEL,
      message: {
        type: 'chat.message',
        schemaVersion: '1.0',
        eventId: `msg_${Date.now()}_${MY_USER_ID}`,
        ts: Date.now(),
        payload: { text }
      }
    });
  } catch (error) {
    console.error('❌ Failed to send:', error.message);
  }
}

function prompt() {
  rl.question('', async (text) => {
    if (text.toLowerCase() === 'exit') {
      console.log('👋 Leaving chat...');
      pubnub.unsubscribeAll();
      process.exit(0);
    }
    
    if (text.trim()) {
      await sendMessage(text);
    }
    
    prompt();
  });
}

// Subscribe to chat channel
console.log('Joining chat channel...\n');
pubnub.subscribe({ channels: [CHANNEL] });
```

### Testing Bidirectional Chat

**Terminal 1:**
```bash
node bidirectional-chat.js Alice
```

**Terminal 2:**
```bash
node bidirectional-chat.js Bob
```

**Interaction:**
```
// Alice's terminal:
[You]: Hello Bob!
[Bob]: Hi Alice!
[You]: How are you?

// Bob's terminal:
[Alice]: Hello Bob!
[You]: Hi Alice!
[Alice]: How are you?
```

### Key Concepts

1. **Deduplication** - Skip own messages (already displayed optimistically)
2. **Publisher UUID** - Use `event.publisher` to identify sender
3. **Optimistic UI** - Display immediately, send in background
4. **Bidirectional** - Both clients publish and subscribe

## Challenge Exercise: Offline Catch-Up

### Task

Implement a pattern that tracks last seen timetoken and catches up when reconnected.

### Implementation

```javascript
const PubNub = require('pubnub');
const fs = require('fs');

const STATE_FILE = './last-seen.json';

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'offline-catchup-user'
});

const CHANNEL = 'test.offline';

// Load last seen timetoken
function loadLastSeen() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return data.lastTimetoken || null;
    }
  } catch (error) {
    console.error('Error loading state:', error.message);
  }
  return null;
}

// Save last seen timetoken
function saveLastSeen(timetoken) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastTimetoken: timetoken }));
  } catch (error) {
    console.error('Error saving state:', error.message);
  }
}

async function catchUp(lastTimetoken) {
  if (!lastTimetoken) {
    console.log('No previous session - starting fresh\n');
    return;
  }
  
  console.log(`📚 Catching up from timetoken: ${lastTimetoken}\n`);
  
  const history = await pubnub.fetchMessages({
    channels: [CHANNEL],
    start: lastTimetoken,  // Fetch after last seen
    count: 100
  });
  
  const messages = history.channels[CHANNEL] || [];
  
  if (messages.length > 0) {
    console.log(`✅ Caught up on ${messages.length} missed messages:\n`);
    messages.forEach(msg => {
      console.log(`  [CATCH-UP] ${msg.message.payload.text}`);
      saveLastSeen(msg.timetoken);
    });
    console.log('');
  } else {
    console.log('✅ No messages missed\n');
  }
}

let lastTimetoken = loadLastSeen();

pubnub.addListener({
  message: (event) => {
    console.log(`📨 [REAL-TIME] ${event.message.payload.text}`);
    lastTimetoken = event.timetoken;
    saveLastSeen(event.timetoken);
  },
  
  status: async (event) => {
    if (event.category === 'PNConnectedCategory') {
      console.log('✅ Connected\n');
      await catchUp(lastTimetoken);
      console.log('👂 Listening for new messages...\n');
    } else if (event.category === 'PNReconnectedCategory') {
      console.log('🔄 Reconnected - catching up...\n');
      await catchUp(lastTimetoken);
    }
  }
});

console.log('Exercise: Offline Catch-Up');
console.log(`Channel: ${CHANNEL}\n`);
console.log('Subscribing...\n');

pubnub.subscribe({ channels: [CHANNEL] });

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n💾 Saving state...');
  saveLastSeen(lastTimetoken);
  console.log('👋 Goodbye!');
  process.exit(0);
});

console.log('Press Ctrl+C to exit');
```

### Testing Offline Catch-Up

1. **Start subscriber:** `node offline-catchup.js`
2. **Stop subscriber** (Ctrl+C)
3. **Publish messages** while subscriber is offline
4. **Restart subscriber** - Should catch up on missed messages

## Lab Completion Checklist

- [ ] Demonstrated real-time delivery (subscribe before publish)
- [ ] Observed message ordering with timetokens
- [ ] Implemented history-on-join pattern
- [ ] Built bidirectional chat with deduplication
- [ ] Implemented offline catch-up with timetoken tracking
- [ ] Understood timing relationship between Publish and Subscribe
- [ ] Handled both historical and real-time messages

## Discussion Questions

1. **If you subscribe after a message was published, will you receive it in real-time?**
   - **Answer:** No. Subscribe must be active before publish for real-time delivery. Use history to retrieve messages published before subscription.

2. **How do you prevent displaying your own messages twice in bidirectional chat?**
   - **Answer:** Check `event.publisher === myUserId` and skip displaying (already shown optimistically).

3. **What's the correct order: subscribe first or fetch history first?**
   - **Answer:** Fetch history first, then subscribe. This prevents gap between historical and real-time messages.

4. **How would you handle a user going offline and coming back?**
   - **Answer:** Track last received timetoken before disconnect, fetch history from that timetoken on reconnect using `start` parameter.

## Summary

Key patterns from this lab:

- **Subscribe before publish** - Required for real-time delivery
- **History-on-join** - Fetch history, then subscribe for new messages
- **Timetoken tracking** - Save last seen timetoken for catch-up
- **Deduplication** - Use eventId or publisher UUID to avoid duplicates
- **Optimistic UI** - Display immediately, publish in background
- **Offline catch-up** - Fetch messages since last timetoken on reconnect

## Next Steps

- Review [04. Publish-Subscribe Flow](../04-publish-subscribe-flow.md) for timing deep dive
- Study [History Fundamentals](../../history/01-history-fundamentals.md) for storage patterns
- Explore [Access Manager](../../overview/02-service-catalog.md) for securing channels

---

**Congratulations!** You've mastered Publish-Subscribe integration patterns. These patterns form the foundation of reliable real-time applications.
