# Membership-Inbox-Subscription: Working Notes

**Last Updated:** 2026-02-13

---

## Implementation Approaches

### Approach 1: Core Platform Feature

**How it works:**
- Built directly into PubNub publish path
- When message is published to any channel:
  1. Check if channel has App Context memberships
  2. Query all UUIDs that are members of the channel
  3. For each member, publish a copy to `inbox.{uuid}`
  4. Original publish completes normally

**Pros:**
- Native performance (no Functions overhead)
- No transaction multiplier for Functions execution
- Consistent behavior across all keysets
- Lower latency
- No Functions limits (timeout, KV operations, etc.)

**Cons:**
- Requires core platform changes
- Longer development and testing cycle
- Harder to iterate/experiment
- Must work for all customers (can't be opt-in easily)
- Potential impact on publish latency for all messages

**Questions:**
- Can routing be async to avoid blocking original publish?
- How to handle routing failures gracefully?
- Can we make it opt-in per keyset?
- What's the latency impact on the publish path?

---

### Approach 2: PubNub Functions (Before Publish)

**How it works:**
- Create Functions Event Handler on wildcard channel pattern
- Before Publish handler triggers on every message
- Function logic:
  1. Query App Context for channel memberships
  2. For each member UUID, call `pubnub.publish()` to their inbox
  3. Return original message unchanged

**Example Function:**

```javascript
export default async (request) => {
  const { message, channel } = request;
  const pubnub = require('pubnub');

  try {
    // Query memberships for this channel
    const memberships = await pubnub.getChannelMembers({
      channel: channel,
      limit: 100
    });

    // Route to each member's inbox
    const routePromises = memberships.data.map(member => {
      const inboxChannel = `inbox.${member.uuid.id}`;
      return pubnub.publish({
        channel: inboxChannel,
        message: {
          ...message,
          meta: {
            ...message.meta,
            originChannel: channel
          }
        }
      });
    });

    await Promise.all(routePromises);
  } catch (error) {
    console.error('Inbox routing error:', error);
    // Don't fail original publish
  }

  // Return original message unchanged
  return request.ok();
};
```

**Pros:**
- Fast to prototype and test
- Can iterate quickly based on feedback
- Customer can customize routing logic
- Easy to enable/disable per keyset
- No core platform changes needed

**Cons:**
- Functions execution timeout (5 seconds)
- Additional transactions: 1 per message for Function execution
- App Context API rate limits could throttle
- KV store needed for membership caching
- Higher latency (Function execution time)
- Functions costs in addition to publish costs

**Questions:**
- Can we cache memberships in KV store to reduce API calls?
- What happens if Function times out? Does original publish fail?
- How to handle pagination if channel has >100 members?
- What's the cost multiplier for customers?

---

### Approach 3: Hybrid (Functions + Cache)

**How it works:**
- Functions Before Publish handler
- Membership data cached in KV store
- After Publish or On Request handlers update cache when memberships change
- Before Publish reads from cache instead of querying App Context

**Cache Structure:**

```javascript
// Key: "channel_members:{channelId}"
// Value: ["uuid1", "uuid2", "uuid3", ...]

// Updated by After Publish on membership events
// Or by On Request webhook from App Context updates
```

**Pros:**
- Faster than querying App Context every time
- Reduces API call overhead
- More predictable latency
- Lower transaction costs

**Cons:**
- Cache invalidation complexity
- Stale data if cache isn't updated immediately
- KV storage costs
- More complex Function logic
- Still subject to Functions timeout

**Questions:**
- How to keep cache in sync reliably?
- What's the cache hit rate likely to be?
- How long should cache TTL be?
- What's the fallback if cache is stale?

---

## Edge Cases to Consider

### 1. User Subscribed to Both Inbox and Original Channel

**Scenario:**
```javascript
pubnub.subscribe({
  channels: ['inbox.alice', 'room.general']
});
```

**Result:** Alice receives duplicate messages - once from `room.general`, once from `inbox.alice`.

**Solutions:**
- **Documentation:** Recommend against this pattern (anti-pattern)
- **Client-side dedupe:** Use `eventId` to detect duplicates
- **Server-side detection:** Check if user is subscribed to both (complex)

**Recommendation:** Document as anti-pattern, provide client-side dedupe example.

---

### 2. Large Channel Fanout

**Scenario:** Channel with 10,000 members → 10,000 inbox publishes per message.

**Concerns:**
- Publish API rate limits
- Cost explosion
- Latency for routing
- Functions timeout

**Solutions:**
- **Rate limiting:** Limit max members for inbox routing (e.g., 1,000)
- **Batching:** Batch inbox publishes where possible
- **Sharding:** Recommend channel sharding for large channels
- **Alert customers:** Warn when approaching limits

**Recommendation:** Set hard limit (e.g., 1,000 members), alert at 80% threshold.

---

### 3. Membership Change Race Conditions

**Scenario:**
1. User leaves channel (membership deleted)
2. Message published to channel (routing starts)
3. Routing sends message to user's inbox (still in progress)
4. User receives message from channel they just left

**Timing:**
```
T0: User leaves channel
T1: Membership deleted from App Context
T2: Message published (reads stale membership)
T3: User receives message in inbox
```

**Solutions:**
- **Eventual consistency:** Document this as expected behavior
- **Timestamp checking:** Include membership timestamp in routed message
- **Grace period:** Accept brief inconsistency window
- **Client filtering:** Let client ignore messages based on timestamp

**Recommendation:** Document eventual consistency guarantees, provide client-side filtering pattern.

---

### 4. User Joins Channel Mid-Conversation

**Scenario:**
1. User joins channel (membership created)
2. Messages published before membership update completes
3. User misses messages published during join window

**Timing:**
```
T0: User joins channel
T1: Membership created (async)
T2: Messages published (membership not yet visible)
T3: User's inbox doesn't receive messages from T2
T4: Membership now active
```

**Solutions:**
- **History backfill:** Client fetches recent history after joining
- **Join event:** Publish join event to trigger sync
- **Optimistic routing:** Route messages optimistically during join
- **Confirmation:** Wait for membership confirmation before considering join complete

**Recommendation:** Document pattern for post-join history fetch.

---

### 5. Inbox Channel Name Collision

**Scenario:** What if customer already uses `inbox.*` pattern for other purposes?

**Solutions:**
- **Configurable prefix:** Allow keyset-level configuration of inbox prefix
- **Reserved pattern:** Document `inbox.*` as reserved for this feature
- **Migration support:** Provide tooling to migrate existing `inbox.*` channels

**Recommendation:** Start with `inbox.*` as default, make configurable in future.

---

### 6. Deleted User / Invalid UUID

**Scenario:** Membership exists for UUID that's been deleted or invalid.

**Routing behavior:**
- Publish to `inbox.{deletedUser}` still succeeds (channels don't require pre-creation)
- Messages go nowhere (no subscribers)

**Solutions:**
- **Cleanup:** Periodically clean up memberships for deleted users
- **Validation:** Validate UUID exists before creating membership
- **Error handling:** Log/alert when routing to inactive users

**Recommendation:** Provide cleanup utilities, validate on membership creation.

---

### 7. Functions Timeout

**Scenario:** Routing logic takes >5 seconds, Functions times out.

**Behavior:**
- Original publish fails or succeeds depending on Function config
- Inbox routing incomplete

**Solutions:**
- **Async routing:** Make routing async, don't block original publish
- **Partial routing:** Route to as many inboxes as possible before timeout
- **Queue-based:** Use message queue for routing (complex)

**Recommendation:** Implement async routing, set realistic member limits.

---

### 8. Cross-Keyset Memberships

**Scenario:** User memberships exist in one keyset but inbox is in another.

**Current behavior:** Not supported - App Context is keyset-scoped.

**Solutions:**
- **Not supported:** Document as limitation
- **Cross-keyset lookups:** (Future) Allow cross-keyset App Context queries

**Recommendation:** Document as limitation, consider for future.

---

## Questions to Research

### Performance & Scale
- [ ] What's the latency impact of App Context queries in publish path?
- [ ] How many members per channel before routing becomes prohibitive?
- [ ] What's the cost multiplier for Functions-based routing?
- [ ] Can we cache membership data effectively? What's cache hit rate?
- [ ] What's the breakpoint where inbox routing is slower than Channel Groups?

### Cost Analysis
- [ ] Transaction costs: Core routing vs. Functions routing vs. Channel Groups
- [ ] App Context query costs at scale
- [ ] Storage costs for duplicated messages (if history enabled)
- [ ] Break-even analysis for customers

### Security & Access Manager
- [ ] How to auto-provision inbox channel tokens?
- [ ] Can we enforce single-subscriber rule per inbox?
- [ ] Audit logging requirements for inbox access?
- [ ] Threat model: What attacks are possible?

### Migration & Adoption
- [ ] How do customers migrate from Channel Groups?
- [ ] Can we build migration tooling? (Channel Group → memberships)
- [ ] Backward compatibility: Can Channel Groups and inbox coexist?
- [ ] What's the adoption path for existing apps?

### API Design
- [ ] Should inbox channel pattern be configurable?
- [ ] Should routing be opt-in per channel?
- [ ] How to handle routing failures gracefully?
- [ ] What metadata should be included in routed messages?

### Observability
- [ ] How to monitor routing performance?
- [ ] Metrics: routing latency, fanout factor, failure rate
- [ ] Alerts: high fanout, timeout, errors
- [ ] Debugging: How to trace message routing?

---

## Alternative Channel Prefixes Considered

| Prefix | Length | Pros | Cons |
|--------|--------|------|------|
| `inbox` | 5 | Clear, intuitive | Generic |
| `uminb` | 5 | Unique acronym | Not readable |
| `usrin` | 5 | User inbox | Odd acronym |
| `notif` | 5 | Notification focus | Too specific |
| `feed` | 4 | Short, clear | Ambiguous (RSS?) |
| `mbox` | 4 | Mailbox | Less clear |
| `stream` | 6 | Event stream | Too long |

**Recommendation:** `inbox` - clear, intuitive, and meets 5-char limit.

---

## Open Questions for Product

1. **Is this a core feature or Functions template?**
   - Core = more investment, better performance
   - Functions = faster to market, more flexible

2. **Opt-in or always-on?**
   - Opt-in = safer, gradual rollout
   - Always-on = simpler, but requires migration path

3. **Who is the primary customer?**
   - Chat apps? Notification systems? All real-time apps?
   - Helps prioritize features and trade-offs

4. **What's the pricing model?**
   - Included in base transactions?
   - Additional cost per routed message?
   - Break-even analysis needed

5. **What's the migration story?**
   - Do we provide tooling?
   - Is there a dual-write period?
   - Backward compatibility requirements?

---

## Next Brainstorming: Enhancements

**If this feature is built, what enhancements would be valuable?**

1. **Filtered Routing**
   - Route only messages matching certain criteria to inbox
   - Example: Only route @mentions, not all messages

2. **Priority Inbox**
   - High-priority channel for urgent messages
   - Pattern: `inbox.{userId}.priority`

3. **Batch Delivery**
   - Aggregate multiple messages, deliver in batches
   - Reduce notification spam

4. **Read Receipts Integration**
   - Track which inbox messages have been read
   - Sync read status across devices

5. **Smart Routing**
   - ML-based routing (only messages user cares about)
   - Spam filtering, relevance scoring

6. **Cross-Platform Inbox**
   - Unified inbox across multiple apps/keysets
   - Single subscription for all user's apps

---

## Competitive Landscape Notes

**Firebase Firestore:**
- Query subscriptions trigger client updates
- Server manages which clients get which updates
- Similar concept but document-based not channel-based

**Ably:**
- Channel multiplexing over single connection
- Client subscribes to multiple channels efficiently
- Different mechanism but solves similar problem

**Stream Chat:**
- User channels + event subscriptions
- Similar inbox concept for notifications
- Membership-driven routing

**Unique Differentiator:**
- Leverage App Context as routing source of truth
- No custom server logic required
- Automatic sync between memberships and subscriptions
