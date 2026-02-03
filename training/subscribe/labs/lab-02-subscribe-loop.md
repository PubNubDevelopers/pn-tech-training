# Lab 2: Implement Subscribe Loop from Scratch (ADVANCED)

## Objective

Implement the PubNub subscribe long-poll protocol from scratch using raw HTTP requests to deeply understand how the protocol works at the lowest level.

**Time Estimate:** 60-90 minutes

**Difficulty:** Advanced

## Prerequisites

- Completed [01. Subscribe Fundamentals](../01-subscribe-fundamentals.md)
- Completed [Lab 1: Basic Subscribe](./lab-01-basic-subscribe.md)
- Understanding of HTTP requests and JSON parsing
- Familiarity with async/await and promises
- Access to a PubNub keyset

## Learning Outcomes

By the end of this lab, you will be able to:

1. Make initial subscribe request (tt=0) and parse the handshake response
2. Implement the long-poll cycle with timetoken and region management
3. Handle message delivery and timeout scenarios
4. Implement error handling and reconnection logic
5. Understand why PubNub uses HTTP/1.1 long-poll over TCP

## Why This Lab Matters

Understanding the subscribe loop at the protocol level helps you:
- **Debug connection issues** - Know what's happening under the hood
- **Build custom clients** - For platforms without official SDKs
- **Optimize performance** - Make informed decisions about subscription management
- **Troubleshoot problems** - Understand timetoken/region mechanics

The PubNub SDK does all of this for you, but understanding the protocol makes you a better solution architect.

## Lab Setup

Create a new file `lab-02-subscribe-loop.js`:

```javascript
// We'll use node-fetch for HTTP requests
// Install: npm install node-fetch@2
const fetch = require('node-fetch');

const SUBSCRIBE_KEY = 'YOUR_SUBSCRIBE_KEY';
const UUID = 'lab-user-raw-subscribe';

console.log('🚀 Raw Subscribe Loop Implementation\n');
```

## Background: The Subscribe Protocol

### REST API Endpoint

```
GET https://ps.pndsn.com/v2/subscribe/{sub_key}/{channels}/0
  ?tt={timetoken}      // 0 for init, then use previous timetoken
  &tr={region}         // Region from previous response (after init)
  &uuid={user_id}      // Required: client identifier
```

### Response Format

```json
{
  "t": {
    "t": "17069876543210000",  // Timetoken for next request
    "r": 12                     // Region code
  },
  "m": [                        // Messages array (empty or populated)
    {
      "c": "channel.name",      // Channel
      "d": { /* message */ },   // Message data
      "p": {
        "t": "17069876543210000",  // Publish timetoken
        "r": 12
      },
      "i": "publisher-uuid"     // Publisher UUID
    }
  ]
}
```

### The Long-Poll Cycle

1. **Initial request** - `tt=0` (no `tr` parameter)
   - Returns timetoken and region immediately
   - No messages expected

2. **Long-poll request** - Use timetoken and region from previous response
   - Server holds connection up to 280 seconds
   - Returns immediately if messages arrive
   - Returns empty `m: []` if timeout occurs

3. **Repeat** - Use latest timetoken and region
   - Cycle continues indefinitely

## Exercise 1: Initial Subscribe (tt=0)

### Task

Make the initial subscribe request to get the starting timetoken and region.

### Implementation

```javascript
const fetch = require('node-fetch');

const SUBSCRIBE_KEY = 'YOUR_SUBSCRIBE_KEY';
const UUID = 'lab-user-ex1';
const CHANNEL = 'test.raw.subscribe';

async function initialSubscribe() {
  console.log('Exercise 1: Initial Subscribe\n');
  
  // Build URL with tt=0
  const url = `https://ps.pndsn.com/v2/subscribe/${SUBSCRIBE_KEY}/${CHANNEL}/0?tt=0&uuid=${UUID}`;
  
  console.log('📡 Making initial request (tt=0)...');
  console.log(`URL: ${url}\n`);
  
  try {
    // Make HTTP GET request
    const response = await fetch(url);
    
    // Check HTTP status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Parse JSON response
    const data = await response.json();
    
    console.log('✅ Initial response received:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    
    // Extract timetoken and region
    const timetoken = data.t.t;
    const region = data.t.r;
    const messages = data.m;
    
    console.log('📊 Parsed values:');
    console.log(`  Timetoken: ${timetoken}`);
    console.log(`  Region: ${region}`);
    console.log(`  Messages: ${messages.length} (should be 0 for init)`);
    console.log('');
    
    return { timetoken, region };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run exercise
initialSubscribe()
  .then(result => {
    console.log('✓ Exercise 1 Complete');
    console.log(`Next subscribe will use: tt=${result.timetoken}&tr=${result.region}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('✗ Exercise 1 Failed');
    process.exit(1);
  });
```

### Expected Output

```
Exercise 1: Initial Subscribe

📡 Making initial request (tt=0)...
URL: https://ps.pndsn.com/v2/subscribe/sub-c-xxx/test.raw.subscribe/0?tt=0&uuid=lab-user-ex1

✅ Initial response received:
{
  "t": {
    "t": "17069876543210000",
    "r": 12
  },
  "m": []
}

📊 Parsed values:
  Timetoken: 17069876543210000
  Region: 12
  Messages: 0 (should be 0 for init)

✓ Exercise 1 Complete
Next subscribe will use: tt=17069876543210000&tr=12
```

### Verification

1. Did the request return immediately (not a long-poll)?
2. Is `m` array empty?
3. Did you receive both timetoken and region?

## Exercise 2: Long-Poll Cycle

### Task

Implement the subscribe loop that waits for messages and handles timeouts.

### Implementation

```javascript
const fetch = require('node-fetch');

const SUBSCRIBE_KEY = 'YOUR_SUBSCRIBE_KEY';
const UUID = 'lab-user-ex2';
const CHANNEL = 'test.raw.subscribe';

async function subscribeLoop(onMessage) {
  console.log('Exercise 2: Subscribe Long-Poll Loop\n');
  console.log(`Subscribing to: ${CHANNEL}\n`);
  
  let timetoken = '0';
  let region = '';
  let loopCount = 0;
  
  while (true) {
    loopCount++;
    console.log(`[Loop ${loopCount}] Making subscribe request...`);
    
    try {
      // Build URL
      let url = `https://ps.pndsn.com/v2/subscribe/${SUBSCRIBE_KEY}/${CHANNEL}/0?tt=${timetoken}&uuid=${UUID}`;
      
      // Add region parameter after initial request
      if (region) {
        url += `&tr=${region}`;
      }
      
      console.log(`  URL: ${url}`);
      
      // Make request (this will block up to 280 seconds if no messages)
      const startTime = Date.now();
      const response = await fetch(url);
      const duration = Date.now() - startTime;
      
      console.log(`  Response received after ${duration}ms`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json();
      
      // Update timetoken and region for next request
      timetoken = data.t.t;
      region = data.t.r;
      
      // Process messages
      const messages = data.m || [];
      
      if (messages.length > 0) {
        console.log(`  ✅ Received ${messages.length} message(s)`);
        
        // Call onMessage callback for each message
        messages.forEach(msg => {
          console.log(`  📨 Message from ${msg.c}:`);
          console.log(`     ${JSON.stringify(msg.d)}`);
          
          if (onMessage) {
            onMessage({
              channel: msg.c,
              message: msg.d,
              timetoken: msg.p.t,
              publisher: msg.i
            });
          }
        });
      } else {
        console.log(`  ⏱️  Long-poll timeout (no messages)`);
      }
      
      console.log(`  Next request: tt=${timetoken}, tr=${region}\n`);
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      console.log(`  Retrying in 2 seconds...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Run exercise
console.log('🚀 Starting subscribe loop...');
console.log('📝 Open another terminal and publish messages to see them arrive\n');

subscribeLoop((event) => {
  // This callback is called for each message
  console.log(`\n[CALLBACK] Message received on ${event.channel}:`);
  console.log(JSON.stringify(event.message, null, 2));
  console.log('');
});
```

### Expected Output

```
Exercise 2: Subscribe Long-Poll Loop

Subscribing to: test.raw.subscribe

🚀 Starting subscribe loop...
📝 Open another terminal and publish messages to see them arrive

[Loop 1] Making subscribe request...
  URL: https://ps.pndsn.com/v2/subscribe/sub-c-xxx/test.raw.subscribe/0?tt=0&uuid=lab-user-ex2
  Response received after 42ms
  ⏱️  Long-poll timeout (no messages)
  Next request: tt=17069876543210000, tr=12

[Loop 2] Making subscribe request...
  URL: https://ps.pndsn.com/v2/subscribe/sub-c-xxx/test.raw.subscribe/0?tt=17069876543210000&uuid=lab-user-ex2&tr=12
  Response received after 87234ms
  ⏱️  Long-poll timeout (no messages)
  Next request: tt=17069876543298734, tr=12

(When a message is published:)

[Loop 3] Making subscribe request...
  URL: https://ps.pndsn.com/v2/subscribe/sub-c-xxx/test.raw.subscribe/0?tt=17069876543298734&uuid=lab-user-ex2&tr=12
  Response received after 1523ms
  ✅ Received 1 message(s)
  📨 Message from test.raw.subscribe:
     {"type":"test.message","payload":{"text":"Hello!"}}

[CALLBACK] Message received on test.raw.subscribe:
{
  "type": "test.message",
  "payload": {
    "text": "Hello!"
  }
}

  Next request: tt=17069876543301257, tr=12
```

### Testing

**Terminal 1:** Run the subscribe loop
```bash
node lab-02-exercise-2.js
```

**Terminal 2:** Publish test messages
```javascript
// test-publish-to-raw.js
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'test-publisher'
});

async function publishTest() {
  for (let i = 1; i <= 3; i++) {
    await pubnub.publish({
      channel: 'test.raw.subscribe',
      message: {
        type: 'test.message',
        number: i,
        payload: { text: `Test message ${i}` }
      }
    });
    console.log(`✅ Published message ${i}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  process.exit(0);
}

publishTest();
```

### Observations

1. **Initial request** returns immediately (no long-poll)
2. **Subsequent requests** block for up to 280 seconds
3. **When message arrives**, response returns immediately
4. **Timetoken updates** with each response
5. **Region stays consistent** across requests

## Exercise 3: Error Handling

### Task

Add error handling for network failures and HTTP errors.

### Implementation

```javascript
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

const SUBSCRIBE_KEY = 'YOUR_SUBSCRIBE_KEY';
const UUID = 'lab-user-ex3';
const CHANNEL = 'test.raw.subscribe';

async function robustSubscribeLoop(onMessage) {
  console.log('Exercise 3: Subscribe Loop with Error Handling\n');
  
  let timetoken = '0';
  let region = '';
  let retryCount = 0;
  const MAX_RETRIES = 5;
  
  while (true) {
    try {
      // Build URL
      let url = `https://ps.pndsn.com/v2/subscribe/${SUBSCRIBE_KEY}/${CHANNEL}/0?tt=${timetoken}&uuid=${UUID}`;
      if (region) url += `&tr=${region}`;
      
      console.log(`[Subscribe] tt=${timetoken.slice(-8)}, region=${region || 'N/A'}`);
      
      // Add timeout (320 seconds to account for 280s server timeout)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 320000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      // Handle HTTP errors
      if (response.status === 403) {
        console.error('❌ 403 Forbidden - Check Access Manager token');
        console.log('Stopping subscribe loop (auth error)');
        break;
        
      } else if (response.status === 400) {
        console.error('❌ 400 Bad Request - Check parameters');
        console.log('Stopping subscribe loop (client error)');
        break;
        
      } else if (response.status >= 500) {
        console.error(`⚠️  ${response.status} Server Error - Retrying...`);
        throw new Error(`Server error: ${response.status}`);
        
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json();
      
      // Update state
      timetoken = data.t.t;
      region = data.t.r;
      
      // Process messages
      const messages = data.m || [];
      if (messages.length > 0) {
        console.log(`📨 Received ${messages.length} message(s)`);
        messages.forEach(msg => {
          if (onMessage) onMessage({
            channel: msg.c,
            message: msg.d,
            timetoken: msg.p.t,
            publisher: msg.i
          });
        });
      }
      
      // Reset retry count on success
      retryCount = 0;
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      
      // Handle AbortError (timeout)
      if (error.name === 'AbortError') {
        console.log('⏱️  Request timeout (>320s) - This should not happen normally');
        console.log('Server timeout is 280s, check network connection');
      }
      
      // Exponential backoff
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        console.error(`❌ Max retries (${MAX_RETRIES}) reached, stopping`);
        break;
      }
      
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} in ${backoffDelay}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

// Run exercise
console.log('🚀 Starting robust subscribe loop...\n');

robustSubscribeLoop((event) => {
  console.log(`\n[MESSAGE] ${event.channel}:`);
  console.log(JSON.stringify(event.message, null, 2));
  console.log('');
});
```

### Error Scenarios to Test

1. **Network disconnection** - Disconnect WiFi and observe retry behavior
2. **Invalid subscribe key** - Use wrong key to trigger 400 error
3. **Access Manager** - If enabled, test with invalid token (403)

## Exercise 4: Full Implementation

### Task

Combine all elements into a production-ready subscribe client.

### Implementation

```javascript
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

class PubNubRawSubscriber {
  constructor(subscribeKey, uuid) {
    this.subscribeKey = subscribeKey;
    this.uuid = uuid;
    this.timetoken = '0';
    this.region = '';
    this.running = false;
    this.messageCallback = null;
    this.statusCallback = null;
  }
  
  onMessage(callback) {
    this.messageCallback = callback;
  }
  
  onStatus(callback) {
    this.statusCallback = callback;
  }
  
  async subscribe(channels) {
    this.channels = Array.isArray(channels) ? channels.join(',') : channels;
    this.running = true;
    
    this.emitStatus('connecting');
    
    await this.subscribeLoop();
  }
  
  unsubscribe() {
    this.running = false;
    this.emitStatus('disconnected');
  }
  
  emitStatus(category, details = {}) {
    if (this.statusCallback) {
      this.statusCallback({ category, ...details });
    }
  }
  
  async subscribeLoop() {
    let retryCount = 0;
    const MAX_RETRIES = 10;
    
    while (this.running) {
      try {
        // Build URL
        let url = `https://ps.pndsn.com/v2/subscribe/${this.subscribeKey}/${this.channels}/0?tt=${this.timetoken}&uuid=${this.uuid}`;
        if (this.region) url += `&tr=${this.region}`;
        
        // Make request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 320000);
        
        const startTime = Date.now();
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;
        
        // Handle errors
        if (response.status === 403) {
          this.emitStatus('access_denied');
          break;
        } else if (response.status === 400) {
          this.emitStatus('bad_request');
          break;
        } else if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        } else if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        // Parse response
        const data = await response.json();
        
        // Update state
        const previousTimetoken = this.timetoken;
        this.timetoken = data.t.t;
        this.region = data.t.r;
        
        // Emit connected on first successful request
        if (previousTimetoken === '0') {
          this.emitStatus('connected', { channels: this.channels.split(',') });
        } else if (retryCount > 0) {
          this.emitStatus('reconnected');
        }
        
        // Process messages
        const messages = data.m || [];
        if (messages.length > 0 && this.messageCallback) {
          messages.forEach(msg => {
            this.messageCallback({
              channel: msg.c,
              message: msg.d,
              timetoken: msg.p.t,
              publisher: msg.i
            });
          });
        }
        
        // Reset retry count
        retryCount = 0;
        
      } catch (error) {
        this.emitStatus('network_error', { error: error.message });
        
        // Retry with backoff
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          this.emitStatus('max_retries_reached');
          break;
        }
        
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
}

// Usage example
const subscriber = new PubNubRawSubscriber(
  'YOUR_SUBSCRIBE_KEY',
  'lab-user-final'
);

subscriber.onStatus((event) => {
  console.log(`[STATUS] ${event.category}`);
  if (event.channels) {
    console.log(`  Channels: ${event.channels.join(', ')}`);
  }
});

subscriber.onMessage((event) => {
  console.log(`\n[MESSAGE] ${event.channel}`);
  console.log(JSON.stringify(event.message, null, 2));
  console.log('');
});

console.log('🚀 Starting custom PubNub subscriber...\n');

subscriber.subscribe(['test.raw.subscribe']);

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n👋 Unsubscribing...');
  subscriber.unsubscribe();
  process.exit(0);
});
```

### Expected Output

```
🚀 Starting custom PubNub subscriber...

[STATUS] connecting
[STATUS] connected
  Channels: test.raw.subscribe

[MESSAGE] test.raw.subscribe
{
  "type": "test.message",
  "payload": {
    "text": "Hello from raw subscriber!"
  }
}
```

## Discussion Questions

### 1. Why does PubNub use HTTP/1.1 long-poll over TCP?

**Answer:**
- **Maximum compatibility** - Works through corporate firewalls and proxies
- **No WebSocket upgrade** - Standard HTTP/HTTPS ports (80/443)
- **Proxy-friendly** - HTTP proxies handle long-poll connections well
- **Simpler reconnection** - Connection drops are normal part of protocol
- **Backpressure management** - Natural flow control through request/response cycle

WebSockets require upgrade handshake which often fails in restricted networks.

### 2. What happens if the client doesn't send the next request quickly enough?

**Answer:**
- Gap in long-poll coverage - no active connection
- Messages published during gap are **not** received in real-time
- Messages still stored in history (if persistence enabled)
- Must use history to catch up when reconnecting
- SDK avoids this by immediately sending next request

### 3. How would you add support for multiple channels?

**Answer:**
```javascript
// Comma-separated channel list in URL
const channels = ['chat.room1', 'chat.room2', 'alerts.system'].join(',');
const url = `https://ps.pndsn.com/v2/subscribe/${subKey}/${channels}/0?...`;

// Messages include channel name in response
messages.forEach(msg => {
  console.log(`Channel: ${msg.c}`);  // Identifies which channel
});
```

### 4. What's the purpose of the `region` parameter?

**Answer:**
- Routes subsequent requests to same Point of Presence (PoP)
- Ensures subscription state consistency
- Reduces cross-region latency
- Returned in initial response, must be included in all subsequent requests

### 5. Why is there both a client timeout (310s) and server timeout (280s)?

**Answer:**
- **Server timeout (280s)** - Fixed, server responds with empty message array
- **Client timeout (310s)** - Buffer to account for network latency
- Client timeout > server timeout ensures server has time to respond normally
- Prevents premature client-side timeout interrupting normal server response

## Lab Completion Checklist

- [ ] Made initial subscribe request with `tt=0`
- [ ] Parsed timetoken and region from response
- [ ] Implemented long-poll cycle with timetoken/region updates
- [ ] Handled message delivery correctly
- [ ] Detected and logged long-poll timeouts (empty message array)
- [ ] Implemented error handling for HTTP errors
- [ ] Added exponential backoff for retry logic
- [ ] Built complete subscriber class with callbacks
- [ ] Tested with actual published messages
- [ ] Understood why HTTP/1.1 is used instead of WebSockets

## Key Insights

After completing this lab, you should understand:

1. **The handshake** - Initial `tt=0` request establishes timetoken and region
2. **The long-poll** - Server holds connection, responds when messages arrive or after 280s
3. **The cycle** - Client immediately sends next request with updated timetoken/region
4. **Timetoken management** - Always use latest timetoken from previous response
5. **Region consistency** - Include region parameter for routing to same PoP
6. **Error handling** - Distinguish between retryable (5xx) and permanent (4xx) errors
7. **Protocol efficiency** - One connection handles indefinite message stream

## Next Steps

- Complete [Lab 3: Pub/Sub Integration](./lab-03-pubsub-integration.md) - Use SDK to build complete messaging flow
- Review [03. Advanced Subscribe](../03-advanced-subscribe.md) - Connection management patterns
- Study [04. Publish-Subscribe Flow](../04-publish-subscribe-flow.md) - End-to-end timing

## Additional Resources

- [PubNub Subscribe REST API Documentation](https://www.pubnub.com/docs/general/rest-api/subscribe)
- [Long-Polling Wikipedia](https://en.wikipedia.org/wiki/Push_technology#Long_polling)
- [HTTP/1.1 Specification (RFC 7230)](https://tools.ietf.org/html/rfc7230)

---

**Congratulations!** You've implemented the PubNub subscribe protocol from scratch. This deep understanding will help you debug issues, optimize performance, and architect better real-time systems.
