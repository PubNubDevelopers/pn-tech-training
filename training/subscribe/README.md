# Module 2: Subscribe Service

## Overview

The Subscribe service is the core mechanism for receiving real-time messages from channels in PubNub. This module provides comprehensive training on how to effectively use Subscribe, from basic operations to advanced connection management and the critical relationship between Publish and Subscribe services.

The module is divided into **Standard** and **Advanced** tracks to accommodate different learning needs and experience levels.

## Learning Tracks

### Standard Track (Core Concepts)

Focus on essential Subscribe operations and best practices:
- [01. Subscribe Fundamentals](./01-subscribe-fundamentals.md) - Core mechanics, long-poll protocol, listeners
- [02. Channel Patterns](./02-channel-patterns.md) - Wildcards, channel groups, filtering

**Time Estimate:** 2-3 hours (reading + labs)

### Advanced Track (Deep Dive & Integration)

Deep dive into protocol mechanics, connection management, and pub/sub integration:
- [03. Advanced Subscribe](./03-advanced-subscribe.md) - Reconnection, multiplexing, configuration
- [04. Publish-Subscribe Flow](./04-publish-subscribe-flow.md) - End-to-end message flow, timing, patterns

**Time Estimate:** 3-4 hours (reading + labs)

## Learning Objectives

### Standard Track Objectives

After completing the Standard track, Solution Architects will be able to:

1. **Explain Subscribe mechanics** - Describe how Subscribe works, the long-poll protocol, and connection lifecycle
2. **Implement message listeners** - Set up listeners for messages, signals, status events
3. **Subscribe to channels** - Single channel, multi-channel, and wildcard subscriptions
4. **Handle connection status** - Monitor and respond to connection state changes
5. **Use channel groups** - Aggregate channels for efficient subscription management
6. **Apply filter expressions** - Client-side message filtering with metadata

### Advanced Track Objectives

After completing the Advanced track, Solution Architects will be able to:

1. **Implement the subscribe loop** - Build subscribe client from scratch using REST API
2. **Design reconnection strategies** - Handle network changes, catch-up after disconnection
3. **Optimize multiplexing** - Manage multiple channels on single connection efficiently
4. **Integrate Publish + Subscribe** - Build complete bidirectional messaging flows
5. **Troubleshoot connection issues** - Diagnose and resolve common Subscribe problems
6. **Architect history catch-up** - Implement offline message recovery patterns

## Prerequisites

Before starting this module, you should have:

- ✅ Completed [Module 1: Publish Service](../publish/README.md)
- ✅ Completed [Module 0: Platform Overview](../overview/README.md)
- ✅ Understanding of HTTP protocols and status codes
- ✅ Access to a PubNub keyset for hands-on labs
- ✅ Familiarity with asynchronous programming (promises, callbacks)

## Module Structure

### Core Documentation

| Document | Track | Topics | Time |
|----------|-------|--------|------|
| [01. Subscribe Fundamentals](./01-subscribe-fundamentals.md) | Standard | Long-poll protocol, listeners, API mechanics | 60 min |
| [02. Channel Patterns](./02-channel-patterns.md) | Standard | Wildcards, channel groups, filtering | 30 min |
| [03. Advanced Subscribe](./03-advanced-subscribe.md) | Advanced | Reconnection, multiplexing, configuration | 45 min |
| [04. Publish-Subscribe Flow](./04-publish-subscribe-flow.md) | Advanced | End-to-end message flow, timing, integration | 45 min |

### Lab Exercises

| Lab | Track | Objective | Time |
|-----|-------|-----------|------|
| [Lab 1: Basic Subscribe](./labs/lab-01-basic-subscribe.md) | Standard | First subscription with listeners | 30 min |
| [Lab 2: Subscribe Loop](./labs/lab-02-subscribe-loop.md) | Advanced | Implement long-poll from scratch | 90 min |
| [Lab 3: Pub/Sub Integration](./labs/lab-03-pubsub-integration.md) | Advanced | Complete messaging flow | 45 min |

## Quick Reference

### Key Protocol Details

| Detail | Value | Notes |
|--------|-------|-------|
| **Protocol** | HTTP/1.1 over TCP | Not WebSockets |
| **Long-poll timeout** | 280 seconds (server) | Fixed server-side |
| **Client timeout** | 310 seconds (default) | Configurable via SDK |
| **Timetoken format** | 17 digits | 10-nanosecond precision |
| **Initial subscribe** | `tt=0` | Returns timetoken + region |

### Channel Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Wildcard depth** | 1 level | `foo.*` works, `foo.bar.*` doesn't |
| **Channel groups** | 2000 channels per group | Server-side aggregation |
| **Multi-channel subscribe** | Unlimited | Practical limit ~50-100 channels |

### Subscribe Transaction Types

| Type | Description | HTTP Response |
|------|-------------|---------------|
| **Init** | First subscribe (tt=0) | 200 (returns timetoken + region) |
| **Long-Poll Expiration** | 280s timeout, no messages | 200 (empty response) |
| **Client Disconnect** | Client canceled request | 499 |
| **Message Received** | Successful message delivery | 200 (with message payload) |

### Status Categories (SDK)

| Category | Meaning | Action |
|----------|---------|--------|
| `PNConnectedCategory` | Successfully connected | Normal operation |
| `PNReconnectedCategory` | Reconnected after disconnect | Consider catch-up with history |
| `PNDisconnectedCategory` | Disconnected | Monitor for reconnection |
| `PNNetworkIssuesCategory` | Network problems | Automatic retry in progress |
| `PNAccessDeniedCategory` | 403 Forbidden | Refresh Access Manager token |

### REST API Endpoint

```
GET https://ps.pndsn.com/v2/subscribe/{sub_key}/{channels}/0
  ?tt={timetoken}      // 0 for init, then use previous timetoken
  &tr={region}         // Region from previous response
  &uuid={user_id}      // Required: client identifier
  &auth={token}        // Access Manager token (if enabled)
```

## Getting Started

### For Standard Track Learners

1. Read [01. Subscribe Fundamentals](./01-subscribe-fundamentals.md)
2. Complete [Lab 1: Basic Subscribe](./labs/lab-01-basic-subscribe.md)
3. Read [02. Channel Patterns](./02-channel-patterns.md)
4. Experiment with wildcards and channel groups

### For Advanced Track Learners

After completing Standard track:

1. Read [03. Advanced Subscribe](./03-advanced-subscribe.md)
2. Read [04. Publish-Subscribe Flow](./04-publish-subscribe-flow.md)
3. Complete [Lab 2: Subscribe Loop](./labs/lab-02-subscribe-loop.md) - Implement from scratch!
4. Complete [Lab 3: Pub/Sub Integration](./labs/lab-03-pubsub-integration.md)

## Common Questions

### How does the long-poll protocol work?

PubNub uses **HTTP/1.1 long-polling** over TCP (not WebSockets). The client sends a Subscribe request, and the server holds the connection open for up to 280 seconds. When messages arrive, the server responds immediately. If no messages arrive within 280 seconds, the server responds with an empty payload, and the client immediately sends the next request. This cycle continues indefinitely.

**Why HTTP/1.1 over WebSockets?**
- Works through corporate firewalls and proxies
- No WebSocket upgrade handshake required
- Automatic reconnection on network changes
- Better backpressure management
- Maximum compatibility

### What's the difference between timetoken and region?

- **Timetoken**: 17-digit timestamp used for message ordering and history queries
- **Region**: Integer indicating which PubNub Point of Presence (PoP) you're connected to; used for consistent routing

Both are returned on initial subscribe (tt=0) and must be passed on subsequent requests.

### Do I need to subscribe before publishing?

For **real-time delivery**, yes! If you subscribe after a message was published, you won't receive it in real-time. Use History to catch up on messages published before you subscribed.

**Pattern:**
1. Subscribe to channel (establishes long-poll)
2. Fetch recent history (catch-up)
3. Receive new messages in real-time

### How do I handle reconnections?

The SDK automatically handles reconnections with exponential backoff. When reconnected (`PNReconnectedCategory` status):

1. Note the last timetoken you received
2. Fetch messages from history using that timetoken
3. Continue normal subscription

### When should I use wildcards vs channel groups?

**Use wildcards** (`foo.*`) when:
- Channel names follow predictable patterns
- You need Function bindings (channel groups don't support Functions)
- Simple, static subscription needs

**Use channel groups** when:
- Managing many channels (>50)
- Channels don't follow naming patterns
- Need dynamic membership (add/remove channels frequently)
- Need to subscribe to >100 channels

### What happens if the client doesn't send the next request quickly?

If the client delays sending the next subscribe request:
- The connection is idle (no active long-poll)
- Messages published during the gap are **not** received in real-time
- Messages are still stored in history (if persistence enabled)
- Solution: Use history to catch up when reconnecting

## Common Mistakes

### 1. Not Adding Listeners Before Subscribe

```javascript
// ❌ WRONG: No listeners set up
pubnub.subscribe({ channels: ['chat.room123'] });
// Messages arrive but nothing happens!

// ✅ CORRECT: Listeners first
pubnub.addListener({
  message: (event) => handleMessage(event)
});
pubnub.subscribe({ channels: ['chat.room123'] });
```

### 2. Ignoring Status Events

```javascript
// ❌ WRONG: No status monitoring
pubnub.addListener({
  message: (event) => handleMessage(event)
});

// ✅ CORRECT: Monitor connection status
pubnub.addListener({
  message: (event) => handleMessage(event),
  status: (event) => {
    if (event.category === 'PNReconnectedCategory') {
      catchUpWithHistory();
    }
  }
});
```

### 3. Subscribing After Publishing

```javascript
// ❌ WRONG: Won't receive in real-time
await pubnub.publish({ channel: 'chat.room123', message: data });
pubnub.subscribe({ channels: ['chat.room123'] });

// ✅ CORRECT: Subscribe first
pubnub.subscribe({ channels: ['chat.room123'] });
await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for connection
await pubnub.publish({ channel: 'chat.room123', message: data });
```

### 4. Not Unsubscribing When Done

```javascript
// ❌ WRONG: Connection stays open
function leaveRoom() {
  // Just navigate away - connection still active!
  navigate('/home');
}

// ✅ CORRECT: Clean up
function leaveRoom() {
  pubnub.unsubscribe({ channels: ['chat.room123'] });
  navigate('/home');
}
```

## Next Steps

After completing this module:

- Proceed to **Module 3: Message Persistence** to learn about History and Message Actions
- Review **Module 4: Access Manager** for securing Subscribe operations with tokens
- Explore **Module 5: Presence** for tracking online users (withPresence integration)
- Study **Module 6: Functions** for in-transit message processing

## Technical Accuracy

All technical specifications in this module have been verified against PubNub's official documentation using the PubNub MCP servers. Key verified details include:

- Long-poll timeout: 280 seconds (server-side)
- Default SDK subscribe timeout: 310 seconds
- Protocol: HTTP/1.1 over TCP (not WebSockets)
- Subscribe transaction types and HTTP status codes
- Wildcard depth limitation (1 level)
- Channel group limits (2000 channels per group)
- Timetoken format (17 digits, 10-nanosecond precision)

---

**Ready to begin?** Start with [01. Subscribe Fundamentals](./01-subscribe-fundamentals.md)
