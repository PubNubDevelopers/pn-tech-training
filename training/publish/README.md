# Module 1: Publish Service

## Overview

The Publish service is the core mechanism for sending messages to channels in real-time. This module provides comprehensive training on how to effectively use Publish, from basic operations to advanced optimization and integration patterns.

The module is divided into **Standard** and **Advanced** tracks to accommodate different learning needs and experience levels.

## Learning Tracks

### Standard Track (Core Concepts)

Focus on essential Publish operations and best practices:
- [01. Publish Fundamentals](./01-publish-fundamentals.md) - Core mechanics, payload limits, error handling
- [02. Message Design](./02-message-design.md) - Message structure, schema versioning, channel naming

**Time Estimate:** 2-3 hours (reading + labs)

### Advanced Track (Optimization & Integration)

Deep dive into performance, security, and service integration:
- [03. Advanced Publish](./03-advanced-publish.md) - Rate limits, signals, encryption, optimization
- [04. Publish Integrations](./04-publish-integrations.md) - History, Mobile Push, Functions, Events and Actions

**Time Estimate:** 3-4 hours (reading + labs)

## Learning Objectives

### Standard Track Objectives

After completing the Standard track, Solution Architects will be able to:

1. **Explain Publish mechanics** - Describe how Publish works, when to use it, and how messages flow
2. **Construct proper messages** - Create messages with required fields (`type`, `schemaVersion`, `eventId`, `ts`)
3. **Handle errors gracefully** - Implement retry logic for 403 (token), 413 (size), 429 (rate limit)
4. **Choose Store vs Fire** - Decide between persistent and ephemeral message delivery
5. **Design channel names** - Follow naming conventions that support Functions and scaling
6. **Apply payload limits** - Keep messages under 32 KiB and optimize for latency

### Advanced Track Objectives

After completing the Advanced track, Solution Architects will be able to:

1. **Optimize for high throughput** - Implement batching, queuing, and connection pooling
2. **Use metadata for filtering** - Configure `meta` parameter for subscriber-side filtering
3. **Configure encryption** - Set up end-to-end encryption with cipher keys
4. **Integrate with other services** - Combine Publish with History, Mobile Push, Functions
5. **Troubleshoot failures** - Diagnose and resolve common Publish issues
6. **Architect client/server patterns** - Design authoritative event systems

## Prerequisites

Before starting this module, you should have:

- ✅ Completed [Module 0: Platform Overview](../overview/README.md)
- ✅ Basic understanding of pub/sub messaging concepts
- ✅ Familiarity with REST APIs and HTTP status codes
- ✅ Access to a PubNub keyset for hands-on labs

## Module Structure

### Core Documentation

| Document | Track | Topics | Time |
|----------|-------|--------|------|
| [01. Publish Fundamentals](./01-publish-fundamentals.md) | Standard | API mechanics, payload limits, Store vs Fire | 45 min |
| [02. Message Design](./02-message-design.md) | Standard | Message structure, schema versioning, channels | 45 min |
| [03. Advanced Publish](./03-advanced-publish.md) | Advanced | Rate limits, Signals, encryption, optimization | 60 min |
| [04. Publish Integrations](./04-publish-integrations.md) | Advanced | History, Push, Functions, Events and Actions | 60 min |

### Lab Exercises

| Lab | Track | Objective | Time |
|-----|-------|-----------|------|
| [Lab 1: Basic Publish](./labs/lab-01-basic-publish.md) | Standard | First publish with error handling | 30 min |
| [Lab 2: Message Patterns](./labs/lab-02-message-patterns.md) | Standard | Schema design and versioning | 45 min |
| [Lab 3: Publish at Scale](./labs/lab-03-publish-at-scale.md) | Advanced | High-throughput optimization | 60 min |

## Quick Reference

### Key Limits (MCP-Verified)

| Limit | Value | Notes |
|-------|-------|-------|
| **Max payload** | 32 KiB | Hard limit including overhead |
| **Recommended max** | 30 KiB | Leave room for headers |
| **Optimal size** | <5 KiB | Best latency/throughput balance |
| **Signal max** | 64 bytes | For high-frequency, small data |
| **Channel name max** | 2,048 characters | Including separators |
| **UUID max** | 92 characters | User identifier |

### Required Message Fields

Every message MUST include:

```json
{
  "type": "domain.action",        // e.g., "vote.submit", "chat.message"
  "schemaVersion": "1.0",          // Version identifier
  "eventId": "evt_unique_id",      // For deduplication
  "ts": 1706889600000,             // Client timestamp (Unix epoch ms)
  "payload": {                     // Application-specific data
    "key": "value"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| **200** | Success | Process timetoken |
| **400** | Bad Request | Check message format |
| **403** | Forbidden | Refresh Access Manager token |
| **413** | Payload Too Large | Reduce message size |
| **429** | Rate Limited | Implement exponential backoff |

### Store vs Fire Decision Matrix

| Use Case | Method | Reasoning |
|----------|--------|-----------|
| Chat messages | Store (`store: true`) | History on join |
| Typing indicators | Fire (`norep: true`) | Ephemeral, no replay needed |
| Vote submissions | Store | Audit trail required |
| Vote results | Store | Historical record |
| Cursor positions | Fire | Real-time only, no persistence |
| System alerts | Store | Compliance/audit |

## Getting Started

### For Standard Track Learners

1. Read [01. Publish Fundamentals](./01-publish-fundamentals.md)
2. Complete [Lab 1: Basic Publish](./labs/lab-01-basic-publish.md)
3. Read [02. Message Design](./02-message-design.md)
4. Complete [Lab 2: Message Patterns](./labs/lab-02-message-patterns.md)

### For Advanced Track Learners

After completing Standard track:

1. Read [03. Advanced Publish](./03-advanced-publish.md)
2. Read [04. Publish Integrations](./04-publish-integrations.md)
3. Complete [Lab 3: Publish at Scale](./labs/lab-03-publish-at-scale.md)

## Common Questions

### When should I use Fire vs Store?

**Use Fire (norep: true)** for:
- Ephemeral data (typing indicators, cursor positions)
- Latency-critical updates where persistence isn't needed
- High-frequency events that shouldn't pollute history

**Use Store (default)** for:
- Chat messages, notifications (history on join)
- Audit trails (votes, transactions)
- Any data users need to see after joining

### How do I handle payload size limits?

If your data exceeds 30 KiB:
1. **Store large data externally** - Publish a reference URL
2. **Use Files service** - For binary assets (images, documents)
3. **Compress data** - Client-side compression before publish
4. **Paginate** - Split into multiple messages

### What's the difference between Signals and Messages?

| Feature | Message (Publish) | Signal |
|---------|-------------------|--------|
| Max size | 32 KiB | 64 bytes |
| Persistence | Optional | Never |
| Cost | Standard | Lower |
| Use case | Content, events | Indicators, ephemeral state |

### How do I ensure messages are delivered exactly once?

1. **Include `eventId`** in every message
2. **Server-side deduplication** - Check KV store or database
3. **Idempotent processing** - Safe to process same message multiple times
4. **Use Functions** - Before Publish handler checks for duplicates

## Next Steps

After completing this module:

- Proceed to **Module 2: Subscribe** to learn about receiving messages
- Review **Module 3: Access Manager** for securing Publish operations
- Explore **Module 9: Functions** for in-transit message processing

## Technical Accuracy

All technical specifications in this module have been verified against PubNub's official documentation using the PubNub MCP servers. Key verified details include:

- Payload size limits (32 KiB)
- Signal limits (64 bytes)
- HTTP status codes and error handling
- Store and Fire behaviors
- Encryption mechanisms (AES-256-CBC)
- Function binding depth limitations (2 levels)
- Mobile Push payload limits (APNs: 2KB, FCM: 4KB)

---

**Ready to begin?** Start with [01. Publish Fundamentals](./01-publish-fundamentals.md)
