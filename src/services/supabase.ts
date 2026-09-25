import { getSupabase, isSupabaseConfigured } from "../supabase";

// Export the singleton or initialized client instance
export const supabase = getSupabase();
export { getSupabase, isSupabaseConfigured };
export default supabase;
