#!/usr/bin/env npx tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Mock downstream MCP server — simulates a customer service toolset.
 *
 * Tools:
 *   read-order       — look up an order by ID
 *   check-eligibility — check if an order is eligible for refund
 *   issue-refund      — issue a refund (costs money)
 *   send-email        — send an email to a customer
 *   search-db         — search the customer database
 *   delete-user       — DANGEROUS: delete a user account
 *   drop-table        — DANGEROUS: drop a database table
 *
 * Run: npx tsx examples/mock-tools-server.ts
 * Communicates via stdio (MCP standard).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "Mock Customer Service Tools",
  version: "1.0.0",
});

// ── Safe tools ──

server.tool(
  "read-order",
  "Look up an order by ID",
  { orderId: z.string() },
  async ({ orderId }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        orderId,
        customer: "Jane Doe",
        amount: 4999,
        status: "delivered",
        date: "2026-03-10",
      }),
    }],
  }),
);

server.tool(
  "check-eligibility",
  "Check if an order is eligible for refund",
  { orderId: z.string() },
  async ({ orderId }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        orderId,
        eligible: true,
        reason: "Within 30-day return window",
        maxRefundCents: 4999,
      }),
    }],
  }),
);

server.tool(
  "issue-refund",
  "Issue a refund for an order",
  { orderId: z.string(), amountCents: z.number() },
  async ({ orderId, amountCents }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        orderId,
        refundedCents: amountCents,
        status: "processed",
        transactionId: `ref_${Date.now()}`,
      }),
    }],
  }),
);

server.tool(
  "send-email",
  "Send an email to a customer",
  { to: z.string(), subject: z.string(), body: z.string() },
  async ({ to, subject }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        sent: true,
        to,
        subject,
        messageId: `msg_${Date.now()}`,
      }),
    }],
  }),
);

server.tool(
  "search-db",
  "Search the customer database",
  { query: z.string() },
  async ({ query }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        results: [
          { id: "cust_001", name: "Jane Doe", email: "jane@example.com" },
          { id: "cust_002", name: "John Smith", email: "john@example.com" },
        ],
        query,
        totalResults: 2,
      }),
    }],
  }),
);

// ── Dangerous tools (should be blocked by policy) ──

server.tool(
  "delete-user",
  "Remove a user account from the system",
  { userId: z.string() },
  async ({ userId }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({ deleted: true, userId }),
    }],
  }),
);

server.tool(
  "drop-table",
  "Remove a database table from the system",
  { tableName: z.string() },
  async ({ tableName }) => ({
    content: [{
      type: "text",
      text: JSON.stringify({ dropped: true, tableName }),
    }],
  }),
);

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
