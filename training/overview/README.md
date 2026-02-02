# Module 0: Platform Overview and Getting Started

## Overview

This module provides a comprehensive introduction to the PubNub platform, covering all core services, their interactions, and integration patterns. It serves as the foundation for understanding how to architect real-time applications using PubNub.

## Learning Objectives

After completing this module, Solution Architects will be able to:

1. **Navigate the PubNub platform** - Understand the complete service ecosystem and how components relate
2. **Identify when to use each service** - Map business requirements to appropriate PubNub services
3. **Understand data flow through the system** - Trace how messages, events, and metadata move through PubNub
4. **Explain the client/server/PubNub relationship** - Describe integration patterns and security models
5. **Draw the platform architecture from memory** - Communicate system design to customers and colleagues
6. **Map common use cases to appropriate services** - Recommend the right combination of services for different scenarios

## Module Contents

### [01. Platform Architecture](./01-platform-architecture.md)
High-level overview of the PubNub platform, including:
- The PubNub Edge Network and global Points of Presence
- Connection model (long-poll protocol, TCP sockets)
- Latency and performance characteristics
- Client/Server/PubNub relationship diagram

### [02. Service Catalog](./02-service-catalog.md)
Comprehensive reference for all PubNub services:
- Publish and Subscribe (core real-time messaging)
- Presence (online user tracking)
- Message Persistence (history storage)
- Access Manager (security and permissions)
- App Context (user and channel metadata)
- Functions (in-transit message processing)
- Mobile Push (native push notifications)
- Files (binary asset management)
- Events and Actions (external system routing)
- Illuminate (real-time analytics)

### [03. Service Interactions](./03-service-interactions.md)
How PubNub services work together:
- Core data flow diagrams
- Service relationship matrix
- Common data flow scenarios (chat, presence, analytics)
- Integration points and dependencies

### [04. Integration Patterns](./04-integration-patterns.md)
Client and server integration best practices:
- Token-based authentication flow
- Client SDK integration patterns
- Server-side integration with secret keys
- Hybrid pub/sub architectures
- Metadata synchronization patterns

## Prerequisites

- Basic understanding of pub/sub messaging concepts
- Familiarity with HTTP protocols
- Understanding of client-server architecture

## Estimated Time

- Reading: 45-60 minutes
- Hands-on exercises: 30-45 minutes
- Total: 1.5-2 hours

## Next Steps

After completing this overview module, proceed to the service-specific deep-dive modules to learn the technical details, best practices, and production considerations for each PubNub service.

## Technical Accuracy

All technical specifications in this module have been verified against PubNub's official documentation using the PubNub MCP servers. Key verified details include:

- Subscribe long-poll timeout: 280 seconds
- Maximum message payload: 32 KiB
- Presence announce_max default: 20
- Token TTL range: 1-43,200 minutes
- Channel Groups limit: 100 channels per group
- Wildcard Subscribe depth: 2 levels maximum
- File size limit: 5 MB
- History fetch limit: 100 messages per channel
- Global Points of Presence: 15+
