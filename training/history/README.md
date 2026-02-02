# Module 2: Message Persistence (History)

## Overview

Message Persistence stores published messages for later retrieval, enabling chat history, offline catch-up, audit trails, and message replay. This module provides comprehensive training on fetching history, working with message actions, and understanding storage propagation timing.

The module is divided into **Standard** and **Advanced** tracks to accommodate different learning needs and experience levels.

## Learning Tracks

### Standard Track (Core Concepts)

Focus on essential history retrieval and message actions:
- [01. History Fundamentals](./01-history-fundamentals.md) - Fetch API, retention, storage behavior
- [02. Message Actions](./02-message-actions.md) - Reactions, read receipts, soft delete

**Time Estimate:** 2-3 hours (reading + labs)

### Advanced Track (Optimization & Patterns)

Deep dive into pagination, multi-channel retrieval, and performance:
- [03. Advanced History](./03-advanced-history.md) - Pagination, multi-channel, optimization, delete operations

**Time Estimate:** 2-3 hours (reading + labs)

## Learning Objectives

### Standard Track Objectives

After completing the Standard track, Solution Architects will be able to:

1. **Fetch message history** - Retrieve messages using `fetchMessages()` and `messageCounts()`
2. **Understand storage timing** - Explain propagation delays and why history isn't for verification
3. **Configure retention** - Choose appropriate retention periods (1 day to unlimited)
4. **Implement history-on-join** - Load history when users join channels
5. **Work with message actions** - Add reactions, read receipts, and soft deletes
6. **Choose storage strategy** - Decide what to store vs what to keep ephemeral

### Advanced Track Objectives

After completing the Advanced track, Solution Architects will be able to:

1. **Paginate efficiently** - Implement cursor-based pagination with timetokens
2. **Fetch multi-channel history** - Retrieve history across multiple channels
3. **Optimize retrieval patterns** - Minimize API calls and data transfer
4. **Implement delete strategies** - Use soft delete vs hard delete appropriately
5. **Handle gaps on reconnect** - Fill message gaps after network interruptions
6. **Calculate costs** - Understand storage and retrieval transaction costs

## Prerequisites

Before starting this module, you should have:

- ✅ Completed [Module 0: Platform Overview](../overview/README.md)
- ✅ Completed [Module 1: Publish](../publish/README.md)
- ✅ Understanding of timetoken ordering
- ✅ Access to a PubNub keyset for hands-on labs

## Module Structure

### Core Documentation

| Document | Track | Topics | Time |
|----------|-------|--------|------|
| [01. History Fundamentals](./01-history-fundamentals.md) | Standard | Fetch API, retention, storage behavior, timing | 45 min |
| [02. Message Actions](./02-message-actions.md) | Standard | Reactions, read receipts, soft delete | 45 min |
| [03. Advanced History](./03-advanced-history.md) | Advanced | Pagination, multi-channel, optimization | 60 min |

### Lab Exercises

| Lab | Track | Objective | Time |
|-----|-------|-----------|------|
| [Lab 1: Basic History](./labs/lab-01-basic-history.md) | Standard | Fetch history + publish-history timing | 45 min |
| [Lab 2: Message Actions](./labs/lab-02-message-actions.md) | Standard | Reactions and read receipts | 45 min |

## Quick Reference

### Key Limits (MCP-Verified)

| Limit | Value | Notes |
|-------|-------|-------|
| **Fetch limit (single channel)** | 100 messages | Per API call |
| **Fetch limit (multi-channel)** | 25 messages per channel | Up to 500 channels |
| **Message counts limit** | 100 channels | Per API call |
| **Timetoken precision** | 17 digits | 10-nanosecond intervals |
| **Retention options** | 1 day - unlimited | Immutable per message |

### Retention Options

| Duration | Availability |
|----------|--------------|
| 1 day | Free tier |
| 7 days | Free tier (default for test keysets) |
| 30 days | Paid accounts |
| 3 months | Paid accounts |
| 6 months | Paid accounts |
| 1 year | Paid accounts |
| Unlimited | Paid accounts |

### What Gets Stored

| Type | Stored in History? |
|------|-------------------|
| Regular messages (type 0) | Yes |
| Signals (type 1) | No |
| App Context events (type 2) | No |
| Message Actions (type 3) | Yes |
| File messages (type 4) | Yes |

### Fetch vs Message Counts

| Method | Purpose | Limits |
|--------|---------|--------|
| `fetchMessages()` | Retrieve message content | 100 (single) or 25 per channel (multi) |
| `messageCounts()` | Get unread counts only | 100 channels |

## Getting Started

### For Standard Track Learners

1. Read [01. History Fundamentals](./01-history-fundamentals.md)
2. Complete [Lab 1: Basic History](./labs/lab-01-basic-history.md)
3. Read [02. Message Actions](./02-message-actions.md)
4. Complete [Lab 2: Message Actions](./labs/lab-02-message-actions.md)

### For Advanced Track Learners

After completing Standard track:

1. Read [03. Advanced History](./03-advanced-history.md)
2. Apply pagination patterns to your applications
3. Optimize multi-channel retrieval

## Common Questions

### Why can't I find my message in history immediately after publishing?

Messages are not immediately available in history due to **storage propagation time**:
- Propagation takes milliseconds to seconds
- Fetching immediately after publish will likely fail
- Adding artificial delays (1-2 seconds) works but is impractical
- **Best practice**: Trust the publish response timetoken as confirmation

**The timetoken from publish IS your confirmation. History is for catch-up and replay, not verification.**

### When should messages be stored vs ephemeral?

**Store in History** when:
- Users need to see previous messages (chat history)
- Audit trail is required (votes, transactions)
- Offline catch-up is important (notifications)
- Compliance logging is needed

**Keep ephemeral** (don't store) when:
- Data is transient (typing indicators, cursor positions)
- High frequency updates (live scores that change constantly)
- No replay value (presence heartbeats)

### How do I implement "history on join"?

Common pattern for chat applications:

```javascript
// 1. Fetch recent history
const history = await pubnub.fetchMessages({
  channels: ['chat.room123'],
  count: 50
});

// 2. Display history
displayMessages(history.channels['chat.room123']);

// 3. Subscribe for new messages
pubnub.subscribe({ channels: ['chat.room123'] });
```

### What's the difference between soft delete and hard delete?

| Type | Method | Behavior | Reversible | Recommendation |
|------|--------|----------|-----------|----------------|
| **Soft Delete** | Add message action with "deleted" flag | Message stays, marked deleted | Yes | Recommended |
| **Hard Delete** | `deleteMessages()` API | Permanently removed | No | Use sparingly |

### How do I paginate through large message histories?

Use timetoken-based cursor pagination:

```javascript
let start = null;
const allMessages = [];

while (true) {
  const result = await pubnub.fetchMessages({
    channels: ['chat.room123'],
    count: 100,
    start: start
  });
  
  const messages = result.channels['chat.room123'];
  if (!messages || messages.length === 0) break;
  
  allMessages.push(...messages);
  start = messages[messages.length - 1].timetoken;
}
```

## Critical Concept: Publish-History Timing

One of the most important lessons in this module is understanding **why you should not verify publishes by checking history**:

1. **Published messages have propagation delay** - Storage is eventually consistent
2. **Immediate fetch will fail** - Message hasn't reached storage yet
3. **Async/await is unreliable** - Sometimes works, sometimes doesn't
4. **Artificial delays are impractical** - Not suitable for production code
5. **Timetoken is authoritative** - The publish response IS your confirmation

This concept is covered in detail in [Lab 1: Exercise 3](./labs/lab-01-basic-history.md#exercise-3-publish-history-timing-critical).

## Next Steps

After completing this module:

- Proceed to **Module 3: Subscribe** to learn about receiving real-time messages
- Review **Module 4: Access Manager** for securing history access
- Explore **Module 9: Functions** for processing history events

## Technical Accuracy

All technical specifications in this module have been verified against PubNub's official documentation using the PubNub MCP servers. Key verified details include:

- Fetch limits (100 single, 25 multi-channel)
- Retention options (1 day to unlimited)
- Message type storage behavior
- Timetoken precision (17 digits)
- Message counts limits (100 channels)
- Soft delete via message actions
- Hard delete requirements (secretKey)

---

**Ready to begin?** Start with [01. History Fundamentals](./01-history-fundamentals.md)
