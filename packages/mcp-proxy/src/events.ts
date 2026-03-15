// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { EventEmitter } from "node:events";
import type { ProxyEvent } from "./types.js";

/**
 * Typed event emitter for proxy events.
 * Used by the management API's SSE endpoint and internal components.
 */
export class ProxyEventBus {
  #emitter = new EventEmitter();

  emit(event: ProxyEvent): void {
    this.#emitter.emit("event", event);
  }

  /** Subscribe to all proxy events. Returns an unsubscribe function. */
  subscribe(handler: (event: ProxyEvent) => void): () => void {
    this.#emitter.on("event", handler);
    return () => {
      this.#emitter.off("event", handler);
    };
  }

  /** Get the number of active subscribers. */
  get listenerCount(): number {
    return this.#emitter.listenerCount("event");
  }
}
