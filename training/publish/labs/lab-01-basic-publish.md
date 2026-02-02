# Lab 1: Basic Publish with Error Handling

## Objective

Learn to publish messages properly with robust error handling, including token refresh and rate limiting.

**Time Estimate:** 30-45 minutes

## Prerequisites

- Completed [01. Publish Fundamentals](../01-publish-fundamentals.md)
- Access to a PubNub keyset
- Basic knowledge of JavaScript/Node.js or your preferred SDK language
- Text editor or IDE

## Learning Outcomes

By the end of this lab, you will be able to:

1. Publish a message to a PubNub channel
2. Capture and log the timetoken
3. Handle 403 errors (token expiration/refresh)
4. Handle 429 errors (rate limiting with exponential backoff)

## Lab Setup

### Step 1: Initialize PubNub SDK

Create a new file `lab-01-publish.js`:

```javascript
const PubNub = require('pubnub');

// Initialize PubNub
const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-001',
  // authKey will be set later (from your token service)
});

console.log('PubNub initialized');
```

### Step 2: Get Configuration

You'll need from the PubNub Admin Portal:
- **Publish Key** (starts with `pub-c-`)
- **Subscribe Key** (starts with `sub-c-`)
- **Secret Key** (for token generation, starts with `sec-c-`) - Keep secure!

## Exercise 1: Basic Publish

### Task

Publish a simple message to a test channel and log the timetoken.

### Implementation

```javascript
async function basicPublish() {
  const channel = 'test.lab01';
  
  const message = {
    type: 'test.message',
    schemaVersion: '1.0',
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ts: Date.now(),
    payload: {
      text: 'Hello from Lab 01!',
      labExercise: 1
    }
  };
  
  console.log('Publishing message:', message);
  
  try {
    const result = await pubnub.publish({
      channel: channel,
      message: message
    });
    
    console.log('✅ Publish successful!');
    console.log('📍 Timetoken:', result.timetoken);
    console.log('📅 Timestamp:', new Date(parseInt(result.timetoken) / 10000));
    
    return result;
    
  } catch (error) {
    console.error('❌ Publish failed:', error.message);
    throw error;
  }
}

// Run the exercise
basicPublish()
  .then(() => console.log('\n✓ Exercise 1 complete'))
  .catch(error => console.error('\n✗ Exercise 1 failed:', error));
```

### Expected Output

```
Publishing message: { type: 'test.message', ... }
✅ Publish successful!
📍 Timetoken: 17069876543210000
📅 Timestamp: 2024-02-02T14:30:45.321Z

✓ Exercise 1 complete
```

### Verification Questions

1. What is the timetoken format? (Answer: 17-digit number representing 10-nanosecond intervals)
2. Why include `eventId` in the message? (Answer: For deduplication and auditing)
3. What does the timetoken represent? (Answer: Server timestamp when message was received)

## Exercise 2: Error Handling - 403 Forbidden

### Task

Simulate and handle token expiration (403 error).

### Background

When using Access Manager, tokens expire after their TTL. Clients must:
1. Detect 403 errors
2. Request a new token from your server
3. Update the SDK with the new token
4. Retry the publish

### Implementation

```javascript
// Simulate token refresh
async function refreshToken() {
  console.log('🔄 Refreshing token...');
  
  // In production, call your server's token endpoint:
  // const response = await fetch('https://your-api.com/token');
  // const { token } = await response.json();
  
  // For this lab, we'll simulate without delay
  // In production, this would be an async HTTP call to your server
  
  // In production, you'd get a real token from your server
  const newToken = 'simulated_token_' + Date.now();
  
  console.log('✅ Token refreshed:', newToken.substr(0, 20) + '...');
  return newToken;
}

async function publishWithTokenRefresh(channel, message) {
  try {
    const result = await pubnub.publish({ channel, message });
    console.log('✅ Publish successful:', result.timetoken);
    return result;
    
  } catch (error) {
    const statusCode = error.status?.statusCode;
    
    if (statusCode === 403) {
      console.warn('⚠️  403 Forbidden - Token expired or invalid');
      
      // Refresh token
      const newToken = await refreshToken();
      
      // Update PubNub SDK
      pubnub.setToken(newToken);
      
      // Retry publish
      console.log('🔁 Retrying publish with new token...');
      const result = await pubnub.publish({ channel, message });
      console.log('✅ Publish successful after token refresh:', result.timetoken);
      return result;
      
    } else {
      // Other error - re-throw
      throw error;
    }
  }
}

// Test the function
const testMessage = {
  type: 'test.message',
  schemaVersion: '1.0',
  eventId: `evt_${Date.now()}`,
  ts: Date.now(),
  payload: { text: 'Testing token refresh' }
};

publishWithTokenRefresh('test.lab01', testMessage)
  .then(() => console.log('\n✓ Exercise 2 complete'))
  .catch(error => console.error('\n✗ Exercise 2 failed:', error));
```

### Expected Output

```
⚠️  403 Forbidden - Token expired or invalid
🔄 Refreshing token...
✅ Token refreshed: simulated_token_1706...
🔁 Retrying publish with new token...
✅ Publish successful after token refresh: 17069876543210000

✓ Exercise 2 complete
```

### Discussion Questions

1. Why is it important to refresh tokens automatically?
2. Should you retry indefinitely on 403 errors? (Answer: No, limit retry attempts)
3. Where should token refresh logic live? (Answer: Centralized in your API client/SDK wrapper)

## Exercise 3: Error Handling - 429 Rate Limiting

### Task

Implement exponential backoff for rate limiting (429 errors).

### Background

When publishing too fast, PubNub returns HTTP 429. Proper handling:
1. Detect 429 errors
2. Implement exponential backoff
3. Add jitter to prevent thundering herd
4. Limit retry attempts

### Implementation

```javascript
async function publishWithBackoff(channel, message, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await pubnub.publish({ channel, message });
      
      if (attempt > 0) {
        console.log(`✅ Publish successful after ${attempt} retries`);
      } else {
        console.log('✅ Publish successful');
      }
      
      console.log('📍 Timetoken:', result.timetoken);
      return result;
      
    } catch (error) {
      const statusCode = error.status?.statusCode;
      
      if (statusCode === 429) {
        // Calculate exponential backoff
        const baseDelay = 1000;  // 1 second
        const maxDelay = 32000;   // 32 seconds
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        
        // Add jitter (0-1000ms)
        const jitter = Math.random() * 1000;
        const totalDelay = delay + jitter;
        
        console.warn(`⚠️  429 Rate Limited (attempt ${attempt + 1}/${maxAttempts})`);
        console.log(`⏱️  Would back off ${Math.round(totalDelay)}ms in production...`);
        
        // In production: implement delay with setTimeout callback
        // Example: await new Promise(resolve => setTimeout(resolve, totalDelay));
        continue;
        
      } else if (statusCode === 403) {
        console.warn('⚠️  403 Forbidden - Refreshing token...');
        const newToken = await refreshToken();
        pubnub.setToken(newToken);
        continue;
        
      } else {
        // Non-retryable error
        console.error('❌ Publish failed with non-retryable error:', statusCode);
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to publish after ${maxAttempts} attempts`);
}

// Test by publishing multiple messages rapidly
async function testRateLimiting() {
  console.log('Testing rate limiting with rapid publishes...\n');
  
  const messages = [];
  for (let i = 0; i < 5; i++) {
    messages.push({
      type: 'test.rapid',
      schemaVersion: '1.0',
      eventId: `evt_${Date.now()}_${i}`,
      ts: Date.now(),
      payload: { sequence: i }
    });
  }
  
  // Publish all rapidly
  for (const message of messages) {
    await publishWithBackoff('test.lab01', message);
  }
  
  console.log('\n✅ All messages published successfully');
}

testRateLimiting()
  .then(() => console.log('\n✓ Exercise 3 complete'))
  .catch(error => console.error('\n✗ Exercise 3 failed:', error));
```

### Expected Output

```
Testing rate limiting with rapid publishes...

✅ Publish successful
📍 Timetoken: 17069876543210000
✅ Publish successful
📍 Timetoken: 17069876543210001
⚠️  429 Rate Limited (attempt 1/5)
⏱️  Backing off 1234ms...
✅ Publish successful after 1 retries
📍 Timetoken: 17069876543210002
...

✅ All messages published successfully

✓ Exercise 3 complete
```

### Discussion Questions

1. Why use exponential backoff instead of fixed delay?
2. Why add jitter to the backoff delay?
3. When should you stop retrying? (Answer: After max attempts or on permanent errors like 413)

## Challenge Exercise: Complete Publish Function

### Task

Combine all error handling into a single robust publish function.

### Requirements

1. Handle 403 (token refresh)
2. Handle 429 (exponential backoff)
3. Handle 413 (payload too large)
4. Limit retry attempts
5. Log all attempts and outcomes
6. Return detailed result object

### Template

```javascript
async function robustPublish(channel, message, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  
  // Your implementation here
  // ...
  
  return {
    success: true,
    timetoken: result.timetoken,
    attempts: attemptCount,
    errors: errorLog
  };
}
```

### Test Cases

```javascript
// Test 1: Normal publish
await robustPublish('test.lab01', normalMessage);

// Test 2: Publish with token refresh (simulate 403)
await robustPublish('test.lab01', messageRequiringAuth);

// Test 3: Publish with rate limiting (simulate 429)
for (let i = 0; i < 10; i++) {
  await robustPublish('test.lab01', { sequence: i });
}

// Test 4: Publish too-large message (413)
await robustPublish('test.lab01', tooLargeMessage);
```

## Lab Completion Checklist

- [ ] Successfully published a message
- [ ] Captured and logged the timetoken
- [ ] Implemented token refresh on 403 error
- [ ] Implemented exponential backoff on 429 error
- [ ] Created a robust publish function combining all techniques
- [ ] Tested edge cases (large payloads, rapid publishes)

## Discussion Questions

1. **Why is error handling important for Publish?**
   - Network issues are common
   - Rate limits protect the platform
   - Tokens expire for security
   - Graceful degradation improves UX

2. **When should you NOT retry a publish?**
   - 400 Bad Request (malformed message)
   - 413 Payload Too Large (won't succeed on retry)
   - After max retry attempts reached
   - User has moved away from the action

3. **How do you balance retry attempts vs user experience?**
   - Use progressive feedback (attempt 1 of 3...)
   - Show "sending..." indicator
   - Allow user to cancel
   - Implement message queue for offline scenarios

## Next Steps

- Proceed to [Lab 2: Message Patterns](./lab-02-message-patterns.md)
- Review [02. Message Design](../02-message-design.md) for schema best practices
- Explore [03. Advanced Publish](../03-advanced-publish.md) for optimization techniques

## Additional Resources

- [PubNub Publish API Documentation](https://www.pubnub.com/docs/sdks/javascript/api-reference/publish)
- [Error Handling Best Practices](https://www.pubnub.com/docs/general/error-handling)
- [Rate Limiting Guide](https://www.pubnub.com/docs/general/rate-limits)
