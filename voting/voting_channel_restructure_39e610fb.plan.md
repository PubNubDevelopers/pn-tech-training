---
name: Voting Channel Restructure
overview: Restructure the voting design pattern to use 2-level channel naming (`[channelType].[channelId]`) that enables per-type Function binding, following the updated PubNub best practices in CLAUDE.md.
todos:
  - id: update-architecture-diagram
    content: Update ASCII architecture diagram with new channel names
    status: completed
  - id: update-channel-topology
    content: Rewrite Section 4 (Channel Topology) with 2-level naming and add Function Binding Strategy subsection
    status: completed
  - id: update-app-context
    content: Update channel field in App Context JSON example
    status: completed
  - id: update-functions-code
    content: Update channel references in Function code examples
    status: completed
  - id: update-pam-tokens
    content: Update channel patterns in PAM token examples
    status: completed
  - id: update-sharding
    content: Update sharding implementation with compound channelId pattern
    status: completed
isProject: false
---

# Restructure Voting Channel Naming to 2-Level Convention

## Problem

Current voting channels use 3-4 level names:

- `vote.{sessionId}.control` (3 levels)
- `vote.{sessionId}.submit` (3 levels)
- `vote.{sessionId}.results` (3 levels)
- `vote.{sessionId}.submit.{shardId}` (4 levels - requires disabling Wildcard Subscribe)

This violates the new rules:

- Function binding only works at second level (`foo.*` works, `foo.bar.*` does NOT)
- 4+ level channels require disabling Wildcard Subscribe

## New Channel Naming

Restructure to 2-level `[channelType].[channelId]`:


| Old Name                            | New Name                            | Function Binding |
| ----------------------------------- | ----------------------------------- | ---------------- |
| `vote.{sessionId}.control`          | `vote-control.{sessionId}`          | `vote-control.*` |
| `vote.{sessionId}.submit`           | `vote-submit.{sessionId}`           | `vote-submit.*`  |
| `vote.{sessionId}.results`          | `vote-results.{sessionId}`          | `vote-results.*` |
| `vote.{sessionId}.submit.{shardId}` | `vote-submit.{sessionId}-shard-{N}` | `vote-submit.*`  |


**Key insight**: Sharding uses compound channelId (`{sessionId}-shard-{N}`) to stay at 2 levels, allowing a single `vote-submit.*` Function binding for all shards.

## Files to Update

[voting/README.md](voting/README.md) - Update all sections containing channel names:

### Section 3.1 Architecture Diagram

- Update channel name labels in ASCII diagram (lines 117-132)

### Section 4.1 Channel Naming Convention

- Replace channel naming examples (lines 200-205)
- Add explicit Function binding patterns

### Section 4.2 Channel Purpose Matrix

- Update channel column (lines 209-214)

### Section 4.3 Channel Partitioning Strategy

- Update shard channel examples (lines 216-235)

### Section 5.1 Channel Metadata

- Update `"channel"` field in JSON example (line 245)

### Section 6.x Message Contracts (all)

- No change needed - messages reference `sessionId`, not channel names

### Section 7.1 Before Publish Handler

- Update channel references in Function code (line ~495)

### Section 8.2 Token Grant Strategy

- Update channel patterns in token examples (lines ~660-700)

### Section 10.2 Sharding Implementation

- Update `getShardChannel` function (lines ~870-880)

### Add new subsection to Section 4

- Add "4.4 Function Binding Strategy" explaining how `vote-*.*` patterns enable per-type routing

## Message Types (No Change Needed)

The existing `type` properties already comply:

- `vote.created`, `vote.opened`, `vote.closed`, `vote.revealed`
- `vote.submit`, `vote.ack`, `vote.tally`

