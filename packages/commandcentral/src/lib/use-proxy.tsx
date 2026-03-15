"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getHealth } from "./api";

interface ProxyConnection {
  isConnected: boolean;
  proxyId: string | null;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
}

const ProxyContext = createContext<ProxyConnection>({
  isConnected: false,
  proxyId: null,
  baseUrl: "http://localhost:9100",
  setBaseUrl: () => {},
});

export function ProxyProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [proxyId, setProxyId] = useState<string | null>(null);
  const [baseUrl, setBaseUrlState] = useState("http://localhost:9100");

  const setBaseUrl = (url: string) => {
    setBaseUrlState(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("occ-proxy-url", url);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("occ-proxy-url");
      if (saved) setBaseUrlState(saved);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const health = await getHealth();
        if (mounted) {
          setIsConnected(health.ok);
          setProxyId(health.proxyId);
        }
      } catch {
        if (mounted) {
          setIsConnected(false);
          setProxyId(null);
        }
      }
    }

    check();
    const interval = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [baseUrl]);

  return (
    <ProxyContext value={{ isConnected, proxyId, baseUrl, setBaseUrl }}>
      {children}
    </ProxyContext>
  );
}

export function useProxy() {
  return useContext(ProxyContext);
}
