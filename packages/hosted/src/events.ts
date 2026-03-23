import type { ServerResponse } from "node:http";

const subscribers = new Map<string, Set<ServerResponse>>();

export const eventBus = {
  subscribe(userId: string, res: ServerResponse) {
    if (!subscribers.has(userId)) subscribers.set(userId, new Set());
    subscribers.get(userId)!.add(res);
    res.on("close", () => {
      subscribers.get(userId)?.delete(res);
      if (subscribers.get(userId)?.size === 0) subscribers.delete(userId);
    });
  },

  emit(userId: string, event: Record<string, unknown>) {
    const subs = subscribers.get(userId);
    if (!subs) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of subs) {
      try { res.write(data); } catch { subs.delete(res); }
    }
  },

  getSubscriberCount(userId: string): number {
    return subscribers.get(userId)?.size ?? 0;
  },
};
