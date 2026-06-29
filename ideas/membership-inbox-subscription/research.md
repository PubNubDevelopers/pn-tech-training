# Membership-Inbox-Subscription: Research Topics

**Last Updated:** 2026-02-13

---

## Research Areas

This document outlines research topics that need investigation before moving this idea from Concept to Proposal stage.

---

## 1. Channel Groups vs. Memberships: Technical Comparison

### Goal
Understand the technical trade-offs between Channel Groups and App Context memberships for subscription management.

### Research Questions

**Performance:**
- [ ] What's the latency difference between:
  - Channel Group subscribe/unsubscribe operations
  - App Context membership create/delete operations
- [ ] How do query performance compare?
  - `listChannelsForChannelGroup` vs. `getChannelMembers`
  - At 10, 100, 1,000, 10,000 members
- [ ] What are the rate limits for each?
  - Channel Group operations per second
  - App Context operations per second

**Scale:**
- [ ] Maximum members per Channel Group vs. per channel memberships
- [ ] How many Channel Groups can a keyset have?
- [ ] How many memberships can a user have?
- [ ] What happens at scale limits?

**Consistency:**
- [ ] Eventual consistency guarantees for both
- [ ] Propagation delay for changes
- [ ] Race condition scenarios

**Cost:**
- [ ] Transaction costs: Channel Group operations vs. App Context operations
- [ ] Storage costs (if applicable)
- [ ] Hidden costs (e.g., History, Presence interaction)

### Methodology
- Benchmarking suite comparing both approaches
- Load testing with varying member counts
- Cost modeling with realistic usage patterns
- Document findings with graphs and tables

### Success Criteria
Clear understanding of when memberships outperform Channel Groups and vice versa.

---

## 2. App Context Performance at Scale

### Goal
Determine if App Context queries can support real-time message routing at production scale.

### Research Questions

**Query Performance:**
- [ ] Latency for `getChannelMembers` with varying member counts:
  - 10 members: ___ms
  - 100 members: ___ms
  - 1,000 members: ___ms
  - 10,000 members: ___ms
- [ ] Does pagination affect performance?
- [ ] Can queries be cached effectively?

**Concurrency:**
- [ ] How many concurrent App Context queries can a keyset handle?
- [ ] What happens when rate limits are hit?
- [ ] Do queries queue or fail?

**Data Freshness:**
- [ ] How stale can membership data be in routing scenarios?
- [ ] Propagation time for membership changes across regions
- [ ] Cache invalidation strategies

**Reliability:**
- [ ] Error rates for App Context queries
- [ ] Retry semantics
- [ ] Failover behavior

### Methodology
1. Create test keyset with App Context enabled
2. Populate with varying member counts
3. Benchmark query performance under load
4. Test concurrent access patterns
5. Measure consistency guarantees

### Success Criteria
- Query latency <100ms for 90% of requests (up to 1,000 members)
- Identify breaking points for scalability
- Document when caching is required

---

## 3. Message Routing Patterns in Real-Time Systems

### Goal
Study how other real-time platforms handle membership-based message routing.

### Platforms to Research

#### Firebase Firestore
- How do query subscriptions work?
- Server-side vs. client-side filtering
- Performance characteristics
- Cost model

#### Ably
- Channel multiplexing
- Subscription management
- Routing mechanisms
- Scale limits

#### Stream Chat
- User notification channels
- Activity feeds
- Membership-driven routing

#### Pusher Channels
- Private vs. presence channels
- Authorization model
- Subscription patterns

#### Socket.IO
- Room management
- Broadcasting strategies
- Namespace/room organization

### Research Questions
- [ ] What patterns do competitors use?
- [ ] What are common pitfalls?
- [ ] What's considered best practice?
- [ ] What features do developers expect?
- [ ] How do they handle scale?
- [ ] What's the pricing model?

### Deliverable
- Competitive analysis document
- Feature comparison matrix
- Lessons learned summary
- Differentiation opportunities

---

## 4. Customer Pain Points with Channel Groups

### Goal
Validate that this feature solves real customer problems.

### Research Methodology

**Customer Interviews (Target: 10 customers):**
- [ ] Identify customers using Channel Groups heavily
- [ ] Schedule 30-min interviews
- [ ] Document current pain points
- [ ] Validate proposed solution resonates

**Interview Questions:**
1. How do you use Channel Groups today?
2. What's your process for managing Channel Group memberships?
3. What problems do you encounter?
4. Have you experienced sync issues? How often?
5. How much code/infrastructure is dedicated to Channel Group management?
6. Would inbox-based routing solve your problems?
7. What concerns would you have about migrating?
8. What features would be must-haves?

**Support Ticket Analysis:**
- [ ] Search support tickets for Channel Group issues
- [ ] Categorize common problems
- [ ] Quantify frequency and severity

**Community Forums:**
- [ ] Search Stack Overflow, Reddit, Discord for Channel Group discussions
- [ ] Identify common questions and complaints
- [ ] Catalog workarounds customers have built

### Deliverable
- Customer pain points summary
- Quote compilation (for internal advocacy)
- Feature requirements from customers
- Migration concerns to address

---

## 5. Cost-Benefit Analysis

### Goal
Determine if inbox routing is cost-effective for customers compared to Channel Groups.

### Cost Model Components

**Channel Groups (Current State):**
- API calls for add/remove channel
- Subscribe operations
- Publish to Channel Group
- History queries

**Inbox Routing (Proposed):**
- App Context membership operations
- Publish to original channel
- Routing publishes to inbox channels (fanout)
- Inbox subscribe
- Inbox history queries

### Analysis Required

**Transaction Costs:**
```
Scenario: 1,000 users, 100 channels, 10 messages/sec

Channel Groups:
- Setup: 1,000 users × 100 channels = 100,000 channel adds
- Runtime: 10 msg/sec × 1 publish = 10 transactions/sec
- Total: ___

Inbox Routing:
- Setup: 1,000 users × 100 channels = 100,000 memberships
- Runtime: 10 msg/sec × (1 publish + 100 inbox publishes) = 1,010 transactions/sec
- Total: ___

Cost difference: ___
```

**Break-Even Analysis:**
- [ ] At what fanout factor does inbox routing become more expensive?
- [ ] What usage patterns favor each approach?
- [ ] Are there hidden cost savings (e.g., reduced infrastructure)?

**Non-Transaction Costs:**
- [ ] Customer infrastructure to manage Channel Groups
- [ ] Engineering time to build and maintain sync logic
- [ ] Support burden for sync issues

### Deliverable
- Cost model spreadsheet
- Break-even calculator
- Pricing recommendation
- Customer impact analysis

---

## 6. Migration Strategies

### Goal
Design a safe, gradual migration path from Channel Groups to inbox routing.

### Migration Challenges

**Existing Applications:**
- Already using Channel Groups
- Deployed clients expect Channel Group behavior
- Can't have downtime
- Need rollback capability

**Data Migration:**
- [ ] How to convert Channel Group memberships to App Context memberships?
- [ ] Can this be automated?
- [ ] What happens to in-flight messages during migration?

### Migration Approaches to Research

#### Option 1: Dual-Write Period
1. Start writing memberships in addition to Channel Groups
2. Keep both in sync for transition period
3. Migrate clients to subscribe to inbox
4. Once all clients migrated, stop updating Channel Groups

**Pros:** Safe, gradual, rollback-friendly
**Cons:** Dual write overhead, complex sync logic

#### Option 2: Shadow Mode
1. Enable inbox routing but keep Channel Groups active
2. Monitor inbox routing performance
3. Gradually migrate clients
4. Sunset Channel Groups once confident

**Pros:** Low risk, can validate before full migration
**Cons:** Running both systems simultaneously

#### Option 3: Parallel Deployment
1. New features use inbox routing
2. Existing features keep Channel Groups
3. Gradual feature-by-feature migration

**Pros:** Isolated risk, phased approach
**Cons:** Maintaining both patterns long-term

### Research Questions
- [ ] What's the recommended migration path?
- [ ] How long should transition period be?
- [ ] What tooling is needed?
- [ ] What monitoring is required during migration?
- [ ] What are rollback procedures?

### Deliverable
- Migration playbook
- Tooling requirements
- Timeline estimate
- Risk assessment

---

## 7. Security & Threat Modeling

### Goal
Ensure inbox routing is secure and doesn't introduce vulnerabilities.

### Security Concerns

**Unauthorized Inbox Access:**
- [ ] Can user A subscribe to user B's inbox?
- [ ] How to enforce single-subscriber rule?
- [ ] What if inbox token is leaked?

**Message Injection:**
- [ ] Can attacker publish directly to inbox channel?
- [ ] Bypass membership checks?
- [ ] Spoof origin channel?

**Denial of Service:**
- [ ] Can attacker create high-fanout scenario?
- [ ] Overwhelm routing system?
- [ ] Exhaust customer's transaction quota?

**Privacy:**
- [ ] Can membership data leak user information?
- [ ] Are inbox messages more/less private than original channels?
- [ ] Compliance considerations (GDPR, HIPAA, etc.)?

### Threat Scenarios to Model

1. **Cross-User Access:** Attacker subscribes to victim's inbox
2. **Message Injection:** Attacker publishes fake messages to inbox
3. **Fanout Bomb:** Attacker creates channel with 100,000 members
4. **Membership Enumeration:** Attacker queries memberships to map users
5. **Token Replay:** Attacker steals and reuses inbox token

### Research Questions
- [ ] What Access Manager grants are required for inbox channels?
- [ ] How to auto-provision secure tokens?
- [ ] What audit logging is needed?
- [ ] How to detect and prevent abuse?
- [ ] What are compliance implications?

### Deliverable
- Threat model document
- Security requirements specification
- Access Manager token design
- Audit logging plan
- Abuse prevention mechanisms

---

## 8. Functions Performance & Limits

### Goal
If implementing via Functions, understand performance characteristics and limits.

### Functions Constraints

**Execution Limits:**
- Max execution time: 5 seconds
- Memory limits
- API rate limits
- KV store limits

**Cost Multipliers:**
- Function execution per message
- KV reads/writes
- Outbound API calls (App Context queries)

### Performance Testing

**Benchmark Scenarios:**
1. **Small fanout (10 members):**
   - Measure execution time
   - Transaction count
   - Latency impact

2. **Medium fanout (100 members):**
   - Measure execution time
   - Pagination impact
   - Risk of timeout

3. **Large fanout (1,000 members):**
   - Will it timeout?
   - Partial routing behavior
   - Error handling

**With Caching:**
- [ ] Test with KV-cached memberships
- [ ] Measure cache hit rate
- [ ] Cache invalidation latency

### Research Questions
- [ ] At what member count do Functions timeout?
- [ ] Can routing be made async to avoid blocking publish?
- [ ] What's the cost multiplier vs. core feature implementation?
- [ ] How to handle partial routing on timeout?

### Deliverable
- Functions performance report
- Recommendation: Functions vs. core feature
- Optimization strategies if using Functions

---

## 9. Message Ordering & Consistency Guarantees

### Goal
Define and validate ordering guarantees for routed messages.

### Ordering Scenarios

**Single Channel to Single Inbox:**
```
Channel A publishes: M1, M2, M3
User inbox receives: M1, M2, M3 (in order?)
```

**Multiple Channels to Single Inbox:**
```
Channel A publishes: M1, M3
Channel B publishes: M2, M4
User inbox receives: M1, M2, M3, M4 (what order?)
```

**Concurrent Routing:**
```
Two messages published simultaneously to same channel
Both route to same inbox
What's the ordering guarantee?
```

### Research Questions
- [ ] What ordering can we guarantee?
- [ ] Per-channel ordering preserved?
- [ ] Cross-channel ordering defined?
- [ ] How to handle out-of-order delivery?
- [ ] What metadata helps clients reorder?

### Consistency Scenarios

**Membership Changes:**
```
T0: User joins channel
T1: Message published
T2: Routing sees membership (or doesn't?)
```

- [ ] When does membership become "visible" for routing?
- [ ] Eventual consistency window?
- [ ] How to handle race conditions?

### Research Methodology
1. Design test scenarios for ordering
2. Implement prototype
3. Measure ordering behavior under load
4. Document guarantees clearly
5. Provide client-side ordering patterns if needed

### Deliverable
- Ordering guarantees specification
- Consistency model documentation
- Client-side best practices for handling ordering
- Test suite for ordering validation

---

## 10. Observability & Monitoring

### Goal
Define how customers and PubNub can monitor inbox routing health and performance.

### Metrics to Track

**Routing Performance:**
- Routing latency (publish → inbox delivery)
- Fanout distribution (avg, p50, p95, p99)
- Failure rate
- Timeout rate (if Functions-based)

**Volume Metrics:**
- Messages routed per second
- Inbox channels active
- Membership query rate
- Cache hit rate (if caching)

**Error Metrics:**
- Routing failures
- Membership query errors
- Timeout events
- Invalid membership data

### Dashboards Needed

**Customer-Facing:**
- Inbox routing volume and latency
- Fanout distribution
- Error rates
- Cost impact

**Internal (PubNub Ops):**
- Global routing volume
- Performance by region
- Failure modes
- Resource utilization

### Alerting

**Customer Alerts:**
- High fanout warning (approaching limits)
- Routing failures
- Performance degradation

**PubNub Alerts:**
- System-wide performance issues
- Rate limit approaching
- Spike in failures

### Research Questions
- [ ] What metrics are most valuable to customers?
- [ ] What SLIs/SLOs should we commit to?
- [ ] How to troubleshoot routing issues?
- [ ] What tracing is needed for debugging?

### Deliverable
- Observability specification
- Dashboard mockups
- Alerting rules
- Troubleshooting playbook

---

## Research Timeline

### Week 1-2: Technical Feasibility
- App Context performance benchmarking
- Functions performance testing
- Scalability limits identification

### Week 3-4: Customer Validation
- Customer interviews
- Pain point analysis
- Support ticket review

### Week 5-6: Competitive & Cost Analysis
- Competitive research
- Cost modeling
- Break-even analysis

### Week 7-8: Design Deep Dives
- Security & threat modeling
- Migration strategy design
- Ordering & consistency specifications

### Week 9-10: Synthesis & Recommendations
- Compile all research findings
- Build recommendation deck
- Present to stakeholders

---

## Research Outputs

At the end of research phase, deliver:

1. **Technical Feasibility Report**
   - Performance benchmarks
   - Scalability limits
   - Implementation approach recommendation

2. **Customer Validation Summary**
   - Pain points validated
   - Feature requirements
   - Migration concerns

3. **Cost-Benefit Analysis**
   - Cost model
   - Break-even scenarios
   - Pricing recommendation

4. **Competitive Analysis**
   - Feature comparison
   - Market positioning
   - Differentiation strategy

5. **Design Specifications**
   - Security model
   - Ordering guarantees
   - Observability plan

6. **Go/No-Go Recommendation**
   - Should we build this?
   - If yes, which implementation approach?
   - What are risks and mitigations?
   - What's the timeline?

---

## Open Research Questions

**High Priority:**
- [ ] Can App Context queries support real-time routing latency?
- [ ] What's the realistic member limit before performance degrades?
- [ ] Do customers validate this solves their problems?
- [ ] Is cost model favorable for customers?

**Medium Priority:**
- [ ] How do competitors handle this? What can we learn?
- [ ] What's the best migration path?
- [ ] Functions or core feature?
- [ ] What ordering guarantees can we make?

**Low Priority:**
- [ ] What enhancements would be valuable in v2?
- [ ] Cross-keyset routing possible?
- [ ] Integration with other PubNub features (e.g., Presence, History)?

---

## Research Resources

### Internal
- PubNub Engineering (performance data, architecture input)
- PubNub Support (customer pain points, ticket analysis)
- PubNub Sales/SA (customer feedback, competitive intel)
- PubNub Product (roadmap alignment, prioritization)

### External
- Customer interviews and surveys
- Competitive platform documentation
- Industry benchmarks and case studies
- Academic research on real-time systems

### Tools
- Benchmarking suite for App Context
- Functions prototyping environment
- Cost modeling spreadsheets
- Analytics for usage patterns

---

## Next Steps After Research

Once research phase is complete:

1. **Synthesize findings** into comprehensive report
2. **Present to stakeholders** for go/no-go decision
3. **If approved:** Move to **Proposal** status and begin detailed design
4. **If not approved:** Move to **Archived** status with lessons learned
5. **If needs more research:** Iterate on specific areas
