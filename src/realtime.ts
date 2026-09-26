/**
 * Real-Time Client Synchronization Engine
 * Operates purely client-side via official @supabase/supabase-js channels.
 * Zero custom backend WebSockets and zero server-side streaming endpoints (Vercel Serverless safe).
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

export type RealtimeListener = (event: string, data: any) => void;

class RealtimeSyncManager {
  private listeners: Set<RealtimeListener> = new Set();
  private companyId = "global";
  private supabaseChannel: any = null;
  private lastProcessedTimestamp = 0;
  private lastProcessedPayload = "";

  constructor() {
    if (typeof window !== "undefined") {
      setTimeout(() => {
        this.initSupabaseChannel();
      }, 0);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: "visibility_refresh" } }));
        }
      });

      window.addEventListener("online", () => {
        this.initSupabaseChannel();
        window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: "network_online" } }));
      });
    }
  }

  public setCompanyId(id: string) {
    if (id && id !== this.companyId) {
      this.companyId = id;
      this.initSupabaseChannel();
    }
  }

  private initSupabaseChannel() {
    if (typeof window === "undefined" || !isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    if (this.supabaseChannel) {
      try {
        client.removeChannel(this.supabaseChannel);
      } catch (e) {}
      this.supabaseChannel = null;
    }

    try {
      const channelName = `realtime_sync_${this.companyId || "global"}`;
      this.supabaseChannel = client
        .channel(channelName)
        .on("broadcast", { event: "*" }, (payload: any) => {
          if (payload && payload.event) {
            this.handleIncomingMessage({
              event: payload.event,
              data: payload.payload || payload.data || {},
              timestamp: payload.timestamp || Date.now()
            });
          }
        })
        .subscribe();
    } catch (e) {
      console.warn("[Supabase Realtime Channel Init Error]:", e);
    }
  }

  public handleIncomingMessage(parsed: any) {
    const evType = parsed.event || parsed.type || "sync";
    const data = parsed.data || {};
    const timestamp = parsed.timestamp || Date.now();

    // Deduplicate identical events received within 250ms
    const payloadSignature = `${evType}_${JSON.stringify(data)}`;
    if (this.lastProcessedPayload === payloadSignature && (Date.now() - this.lastProcessedTimestamp) < 250) {
      return;
    }
    this.lastProcessedPayload = payloadSignature;
    this.lastProcessedTimestamp = timestamp;

    // 1. Notify internal subscribers
    this.listeners.forEach((listener) => {
      try {
        listener(evType, data);
      } catch (e) {
        console.error("[Realtime Listener Error]:", e);
      }
    });

    // 2. Dispatch specific window custom events for components
    try {
      window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: evType, data, ...parsed } }));

      if (evType.includes("sale") || evType.includes("venda")) {
        window.dispatchEvent(new CustomEvent("sales_remote_sync", { detail: data }));
      }
      if (evType.includes("expense") || evType.includes("despesa")) {
        window.dispatchEvent(new CustomEvent("expenses_remote_sync", { detail: data }));
      }
      if (evType.includes("product") || evType.includes("produto")) {
        window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: data }));
      }
      if (evType.includes("cash_register") || evType.includes("caixa")) {
        window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: data }));
      }
      if (evType.includes("gastos_mensais") || evType.includes("bill")) {
        window.dispatchEvent(new CustomEvent("bills_remote_sync", { detail: data }));
      }
      if (evType.includes("client") || evType.includes("cliente")) {
        window.dispatchEvent(new CustomEvent("clients_remote_sync", { detail: data }));
      }
      if (evType.includes("goal") || evType.includes("meta")) {
        window.dispatchEvent(new CustomEvent("goals_remote_sync", { detail: data }));
      }
      if (evType.includes("quick_sale")) {
        window.dispatchEvent(new CustomEvent("quick_sales_remote_sync", { detail: data }));
      }
      if (evType.includes("company") || evType.includes("profile")) {
        window.dispatchEvent(new CustomEvent("company_remote_sync", { detail: data }));
      }
      if (evType.includes("backup")) {
        window.dispatchEvent(new CustomEvent("cloud_backups_updated", { detail: data }));
        window.dispatchEvent(new CustomEvent("backup_restored_sync", { detail: data }));
      }
    } catch (e) {}
  }

  public subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(event: string, data: any = {}, targetCompanyId?: string) {
    const payload = {
      companyId: targetCompanyId || this.companyId || "global",
      event,
      data,
      timestamp: Date.now()
    };

    // 1. Broadcast directly via Supabase Realtime client if available
    try {
      const client = getSupabase();
      if (client && this.supabaseChannel) {
        this.supabaseChannel.send({
          type: "broadcast",
          event,
          payload: data
        }).catch(() => {});
      }
    } catch (e) {}

    // 2. Local dispatch for instant UI responsiveness
    this.handleIncomingMessage(payload);
  }

  public isConnected(): boolean {
    return isSupabaseConfigured();
  }
}

export const realtimeManager = new RealtimeSyncManager();

export function broadcastRealtime(event: string, data: any = {}, companyId?: string) {
  realtimeManager.broadcast(event, data, companyId);
}

export function subscribeRealtime(listener: RealtimeListener): () => void {
  return realtimeManager.subscribe(listener);
}
