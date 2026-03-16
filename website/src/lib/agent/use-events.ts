"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProxyEvent } from "./types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("occ-proxy-url");
    if (stored) return stored;
    return "http://localhost:9100";
  }
  return "http://localhost:9100";
}

/**
 * React hook for SSE connection to the proxy's /api/events endpoint.
 * Provides real-time proxy events with auto-reconnect.
 */
export function useProxyEvents(maxEvents = 200) {
  const [events, setEvents] = useState<ProxyEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
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
        reconnectTimer = setTimeout(() => {
          connect();
        }, 3000);
      };
    }

    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [maxEvents]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, clearEvents };
}
