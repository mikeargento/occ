"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ProxyEvent } from "./types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("occ-proxy-url");
    if (stored) return stored;
    return "";
  }
  return "";
}

/**
 * React hook for SSE connection to the proxy's /api/events endpoint.
 * Provides real-time proxy events with auto-reconnect.
 */
export function useProxyEvents(maxEvents = 200) {
  const [events, setEvents] = useState<ProxyEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    const url = `${getBaseUrl()}/api/events`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ProxyEvent;
        setEvents((prev) => {
          const next = [event, ...prev];
          return next.slice(0, maxEvents);
        });
      } catch {
        // Ignore non-JSON messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [maxEvents]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, clearEvents };
}
