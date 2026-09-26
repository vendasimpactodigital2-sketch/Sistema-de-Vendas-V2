import { getSupabase, isSupabaseConfigured } from "../supabase";

// Export the client instance lazily via proxy to prevent uninitialized access
export const supabase: any = new Proxy({} as any, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) return undefined;
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  }
});

export { getSupabase, isSupabaseConfigured };
export default supabase;

