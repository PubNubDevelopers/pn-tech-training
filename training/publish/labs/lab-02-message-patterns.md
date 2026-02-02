# Lab 2: Message Patterns and Schema Design

## Objective

Learn to design production-ready message schemas with proper structure, versioning, and channel naming conventions.

**Time Estimate:** 45-60 minutes

## Prerequisites

- Completed [Lab 1: Basic Publish](./lab-01-basic-publish.md)
- Read [02. Message Design](../02-message-design.md)
- Access to a PubNub keyset
- Understanding of schema versioning concepts

## Learning Outcomes

By the end of this lab, you will be able to:

1. Create messages with all four required fields
2. Implement schema versioning (v1.0, v1.1, v2.0)
3. Design channel names following best practices
4. Handle multiple schema versions in subscribers
5. Configure a Before Publish Function for validation (conceptual)

## Lab Setup

Create a new file `lab-02-schemas.js`:

```javascript
const PubNub = require('pubnub');

const pubnub = new PubNub({
  publishKey: 'YOUR_PUBLISH_KEY',
  subscribeKey: 'YOUR_SUBSCRIBE_KEY',
  userId: 'lab-user-002'
});

console.log('Lab 02: Message Patterns initialized\n');
```

## Exercise 1: Required Message Fields

### Task

Create messages that include all four required fields: `type`, `schemaVersion`, `eventId`, and `ts`.

### Implementation

```javascript
// Bad message (missing required fields)
const badMessage = {
  text: 'Hello World',
  userId: 'user123'
};

// Good message (all required fields)
function createMessage(type, payload) {
  return {
    // Required fields
    type: type,
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    
    // Application payload
    payload: payload
  };
}

function generateEventId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `evt_${timestamp}_${random}`;
}

// Test message creation
async function testMessageCreation() {
  console.log('=== Exercise 1: Required Fields ===\n');
  
  // Create various message types
  const chatMessage = createMessage('chat.message', {
    text: 'Hello from the lab!',
    roomId: 'room123',
    userId: 'user456'
  });
  
  const voteMessage = createMessage('vote.submit', {
    sessionId: 'session789',
    optionId: 'option_A',
    voterId: 'voter123'
  });
  
  const typingMessage = createMessage('chat.typing', {
    roomId: 'room123',
    userId: 'user456',
    typing: true
  });
  
  console.log('Chat Message:', JSON.stringify(chatMessage, null, 2));
  console.log('\nVote Message:', JSON.stringify(voteMessage, null, 2));
  console.log('\nTyping Message:', JSON.stringify(typingMessage, null, 2));
  
  // Publish one to test
  const result = await pubnub.publish({
    channel: 'test.lab02',
    message: chatMessage
  });
  
  console.log('\n✅ Message published:', result.timetoken);
}

testMessageCreation()
  .then(() => console.log('\n✓ Exercise 1 complete\n'))
  .catch(error => console.error('\n✗ Exercise 1 failed:', error));
```

### Validation Questions

1. Why is `type` important? (Answer: Enables routing, filtering, Function dispatch)
2. What format should `eventId` use? (Answer: Unique identifier, timestamp-based recommended)
3. What's the difference between `ts` and timetoken? (Answer: `ts` is client timestamp, timetoken is server timestamp)

## Exercise 2: Schema Versioning

### Task

Implement schema evolution from v1.0 → v1.1 → v2.0 with proper version handling.

### Scenario

You're building a user profile system:
- **v1.0**: Basic profile (name only)
- **v1.1**: Added optional avatar field
- **v2.0**: Restructured (name → displayName, added required bio)

### Implementation

```javascript
// Version 1.0: Original schema
function createProfileV1(userId, name) {
  return {
    type: 'user.profile',
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      userId: userId,
      name: name
    }
  };
}

// Version 1.1: Added optional avatar (additive change)
function createProfileV1_1(userId, name, avatar) {
  return {
    type: 'user.profile',
    schemaVersion: '1.1',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      userId: userId,
      name: name,
      avatar: avatar  // New optional field
    }
  };
}

// Version 2.0: Breaking changes (rename + required field)
function createProfileV2(userId, displayName, bio) {
  return {
    type: 'user.profile',
    schemaVersion: '2.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      userId: userId,
      displayName: displayName,  // Renamed from 'name'
      profile: {
        bio: bio  // New required field
      }
    }
  };
}

// Consumer that handles all versions
function handleProfileUpdate(message) {
  const { schemaVersion, payload } = message;
  
  console.log(`\nHandling schema version: ${schemaVersion}`);
  
  switch (schemaVersion) {
    case '1.0':
      // Handle v1.0
      console.log('  User:', payload.userId);
      console.log('  Name:', payload.name);
      console.log('  Avatar:', 'N/A (not in v1.0)');
      break;
      
    case '1.1':
      // Handle v1.1
      console.log('  User:', payload.userId);
      console.log('  Name:', payload.name);
      console.log('  Avatar:', payload.avatar || 'N/A');
      break;
      
    case '2.0':
      // Handle v2.0
      console.log('  User:', payload.userId);
      console.log('  Display Name:', payload.displayName);
      console.log('  Bio:', payload.profile.bio);
      break;
      
    default:
      console.error(`  ❌ Unsupported schema version: ${schemaVersion}`);
  }
}

async function testSchemaVersioning() {
  console.log('=== Exercise 2: Schema Versioning ===\n');
  
  const channel = 'test.profiles';
  
  // Publish v1.0
  const v1 = createProfileV1('user123', 'Alice');
  console.log('Publishing v1.0...');
  await pubnub.publish({ channel, message: v1 });
  handleProfileUpdate(v1);
  
  // Publish v1.1
  const v1_1 = createProfileV1_1('user456', 'Bob', 'https://example.com/bob.jpg');
  console.log('\nPublishing v1.1...');
  await pubnub.publish({ channel, message: v1_1 });
  handleProfileUpdate(v1_1);
  
  // Publish v2.0
  const v2 = createProfileV2('user789', 'Charlie', 'Software engineer from NYC');
  console.log('\nPublishing v2.0...');
  await pubnub.publish({ channel, message: v2 });
  handleProfileUpdate(v2);
  
  console.log('\n✅ All versions published and handled successfully');
}

testSchemaVersioning()
  .then(() => console.log('\n✓ Exercise 2 complete\n'))
  .catch(error => console.error('\n✗ Exercise 2 failed:', error));
```

### Expected Output

```
=== Exercise 2: Schema Versioning ===

Publishing v1.0...

Handling schema version: 1.0
  User: user123
  Name: Alice
  Avatar: N/A (not in v1.0)

Publishing v1.1...

Handling schema version: 1.1
  User: user456
  Name: Bob
  Avatar: https://example.com/bob.jpg

Publishing v2.0...

Handling schema version: 2.0
  User: user789
  Display Name: Charlie
  Bio: Software engineer from NYC

✅ All versions published and handled successfully

✓ Exercise 2 complete
```

### Discussion Questions

1. When should you increment minor vs major version?
2. How long should you support old versions?
3. What's the migration strategy from v1 to v2?

## Exercise 3: Channel Naming

### Task

Design channel names for a voting application following the `[channelType].[channelId]` pattern.

### Requirements

- Separate channels for submissions and results
- Support multiple concurrent sessions
- Enable Function binding with wildcards
- Keep depth to 2 levels

### Implementation

```javascript
// Channel naming utilities
const ChannelNames = {
  // Vote submission channel (clients write)
  voteSubmission(sessionId) {
    return `vote-submit.${sessionId}`;
  },
  
  // Vote results channel (server writes)
  voteResults(sessionId) {
    return `vote-results.${sessionId}`;
  },
  
  // Chat channel for session
  sessionChat(sessionId) {
    return `chat.${sessionId}`;
  },
  
  // Typing indicators
  sessionTyping(sessionId) {
    return `typing.${sessionId}`;
  },
  
  // User inbox
  userInbox(userId) {
    return `inbox.${userId}`;
  },
  
  // Presence shard
  presenceShard(sessionId, shardId) {
    // Compound ID in second level (not a third level!)
    return `presence.${sessionId}-shard-${shardId}`;
  }
};

// Wildcard patterns for Functions or Subscribe
const WildcardPatterns = {
  allVoteSubmissions: 'vote-submit.*',
  allVoteResults: 'vote-results.*',
  allChats: 'chat.*',
  allInboxes: 'inbox.*',
  allPresence: 'presence.*'
};

async function testChannelNaming() {
  console.log('=== Exercise 3: Channel Naming ===\n');
  
  const sessionId = 'session_abc123';
  const userId = 'user_456';
  
  // Generate channel names
  console.log('Channel Names for Session:', sessionId);
  console.log('  Vote Submission:', ChannelNames.voteSubmission(sessionId));
  console.log('  Vote Results:', ChannelNames.voteResults(sessionId));
  console.log('  Chat:', ChannelNames.sessionChat(sessionId));
  console.log('  Typing:', ChannelNames.sessionTyping(sessionId));
  console.log('  Presence Shard 0:', ChannelNames.presenceShard(sessionId, 0));
  console.log('  Presence Shard 1:', ChannelNames.presenceShard(sessionId, 1));
  
  console.log('\nUser-specific Channels:');
  console.log('  User Inbox:', ChannelNames.userInbox(userId));
  
  console.log('\nWildcard Patterns (for Functions/Subscribe):');
  console.log('  All Submissions:', WildcardPatterns.allVoteSubmissions);
  console.log('  All Results:', WildcardPatterns.allVoteResults);
  console.log('  All Chats:', WildcardPatterns.allChats);
  
  // Test publishing to named channels
  const voteSubmit = ChannelNames.voteSubmission(sessionId);
  const voteResults = ChannelNames.voteResults(sessionId);
  
  console.log('\n📤 Publishing to submission channel:', voteSubmit);
  await pubnub.publish({
    channel: voteSubmit,
    message: createMessage('vote.submit', {
      sessionId,
      optionId: 'option_A',
      voterId: userId
    })
  });
  
  console.log('✅ Vote submitted');
  
  console.log('\n📤 Publishing to results channel:', voteResults);
  await pubnub.publish({
    channel: voteResults,
    message: createMessage('vote.tally', {
      sessionId,
      results: {
        option_A: 5,
        option_B: 3
      }
    })
  });
  
  console.log('✅ Results published');
}

testChannelNaming()
  .then(() => console.log('\n✓ Exercise 3 complete\n'))
  .catch(error => console.error('\n✗ Exercise 3 failed:', error));
```

### Channel Naming Validation

Check your channel names:

| Channel | Valid? | Reason |
|---------|--------|--------|
| `vote-submit.session123` | ✅ | 2 levels, good naming |
| `chat.room456` | ✅ | 2 levels, simple |
| `vote.session.submit` | ❌ | 3 levels, breaks Function binding |
| `inbox_user123` | ❌ | 1 level, no separator |
| `presence.session123-shard-0` | ✅ | 2 levels, compound ID |

## Exercise 4: Before Publish Function (Conceptual)

### Task

Design a Before Publish Function to validate messages (conceptual - actual deployment in Admin Portal).

### Function Design

```javascript
// Conceptual Function: message-validator
// Trigger: Before Publish on vote-submit.*

export default (request) => {
  const message = request.message;
  const channel = request.channel;
  
  console.log(`Validating message on ${channel}`);
  
  // 1. Validate required fields
  const requiredFields = ['type', 'schemaVersion', 'eventId', 'ts', 'payload'];
  for (const field of requiredFields) {
    if (!message[field]) {
      return request.abort({
        error: 'missing_field',
        message: `Missing required field: ${field}`
      });
    }
  }
  
  // 2. Validate message type
  if (!message.type.startsWith('vote.')) {
    return request.abort({
      error: 'invalid_type',
      message: `Invalid type for vote-submit channel: ${message.type}`
    });
  }
  
  // 3. Validate schema version
  const supportedVersions = ['1.0', '1.1', '2.0'];
  if (!supportedVersions.includes(message.schemaVersion)) {
    return request.abort({
      error: 'unsupported_version',
      message: `Unsupported schema version: ${message.schemaVersion}`
    });
  }
  
  // 4. Validate payload structure
  if (!message.payload.sessionId || !message.payload.optionId) {
    return request.abort({
      error: 'invalid_payload',
      message: 'Vote must include sessionId and optionId'
    });
  }
  
  // 5. Rate limiting (using KV store)
  const voterId = message.payload.voterId || request.publisher;
  const rateLimitKey = `vote:${voterId}:${message.payload.sessionId}`;
  
  const existingVote = kvstore.get(rateLimitKey);
  if (existingVote) {
    return request.abort({
      error: 'duplicate_vote',
      message: 'You have already voted in this session'
    });
  }
  
  // Record vote
  kvstore.set(rateLimitKey, {
    eventId: message.eventId,
    timestamp: Date.now()
  }, 3600);  // 1 hour TTL
  
  // 6. Enrich with server timestamp
  message.serverTs = Date.now();
  message.validated = true;
  
  console.log(`✅ Message validated successfully`);
  
  // Allow message
  return request.ok();
};
```

### Validation Test Cases

```javascript
async function testValidation() {
  console.log('=== Exercise 4: Validation (Conceptual) ===\n');
  
  const sessionId = 'session_test123';
  const channel = ChannelNames.voteSubmission(sessionId);
  
  // Test Case 1: Valid message
  console.log('Test 1: Valid message');
  const validMessage = createMessage('vote.submit', {
    sessionId: sessionId,
    optionId: 'option_A',
    voterId: 'voter_001'
  });
  console.log('  Message:', JSON.stringify(validMessage, null, 2));
  console.log('  Expected: ✅ Pass validation\n');
  
  // Test Case 2: Missing required field
  console.log('Test 2: Missing eventId');
  const invalidMessage1 = {
    type: 'vote.submit',
    schemaVersion: '1.0',
    // eventId missing!
    ts: Date.now(),
    payload: { sessionId, optionId: 'option_A' }
  };
  console.log('  Expected: ❌ Fail validation (missing_field)\n');
  
  // Test Case 3: Invalid type for channel
  console.log('Test 3: Wrong message type for vote channel');
  const invalidMessage2 = createMessage('chat.message', {
    text: 'This should not be on vote-submit channel'
  });
  console.log('  Expected: ❌ Fail validation (invalid_type)\n');
  
  // Test Case 4: Unsupported schema version
  console.log('Test 4: Unsupported schema version');
  const invalidMessage3 = {
    ...validMessage,
    schemaVersion: '99.0'
  };
  console.log('  Expected: ❌ Fail validation (unsupported_version)\n');
  
  console.log('Note: Actual validation would occur in Before Publish Function');
  console.log('      Deploy function in Admin Portal with trigger: vote-submit.*');
}

testValidation()
  .then(() => console.log('\n✓ Exercise 4 complete\n'))
  .catch(error => console.error('\n✗ Exercise 4 failed:', error));
```

## Challenge Exercise: Complete Voting System Schema

### Task

Design a complete message schema for a voting application.

### Requirements

1. **Vote submission messages** (client → server)
   - Schema v1.0: Basic vote
   - Include session ID, option ID, voter ID
   
2. **Vote tally messages** (server → clients)
   - Include current results
   - Include total vote count
   
3. **Vote session control** (host only)
   - Open session
   - Close session
   - Include session metadata

4. **Channel naming**
   - Submission channel
   - Results channel
   - Control channel

### Solution Template

```javascript
const VotingSchemas = {
  // Client submits vote
  voteSubmit: (sessionId, optionId, voterId) => ({
    type: 'vote.submit',
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      sessionId,
      optionId,
      voterId
    }
  }),
  
  // Server publishes tally
  voteTally: (sessionId, results, totalVotes) => ({
    type: 'vote.tally',
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      sessionId,
      results,  // { option_A: 5, option_B: 3 }
      totalVotes
    }
  }),
  
  // Host opens session
  sessionOpen: (sessionId, title, options, hostId) => ({
    type: 'vote.session.open',
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      sessionId,
      title,
      options,  // [{ id: 'A', text: 'Option A' }]
      hostId,
      openedAt: Date.now()
    }
  }),
  
  // Host closes session
  sessionClose: (sessionId, finalResults, hostId) => ({
    type: 'vote.session.close',
    schemaVersion: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    payload: {
      sessionId,
      finalResults,
      hostId,
      closedAt: Date.now()
    }
  })
};

// Test the schemas
async function testVotingSystem() {
  console.log('=== Challenge: Complete Voting System ===\n');
  
  const sessionId = 'session_final';
  const hostId = 'host_001';
  
  // 1. Host opens session
  const openMsg = VotingSchemas.sessionOpen(
    sessionId,
    'Favorite Color',
    [
      { id: 'red', text: 'Red' },
      { id: 'blue', text: 'Blue' },
      { id: 'green', text: 'Green' }
    ],
    hostId
  );
  
  console.log('1. Opening session...');
  await pubnub.publish({
    channel: `vote-control.${sessionId}`,
    message: openMsg
  });
  console.log('   ✅ Session opened\n');
  
  // 2. Users submit votes
  console.log('2. Users voting...');
  for (let i = 0; i < 5; i++) {
    const vote = VotingSchemas.voteSubmit(
      sessionId,
      ['red', 'blue', 'green'][i % 3],
      `voter_${i}`
    );
    
    await pubnub.publish({
      channel: ChannelNames.voteSubmission(sessionId),
      message: vote
    });
    
    console.log(`   Vote ${i + 1} submitted`);
  }
  console.log('   ✅ All votes submitted\n');
  
  // 3. Server publishes tally
  console.log('3. Publishing results...');
  const tally = VotingSchemas.voteTally(
    sessionId,
    { red: 2, blue: 2, green: 1 },
    5
  );
  
  await pubnub.publish({
    channel: ChannelNames.voteResults(sessionId),
    message: tally
  });
  console.log('   ✅ Results published\n');
  
  // 4. Host closes session
  console.log('4. Closing session...');
  const closeMsg = VotingSchemas.sessionClose(
    sessionId,
    { red: 2, blue: 2, green: 1 },
    hostId
  );
  
  await pubnub.publish({
    channel: `vote-control.${sessionId}`,
    message: closeMsg
  });
  console.log('   ✅ Session closed\n');
  
  console.log('✅ Complete voting system tested successfully');
}

testVotingSystem()
  .then(() => console.log('\n✓ Challenge complete\n'))
  .catch(error => console.error('\n✗ Challenge failed:', error));
```

## Lab Completion Checklist

- [ ] Created messages with all four required fields
- [ ] Implemented schema versioning (v1.0, v1.1, v2.0)
- [ ] Handled multiple versions in subscriber
- [ ] Designed channel names following `[channelType].[channelId]` pattern
- [ ] Validated channel names for Function binding
- [ ] Designed Before Publish validation logic
- [ ] Completed voting system challenge

## Key Takeaways

1. **Four Required Fields**: `type`, `schemaVersion`, `eventId`, `ts` in every message
2. **Schema Versioning**: Minor for additive, Major for breaking changes
3. **Channel Naming**: Two-level pattern `[channelType].[channelId]`
4. **Function Binding**: Only works at second level (`foo.*`)
5. **Separation**: Different channels for submission vs results

## Next Steps

- Proceed to [Lab 3: Publish at Scale](./lab-03-publish-at-scale.md)
- Review [03. Advanced Publish](../03-advanced-publish.md) for optimization
- Explore [04. Publish Integrations](../04-publish-integrations.md) for Functions

## Additional Resources

- [Message Schema Best Practices](https://www.pubnub.com/docs/general/messages/publish)
- [Channel Naming Conventions](https://www.pubnub.com/docs/general/channels/overview)
- [PubNub Functions Documentation](https://www.pubnub.com/docs/functions/overview)
