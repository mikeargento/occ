"use client";

import { useEffect, useState, useCallback } from "react";
import { listKeys, setKey, deleteKey } from "@/lib/api";
import type { StoredKey } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime } from "@/lib/format";

export default function KeysPage() {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", value: "" });
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listKeys()
      .then((res) => setKeys(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleAdd() {
    if (!form.id.trim() || !form.name.trim() || !form.value.trim()) return;
    setSaving(true);
    try {
      await setKey(form.id.trim(), form.name.trim(), form.value.trim());
      setForm({ id: "", name: "", value: "" });
      setShowAdd(false);
      setShowValue(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteKey(id);
      setConfirmingDelete(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">API Keys</h1>
          <p className="text-sm text-text-secondary mt-1">
            Encrypted keys stored locally in .occ/keys.json
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
        >
          Add Key
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 animate-slide-up">
          <Card>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                    Key ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. openai-api-key"
                    value={form.id}
                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-bg-inset border border-border focus:border-accent-dim outline-none transition-colors"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. OpenAI API Key"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-bg-inset border border-border focus:border-accent-dim outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                  Value
                </label>
                <div className="relative">
                  <input
                    type={showValue ? "text" : "password"}
                    placeholder="Enter secret value..."
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    className="w-full px-3 py-2 pr-16 text-sm font-mono rounded-lg bg-bg-inset border border-border focus:border-accent-dim outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowValue(!showValue)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    {showValue ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleAdd}
                  disabled={saving || !form.id.trim() || !form.name.trim() || !form.value.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-text text-bg hover:bg-accent disabled:opacity-40 transition-all duration-100"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setForm({ id: "", name: "", value: "" });
                    setShowValue(false);
                  }}
                  className="px-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-error/60 hover:text-error ml-3 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-[56px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && keys.length === 0 && (
        <EmptyState
          icon="default"
          title="No keys stored"
          description="Add API keys to securely store them for use by connections and agents. Keys are encrypted at rest."
          action={
            !showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
              >
                Add Key
              </button>
            ) : undefined
          }
        />
      )}

      {/* Keys table */}
      {keys.length > 0 && (
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  Name
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  ID
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Value
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Updated
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-border-subtle last:border-0 group hover:bg-bg-subtle/40 transition-colors duration-75"
                >
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-text">{key.name}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-text-secondary font-mono">{key.id}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-text-tertiary font-mono tracking-wider">
                      {key.maskedValue}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm text-text-tertiary">
                      {formatRelativeTime(key.updatedAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                      {confirmingDelete === key.id ? (
                        <>
                          <span className="text-xs text-text-secondary">Delete?</span>
                          <button
                            onClick={() => handleDelete(key.id)}
                            className="px-2 py-1 text-xs rounded-md text-error hover:bg-error/10 transition-colors font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmingDelete(null)}
                            className="px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmingDelete(key.id)}
                          className="px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-error hover:bg-error/5 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
