# Lab 1: Basic History and Storage Timing

## Objective

Learn to fetch message history, understand timetoken ordering, and critically understand why published messages are not immediately available in history—and why that matters for production systems.

**Time Estimate:** 45-60 minutes

## Prerequisites

- Completed [Module 1: Publish](../../publish/README.md)
- Completed [01. History Fundamentals](../01-history-fundamentals.md)
- Access to a PubNub keyset with Message Persistence enabled
- Basic knowledge of JavaScript/Node.js or your preferred SDK language
- Text editor or IDE

## Learning Outcomes

By the end of this lab, you will be able to:

1. Fetch message history from a channel
2. Understand timetoken-based ordering
3. Implement the history-on-join pattern
4. **Understand storage propagation timing** (critical)
5. Explain why history is NOT for publish verification
6. Paginate through message history

## Lab Setup

### Step 1: Initialize PubNub SDK

Create a new file `lab-01-history.js`:

```javascript
const PubNub = require('pubnub');

// Initialize PubNub
const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-history'
});

console.log('PubNub initialized for History Lab\n');
```

### Step 2: Enable Message Persistence

Verify Message Persistence is enabled on your keyset:
1. Go to PubNub Admin Portal
2. Select your keyset
3. Check that "Message Persistence" is enabled
4. Note the retention period (7 days recommended for testing)

### Step 3: Publish Test Messages

Let's create some test data:

```javascript
async function publishTestMessages(channel, count = 10) {
  console.log(`Publishing ${count} test messages...`);
  
  for (let i = 1; i <= count; i++) {
    const message = {
      type: 'test.message',
      schemaVersion: '1.0',
      eventId: `test_${Date.now()}_${i}`,
      ts: Date.now(),
      payload: {
        text: `Test message ${i}`,
        sequence: i
      }
    };
    
    await pubnub.publish({
      channel: channel,
      message: message,
      storeInHistory: true
    });
    
    console.log(`  Published message ${i}`);
    
    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('✅ All test messages published\n');
}

// Run setup
publishTestMessages('history-lab.test')
  .then(() => console.log('Setup complete'))
  .catch(error => console.error('Setup failed:', error));
```

Run this first to create test data, then **wait 2-3 seconds** before proceeding to exercises.

## Exercise 1: Basic Fetch

### Task

Fetch recent messages from a channel and display them.

### Implementation

```javascript
async function basicFetch(channel) {
  console.log('=== Exercise 1: Basic Fetch ===\n');
  console.log(`Fetching history from ${channel}...`);
  
  try {
    const result = await pubnub.fetchMessages({
      channels: [channel],
      count: 10
    });
    
    const messages = result.channels[channel] || [];
    
    console.log(`✅ Fetched ${messages.length} messages\n`);
    
    // Display messages
    messages.forEach((msg, index) => {
      console.log(`Message ${index + 1}:`);
      console.log(`  Timetoken: ${msg.timetoken}`);
      console.log(`  Type: ${msg.message.type}`);
      console.log(`  Text: ${msg.message.payload.text}`);
      console.log(`  Sequence: ${msg.message.payload.sequence}`);
      console.log('');
    });
    
    return messages;
    
  } catch (error) {
    console.error('❌ Fetch failed:', error.message);
    throw error;
  }
}

// Run exercise
basicFetch('history-lab.test')
  .then(() => console.log('\n✓ Exercise 1 complete\n'))
  .catch(error => console.error('\n✗ Exercise 1 failed:', error));
```

### Expected Output

```
=== Exercise 1: Basic Fetch ===

Fetching history from history-lab.test...
✅ Fetched 10 messages

Message 1:
  Timetoken: 17069876543210000
  Type: test.message
  Text: Test message 1
  Sequence: 1

Message 2:
  Timetoken: 17069876543220000
  Type: test.message
  Text: Test message 2
  Sequence: 2

...

✓ Exercise 1 complete
```

### Verification Questions

1. What order are messages returned in? (Answer: Oldest to newest, ordered by timetoken)
2. What is a timetoken? (Answer: 17-digit server timestamp representing message publish time)
3. Can you fetch more than 100 messages in one call? (Answer: No, max 100 for single channel)

## Exercise 2: History on Join Pattern

### Task

Implement the common pattern of fetching history when a user joins a channel, then subscribing for new messages.

### Implementation

```javascript
async function historyOnJoin(channel) {
  console.log('=== Exercise 2: History on Join ===\n');
  console.log(`Joining channel: ${channel}`);
  
  // Step 1: Fetch recent history
  console.log('Step 1: Fetching recent history...');
  const result = await pubnub.fetchMessages({
    channels: [channel],
    count: 50
  });
  
  const historicalMessages = result.channels[channel] || [];
  console.log(`✅ Loaded ${historicalMessages.length} historical messages`);
  
  // Step 2: Display history
  console.log('\nHistorical messages:');
  historicalMessages.slice(-5).forEach(msg => {
    console.log(`  [${msg.timetoken}] ${msg.message.payload.text}`);
  });
  
  // Step 3: Subscribe for new real-time messages
  console.log('\nStep 2: Subscribing for new messages...');
  pubnub.subscribe({ channels: [channel] });
  
  // Step 4: Set up listener
  pubnub.addListener({
    message: (event) => {
      if (event.channel === channel) {
        console.log(`  [NEW] [${event.timetoken}] ${event.message.payload.text}`);
      }
    }
  });
  
  console.log('✅ Subscribed and listening for new messages');
  console.log('\nTry publishing a new message to see it appear in real-time!');
  
  // Keep alive for 10 seconds to see real-time messages
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Cleanup
  pubnub.unsubscribe({ channels: [channel] });
  pubnub.removeAllListeners();
  
  console.log('\n✅ Exercise 2 complete');
}

// Run exercise
historyOnJoin('history-lab.test')
  .catch(error => console.error('Exercise 2 failed:', error));
```

### Expected Output

```
=== Exercise 2: History on Join ===

Joining channel: history-lab.test
Step 1: Fetching recent history...
✅ Loaded 10 historical messages

Historical messages:
  [17069876543210000] Test message 1
  [17069876543220000] Test message 2
  [17069876543230000] Test message 3
  [17069876543240000] Test message 4
  [17069876543250000] Test message 5

Step 2: Subscribing for new messages...
✅ Subscribed and listening for new messages

Try publishing a new message to see it appear in real-time!

✅ Exercise 2 complete
```

### Discussion

This is the standard pattern for chat applications:
1. Fetch history first (show previous conversation)
2. Subscribe for real-time updates (show new messages as they arrive)

**Why this order?** If you subscribe first, you might miss messages that arrive between subscribing and fetching history.

## Exercise 3: Publish-History Timing (CRITICAL)

### Task

Understand why messages are NOT immediately available in history after publishing, and why this matters.

This is one of the most important concepts in Message Persistence.

### Background

Many developers try to verify a publish succeeded by immediately checking history. This is **unreliable** and demonstrates a **misunderstanding of how distributed storage works**.

### Part A: Immediate Fetch (Synchronous)

```javascript
async function testImmediateFetch() {
  console.log('=== Exercise 3 Part A: Immediate Fetch ===\n');
  console.log('Publishing a message, then immediately fetching history...\n');
  
  const channel = 'history-lab.timing';
  const testMessage = {
    type: 'timing.test',
    schemaVersion: '1.0',
    eventId: `timing_test_${Date.now()}`,
    ts: Date.now(),
    payload: {
      text: 'Timing test message',
      test: 'immediate'
    }
  };
  
  // Publish
  const publishResult = await pubnub.publish({
    channel: channel,
    message: testMessage,
    storeInHistory: true
  });
  
  console.log('✅ Published successfully');
  console.log(`   Timetoken: ${publishResult.timetoken}\n`);
  
  // Immediately try to fetch (NO DELAY)
  console.log('Immediately fetching history (no delay)...');
  const fetchResult = await pubnub.fetchMessages({
    channels: [channel],
    count: 1
  });
  
  const messages = fetchResult.channels[channel] || [];
  
  if (messages.length === 0) {
    console.log('❌ Message NOT found in history!');
    console.log('   This is expected - storage propagation has not completed\n');
  } else {
    const latestMessage = messages[0];
    if (latestMessage.timetoken === publishResult.timetoken) {
      console.log('✅ Message found (got lucky with timing)');
    } else {
      console.log('⚠️  Found a message, but not the one we just published');
      console.log(`   Expected: ${publishResult.timetoken}`);
      console.log(`   Found: ${latestMessage.timetoken}`);
    }
  }
  
  console.log('\n📝 Key Learning: Immediate fetch after publish is unreliable\n');
}

testImmediateFetch()
  .then(() => console.log('✓ Part A complete\n'))
  .catch(error => console.error('✗ Part A failed:', error));
```

### Part B: Async/Await (Still Unreliable)

```javascript
async function testAsyncAwait() {
  console.log('=== Exercise 3 Part B: Async/Await ===\n');
  console.log('Publishing with async/await, then fetching...\n');
  
  const channel = 'history-lab.timing';
  const testMessage = {
    type: 'timing.test',
    schemaVersion: '1.0',
    eventId: `timing_test_${Date.now()}`,
    ts: Date.now(),
    payload: {
      text: 'Async/await test',
      test: 'async-await'
    }
  };
  
  // Publish with await
  const publishResult = await pubnub.publish({
    channel: channel,
    message: testMessage,
    storeInHistory: true
  });
  
  console.log('✅ Published successfully');
  console.log(`   Timetoken: ${publishResult.timetoken}\n`);
  
  // Fetch with await (still no artificial delay)
  console.log('Fetching with await...');
  const fetchResult = await pubnub.fetchMessages({
    channels: [channel],
    start: publishResult.timetoken
  });
  
  const messages = fetchResult.channels[channel] || [];
  
  if (messages.length === 0) {
    console.log('❌ Message NOT found in history!');
    console.log('   Even with async/await, propagation delay exists\n');
  } else {
    console.log('✅ Message found (timing worked out this time)');
    console.log('   But this is inconsistent and unreliable!\n');
  }
  
  console.log('📝 Key Learning: Async/await does NOT guarantee propagation\n');
}

testAsyncAwait()
  .then(() => console.log('✓ Part B complete\n'))
  .catch(error => console.error('✗ Part B failed:', error));
```

### Part C: Adding Delay (Works But Impractical)

```javascript
async function testWithDelay() {
  console.log('=== Exercise 3 Part C: With Delay ===\n');
  console.log('Publishing, waiting 2 seconds, then fetching...\n');
  
  const channel = 'history-lab.timing';
  const testMessage = {
    type: 'timing.test',
    schemaVersion: '1.0',
    eventId: `timing_test_${Date.now()}`,
    ts: Date.now(),
    payload: {
      text: 'Delay test message',
      test: 'with-delay'
    }
  };
  
  // Publish
  const publishResult = await pubnub.publish({
    channel: channel,
    message: testMessage,
    storeInHistory: true
  });
  
  console.log('✅ Published successfully');
  console.log(`   Timetoken: ${publishResult.timetoken}\n`);
  
  // Wait 2 seconds
  console.log('⏳ Waiting 2 seconds for propagation...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Now fetch
  console.log('Fetching after delay...');
  const fetchResult = await pubnub.fetchMessages({
    channels: [channel],
    count: 5
  });
  
  const messages = fetchResult.channels[channel] || [];
  const found = messages.find(msg => msg.timetoken === publishResult.timetoken);
  
  if (found) {
    console.log('✅ Message found in history!');
    console.log('   The 2-second delay allowed propagation to complete\n');
  } else {
    console.log('❌ Still not found (rare, but possible)');
    console.log('   Propagation can occasionally take longer\n');
  }
  
  console.log('📝 Key Learning: Delays work but are IMPRACTICAL for production\n');
  console.log('   Problems with this approach:');
  console.log('   - Blocks execution for 2 seconds');
  console.log('   - Poor user experience');
  console.log('   - Not suitable for production code');
  console.log('   - Propagation time varies (2s might not always be enough)\n');
}

testWithDelay()
  .then(() => console.log('✓ Part C complete\n'))
  .catch(error => console.error('✗ Part C failed:', error));
```

### Part D: The Right Approach (Trust the Timetoken)

```javascript
async function testCorrectApproach() {
  console.log('=== Exercise 3 Part D: Correct Approach ===\n');
  console.log('The RIGHT way to confirm a publish succeeded:\n');
  
  const channel = 'history-lab.timing';
  const testMessage = {
    type: 'timing.test',
    schemaVersion: '1.0',
    eventId: `timing_test_${Date.now()}`,
    ts: Date.now(),
    payload: {
      text: 'Correct approach test',
      test: 'correct'
    }
  };
  
  try {
    // Publish
    const result = await pubnub.publish({
      channel: channel,
      message: testMessage,
      storeInHistory: true
    });
    
    // The timetoken IS your confirmation!
    console.log('✅ Publish succeeded!');
    console.log(`   Timetoken: ${result.timetoken}`);
    console.log('   ↑ This IS proof the message was published and WILL be stored\n');
    
    console.log('📝 Best Practice:');
    console.log('   - Trust the timetoken response');
    console.log('   - Do NOT verify by fetching history');
    console.log('   - History is for REPLAY, not VERIFICATION');
    console.log('   - If publish returns a timetoken, it succeeded\n');
    
    return result;
    
  } catch (error) {
    console.error('❌ Publish failed:', error.message);
    console.log('   Only an error means publish failed\n');
    throw error;
  }
}

testCorrectApproach()
  .then(() => console.log('✓ Part D complete\n'))
  .catch(error => console.error('✗ Part D failed:', error));
```

### Complete Exercise Runner

Run all parts sequentially:

```javascript
async function runTimingExercise() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  CRITICAL CONCEPT: Publish-History Timing         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  await testImmediateFetch();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testAsyncAwait();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testWithDelay();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testCorrectApproach();
  
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  KEY TAKEAWAYS                                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log('1. Published messages are NOT immediately in history');
  console.log('2. Storage propagation takes 10ms - 2+ seconds');
  console.log('3. Async/await does NOT guarantee propagation');
  console.log('4. Adding delays works but is impractical');
  console.log('5. The timetoken response IS your confirmation');
  console.log('6. History is for catch-up/replay, NOT verification\n');
  
  console.log('✓ Exercise 3 complete\n');
}

runTimingExercise()
  .catch(error => console.error('Exercise 3 failed:', error));
```

### Discussion Questions

1. **Why does immediate fetch after publish fail?**
   - Storage propagation delay (eventually consistent, not immediately consistent)
   - Message must be replicated to storage database
   - Typically 10-500ms, but can vary

2. **Why is adding a 2-second delay impractical?**
   - Blocks execution
   - Poor user experience (2-second wait)
   - Propagation time varies (might need more than 2 seconds sometimes)
   - Not suitable for production applications

3. **What IS the timetoken?**
   - Server timestamp when message was received
   - Proof that message was published
   - Will be the timetoken when message appears in history
   - This IS your confirmation

4. **When SHOULD you use history?**
   - Catch-up on join (load previous messages)
   - Offline sync (retrieve missed messages)
   - Audit trails (review historical data)
   - Message replay (debugging, compliance)

5. **When should you NOT use history?**
   - Publish verification (use timetoken response)
   - Immediate post-publish validation
   - Real-time confirmation

## Exercise 4: Pagination

### Task

Fetch messages in batches using timetoken-based pagination.

### Implementation

```javascript
async function paginationExample(channel) {
  console.log('=== Exercise 4: Pagination ===\n');
  console.log(`Paginating through history on ${channel}...\n`);
  
  const allMessages = [];
  let start = null;
  let page = 1;
  
  while (true) {
    console.log(`Fetching page ${page}...`);
    
    const result = await pubnub.fetchMessages({
      channels: [channel],
      count: 5,  // Small count for demonstration
      start: start
    });
    
    const messages = result.channels[channel] || [];
    
    if (messages.length === 0) {
      console.log('No more messages\n');
      break;
    }
    
    console.log(`  Got ${messages.length} messages`);
    allMessages.push(...messages);
    
    // Move cursor to oldest message in batch
    start = messages[messages.length - 1].timetoken;
    page++;
    
    // Stop after 3 pages for demo
    if (page > 3) {
      console.log('(Stopping after 3 pages for demo)\n');
      break;
    }
  }
  
  console.log(`✅ Total messages fetched: ${allMessages.length}`);
  console.log('\nFirst message:', allMessages[0].message.payload.text);
  console.log('Last message:', allMessages[allMessages.length - 1].message.payload.text);
}

paginationExample('history-lab.test')
  .then(() => console.log('\n✓ Exercise 4 complete\n'))
  .catch(error => console.error('\n✗ Exercise 4 failed:', error));
```

### Expected Output

```
=== Exercise 4: Pagination ===

Paginating through history on history-lab.test...

Fetching page 1...
  Got 5 messages
Fetching page 2...
  Got 5 messages
Fetching page 3...
  Got 0 messages
No more messages

✅ Total messages fetched: 10

First message: Test message 1
Last message: Test message 10

✓ Exercise 4 complete
```

## Lab Completion Checklist

- [ ] Successfully fetched message history
- [ ] Implemented history-on-join pattern
- [ ] **Understood storage propagation timing** (critical!)
- [ ] Explained why history is NOT for verification
- [ ] Paginated through message history
- [ ] Can articulate when to use history vs timetoken

## Critical Concept Summary

### What We Learned About Storage Timing

1. **Published messages have propagation delay**
   - Not immediately available in history
   - Typically 10-500ms, can be longer

2. **Immediate fetch fails**
   - No delay = message not found
   - This is expected behavior, not a bug

3. **Async/await doesn't guarantee propagation**
   - Awaiting publish only means "publish API returned"
   - Does NOT mean "message is in storage"

4. **Delays work but are impractical**
   - 2-second delay usually works
   - But blocks execution, poor UX, not production-ready

5. **Timetoken IS confirmation**
   - Publish response includes timetoken
   - This IS proof message was published
   - Don't check history to verify

6. **History is for replay, not verification**
   - Catch-up on join
   - Offline sync
   - Audit trails
   - NOT for confirming publish succeeded

### When You Might Forget This

Developers often make these mistakes:

```javascript
// ❌ WRONG: Trying to verify publish
const result = await pubnub.publish({...});
const history = await pubnub.fetchMessages({...});  // Might not find it!
if (history.found) { /* ... */ }

// ✅ CORRECT: Trust the timetoken
const result = await pubnub.publish({...});
console.log('✅ Published:', result.timetoken);  // This IS confirmation
```

## Next Steps

- Proceed to [Lab 2: Message Actions](./lab-02-message-actions.md)
- Review [02. Message Actions](../02-message-actions.md) for reactions and read receipts
- Explore [03. Advanced History](../03-advanced-history.md) for optimization techniques

## Additional Resources

- [PubNub History API Documentation](https://www.pubnub.com/docs/sdks/javascript/api-reference/fetch-messages)
- [Message Persistence Best Practices](https://www.pubnub.com/docs/general/messages/persistence)
