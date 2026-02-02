# Service Interactions

## Overview

PubNub services are designed to work together seamlessly. Understanding how services interact is critical for designing robust, scalable real-time applications. This document explores the relationships between services and common data flow patterns.

## Core Data Flow Diagram

```mermaid
flowchart TB
    subgraph entry [Entry Points]
        Publisher[Publisher]
        Subscriber[Subscriber]
    end
    
    subgraph security [Security Layer]
        AccessMgr[Access Manager<br/>Token Validation]
    end
    
    subgraph processing [Processing Layer]
        BeforePub[Functions<br/>Before Publish]
        AfterPub[Functions<br/>After Publish]
    end
    
    subgraph core [Core Messaging]
        Channel[Channel<br/>Message Bus]
    end
    
    subgraph storage [Storage Layer]
        History[Message Persistence<br/>History]
        AppContext[App Context<br/>Metadata]
    end
    
    subgraph awareness [Awareness Layer]
        Presence[Presence<br/>Occupancy]
    end
    
    subgraph delivery [Extended Delivery]
        MobilePush[Mobile Push<br/>APNs/FCM]
        Files[Files<br/>Binary Assets]
    end
    
    subgraph integration [External Integration]
        EventsActions[Events and Actions<br/>Webhooks/AWS]
        Illuminate[Illuminate<br/>Analytics]
    end
    
    Publisher --> AccessMgr
    AccessMgr --> BeforePub
    BeforePub --> Channel
    Channel --> History
    Channel --> Subscriber
    Channel --> MobilePush
    Channel --> AfterPub
    Channel --> EventsActions
    
    Subscriber --> AccessMgr
    Subscriber --> Presence
    
    AfterPub --> EventsActions
    
    EventsActions --> Illuminate
    Channel --> Illuminate
    
    Publisher -.->|set metadata| AppContext
    Subscriber -.->|get metadata| AppContext
    
    Publisher -.->|upload| Files
    Subscriber -.->|download| Files
```

## Service Relationship Matrix

### Complete Interaction Table

| From Service | To Service | Relationship | Direction |
|--------------|-----------|--------------|-----------|
| **Publish** | Access Manager | Token validation before publish | Sequential |
| **Publish** | Functions (Before) | Message interception and validation | Sequential |
| **Publish** | History | Automatic storage if enabled | Parallel |
| **Publish** | Mobile Push | Push payload extraction and routing | Parallel |
| **Publish** | Events and Actions | Event routing on publish | Parallel |
| **Publish** | Illuminate | Analytics ingestion | Parallel |
| **Subscribe** | Access Manager | Token validation on connect | Sequential |
| **Subscribe** | Presence | Implicit heartbeat mechanism | Automatic |
| **Subscribe** | History | Fetch messages on demand | On-demand |
| **Functions (After)** | Events and Actions | Side-effect routing | Sequential |
| **Functions (After)** | App Context | Metadata updates | On-demand |
| **Presence** | Functions (After) | Presence event handling | Sequential |
| **Presence** | App Context | Status synchronization | Via Functions |
| **All Events** | Events and Actions | Declarative event routing | Parallel |
| **All Events** | Illuminate | Real-time analytics | Parallel |

### Service Dependencies

```mermaid
flowchart LR
    subgraph independent [Independent Services]
        Publish[Publish]
        Subscribe[Subscribe]
        AppContext[App Context]
    end
    
    subgraph dependent [Dependent Services]
        Presence[Presence<br/>depends on Subscribe]
        History[History<br/>depends on Publish]
        MobilePush[Mobile Push<br/>depends on Publish]
        Functions[Functions<br/>intercepts Publish/Presence]
    end
    
    subgraph overlay [Overlay Services]
        AccessMgr[Access Manager<br/>secures all operations]
        EventsActions[Events and Actions<br/>observes all events]
        Illuminate[Illuminate<br/>analyzes all events]
    end
    
    Subscribe --> Presence
    Publish --> History
    Publish --> MobilePush
    Publish --> Functions
    
    AccessMgr -.->|validates| Publish
    AccessMgr -.->|validates| Subscribe
    AccessMgr -.->|validates| AppContext
    
    EventsActions -.->|routes| Publish
    EventsActions -.->|routes| Presence
    EventsActions -.->|routes| AppContext
    
    Illuminate -.->|analyzes| Publish
    Illuminate -.->|analyzes| Presence
```

## Common Data Flow Scenarios

### Scenario 1: Chat Message Flow (Complete)

This scenario demonstrates how a chat message flows through the entire PubNub platform.

```mermaid
sequenceDiagram
    participant User
    participant AccessMgr as Access Manager
    participant BeforePub as Functions<br/>Before Publish
    participant Channel
    participant History
    participant Subscribers
    participant MobilePush as Mobile Push
    participant EventsActions as Events and Actions
    participant Illuminate
    
    User->>AccessMgr: publish("chat.room1", message)
    AccessMgr->>AccessMgr: Validate token permissions
    AccessMgr->>BeforePub: Forward to Before Publish Function
    
    BeforePub->>BeforePub: Content moderation check
    BeforePub->>BeforePub: Add server timestamp
    BeforePub->>Channel: request.ok() - Allow message
    
    par Parallel Distribution
        Channel->>History: Store message (if enabled)
        Channel->>Subscribers: Real-time delivery to online users
        Channel->>MobilePush: Extract pn_apns/pn_fcm payloads
        Channel->>EventsActions: Route to configured listeners
        Channel->>Illuminate: Track message metrics
    end
    
    MobilePush->>MobilePush: Check device registrations
    MobilePush->>MobilePush: Send to APNs/FCM
    
    EventsActions->>EventsActions: Apply filters
    EventsActions->>EventsActions: Send to webhook/SQS
    
    Subscribers->>User: Message delivered
```

**Step-by-Step Breakdown**:

1. **User publishes message** with Access Manager token
2. **Access Manager validates** token has `write` permission for channel
3. **Before Publish Function** intercepts message:
   - Checks content for profanity
   - Adds server timestamp
   - Returns `request.ok()` to allow or `request.abort()` to block
4. **Parallel distribution** occurs simultaneously:
   - **History**: Message stored with timetoken
   - **Subscribers**: Real-time delivery to all subscribed clients
   - **Mobile Push**: Push payloads sent to offline users via APNs/FCM
   - **Events and Actions**: Message routed to webhooks, AWS, etc.
   - **Illuminate**: Message tracked in analytics
5. **User receives confirmation** with timetoken

### Scenario 2: User Comes Online (Presence + App Context)

This scenario shows how Presence and App Context work together to track user status.

```mermaid
sequenceDiagram
    participant User
    participant AccessMgr as Access Manager
    participant Subscribe
    participant Presence
    participant AfterPresence as Functions<br/>After Presence
    participant AppContext as App Context
    participant OtherUsers as Other Subscribers
    participant EventsActions as Events and Actions
    
    User->>AccessMgr: subscribe("chat.room1")
    AccessMgr->>AccessMgr: Validate token permissions
    AccessMgr->>Subscribe: Establish long-poll connection
    
    Subscribe->>Presence: Implicit heartbeat (join event)
    Presence->>AfterPresence: Fire After Presence handler
    
    AfterPresence->>AppContext: Update user status to "online"
    AfterPresence->>AppContext: Update lastSeen timestamp
    
    par Parallel Notifications
        Presence->>OtherUsers: Deliver presence event (join)
        Presence->>EventsActions: Route to analytics webhook
    end
    
    OtherUsers->>OtherUsers: Update UI - show user as online
    
    Note over Subscribe,Presence: Heartbeats continue every ~280s
    
    User->>Subscribe: unsubscribe() OR timeout
    Subscribe->>Presence: Leave or timeout event
    Presence->>AfterPresence: Fire After Presence handler
    
    AfterPresence->>AppContext: Update user status to "offline"
    AfterPresence->>AppContext: Update lastSeen timestamp
    
    Presence->>OtherUsers: Deliver presence event (leave/timeout)
```

**Key Points**:

- **Presence piggybacks on Subscribe** - No separate connection required
- **After Presence Function** bridges ephemeral Presence to persistent App Context
- **App Context stores canonical status** - Source of truth for user state
- **Other users receive presence events** in real-time
- **Timeout handled same as leave** - Always treat timeout as offline

### Scenario 3: File Sharing with Notifications

```mermaid
sequenceDiagram
    participant User
    participant Files
    participant Storage as Cloud Storage
    participant Channel
    participant History
    participant Subscribers
    participant MobilePush as Mobile Push
    
    User->>Files: sendFile(channel, file)
    Files->>Files: Generate upload URL
    Files->>Storage: Upload file (5MB max)
    Storage-->>Files: File uploaded (id, name)
    
    Files->>Channel: publishFile() - auto publish file event
    
    par Parallel Distribution
        Channel->>History: Store file event
        Channel->>Subscribers: Real-time file notification
        Channel->>MobilePush: Push notification to offline users
    end
    
    Subscribers->>Files: downloadFile(id, name)
    Files-->>Subscribers: Download URL
    Subscribers->>Storage: Retrieve file
```

**Key Points**:

- **Two-step upload**: Generate URL, then upload
- **Automatic file event**: `publishFile()` sends notification to channel
- **File metadata in History**: Event stored like regular message
- **Push notifications**: Offline users alerted to new files

### Scenario 4: External Integration via Events and Actions

```mermaid
sequenceDiagram
    participant Publisher
    participant Channel
    participant EventsActions as Events and Actions
    participant Filter as JSONPath Filter
    participant Webhook
    participant AWS as AWS Kinesis
    participant Illuminate
    
    Publisher->>Channel: publish("sensor.temp", data)
    
    Channel->>EventsActions: Event emitted
    EventsActions->>Filter: Apply filter: $.message[?(@.temp > 100)]
    
    alt Filter matches
        Filter->>Filter: Condition met
        par Send to Actions
            EventsActions->>Webhook: POST to alert endpoint
            EventsActions->>AWS: Send to Kinesis stream
            EventsActions->>Illuminate: Track anomaly metric
        end
    else Filter does not match
        Filter->>Filter: Skip actions
    end
```

**Key Points**:

- **Declarative routing**: No code required in application
- **JSONPath filtering**: Complex conditions on message payload
- **Multiple actions**: Send to multiple destinations simultaneously
- **Illuminate integration**: Analytics automatically tracked

### Scenario 5: Server-Authoritative Voting

This scenario demonstrates a hybrid architecture where clients submit votes but server validates and publishes results.

```mermaid
sequenceDiagram
    participant Client
    participant BeforePub as Functions<br/>Before Publish
    participant VoteSubmit as vote-submit.*
    participant Server as Customer Server
    participant VoteResult as vote-result.*
    participant Subscribers
    participant History
    
    Client->>VoteSubmit: publish("vote-submit.session123", vote)
    VoteSubmit->>BeforePub: Before Publish validation
    
    BeforePub->>BeforePub: Check vote structure
    BeforePub->>BeforePub: Rate limit check (KV store)
    BeforePub->>VoteSubmit: request.ok() - Allow
    
    Server->>VoteSubmit: subscribe("vote-submit.*")
    VoteSubmit->>Server: Deliver vote
    
    Server->>Server: Validate vote eligibility
    Server->>Server: Record in database
    Server->>Server: Calculate updated tally
    
    Server->>VoteResult: publish("vote-result.session123", tally)
    
    par Distribution
        VoteResult->>Subscribers: Real-time tally update
        VoteResult->>History: Store result
    end
```

**Key Points**:

- **Client submits** to `vote-submit.*` channel
- **Function validates structure** before delivery
- **Server subscribes** to `vote-submit.*` (wildcard)
- **Server publishes authoritative results** to `vote-result.*`
- **Clear separation**: Submission vs results channels

## Service Composition Patterns

### Pattern 1: Ephemeral + Persistent (Presence + App Context)

**Use Case**: Track online users with persistent profile data

```
Presence (ephemeral)           App Context (persistent)
├─ join/leave/timeout events   ├─ User profiles (name, avatar)
├─ Current occupancy count     ├─ Channel metadata
└─ Session-based state         └─ Membership relationships

Integration via Functions After Presence
```

**When to use**:
- Chat applications (online status + profiles)
- Multiplayer games (players online + stats)
- Collaborative tools (editors online + permissions)

### Pattern 2: Real-Time + History (Publish/Subscribe + Persistence)

**Use Case**: Live messaging with catch-up capability

```
Publish/Subscribe (real-time)  Message Persistence (history)
├─ Instant delivery            ├─ Store last N messages
├─ Sub-30ms latency            ├─ Fetch on join
└─ Ephemeral in-transit        └─ Configurable retention

Automatically integrated via store=1 flag
```

**When to use**:
- Chat (live messages + history on join)
- Live blogs (real-time updates + archive)
- IoT monitoring (current readings + historical trends)

### Pattern 3: Client + Server Validation (Functions + Access Manager)

**Use Case**: Secure user-generated content

```
Access Manager (authentication)  Functions (validation)
├─ Token-based authorization     ├─ Content moderation
├─ Read/write permissions       ├─ Rate limiting
└─ Time-limited access           └─ Schema validation

Sequential: Token check → Function intercept → Delivery
```

**When to use**:
- Public chat rooms (authenticated + moderated)
- User-submitted content (authorized + validated)
- Rate-limited APIs (token + quota check)

### Pattern 4: PubNub + External Systems (Events and Actions + Illuminate)

**Use Case**: Real-time events with external processing

```
Events and Actions (routing)    Illuminate (analytics)
├─ Route to webhooks            ├─ Business metrics
├─ Send to AWS SQS/Kinesis     ├─ Decision automation
└─ Integrate with Kafka         └─ Real-time dashboards

Both observe the same event stream in parallel
```

**When to use**:
- Analytics pipelines (PubNub → Data warehouse)
- Multi-system integration (PubNub → Email/SMS/Slack)
- Decision automation (metrics → triggers → actions)

## Cross-Service Data Synchronization

### App Context ↔ Presence Synchronization

**Challenge**: Presence is ephemeral, App Context is persistent. How to keep them in sync?

**Solution**: Use Functions After Presence handler

```javascript
// Function: presence-to-appcontext
// Trigger: After Presence on channels.*

export default async (request) => {
  const { action, uuid, timestamp } = request.message;
  
  if (!['join', 'leave', 'timeout'].includes(action)) {
    return request.ok();
  }
  
  const isOnline = action === 'join';
  
  // Update App Context
  await pubnub.objects.setUUIDMetadata({
    uuid: uuid,
    data: {
      custom: {
        online: isOnline,
        lastSeen: timestamp
      }
    }
  });
  
  return request.ok();
};
```

### History ↔ External Database Synchronization

**Challenge**: PubNub History has retention limits. How to achieve unlimited history?

**Solution**: Use Events and Actions or Functions to route to external database

```javascript
// Function: archive-to-database
// Trigger: After Publish on archive.*

export default async (request) => {
  const message = request.message;
  
  // Send to external database via webhook
  await xhr.fetch('https://api.yourcompany.com/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: message.channel,
      timetoken: message.timetoken,
      publisher: message.publisher,
      message: message.message
    })
  });
  
  return request.ok();
};
```

## Service Interaction Best Practices

### 1. Always Validate Before Storage

```
Publish → Access Manager → Functions (Before) → History

Never store invalid or malicious content
```

### 2. Use Presence for Ephemeral, App Context for Canonical

```
Presence: "Is user online RIGHT NOW?"
App Context: "Who IS this user?" (name, email, profile)
```

### 3. Separate Submission and Result Channels

```
Clients publish to: vote-submit.*
Clients subscribe to: vote-result.*

Server controls authoritative results
```

### 4. Bridge PubNub to External Systems Asynchronously

```
After Publish Function → Webhook (non-blocking)
Events and Actions → AWS SQS → Lambda

Don't slow down real-time delivery
```

### 5. Use Illuminate for PubNub-Native Analytics

```
PubNub Events → Illuminate Business Objects → Metrics → Decisions

No custom analytics infrastructure needed
```

## Performance Considerations

### Service Latency Impact

| Service Combination | Added Latency | Notes |
|---------------------|---------------|-------|
| Publish only | 0ms baseline | Direct delivery |
| + Access Manager | <5ms | Token validation |
| + Functions (Before) | 10-50ms | Depends on Function logic |
| + History | 0ms | Parallel, non-blocking |
| + Mobile Push | 0ms | Parallel, non-blocking |
| + Events and Actions | 0ms | Parallel, non-blocking |

**Key Insight**: Most services run in parallel and don't add latency to the critical path. Only Access Manager and Functions (Before Publish) are sequential.

### Fanout Considerations

**Problem**: Publishing to channels with many subscribers

| Subscribers | Fanout Strategy |
|-------------|-----------------|
| 1-1,000 | Direct publish to channel |
| 1,000-10,000 | Consider channel sharding |
| 10,000+ | Use presence Interval Mode, shard channels |

**Mitigation**:
- Shard channels: `chat.room1.shard-0`, `chat.room1.shard-1`, etc.
- Use Signals (64 bytes) for high-frequency, low-payload events
- Enable Presence Interval Mode for high-occupancy channels

## Summary

PubNub services interact in well-defined patterns:

1. **Sequential**: Access Manager → Functions (Before) → Channel
2. **Parallel**: Channel → History + Subscribers + Mobile Push + Events and Actions + Illuminate
3. **Piggybacking**: Subscribe → Presence (automatic heartbeat)
4. **Bridging**: Functions connect ephemeral services (Presence) to persistent services (App Context)
5. **Observing**: Events and Actions and Illuminate observe all events without blocking

Understanding these interaction patterns enables you to design robust, scalable real-time applications that leverage the full power of the PubNub platform.

---

**Next**: [04. Integration Patterns](./04-integration-patterns.md) - Learn how to integrate client applications and servers with PubNub.
