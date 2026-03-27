"use client";

import { useState, useEffect } from "react";

const API = "https://occ.wtf";

interface Proof {
  id: number;
  digestB64: string;
  counter: string | null;
  commitTime: number | null;
  enforcement: string;
  signerPub: string;
  attrName: string | null;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export default function Explorer() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API}/api/proofs?limit=50`)
      .then(r => r.ok ? r.json() : { proofs: [] })
      .then(d => setProofs(d.proofs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? proofs.filter(p =>
        p.digestB64.toLowerCase().includes(search.toLowerCase()) ||
        (p.attrName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        p.signerPub.toLowerCase().includes(search.toLowerCase()) ||
        (p.counter ?? "").includes(search)
      )
    : proofs;

  return (
    <div style={S.page}>
      <a href="/documentation" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>← Back</a>

      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", margin: "32px 0 8px", color: "#000" }}>Proof Explorer</h1>
      <p style={{ fontSize: 15, color: "#636366", margin: "0 0 24px" }}>Every OCC proof, publicly verifiable.</p>

      <input
        type="text"
        placeholder="Search by digest, signer, attribution, counter..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={S.search}
      />

      {loading ? (
        <p style={{ color: "#636366", fontSize: 14, padding: "32px 0" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#636366", fontSize: 14, padding: "32px 0" }}>No proofs found.</p>
      ) : (
        <div style={{ border: "1px solid #e5e5ea" }}>
          {filtered.map((p, i) => {
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #e5e5ea" : "none" }}>
                <button onClick={() => setExpanded(isOpen ? null : p.id)} style={S.row}>
                  <span style={{ color: "#636366", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 150ms", fontSize: 10 }}>▶</span>
                  <code style={{ fontSize: 12, fontFamily: "'SF Mono', Menlo, monospace", color: "#000", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {truncate(p.digestB64, 32)}
                  </code>
                  <span style={{ fontSize: 11, color: p.enforcement === "hardware_enclave" ? "#007aff" : "#636366", flexShrink: 0, marginLeft: 8 }}>
                    {p.enforcement === "hardware_enclave" ? "Hardware" : "Software"}
                  </span>
                  {p.counter && <span style={{ fontSize: 11, color: "#636366", flexShrink: 0, marginLeft: 8 }}>#{p.counter}</span>}
                  {p.commitTime && <span style={{ fontSize: 11, color: "#636366", flexShrink: 0, marginLeft: 8 }}>{timeAgo(p.commitTime)}</span>}
                </button>

                {isOpen && (
                  <div style={{ padding: 16, background: "#f2f2f7", borderTop: "1px solid #e5e5ea" }}>
                    <Field label="Digest" value={p.digestB64} mono />
                    <Field label="Signer" value={p.signerPub} mono />
                    <Field label="Enforcement" value={p.enforcement === "hardware_enclave" ? "Hardware Enclave (AWS Nitro)" : "Software"} />
                    {p.counter && <Field label="Counter" value={p.counter} />}
                    {p.commitTime && <Field label="Committed" value={new Date(p.commitTime).toLocaleString()} />}
                    {p.attrName && <Field label="Attribution" value={p.attrName} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0", borderBottom: "1px solid #e5e5ea" }}>
      <span style={{ fontSize: 11, color: "#636366", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: mono ? 11 : 12,
        fontFamily: mono ? "'SF Mono', Menlo, monospace" : "inherit",
        color: "#000", wordBreak: "break-all", textAlign: "right",
      }}>{value}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
    background: "#fff",
    color: "#000",
    padding: "48px 24px",
    maxWidth: 720,
    margin: "0 auto",
  },
  search: {
    width: "100%",
    height: 44,
    padding: "0 14px",
    fontSize: 15,
    border: "1px solid #e5e5ea",
    background: "#fff",
    color: "#000",
    outline: "none",
    marginBottom: 24,
    fontFamily: "inherit",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    height: 44,
    padding: "0 14px",
    gap: 10,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
};
