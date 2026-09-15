import { DeletionAuditRecord } from "../types";
import { getSupabase, isSupabaseConfigured } from "../supabase";

const LOCAL_STORAGE_KEY_PREFIX = "NUCLEO_DELETION_AUDIT_LOG_";

export function getLocalDeletionAuditRecords(ownerId: string): DeletionAuditRecord[] {
  try {
    const key = `${LOCAL_STORAGE_KEY_PREFIX}${ownerId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Check legacy generic key
      const fallback = localStorage.getItem("NUCLEO_DELETION_AUDIT_LOG");
      if (fallback) {
        return JSON.parse(fallback);
      }
      return [];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erro ao ler registros locais de exclusão:", err);
    return [];
  }
}

export function saveLocalDeletionAuditRecord(record: DeletionAuditRecord, ownerId: string): DeletionAuditRecord[] {
  try {
    const current = getLocalDeletionAuditRecords(ownerId);
    // Prepend new record so newest is first
    const updated = [record, ...current.filter(r => r.id !== record.id)];
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${ownerId}`, JSON.stringify(updated));
    localStorage.setItem("NUCLEO_DELETION_AUDIT_LOG", JSON.stringify(updated));

    // Dispatch event so any listening UI updates in real time
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("deletion-audit-updated", { detail: updated }));
    }

    // Background sync to Supabase
    if (isSupabaseConfigured() && ownerId) {
      syncDeletionAuditToSupabase(ownerId, updated).catch(err => {
        console.warn("Notice: Failed background sync of deletion audit to Supabase:", err);
      });
    }

    return updated;
  } catch (err) {
    console.error("Erro ao salvar registro de exclusão:", err);
    return [];
  }
}

export function clearLocalDeletionAuditRecords(ownerId: string): void {
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${ownerId}`);
    localStorage.removeItem("NUCLEO_DELETION_AUDIT_LOG");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("deletion-audit-updated", { detail: [] }));
    }
    if (isSupabaseConfigured() && ownerId) {
      syncDeletionAuditToSupabase(ownerId, []).catch(console.warn);
    }
  } catch (err) {
    console.error("Erro ao limpar registros de exclusão:", err);
  }
}

export async function syncDeletionAuditToSupabase(ownerId: string, records: DeletionAuditRecord[]): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !ownerId) return false;

  try {
    const rowId = `deletion_audit_log_${ownerId}`;
    const { error } = await supabase.from("sales").upsert({
      id: rowId,
      user_id: ownerId,
      client_name: "DELETION_AUDIT_LOG",
      client_phone: "AUDIT",
      items: records,
      date: new Date().toISOString()
    });

    if (error) {
      console.warn("Notice syncing deletion audit to Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Supabase deletion audit upsert notice:", err);
    return false;
  }
}

export async function fetchDeletionAuditFromSupabase(ownerId: string): Promise<DeletionAuditRecord[]> {
  const supabase = getSupabase();
  if (!supabase || !ownerId) return getLocalDeletionAuditRecords(ownerId);

  try {
    const rowId = `deletion_audit_log_${ownerId}`;
    const { data, error } = await supabase
      .from("sales")
      .select("items")
      .eq("id", rowId)
      .maybeSingle();

    if (error) {
      console.warn("Notice fetching deletion audit from Supabase:", error.message);
      return getLocalDeletionAuditRecords(ownerId);
    }

    if (data?.items && Array.isArray(data.items)) {
      const remoteRecords: DeletionAuditRecord[] = data.items;
      const localRecords = getLocalDeletionAuditRecords(ownerId);

      // Merge by unique ID
      const map = new Map<string, DeletionAuditRecord>();
      remoteRecords.forEach(r => map.set(r.id, r));
      localRecords.forEach(r => map.set(r.id, r));

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
      );

      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${ownerId}`, JSON.stringify(merged));
      localStorage.setItem("NUCLEO_DELETION_AUDIT_LOG", JSON.stringify(merged));
      return merged;
    }

    return getLocalDeletionAuditRecords(ownerId);
  } catch (err) {
    console.warn("Error fetching remote deletion audit:", err);
    return getLocalDeletionAuditRecords(ownerId);
  }
}
