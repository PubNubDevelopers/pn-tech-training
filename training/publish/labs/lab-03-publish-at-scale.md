# Lab 3: Publish at Scale

## Objective

Learn to optimize publish operations for high-throughput scenarios, including batching, queuing, channel sharding, and performance measurement.

**Time Estimate:** 60-75 minutes

## Prerequisites

- Completed [Lab 1: Basic Publish](./lab-01-basic-publish.md) and [Lab 2: Message Patterns](./lab-02-message-patterns.md)
- Read [03. Advanced Publish](../03-advanced-publish.md)
- Understanding of async/promises and performance measurement
- Access to a PubNub keyset

## Learning Outcomes

By the end of this lab, you will be able to:

1. Measure baseline publish latency and throughput
2. Implement message batching and queuing
3. Test and handle throttling behavior (429 errors)
4. Compare Fire vs Store performance
5. Shard channels to avoid hot spots
6. Optimize for high-volume publishing scenarios

## Lab Setup

Create a new file `lab-03-scale.js`:

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-003'
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Lab 03: Publish at Scale initialized\n');
```

## Exercise 1: Baseline Performance Measurement

### Task

Measure baseline publish latency and throughput.

### Implementation

```javascript
class PerformanceMetrics {
  constructor() {
    this.publishes = [];
    this.errors = [];
  }
  
  recordPublish(latency, size) {
    this.publishes.push({ latency, size, timestamp: Date.now() });
  }
  
  recordError(error) {
    this.errors.push({ error, timestamp: Date.now() });
  }
  
  getStats() {
    if (this.publishes.length === 0) {
      return { count: 0 };
    }
    
    const latencies = this.publishes.map(p => p.latency);
    const sizes = this.publishes.map(p => p.size);
    
    return {
      count: this.publishes.length,
      errorCount: this.errors.length,
      latency: {
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p50: this.percentile(latencies, 0.5),
        p95: this.percentile(latencies, 0.95),
        p99: this.percentile(latencies, 0.99)
      },
      size: {
        min: Math.min(...sizes),
        max: Math.max(...sizes),
        avg: sizes.reduce((a, b) => a + b, 0) / sizes.length
      }
    };
  }
  
  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
  
  reset() {
    this.publishes = [];
    this.errors = [];
  }
}

async function measureBaseline(messageCount = 100) {
  console.log('=== Exercise 1: Baseline Performance ===\n');
  console.log(`Publishing ${messageCount} messages...`);
  
  const metrics = new PerformanceMetrics();
  const channel = 'test.baseline';
  
  const startTime = Date.now();
  
  for (let i = 0; i < messageCount; i++) {
    const message = {
      type: 'test.baseline',
      schemaVersion: '1.0',
      eventId: `evt_${Date.now()}_${i}`,
      ts: Date.now(),
      payload: {
        sequence: i,
        data: 'x'.repeat(100)  // ~100 bytes payload
      }
    };
    
    const messageSize = JSON.stringify(message).length;
    const publishStart = Date.now();
    
    try {
      await pubnub.publish({ channel, message });
      const latency = Date.now() - publishStart;
      metrics.recordPublish(latency, messageSize);
      
      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r  Progress: ${i + 1}/${messageCount}`);
      }
    } catch (error) {
      metrics.recordError(error);
    }
  }
  
  const totalTime = Date.now() - startTime;
  const stats = metrics.getStats();
  
  console.log('\n\nResults:');
  console.log('  Total messages:', stats.count);
  console.log('  Errors:', stats.errorCount);
  console.log('  Total time:', totalTime, 'ms');
  console.log('  Throughput:', (stats.count / (totalTime / 1000)).toFixed(2), 'msg/sec');
  console.log('\nLatency (ms):');
  console.log('  Min:', stats.latency.min);
  console.log('  Avg:', stats.latency.avg.toFixed(2));
  console.log('  Max:', stats.latency.max);
  console.log('  P50:', stats.latency.p50);
  console.log('  P95:', stats.latency.p95);
  console.log('  P99:', stats.latency.p99);
  console.log('\nMessage Size (bytes):');
  console.log('  Avg:', stats.size.avg.toFixed(0));
  
  return stats;
}

measureBaseline(100)
  .then(() => console.log('\n✓ Exercise 1 complete\n'))
  .catch(error => console.error('\n✗ Exercise 1 failed:', error));
```

### Expected Output

```
=== Exercise 1: Baseline Performance ===

Publishing 100 messages...
  Progress: 100/100

Results:
  Total messages: 100
  Errors: 0
  Total time: 5234 ms
  Throughput: 19.11 msg/sec

Latency (ms):
  Min: 28
  Avg: 45.23
  Max: 125
  P50: 42
  P95: 78
  P99: 115

Message Size (bytes):
  Avg: 234

✓ Exercise 1 complete
```

## Exercise 2: Batched Publishing

### Task

Implement batching to improve throughput with parallel publishes.

### Implementation

```javascript
async function batchPublish(messages, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    
    // Publish batch in parallel
    const batchResults = await Promise.all(
      batch.map(msg => pubnub.publish({ channel: msg.channel, message: msg.data }))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

async function compareBatchSizes() {
  console.log('=== Exercise 2: Batching ===\n');
  
  const messageCount = 100;
  const testMessages = Array.from({ length: messageCount }, (_, i) => ({
    channel: 'test.batch',
    data: {
      type: 'test.batch',
      schemaVersion: '1.0',
      eventId: `evt_batch_${i}`,
      ts: Date.now(),
      payload: { sequence: i }
    }
  }));
  
  // Test different batch sizes
  const batchSizes = [1, 5, 10, 20];
  
  for (const batchSize of batchSizes) {
    console.log(`Testing batch size: ${batchSize}`);
    
    const startTime = Date.now();
    await batchPublish(testMessages, batchSize);
    const totalTime = Date.now() - startTime;
    
    const throughput = (messageCount / (totalTime / 1000)).toFixed(2);
    console.log(`  Time: ${totalTime}ms`);
    console.log(`  Throughput: ${throughput} msg/sec\n`);
    
    await sleep(1000);  // Pause between tests
  }
  
  console.log('✅ Batching comparison complete');
}

compareBatchSizes()
  .then(() => console.log('\n✓ Exercise 2 complete\n'))
  .catch(error => console.error('\n✗ Exercise 2 failed:', error));
```

### Expected Output

```
=== Exercise 2: Batching ===

Testing batch size: 1
  Time: 5234ms
  Throughput: 19.11 msg/sec

Testing batch size: 5
  Time: 2845ms
  Throughput: 35.15 msg/sec

Testing batch size: 10
  Time: 1923ms
  Throughput: 52.00 msg/sec

Testing batch size: 20
  Time: 1567ms
  Throughput: 63.82 msg/sec

✅ Batching comparison complete

✓ Exercise 2 complete
```

## Exercise 3: Message Queue Implementation

### Task

Implement a message queue to control publish rate and handle backpressure.

### Implementation

```javascript
class PublishQueue {
  constructor(pubnub, options = {}) {
    this.pubnub = pubnub;
    this.queue = [];
    this.messagesPerSecond = options.rate || 100;
    this.interval = 1000 / this.messagesPerSecond;
    this.processing = false;
    this.metrics = {
      enqueued: 0,
      processed: 0,
      failed: 0
    };
  }
  
  enqueue(channel, message) {
    return new Promise((resolve, reject) => {
      this.queue.push({ channel, message, resolve, reject });
      this.metrics.enqueued++;
      
      if (!this.processing) {
        this.process();
      }
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    console.log('Queue processing started...');
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        const result = await this.pubnub.publish({
          channel: item.channel,
          message: item.message
        });
        
        this.metrics.processed++;
        item.resolve(result);
      } catch (error) {
        this.metrics.failed++;
        item.reject(error);
      }
      
      // Rate limiting delay
      if (this.queue.length > 0) {
        await sleep(this.interval);
      }
      
      // Progress update
      if (this.metrics.processed % 10 === 0) {
        process.stdout.write(`\r  Processed: ${this.metrics.processed}, Queue: ${this.queue.length}`);
      }
    }
    
    console.log('\nQueue processing complete');
    this.processing = false;
  }
  
  size() {
    return this.queue.length;
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
}

async function testMessageQueue() {
  console.log('=== Exercise 3: Message Queue ===\n');
  
  const queue = new PublishQueue(pubnub, { rate: 50 });  // 50 msg/sec
  
  console.log('Enqueueing 100 messages...');
  
  const enqueuePromises = [];
  for (let i = 0; i < 100; i++) {
    const promise = queue.enqueue('test.queue', {
      type: 'test.queued',
      schemaVersion: '1.0',
      eventId: `evt_queue_${i}`,
      ts: Date.now(),
      payload: { sequence: i }
    });
    
    enqueuePromises.push(promise);
  }
  
  console.log('All messages enqueued, queue size:', queue.size());
  console.log('');
  
  // Wait for all to complete
  const startTime = Date.now();
  await Promise.all(enqueuePromises);
  const totalTime = Date.now() - startTime;
  
  const metrics = queue.getMetrics();
  console.log('\nQueue Metrics:');
  console.log('  Enqueued:', metrics.enqueued);
  console.log('  Processed:', metrics.processed);
  console.log('  Failed:', metrics.failed);
  console.log('  Total time:', totalTime, 'ms');
  console.log('  Throughput:', (metrics.processed / (totalTime / 1000)).toFixed(2), 'msg/sec');
}

testMessageQueue()
  .then(() => console.log('\n✓ Exercise 3 complete\n'))
  .catch(error => console.error('\n✗ Exercise 3 failed:', error));
```

## Exercise 4: Throttling Test (429 Errors)

### Task

Intentionally trigger rate limiting and measure recovery with exponential backoff.

### Implementation

```javascript
async function testThrottling() {
  console.log('=== Exercise 4: Throttling Test ===\n');
  console.log('Publishing rapidly to trigger rate limiting...\n');
  
  const metrics = {
    success: 0,
    throttled: 0,
    retries: 0
  };
  
  async function publishWithBackoff(channel, message, attempt = 0) {
    try {
      await pubnub.publish({ channel, message });
      metrics.success++;
      return true;
      
    } catch (error) {
      if (error.status?.statusCode === 429) {
        metrics.throttled++;
        
        if (attempt < 3) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.log(`  ⚠️  Rate limited, backing off ${delay}ms (attempt ${attempt + 1})`);
          
          await sleep(delay);
          metrics.retries++;
          return publishWithBackoff(channel, message, attempt + 1);
        }
        
        return false;
      }
      
      throw error;
    }
  }
  
  // Publish 200 messages as fast as possible
  const promises = [];
  for (let i = 0; i < 200; i++) {
    const promise = publishWithBackoff('test.throttle', {
      type: 'test.throttle',
      schemaVersion: '1.0',
      eventId: `evt_throttle_${i}`,
      ts: Date.now(),
      payload: { sequence: i }
    });
    
    promises.push(promise);
  }
  
  await Promise.all(promises);
  
  console.log('\nThrottling Test Results:');
  console.log('  Successful publishes:', metrics.success);
  console.log('  Throttled (429):', metrics.throttled);
  console.log('  Retries:', metrics.retries);
  console.log('  Success rate:', ((metrics.success / 200) * 100).toFixed(1) + '%');
}

testThrottling()
  .then(() => console.log('\n✓ Exercise 4 complete\n'))
  .catch(error => console.error('\n✗ Exercise 4 failed:', error));
```

## Exercise 5: Fire vs Store Performance

### Task

Compare performance of Fire (norep: true) vs regular Publish (Store).

### Implementation

```javascript
async function compareFireVsStore() {
  console.log('=== Exercise 5: Fire vs Store ===\n');
  
  const messageCount = 50;
  
  // Test 1: Regular Publish (Store)
  console.log('Test 1: Regular Publish (with replication and storage)');
  let startTime = Date.now();
  
  for (let i = 0; i < messageCount; i++) {
    await pubnub.publish({
      channel: 'test.store',
      message: {
        type: 'test.store',
        eventId: `evt_store_${i}`,
        ts: Date.now(),
        payload: { sequence: i }
      },
      storeInHistory: true
    });
  }
  
  const storeTime = Date.now() - startTime;
  const storeThroughput = (messageCount / (storeTime / 1000)).toFixed(2);
  
  console.log(`  Time: ${storeTime}ms`);
  console.log(`  Throughput: ${storeThroughput} msg/sec\n`);
  
  await sleep(2000);
  
  // Test 2: Fire (no replication, no storage)
  console.log('Test 2: Fire (no replication, Functions/Illuminate only)');
  startTime = Date.now();
  
  for (let i = 0; i < messageCount; i++) {
    await pubnub.fire({
      channel: 'test.fire',
      message: {
        type: 'test.fire',
        eventId: `evt_fire_${i}`,
        ts: Date.now(),
        payload: { sequence: i }
      }
    });
  }
  
  const fireTime = Date.now() - startTime;
  const fireThroughput = (messageCount / (fireTime / 1000)).toFixed(2);
  
  console.log(`  Time: ${fireTime}ms`);
  console.log(`  Throughput: ${fireThroughput} msg/sec\n`);
  
  // Comparison
  console.log('Comparison:');
  console.log(`  Fire is ${(storeTime / fireTime).toFixed(2)}x faster`);
  console.log(`  Latency reduction: ${((storeTime - fireTime) / messageCount).toFixed(1)}ms per message`);
}

compareFireVsStore()
  .then(() => console.log('\n✓ Exercise 5 complete\n'))
  .catch(error => console.error('\n✗ Exercise 5 failed:', error));
```

## Exercise 6: Channel Sharding

### Task

Implement channel sharding to distribute load and avoid hot channels.

### Implementation

```javascript
class ChannelSharding {
  constructor(baseChannel, shardCount = 10) {
    this.baseChannel = baseChannel;
    this.shardCount = shardCount;
  }
  
  getShardChannel(key) {
    // Simple hash function
    const hash = this.simpleHash(key);
    const shardId = hash % this.shardCount;
    return `${this.baseChannel}.shard-${shardId}`;
  }
  
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;  // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  getAllShardChannels() {
    return Array.from({ length: this.shardCount }, (_, i) => 
      `${this.baseChannel}.shard-${i}`
    );
  }
}

async function testSharding() {
  console.log('=== Exercise 6: Channel Sharding ===\n');
  
  const sharding = new ChannelSharding('notifications', 10);
  
  console.log('Shard channels:', sharding.getAllShardChannels().join(', '));
  console.log('');
  
  // Simulate 100 users publishing
  const users = Array.from({ length: 100 }, (_, i) => `user_${i}`);
  const shardDistribution = {};
  
  console.log('Publishing to sharded channels...');
  
  for (const userId of users) {
    const shardChannel = sharding.getShardChannel(userId);
    
    // Track distribution
    shardDistribution[shardChannel] = (shardDistribution[shardChannel] || 0) + 1;
    
    await pubnub.publish({
      channel: shardChannel,
      message: {
        type: 'notification.user',
        eventId: `evt_${userId}`,
        ts: Date.now(),
        payload: { userId }
      }
    });
  }
  
  console.log('\nShard Distribution:');
  Object.entries(shardDistribution)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([shard, count]) => {
      const bar = '█'.repeat(count / 2);
      console.log(`  ${shard}: ${count.toString().padStart(3)} ${bar}`);
    });
  
  console.log('\n✅ Sharding test complete');
  console.log('   Users distributed across', Object.keys(shardDistribution).length, 'shards');
}

testSharding()
  .then(() => console.log('\n✓ Exercise 6 complete\n'))
  .catch(error => console.error('\n✗ Exercise 6 failed:', error));
```

### Expected Output

```
=== Exercise 6: Channel Sharding ===

Shard channels: notifications.shard-0, notifications.shard-1, ..., notifications.shard-9

Publishing to sharded channels...

Shard Distribution:
  notifications.shard-0:  12 ████████
  notifications.shard-1:   9 ████
  notifications.shard-2:  11 █████
  notifications.shard-3:   8 ████
  notifications.shard-4:  13 ██████
  notifications.shard-5:   7 ███
  notifications.shard-6:  10 █████
  notifications.shard-7:  12 ██████
  notifications.shard-8:   9 ████
  notifications.shard-9:   9 ████

✅ Sharding test complete
   Users distributed across 10 shards

✓ Exercise 6 complete
```

## Challenge Exercise: Production-Ready Publisher

### Task

Build a production-ready publisher class that combines all optimization techniques.

### Requirements

1. Message queuing with configurable rate
2. Automatic retry with exponential backoff
3. Channel sharding support
4. Performance metrics collection
5. Error handling and logging
6. Graceful shutdown

### Template

```javascript
class ProductionPublisher {
  constructor(pubnub, options = {}) {
    this.pubnub = pubnub;
    this.rate = options.rate || 100;  // msg/sec
    this.maxRetries = options.maxRetries || 3;
    this.shardCount = options.shardCount || 10;
    
    // Your implementation here
  }
  
  async publish(channel, message, options = {}) {
    // Implement with all optimizations
  }
  
  getMetrics() {
    // Return performance metrics
  }
  
  async shutdown() {
    // Graceful shutdown
  }
}

// Test the production publisher
const publisher = new ProductionPublisher(pubnub, {
  rate: 50,
  maxRetries: 3,
  shardCount: 10
});

// Publish 1000 messages
for (let i = 0; i < 1000; i++) {
  await publisher.publish('test.prod', {
    type: 'test.production',
    payload: { sequence: i }
  });
}

console.log('Metrics:', publisher.getMetrics());
await publisher.shutdown();
```

## Lab Completion Checklist

- [ ] Measured baseline publish performance
- [ ] Implemented and tested batched publishing
- [ ] Created message queue with rate control
- [ ] Triggered and handled rate limiting (429)
- [ ] Compared Fire vs Store performance
- [ ] Implemented channel sharding
- [ ] Built production-ready publisher class
- [ ] Documented performance improvements

## Performance Summary

Record your findings:

| Technique | Throughput Improvement | Use Cases |
|-----------|----------------------|-----------|
| Baseline | ___ msg/sec | Reference |
| Batching (size 10) | ___ msg/sec | Bulk operations |
| Message Queue | ___ msg/sec | Controlled rate |
| Fire vs Store | ___ x faster | Analytics only |
| Channel Sharding | Distributes load | High traffic |

## Key Takeaways

1. **Batching**: Parallel publishes significantly improve throughput
2. **Queueing**: Control rate to avoid throttling
3. **Fire**: Use for analytics/Functions only (no subscribers needed)
4. **Sharding**: Distribute load across channels for scalability
5. **Monitoring**: Track metrics to identify bottlenecks

## Next Steps

- Review [04. Publish Integrations](../04-publish-integrations.md)
- Proceed to Module 2: Subscribe (coming soon)
- Apply optimizations to your real applications

## Additional Resources

- [PubNub Performance Best Practices](https://www.pubnub.com/docs/general/performance)
- [Rate Limiting Guide](https://www.pubnub.com/docs/general/rate-limits)
- [Channel Sharding Patterns](https://www.pubnub.com/docs/general/channels/best-practices)
