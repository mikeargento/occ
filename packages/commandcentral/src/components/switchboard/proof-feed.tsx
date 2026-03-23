"use client";

import type { ProxyEvent } from "@/lib/types";
import { Badge } from "@/components/shared/badge";
import { formatRelativeTime } from "@/lib/format";

interface ProofFeedProps {
  events: ProxyEvent[];
  isConnected: boolean;
}

export function ProofFeed({ events, isConnected }: ProofFeedProps) {
  if (events.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-subtle border border-border-subtle">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-success animate-pulse-dot" : "bg-text-tertiary"
            }`}
          />
          <p className="text-xs text-text-tertiary">
            {isConnected ? "Listening for activity..." : "Waiting for connection"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {events.map((event, i) => (
        <EventRow key={i} event={event} />
      ))}
    </div>
  );
}

function EventRow({ event }: { event: ProxyEvent }) {
  if (event.type === "tool-executed") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 animate-slide-up">
        <div className="relative flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-success" />
        </div>
        <span className="text-xs font-mono text-text flex-1 truncate">
          {event.tool}
        </span>
        <Badge variant="success">Allowed</Badge>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  if (event.type === "policy-violation") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 animate-slide-up">
        <div className="relative flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-error" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono text-text-secondary block truncate">
            {event.tool}
          </span>
          <span className="text-[11px] text-error/70 block truncate">
            {event.reason}
          </span>
        </div>
        <Badge variant="error">Denied</Badge>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  if (event.type === "policy-loaded") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 animate-slide-up">
        <div className="w-2 h-2 rounded-full bg-info flex-shrink-0" />
        <span className="text-xs text-text-secondary flex-1">
          Policy loaded: {event.policyName}
        </span>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  return null;
}
