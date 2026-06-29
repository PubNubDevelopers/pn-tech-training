# Membership-Inbox-Subscription

**Status:** Concept
**Type:** Feature
**Complexity:** Medium
**Last Updated:** 2026-02-13
**Owner:** Product/Engineering

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Proposed Solution](#proposed-solution)
- [Target Use Cases](#target-use-cases)
- [Technical Approach](#technical-approach)
- [PubNub Features Involved](#pubnub-features-involved)
- [Benefits](#benefits)
- [Challenges & Considerations](#challenges--considerations)
- [Dependencies](#dependencies)
- [Alternatives Considered](#alternatives-considered)
- [Next Steps](#next-steps)
- [References](#references)

---

## Problem Statement

Today, applications that need to route messages to users based on their memberships or subscriptions must **manually manage Channel Groups on the server side**. This creates several problems:

1. **Operational Complexity** - Customers must maintain synchronization logic between App Context memberships and Channel Group assignments
2. **Sync Issues** - Lag or failures can cause users to miss messages or receive messages from channels they've left
3. **Server Dependencies** - Requires customer infrastructure to handle membership changes and update Channel Groups
4. **Scale Challenges** - High-frequency membership changes can overwhelm Channel Group management APIs
5. **Client Complexity** - Clients must subscribe to Channel Groups or manually track their channel list

**Example Scenarios:**
- Chat app where users are members of multiple rooms - must sync room memberships to Channel Group
- Notification system where users subscribe to topics - must sync topic subscriptions to Channel Group
- Collaborative workspace where users join projects - must sync project memberships to Channel Group

Currently, customers must build and maintain this synchronization infrastructure themselves.

---

## Proposed Solution

**Automate channel routing using App Context memberships** by introducing a special "inbox" channel pattern that PubNub automatically populates with messages from channels the user is a member of.

### High-Level Concept

1. **User subscribes to a single personal inbox channel** - `inbox.{userId}`
2. **User creates App Context memberships** to channels they want to receive messages from
3. **PubNub server automatically routes messages** from member channels to the user's inbox
4. **No manual Channel Group management** required by customer

### Message Flow

```
1. Message published to: channel.room123

2. PubNub checks App Context: "Who is a member of channel.room123?"
   → user.alice, user.bob, user.charlie

3. PubNub routes message to inbox channels:
   → inbox.alice
   → inbox.bob
   → inbox.charlie

4. Users subscribed to their inbox channels receive the message
```

### Key Innovation

**Leverage App Context as the source of truth** for subscription management, eliminating the need for customers to maintain parallel Channel Group infrastructure.

---

## Target Use Cases

### 1. Chat Applications
Users join/leave chat rooms dynamically. Instead of managing Channel Groups:
- Users manage memberships via App Context
- Subscribe to `inbox.{userId}` once
- Automatically receive messages from all member rooms

### 2. Notification Systems
Users subscribe to notification topics (e.g., alerts, updates, news):
- Create memberships to topic channels
- Receive all notifications in personal inbox
- No Channel Group updates needed

### 3. Collaborative Applications
Users join projects, teams, or workspaces:
- Membership tracks which projects user belongs to
- Single subscription point for all project updates
- Automatic routing as user joins/leaves projects

### 4. Social Features
Follow feeds, friend activities, group updates:
- Memberships represent social connections
- Inbox aggregates all social updates
- Simplified client subscription logic

### 5. Multi-Tenant SaaS
Users belong to organizations, departments, teams:
- Memberships model organizational structure
- Inbox receives messages from all relevant entities
- No manual subscription list management

---

## Technical Approach

### Channel Naming Convention

**Inbox Channel Pattern:** `inbox.{userId}`

- Prefix: `inbox` (5 characters, satisfies constraint)
- User identifier follows the dot separator
- Examples:
  - `inbox.alice`
  - `inbox.user123`
  - `inbox.customer-abc-456`

### Routing Mechanism

Two potential implementation approaches:

#### **Option A: Core Platform Feature**
- Built into PubNub core publish logic
- When message published to `channel.X`:
  1. Query App Context for memberships to `channel.X`
  2. For each member UUID, publish copy to `inbox.{uuid}`
  3. Maintains original message metadata and timetoken

**Pros:** Highest performance, native integration, consistent behavior
**Cons:** Platform change, longer development cycle

#### **Option B: PubNub Functions**
- Functions Before Publish handler on wildcard pattern
- Executes on every channel publish
- Queries App Context memberships, publishes to inbox channels

**Pros:** Faster to prototype, configurable per keyset
**Cons:** Performance overhead, Functions limits, additional transaction costs

### Membership Schema

Uses existing App Context membership model:

```json
{
  "uuid": "user.alice",
  "channel": "room.general",
  "custom": {},
  "status": "active"
}
```

No schema changes required - leverages existing memberships.

### Message Format

Messages routed to inbox channels retain original structure:

```json
{
  "type": "chat.message",
  "schemaVersion": "1.0",
  "eventId": "evt_abc123",
  "ts": 1676389200000,
  "payload": {
    "text": "Hello world",
    "sender": "user.bob"
  },
  "meta": {
    "originChannel": "room.general"
  }
}
```

**Key field:** `meta.originChannel` - indicates which channel the message was originally published to.

### Subscription Pattern

**Client subscribes once:**

```javascript
pubnub.subscribe({
  channels: ['inbox.alice']
});
```

**All messages from member channels arrive in inbox.**

---

## PubNub Features Involved

| Feature | Usage |
|---------|-------|
| **App Context (Objects)** | Store and query channel memberships |
| **Pub/Sub** | Inbox channels, original channel publishes |
| **Functions** | (If Option B) Before Publish handler for routing logic |
| **Access Manager** | Secure inbox channels, prevent unauthorized access |
| **History/Persistence** | Optional: Store inbox messages for replay |

---

## Benefits

### For Customers

1. **Simplified Architecture** - No server-side Channel Group management
2. **Automatic Sync** - Memberships and subscriptions always in sync
3. **Reduced Infrastructure** - Less code to write and maintain
4. **Single Subscription Point** - Clients subscribe to one channel
5. **Declarative Model** - Memberships define subscriptions naturally
6. **Real-Time Updates** - Membership changes immediately affect routing

### For PubNub

1. **Competitive Differentiation** - Unique feature vs. competitors
2. **Increased App Context Adoption** - Clear value proposition for Objects
3. **Simplified Customer Onboarding** - Easier to build chat/notification apps
4. **Reduced Support Burden** - Fewer Channel Group sync issues
5. **Platform Value** - Deeper integration across PubNub features

### Cost Model

**Potential transaction impacts:**
- **Core feature:** Minimal transaction increase (routing overhead)
- **Functions-based:** Additional transactions per publish + KV reads for memberships

Needs analysis for cost implications vs. value delivered.

---

## Challenges & Considerations

### 1. Performance & Scale

**Challenge:** Large channels with many members could trigger many inbox publishes.

**Example:** Channel with 10,000 members → 10,000 inbox publishes per message

**Mitigations:**
- Rate limiting on inbox routing
- Batching inbox publishes where possible
- Alerts for high-fanout scenarios
- Recommend channel sharding for large channels

### 2. Message Ordering

**Challenge:** Inbox messages may arrive out-of-order if routing is asynchronous.

**Considerations:**
- Preserve original timetoken in routed message
- Document ordering guarantees clearly
- Provide best practices for handling out-of-order messages

### 3. Migration Path

**Challenge:** Existing apps use Channel Groups - how to migrate?

**Migration Strategy:**
- Dual-write period: Update both Channel Groups and memberships
- Gradual client migration to inbox subscription
- Backward compatibility: Keep Channel Groups working
- Migration tooling: Bulk import Channel Groups → memberships

### 4. Access Manager & Security

**Challenge:** Inbox channels need strict security - only owner can subscribe.

**Access Manager Requirements:**
- Auto-generate tokens for inbox channels
- Enforce single-subscriber rule per inbox
- Prevent cross-user access
- Audit logging for inbox access

**Example Token:**
```json
{
  "channels": {
    "inbox.alice": {
      "read": true,
      "write": false
    }
  },
  "uuid": "alice",
  "ttl": 3600
}
```

### 5. Message Deduplication

**Challenge:** User subscribed to inbox AND original channel → duplicate messages.

**Approaches:**
- Document as anti-pattern (don't subscribe to both)
- Client-side dedupe using `eventId`
- Server-side dedupe detection (complex)

### 6. Presence Integration

**Challenge:** How does Presence work with inbox channels?

**Options:**
- Presence on inbox shows user online status
- Presence on original channels shows active participants
- Need clear semantics for both

### 7. History & Persistence

**Challenge:** Should inbox messages be persisted? Separate from original channel?

**Considerations:**
- Inbox history = personalized message history
- Original channel history = canonical message log
- Storage costs for duplicated messages
- Retention policies per channel type

### 8. Membership Event Latency

**Challenge:** Delay between membership change and routing update.

**Scenarios:**
- User leaves channel → still receives messages briefly
- User joins channel → misses messages published during join

**Mitigations:**
- Document eventual consistency guarantees
- Provide sync/confirmation mechanisms
- Best practices for handling edge cases

### 9. Cost Implications

**Challenge:** Additional publishes increase transaction costs.

**Cost Analysis Needed:**
- Fanout factor (avg members per channel)
- Message volume
- Compare to Channel Group transaction costs
- Break-even analysis for customers

### 10. Function Limits (if Option B)

**Challenge:** Functions have execution time and API call limits.

**Constraints:**
- 5-second timeout
- API rate limits for App Context queries
- Transaction overhead

**Workarounds:**
- Cache membership data in KV store
- Batch processing where possible
- Fallback to direct subscription if routing fails

---

## Dependencies

### Required PubNub Features
- **App Context (Objects)** - Must be enabled on keyset
- **Channel Memberships** - Core dependency for routing logic
- **Pub/Sub** - Inbox channel infrastructure

### Optional Features
- **Functions** - If implementing via Option B
- **Access Manager** - Strongly recommended for security
- **History** - For message replay and auditing

### External Dependencies
None - fully contained within PubNub platform.

### Prerequisites
- Customers must model their channels using App Context
- Clients must be updated to subscribe to inbox pattern
- Access Manager tokens must include inbox channel grants

---

## Alternatives Considered

### 1. Manual Channel Group Management (Current State)

**Approach:** Customers manage Channel Groups via server-side logic.

**Pros:**
- Fully supported today
- Complete control over routing
- Well-understood pattern

**Cons:**
- High operational complexity
- Sync issues common
- Requires customer infrastructure

**Why not:** This is the problem we're solving.

---

### 2. Wildcard Subscribe

**Approach:** Clients subscribe to `room.*` to receive all room messages.

**Pros:**
- Simple client logic
- No server-side management
- Built-in feature

**Cons:**
- Clients receive ALL messages from pattern, not just their channels
- Security implications (broad access)
- No per-user filtering
- Not scalable for selective subscriptions

**Why not:** Too coarse-grained, lacks per-user control.

---

### 3. Client-Side Subscription Management

**Approach:** Clients maintain their own list of channels and subscribe/unsubscribe dynamically.

**Pros:**
- No server logic required
- Direct control

**Cons:**
- Clients must track memberships locally
- Network overhead for subscribe/unsubscribe
- State sync issues
- Doesn't work for offline routing
- Mobile battery impact

**Why not:** Puts burden on client, unreliable state management.

---

### 4. External Message Router

**Approach:** Build custom routing service outside PubNub.

**Pros:**
- Complete customization
- Can integrate with other systems

**Cons:**
- Significant infrastructure to build and maintain
- Additional latency
- Complexity
- Cost

**Why not:** Defeats purpose of using real-time platform.

---

### 5. Presence-Based Routing

**Approach:** Use Presence to determine who's online and route accordingly.

**Pros:**
- Real-time awareness of active users

**Cons:**
- Doesn't solve membership problem
- Ephemeral state only
- Presence isn't authoritative
- Doesn't handle offline users

**Why not:** Presence is for online status, not subscription management.

---

## Next Steps

### Phase 1: Research & Validation (2-3 weeks)

- [ ] Deep-dive technical feasibility study
  - App Context query performance at scale
  - Fanout implications and cost modeling
  - Functions vs. core platform trade-offs
- [ ] Customer validation
  - Interview 5-10 customers using Channel Groups
  - Validate pain points and solution approach
  - Gather requirements for migration path
- [ ] Competitive analysis
  - How do competitors handle this? (Firebase, Ably, Stream, etc.)
  - Identify unique differentiators
- [ ] Cost-benefit analysis
  - Transaction impact modeling
  - Customer value proposition
  - Break-even scenarios

### Phase 2: Prototype (2-4 weeks)

- [ ] Build Functions-based POC (Option B)
  - Implement Before Publish handler
  - Test with realistic membership data
  - Measure performance and latency
  - Identify bottlenecks
- [ ] Create sample applications
  - Chat app using inbox pattern
  - Notification system demo
  - Document developer experience
- [ ] Load testing
  - Test with varying fanout factors (10, 100, 1000 members)
  - Measure Functions execution time
  - Identify breaking points

### Phase 3: Proposal & Design (2-3 weeks)

- [ ] Write detailed technical specification
  - API design
  - Message format and metadata
  - Access Manager requirements
  - Migration strategy
- [ ] Security review
  - Threat modeling
  - Access Manager token design
  - Audit requirements
- [ ] Cost analysis presentation
  - Transaction modeling
  - Pricing strategy
  - Customer impact
- [ ] Engineering review and approval

### Phase 4: Implementation (TBD)

- [ ] Core platform feature OR Functions template
- [ ] Documentation and guides
- [ ] Migration tooling
- [ ] Beta program with select customers
- [ ] GA launch

---

## References

### Internal Documentation
- [App Context (Objects) Documentation](https://www.pubnub.com/docs/general/objects/overview)
- [Channel Groups Documentation](https://www.pubnub.com/docs/general/channels/subscribe#channel-groups)
- [PubNub Functions Documentation](https://www.pubnub.com/docs/functions/overview)

### Related Use Cases
- [Best Practices: Chat Applications](../../best-practices/)
- [Training: App Context](../../training/)

### External References
- Firebase Firestore query subscriptions
- Ably channel multiplexing
- Stream Chat channel memberships

### Discussions
- (Add links to internal discussions, Slack threads, customer requests)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-13 | 1.0 | Initial concept proposal |
