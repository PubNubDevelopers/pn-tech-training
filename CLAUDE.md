# CLAUDE.md

## Objective
Use Claude to plan and draft best-practice guidance for building real-time applications on PubNub using:
- **App Context** (Objects)
- **Functions** (Event Handlers)
- **Pub/Sub**
- **Presence**
- **Message Persistence / History / Fetch**
- **Access Manager (PAM)**
- **PubNub MCP Servers**
- Other PubNub features as required

Primary target use cases include (but are not limited to):
- Voting
- Polling
- Trivia
- Quizzes
- Other interactive, real-time patterns

The outputs must be **production-oriented**: reference architectures, implementation patterns, guardrails, and example workflows that can be reused internally and with customers.

---

## Audience
- Solution Architects / Sales Engineers
- Customer Engineering teams
- Customers building production systems

Assume basic PubNub familiarity, but **do not assume** production experience with real-time systems.

---

## Required Deliverables
Claude should produce, as applicable per use case:
- **Reference architecture** (components + data flow)
- **Channel strategy** (naming, partitioning, fanout, scaling considerations)
- **Data model** (App Context schemas, relationships, constraints)
- **Event model** (events, commands, idempotency strategy)
- **Functions design** (triggers, retries, side effects, observability)
- **Security model** (PAM roles, token design, least privilege)
- **Correctness guarantees** (ordering, dedupe, race conditions, replay handling)
- **Performance analysis** (hot channels, sharding, batching, rate limits)
- **Resilience** (failover behavior, retries, backpressure)
- **Observability** (logging, metrics, tracing, audit trail)
- **Cost / usage considerations** (message volume, payload sizing, retention)
- **Testing plan** (unit, integration, load, chaos testing)
- **Operational runbook** (alerts, dashboards, support playbook)

---

## Canonical Use Case Pattern Template
Every use case MUST follow this structure:

1. **Problem Statement**
2. **Requirements**
   - Functional
   - Non-functional (latency, scale, reliability)
3. **Architecture**
   - Diagram description (text)
   - Components
4. **Channel Topology**
5. **App Context Model**
6. **Event / Message Contracts**
7. **Functions / Server Logic**
8. **Security (PAM / tokens)**
9. **Failure Modes & Edge Cases**
10. **Scaling Notes**
11. **Observability**
12. **Testing**
13. **Implementation Checklist**
14. **Common Mistakes**

---

## PubNub Best-Practice Guardrails (Non-Negotiable)

Claude MUST:
- Prefer **idempotent** designs and explain how idempotency is achieved.
- Explicitly address **deduplication** and **replay** for every use case.
- Include **authorization (PAM token strategy)** in every design.
- Avoid trusting clients with authoritative decisions.
- Clearly explain **when to use App Context vs History vs external storage**.
- Define and justify **channel naming and partitioning**.
- Include **payload size constraints** and recommended message shapes.
- Discuss **fanout risks** and mitigation strategies.
- Include at least one **abuse / moderation control** for public-facing use cases.

---

## Feature Usage Rules

### App Context (Objects)
- Use for canonical identity, metadata, membership, and queryable state.
- Do **not** use as a high-frequency event log.
- Explicitly define UUID, Channel, and Membership schemas.

### Functions (Event Handlers)
- Use for validation, enrichment, moderation, routing, and side effects.
- Keep logic deterministic and idempotent.
- Document retry semantics and error handling.
- Avoid heavy or latency-sensitive work inside Functions.

### Pub/Sub
- Use for real-time, ephemeral events.
- **Every message MUST include a top-level `type` property** (e.g., `vote.submit`, `poll.answer`, `quiz.response`).
- The `type` property enables routing, filtering, and Function handling by message purpose.
- Version all messages (`schemaVersion`).
- Include `eventId` or `requestId` for dedupe and auditing.

### Presence
- Use for ephemeral occupancy and “who’s here” indicators.
- Never treat Presence as an authoritative identity source.

### History / Fetch / Persistence
- Use for short- to medium-term replay and auditability.
- Explicitly define retention per use case.
- Never assume infinite retention.

### Access Manager (PAM)
- Prefer **token-based grants**.
- Enforce least privilege (channels, TTLs, capabilities).
- Clearly separate roles (host, moderator, participant, viewer).

### Channel Naming
- Use **`[channelType].[channelID]`** convention (e.g., `vote.session123`, `inbox.user456`, `group.room789`).
- Always use a **dot (`.`) after the channel type prefix** to enable wildcard subscribe and Function binding.
- Channel IDs can be **composable** from multiple entities (e.g., `group.event123.room456`, `inbox.customer789.user123`).
- Use **ASCII characters only** for all channel name parts.
- **Depth warning**: Channels more than 3 levels deep require disabling Wildcard Subscribe to publish.
- **Wildcard limitation**: Function channel binding only works at the second level (`foo.*` works, `foo.bar.*` does not).
- Choose delimiter placement based on Function requirements: use `.` where you need wildcard binding for Functions.

---

## PubNub MCP Server Usage (Required)

Claude MUST incorporate **PubNub MCP servers** where appropriate.

### When to Use MCP Servers
- Reading **pnconfig**, App Context schemas, or metadata
- Inspecting configuration, constraints, or defaults
- Acting as a **read-only source of truth** for planning
- Avoiding duplication of logic already defined in PubNub tooling

### MCP Design Principles
- Treat MCP servers as **authoritative, read-only inputs**
- Do not assume write or mutation capabilities
- Prefer MCP-sourced data over inferred or hardcoded assumptions
- Clearly state when a design relies on MCP-provided context

### Required MCP Considerations in Outputs
For each use case, Claude should state:
- Which data **could or should** be sourced via MCP
- What benefits MCP provides (correctness, safety, consistency)
- What logic remains in the application vs MCP-backed tooling

---

## Output Format Requirements
Claude outputs must be:
- Structured and well-headed
- Copy/paste friendly
- Explicit about assumptions and tradeoffs
- Versioned where relevant (schemas, message contracts)
- Actionable (tables, examples, checklists)

### Message Contract Requirements
All example messages must include:
- `type`
- `schemaVersion`
- `eventId` or `requestId`
- `ts` (timestamp)
- Minimal, well-scoped payload

---

## Style Rules
- Use clear, technical language
- Avoid marketing language
- Prefer concrete recommendations over generic advice
- If uncertain, state assumptions and offer alternatives

---

## Validation Checklist (Claude must verify before finalizing)
For every use case:
- [ ] Channel strategy defined
- [ ] App Context model defined
- [ ] Security model defined
- [ ] Idempotency & dedupe addressed
- [ ] Failure modes addressed
- [ ] Scaling & fanout risks addressed
- [ ] Observability plan included
- [ ] Testing checklist included
- [ ] MCP usage considered and documented

---

## Questions Claude May Ask (Only if Blocked)
Claude may ask **at most three** clarifying questions, prioritized:
1. Expected scale (users, rooms, messages/sec)
2. Authority model (who can create/close/grade)
3. Retention and audit requirements
