/**
 * Real-Time Multi-Terminal Synchronization Engine
 * Connects via WebSocket (/ws/realtime) with automatic fallback to SSE (/api/realtime/stream).
 * Broadcasts and listens for sales, expenses, cash register, products, clients, bills, and goals across all open links.
 */

type RealtimeListener = (event: string, data: any) => void;

class RealtimeSyncManager {
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private listeners: Set<RealtimeListener> = new Set();
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isConnecting = false;
  private companyId = "global";

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
      // Handle tab visibility and focus changes (reconnect and trigger sync if wake from sleep)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.ensureConnected();
          window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: "visibility_refresh" } }));
        }
      });
      window.addEventListener("focus", () => {
        this.ensureConnected();
      });
      window.addEventListener("online", () => {
        this.ensureConnected();
        window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: "network_online" } }));
      });
    }
  }

  public setCompanyId(id: string) {
    if (id && id !== this.companyId) {
      this.companyId = id;
      this.reconnect();
    }
  }

  public init() {
    this.connectWebSocket();
    this.connectSSE();
  }

  private getWsUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/ws/realtime`;
  }

  private connectWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = this.getWsUrl();
      const socket = new WebSocket(url);
      (window as any).__syncSocket = socket;

      socket.onopen = () => {
        this.ws = socket;
        console.log("[Realtime WS] Conectado em tempo real via WebSocket!");
        // Envia mensagem inicial
        socket.send(JSON.stringify({ type: "register", companyId: this.companyId }));
        
        // Inicia heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      };

      socket.onmessage = (e) => {
        try {
          if (!e.data) return;
          const parsed = JSON.parse(e.data);
          if (parsed.type === "pong" || parsed.type === "connected") return;
          this.handleIncomingMessage(parsed);
        } catch (err) {
          console.warn("[Realtime WS Parse Error]:", err);
        }
      };

      socket.onerror = (e) => {
        // Fallback para SSE cuidará da conexão
      };

      socket.onclose = () => {
        this.ws = null;
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.scheduleReconnect();
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private connectSSE() {
    if (this.sse && this.sse.readyState !== EventSource.CLOSED) {
      return;
    }

    try {
      const sseUrl = `/api/realtime/stream?companyId=${encodeURIComponent(this.companyId)}`;
      const source = new EventSource(sseUrl);

      source.onopen = () => {
        this.sse = source;
      };

      source.onmessage = (event) => {
        try {
          if (!event.data || event.data.startsWith(":")) return;
          const parsed = JSON.parse(event.data);
          if (parsed.type === "connected") return;
          this.handleIncomingMessage(parsed);
        } catch (err) {}
      };

      source.onerror = () => {
        if (this.sse) {
          this.sse.close();
          this.sse = null;
        }
        setTimeout(() => this.connectSSE(), 4000);
      };
    } catch (e) {}
  }

  private lastProcessedTimestamp = 0;
  private lastProcessedPayload = "";

  private handleIncomingMessage(parsed: any) {
    const evType = parsed.event || parsed.type;
    const data = parsed.data || {};
    const timestamp = parsed.timestamp || Date.now();

    // Deduplicate identical events received simultaneously via WS and SSE within 200ms
    const payloadSignature = `${evType}_${JSON.stringify(data)}`;
    if (this.lastProcessedPayload === payloadSignature && (Date.now() - this.lastProcessedTimestamp) < 250) {
      return;
    }
    this.lastProcessedPayload = payloadSignature;
    this.lastProcessedTimestamp = Date.now();

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

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 2500);
  }

  public ensureConnected() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }
    if (!this.sse || this.sse.readyState === EventSource.CLOSED) {
      this.connectSSE();
    }
  }

  public reconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.sse) {
      try { this.sse.close(); } catch (e) {}
      this.sse = null;
    }
    this.init();
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

    // 1. Try sending over WebSocket (instant < 10ms)
    let wsSent = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        wsSent = true;
      } catch (e) {}
    }

    // 2. Always POST to /api/realtime/notify to guarantee server persistence and broadcast to SSE listeners
    fetch("/api/realtime/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});

    // 3. Local dispatch for same-tab responsiveness
    try {
      window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: payload }));
    } catch (e) {}
  }

  public isConnected(): boolean {
    return (this.ws !== null && this.ws.readyState === WebSocket.OPEN) ||
           (this.sse !== null && this.sse.readyState === EventSource.OPEN);
  }
}

export const realtimeManager = new RealtimeSyncManager();

export function broadcastRealtime(event: string, data: any = {}, companyId?: string) {
  realtimeManager.broadcast(event, data, companyId);
}

export function subscribeRealtime(listener: RealtimeListener): () => void {
  return realtimeManager.subscribe(listener);
}
