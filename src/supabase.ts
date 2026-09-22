import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { User, CompanyProfile, Sale, Expense, CashRegisterState, CashRegisterSession, SupportFeedback, SupportConfig, CatalogProduct } from "./types";

// Prioritize VITE_ prefix (standard for Vite) as well as NEXT_PUBLIC_ (common in Vercel migrations)
// and window.__ENV__ or process.env if injected by build systems.
const getEnvVar = (viteKey: string, nextKey: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env) {
      // @ts-ignore
      if (import.meta.env[viteKey]) return import.meta.env[viteKey];
      // @ts-ignore
      if (import.meta.env[nextKey]) return import.meta.env[nextKey];
    }
  } catch (e) {}

  try {
    // @ts-ignore
    if (typeof window !== "undefined" && (window as any).__ENV__) {
      // @ts-ignore
      if ((window as any).__ENV__[viteKey]) return (window as any).__ENV__[viteKey];
      // @ts-ignore
      if ((window as any).__ENV__[nextKey]) return (window as any).__ENV__[nextKey];
    }
  } catch (e) {}

  try {
    // @ts-ignore
    if (typeof process !== "undefined" && process.env) {
      // @ts-ignore
      if (process.env[viteKey]) return process.env[viteKey];
      // @ts-ignore
      if (process.env[nextKey]) return process.env[nextKey];
    }
  } catch (e) {}

  return "";
};

const supabaseUrl = getEnvVar("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getEnvVar("VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");

let clientInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  if (!clientInstance) {
    try {
      clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          storage: window.localStorage,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (err) {
      console.error("Erro crítico ao inicializar o cliente do Supabase:", err);
      clientInstance = null;
    }
  }
  return clientInstance;
}

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

export function normalizeUserString(str: string): string {
  return (str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/^@/, ""); // Remove leading @
}

export function getAdminDomain(email?: string, username?: string): string {
  if (email && email.includes("@")) {
    const domain = email.split("@")[1].toLowerCase().trim();
    const publicDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "bol.com.br", "uol.com.br", "live.com"];
    if (publicDomains.includes(domain)) {
      const localPart = email.split("@")[0].toLowerCase().trim().replace(/[^a-z0-9]/g, "");
      return `${localPart}.${domain}`;
    }
    return domain;
  }
  const fallbackUser = (username || "grafica").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return `${fallbackUser}.com`;
}

// ==========================================
// SUPABASE AUTHENTICATION INTEGRATION HELPERS
// ==========================================

export async function dbSignIn(usernameOrEmail: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { user: null, error: "Conexão com Supabase não configurada." };
  }

  try {
    const trimmed = usernameOrEmail.trim();
    
    // Clean up any leading '@' if entered by the user
    const cleanUsername = trimmed.startsWith("@") ? trimmed.substring(1) : trimmed;
    
    // Check if what is left is a genuine email address. If not, auto-generate fallback email format.
    const email = cleanUsername.includes("@") ? cleanUsername : `${cleanUsername.toLowerCase()}@grafica.com`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Fallback search to see if they are a registered attendant who exists in `users` table without separate OAuth / Auth accounts.
      try {
        const { data: dbMatchedUsers, error: dbQueryError } = await supabase
          .from("users")
          .select("*");

        if (!dbQueryError && dbMatchedUsers && dbMatchedUsers.length > 0) {
          const matchedDbUser = dbMatchedUsers.find((u: any) => {
            const userLogin = normalizeUserString(u.username || u.usuario || "");
            const userEmail = normalizeUserString(u.email || "");
            const targetLogin = normalizeUserString(trimmed);
            
            const matchesUsername = userLogin === targetLogin || userEmail === targetLogin;
            
            const storedPass = u.password || u.senha || "";
            const [mainPass] = storedPass.split("::");
            const matchesPassword = mainPass === password || storedPass === password || u.senha === password;

            return matchesUsername && matchesPassword;
          });

          if (matchedDbUser) {
            const matchedUser: User = {
              id: matchedDbUser.id,
              name: matchedDbUser.name || matchedDbUser.nome || "",
              username: matchedDbUser.username || matchedDbUser.usuario || "",
              email: matchedDbUser.email || "",
              password: matchedDbUser.password || matchedDbUser.senha || "",
              owner_id: matchedDbUser.owner_id || null
            };
            return { user: matchedUser, error: null };
          }
        }
      } catch (dbErr) {
        console.warn("Database-only login fallback exception:", dbErr);
      }

      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "Usuário não retornado pelo servidor." };
    }

    const name = data.user.user_metadata?.name || data.user.user_metadata?.fullName || email.split("@")[0];
    const username = data.user.user_metadata?.username || email.split("@")[0];

    // Check if user already exists in public table to preserve role metadata and avoid duplication
    let realOwnerId = data.user.id;
    let existingRole = "";
    let existingStatus = "trial";
    let existingCreatedAt = new Date().toISOString();
    let existingIsAdmin = false;
    try {
      let dbUser: any = null;
      const { data: exactUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      if (exactUser) {
        dbUser = exactUser;
      } else if (data.user.email) {
        const { data: emailUser } = await supabase
          .from("users")
          .select("*")
          .eq("email", data.user.email)
          .maybeSingle();
        if (emailUser) {
          dbUser = emailUser;
          // Update id on matching email record to avoid duplicate rows
          try {
            await supabase.from("users").update({ id: data.user.id }).eq("email", data.user.email);
          } catch (e) {}
        }
      }

      if (dbUser) {
        if (dbUser.owner_id && dbUser.owner_id !== data.user.id && (dbUser.role === "atendente" || dbUser.role === "vendedor")) {
          realOwnerId = dbUser.owner_id;
        } else {
          realOwnerId = data.user.id;
        }
        existingRole = dbUser.role || dbUser.cargo || dbUser.tipo || "";
        existingStatus = dbUser.status_assinatura || "trial";
        if (dbUser.created_at) {
          existingCreatedAt = dbUser.created_at;
        }
        existingIsAdmin = !!dbUser.is_admin || dbUser.role === "admin" || dbUser.role === "administrador" || dbUser.cargo === "administrador" || !dbUser.owner_id || dbUser.owner_id === dbUser.id || data.user.email === "vendas.impactodigital2@gmail.com" || data.user.email === "sistemavendaadm@gmail.com" || data.user.email === "sistemadevendaadm@gmail.com";
      }
    } catch (err) {
      console.warn("Could not query existing user record in users table:", err);
    }

    // Guarantee custom public.users table contains a matching record to satisfy references
    const matchedUser: User = {
      id: data.user.id,
      name,
      username,
      email: data.user.email,
      password: "",
      owner_id: realOwnerId,
      role: existingRole,
      status_assinatura: existingStatus,
      created_at: existingCreatedAt,
      is_admin: existingIsAdmin
    };

    const signupSynced = await dbSaveUser(matchedUser, realOwnerId);
    if (!signupSynced) {
      console.warn("Could not sync user metadata into public.users database table");
    }

    return { user: matchedUser, error: null };
  } catch (err: any) {
    console.error("Login Exception in Supabase Auth:", err);
    return { user: null, error: err.message || "Erro inesperado ao realizar login." };
  }
}

export async function dbSignUp(fullName: string, username: string, emailOptional: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { user: null, error: "Conexão com Supabase não configurada." };
  }

  try {
    const trimmedUser = username.trim().toLowerCase();
    const cleanUser = trimmedUser.startsWith("@") ? trimmedUser.substring(1) : trimmedUser;
    const finalEmail = emailOptional.trim() ? emailOptional.trim() : `${cleanUser}@grafica.com`;

    const { data, error } = await supabase.auth.signUp({
      email: finalEmail,
      password,
      options: {
        data: {
          name: fullName.trim(),
          username: cleanUser
        }
      }
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "Não foi possível registrar o usuário no sistema." };
    }

    const registeredUser: User = {
      id: data.user.id,
      name: fullName.trim(),
      username: cleanUser,
      email: finalEmail,
      password: "",
      owner_id: data.user.id,
      status_assinatura: "trial",
      created_at: new Date().toISOString()
    };

    const signupSynced = await dbSaveUser(registeredUser, data.user.id);
    if (!signupSynced) {
      console.warn("Could not sync signed-up user metadata in public.users database table");
    }

    return { user: registeredUser, error: null };
  } catch (err: any) {
    console.error("Registration Exception in Supabase Auth:", err);
    return { user: null, error: err.message || "Erro inesperado ao criar registro." };
  }
}

export async function dbSignOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function dbVerifyUserSession(userId: string): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return null;

    console.log("[dbVerifyUserSession] SUPABASE FETCH SUCCESSFUL. User:", data.email, "Raw columns:", JSON.stringify(data));

    const isAdmin = !!data.is_admin || data.role === "admin" || data.role === "administrador" || data.cargo === "administrador" || !data.owner_id || data.owner_id === data.id || data.email === "vendas.impactodigital2@gmail.com" || data.email === "sistemavendaadm@gmail.com" || data.email === "sistemadevendaadm@gmail.com";
    const statusVal = (data.status || data.status_assinatura || "trial").toString().trim();

    const mappedUser: User = {
      id: data.id,
      name: data.name || data.nome || "",
      username: data.username || data.usuario || "",
      email: data.email || "",
      password: data.password || data.senha || "",
      owner_id: data.owner_id || null,
      created_at: data.created_at || null,
      status_assinatura: statusVal,
      status: statusVal,
      is_admin: isAdmin,
      role: data.role || data.cargo || data.tipo || ""
    };

    console.log("[dbVerifyUserSession] Mapped User Object:", JSON.stringify(mappedUser));
    return mappedUser;
  } catch (err) {
    console.error("Error verifying database user session:", err);
    return null;
  }
}

export async function dbLoadSessionUser(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // 1. Prioritize supabase.auth.getUser() to get fresh authoritative authenticated user directly
    let u: any = null;
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!userError && userData?.user) {
        u = userData.user;
      }
    } catch (e) {}

    // Fallback to getSession if getUser didn't return
    if (!u) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Supabase session error, clearing stale auth data:", error.message);
        try {
          const keys = Object.keys(localStorage);
          for (const key of keys) {
            if (key.startsWith("sb-")) {
              localStorage.removeItem(key);
            }
          }
          await supabase.auth.signOut().catch(() => {});
        } catch (cleanErr) {
          console.error("Failed to clean up storage keys:", cleanErr);
        }
        return null;
      }
      u = data?.session?.user || null;
    }

    if (u) {
      const name = u.user_metadata?.name || u.user_metadata?.fullName || u.email?.split("@")[0] || "Usuário";
      const username = u.user_metadata?.username || u.email?.split("@")[0] || "usuario";

      // By default, the owner_id MUST BE the Auth UID to guarantee multi-terminal parity
      let realOwnerId = u.id;
      let createdAt = u.created_at;
      let statusAssinatura = "trial";
      let isAdmin = false;
      let userRole = "";
      try {
        let dbUser: any = null;
        const { data: exactUser } = await supabase
          .from("users")
          .select("*")
          .eq("id", u.id)
          .maybeSingle();

        if (exactUser) {
          dbUser = exactUser;
        } else if (u.email) {
          const { data: emailUser } = await supabase
            .from("users")
            .select("*")
            .eq("email", u.email)
            .maybeSingle();
          if (emailUser) {
            dbUser = emailUser;
            // Unify id with Auth UID to prevent duplicate user rows
            try {
              await supabase.from("users").update({ id: u.id }).eq("email", u.email);
            } catch (e) {}
          }
        }

        if (dbUser) {
          console.log("[dbLoadSessionUser] SUPABASE FETCH SUCCESSFUL. User ID:", u.id);
          if (dbUser.owner_id && dbUser.owner_id !== u.id && (dbUser.role === "atendente" || dbUser.role === "vendedor")) {
            realOwnerId = dbUser.owner_id;
          } else {
            realOwnerId = u.id;
          }
          if (dbUser.created_at) {
            createdAt = dbUser.created_at;
          }
          if (dbUser.status_assinatura || dbUser.status) {
            statusAssinatura = (dbUser.status || dbUser.status_assinatura).toString().trim();
          }
          isAdmin = !!dbUser.is_admin || dbUser.role === "admin" || dbUser.role === "administrador" || dbUser.cargo === "administrador" || !dbUser.owner_id || dbUser.owner_id === dbUser.id || u.email === "vendas.impactodigital2@gmail.com" || u.email === "sistemavendaadm@gmail.com" || u.email === "sistemadevendaadm@gmail.com";
          userRole = dbUser.role || dbUser.cargo || dbUser.tipo || "";
        } else {
          // Record doesn't exist yet in public.users, create it with u.id to prevent duplication
          try {
            await supabase.from("users").upsert({
              id: u.id,
              name,
              username,
              email: u.email,
              owner_id: u.id,
              status_assinatura: "trial",
              created_at: createdAt || new Date().toISOString()
            });
          } catch (upsertErr) {
            console.warn("Notice: could not insert user record into public.users:", upsertErr);
          }
        }
      } catch (err) {
        console.warn("Could not query existing user record in users table during session load:", err);
      }

      const mappedUser: User = {
        id: u.id,
        name,
        username,
        email: u.email,
        owner_id: realOwnerId,
        created_at: createdAt,
        status_assinatura: statusAssinatura,
        status: statusAssinatura,
        is_admin: isAdmin,
        role: userRole
      };

      console.log("[dbLoadSessionUser] Mapped User Object with Auth ID:", JSON.stringify(mappedUser));
      return mappedUser;
    }
  } catch (e: any) {
    console.error("Error retrieving Supabase user session:", e);
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith("sb-")) {
          localStorage.removeItem(key);
        }
      }
      await supabase.auth.signOut().catch(() => {});
    } catch {}
  }
  return null;
}

// ==========================================
// USER DATABASE SYNCHRONIZATION HELPERS
// ==========================================

export async function dbUpdateSubscriptionStatus(userId: string, status: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("users")
      .update({ status_assinatura: status })
      .eq("id", userId);
    if (error) {
      console.warn("Could not update status_assinatura, error:", error.message);
    }
    return true;
  } catch (err) {
    console.error("Error updating subscription status:", err);
    return false;
  }
}

export async function dbUpdateUserAdminActions(userId: string, updates: { status_assinatura?: string; created_at?: string }): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId);
    if (error) {
      console.error("Error updating user admin actions:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exception updating user admin actions:", err);
    return false;
  }
}

export async function dbGetUsers(loggedInUserId?: string): Promise<User[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  try {
    if (loggedInUserId) {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .or(`owner_id.eq.${loggedInUserId},id.eq.${loggedInUserId}`);
        
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            name: d.name || d.nome || "",
            username: d.username || d.usuario || "",
            email: d.email || "",
            password: d.password || d.senha || "",
            owner_id: d.owner_id || null,
            role: d.role || d.cargo || d.tipo || "",
            created_at: d.created_at || null,
            data_expiracao: d.data_expiracao || d.trial_end || null,
            status_assinatura: d.status_assinatura || "trial",
            is_admin: d.is_admin ?? (d.role === "admin" || d.role === "administrador" || !d.owner_id || d.owner_id === d.id || d.email === "vendas.impactodigital2@gmail.com" || d.email === "sistemavendaadm@gmail.com" || d.email === "sistemadevendaadm@gmail.com")
          }));
        } else {
          console.warn("Querying users with owner_id filter failed, trying simple select * schema fallback:", error);
        }
      } catch (err) {
        console.warn("Exception with owner_id query filter, falling back to simple select *:", err);
      }
    }
    
    const { data, error } = await supabase.from("users").select("*");
    
    if (error) {
      console.error("Error fetching users from Supabase:", error);
      return null;
    }
    
    if (!data) return [];
 
    return data.map((d: any) => ({
      id: d.id,
      name: d.name || d.nome || "",
      username: d.username || d.usuario || "",
      email: d.email || "",
      password: d.password || d.senha || "",
      owner_id: d.owner_id || null,
      role: d.role || d.cargo || d.tipo || "",
      created_at: d.created_at || null,
      data_expiracao: d.data_expiracao || d.trial_end || null,
      status_assinatura: d.status_assinatura || "trial",
      is_admin: d.is_admin ?? (d.role === "admin" || d.role === "administrador" || !d.owner_id || d.owner_id === d.id || d.email === "vendas.impactodigital2@gmail.com" || d.email === "sistemavendaadm@gmail.com" || d.email === "sistemadevendaadm@gmail.com")
    }));
  } catch (err) {
    console.error("Supabase user query exception:", err);
    return null;
  }
}

export async function dbSaveUser(user: User, ownerId?: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  // Ensure 'id' is a valid UUID to avoid PostgreSQL 22P02 database error (invalid input syntax for type uuid)
  let cleanId = user.id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cleanId)) {
    // If it's not a valid UUID (e.g. starts with "usr_"), generate a valid UUID v4
    cleanId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    // Update user object reference
    user.id = cleanId;
  }

  const finalOwnerId = user.owner_id || ownerId || null;
  const finalStatusAssinatura = user.status_assinatura || "trial";
  const finalCreatedAt = user.created_at || new Date().toISOString();

  // Attempt 1a: English columns with owner_id and role
  try {
    const { error } = await supabase
      .from("users")
      .upsert({
        id: cleanId,
        name: user.name,
        username: user.username,
        email: user.email || null,
        password: user.password || "",
        owner_id: finalOwnerId,
        role: user.role || null,
        status_assinatura: finalStatusAssinatura,
        created_at: finalCreatedAt
      });

    if (!error) {
      console.log("User saved successfully in 'users' table (EN format with owner_id and role)");
      return true;
    }
    console.warn("Payload EN (with owner_id and role) failed for 'users' table:", error.message);
  } catch (err: any) {
    console.warn("Exception in Attack 1a:", err.message);
  }

  // Attempt 1b: English columns with owner_id (WITHOUT role)
  const enPayload = {
    id: cleanId,
    name: user.name,
    username: user.username,
    email: user.email || null,
    password: user.password || "",
    owner_id: finalOwnerId,
    status_assinatura: finalStatusAssinatura,
    created_at: finalCreatedAt
  };

  try {
    const { error } = await supabase
      .from("users")
      .upsert(enPayload);

    if (!error) {
      console.log("User saved successfully in 'users' table (EN format with owner_id)");
      return true;
    }
    console.warn("Payload EN (with owner_id) failed for 'users' table, trying EN fallback without owner_id:", error.message);
  } catch (err) {
    console.warn("Exception with EN payload for 'users' table:", err);
  }

  // Attempt 2a: English columns WITHOUT owner_id but WITH role
  try {
    const { error } = await supabase
      .from("users")
      .upsert({
        id: cleanId,
        name: user.name,
        username: user.username,
        email: user.email || null,
        password: user.password || "",
        role: user.role || null,
        status_assinatura: finalStatusAssinatura,
        created_at: finalCreatedAt
      });

    if (!error) {
      console.log("User saved successfully in 'users' table (EN format without owner_id with role)");
      return true;
    }
    console.warn("enPayloadNoOwnerWithRole failed for 'users' table:", error.message);
  } catch (err) {
    console.warn("Exception in Attempt 2a:", err);
  }

  // Attempt 2b: English columns WITHOUT owner_id
  const enPayloadNoOwner = {
    id: cleanId,
    name: user.name,
    username: user.username,
    email: user.email || null,
    password: user.password || "",
    status_assinatura: finalStatusAssinatura,
    created_at: finalCreatedAt
  };

  try {
    const { error } = await supabase
      .from("users")
      .upsert(enPayloadNoOwner);

    if (!error) {
      console.log("User saved successfully in 'users' table (EN format without owner_id)");
      return true;
    }
    console.warn("enPayloadNoOwner failed for 'users' table, trying PT format with owner_id:", error.message);
  } catch (err) {
    console.warn("Exception with enPayloadNoOwner for 'users' table:", err);
  }

  // Attempt 3a: Portuguese columns with owner_id and cargo/tipo
  try {
    const { error } = await supabase
      .from("users")
      .upsert({
        id: cleanId,
        nome: user.name,
        usuario: user.username,
        email: user.email || null,
        senha: user.password || "",
        owner_id: finalOwnerId,
        cargo: user.role || null,
        tipo: user.role || null,
        status_assinatura: finalStatusAssinatura,
        created_at: finalCreatedAt
      });

    if (!error) {
      console.log("User saved successfully in 'users' table (PT format with owner_id and cargo/tipo)");
      return true;
    }
    console.warn("ptPayloadWithRole failed for 'users' table:", error.message);
  } catch (err) {
    console.warn("Exception in Attempt 3a:", err);
  }

  // Attempt 3b: Portuguese columns with owner_id
  const ptPayload = {
    id: cleanId,
    nome: user.name,
    usuario: user.username,
    email: user.email || null,
    senha: user.password || "",
    owner_id: finalOwnerId,
    status_assinatura: finalStatusAssinatura,
    created_at: finalCreatedAt
  };

  try {
    const { error } = await supabase
      .from("users")
      .upsert(ptPayload);

    if (!error) {
      console.log("User saved successfully in 'users' table (PT format with owner_id)");
      return true;
    }
    console.warn("Payload PT (with owner_id) failed for 'users' table, trying PT fallback without owner_id:", error.message);
  } catch (err) {
    console.error("Exception with PT payload for 'users' table:", err);
  }

  // Attempt 4a: Portuguese columns WITHOUT owner_id but WITH cargo/tipo
  try {
    const { error } = await supabase
      .from("users")
      .upsert({
        id: cleanId,
        nome: user.name,
        usuario: user.username,
        email: user.email || null,
        senha: user.password || "",
        cargo: user.role || null,
        tipo: user.role || null,
        status_assinatura: finalStatusAssinatura,
        created_at: finalCreatedAt
      });

    if (!error) {
      console.log("User saved successfully in 'users' table (PT format without owner_id and cargo/tipo)");
      return true;
    }
    console.warn("ptPayloadNoOwnerWithRole failed for 'users' table:", error.message);
  } catch (err) {
    console.warn("Exception in Attempt 4a:", err);
  }

  // Attempt 4b: Portuguese columns WITHOUT owner_id
  const ptPayloadNoOwner = {
    id: cleanId,
    nome: user.name,
    usuario: user.username,
    email: user.email || null,
    senha: user.password || "",
    status_assinatura: finalStatusAssinatura,
    created_at: finalCreatedAt
  };

  try {
    const { error } = await supabase
      .from("users")
      .upsert(ptPayloadNoOwner);

    if (!error) {
      console.log("User saved successfully in 'users' table (PT format without owner_id)");
      return true;
    }
    console.error("ptPayloadNoOwner failed for 'users' table:", error.message);
  } catch (err) {
    console.error("Exception with ptPayloadNoOwner for 'users' table:", err);
  }

  return false;
}

export async function dbDeleteUser(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    // 1. Attempt to invoke a secure database function (RPC) that deletes from both public.users and auth.users.
    // PostgreSQL SECURITY DEFINER functions bypass normal user bounds, allowing the action safely.
    const { data, error: rpcError } = await supabase.rpc("delete_user_by_id", {
      user_id_to_delete: userId
    });

    if (!rpcError) {
      console.log("Successfully deleted user from auth.users and public.users via RPC.");
      return true;
    }
    console.warn("RPC delete_user_by_id failed or not created, using standard public.users deletion:", rpcError);
  } catch (rpcExc) {
    console.warn("Exception during RPC delete_user_by_id invocation:", rpcExc);
  }

  // Fallback: Delete from public.users table directly so that the local system state stays clean
  try {
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) {
      console.error("Error deleting user from public.users table:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase delete user exception:", err);
    return false;
  }
}

// ==========================================
// COMPANY PROFILE DATABASE SYNCHRONIZATION
// ==========================================

export async function dbGetCompanyProfile(userId: string): Promise<CompanyProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching company profile from Supabase:", error);
      return null;
    }

    if (!data) return null;

    return {
      tradingName: data.trading_name,
      phone: data.phone || "",
      cep: data.cep || "",
      address: data.address || "",
      number: data.number || "",
      neighborhood: data.neighborhood || "",
      city: data.city || "",
      state: data.state || "",
      cnpjCpf: data.cnpj_cpf || "",
      logo: data.logo || null,
      pixKey: data.pix_key || data.pixKey || "",
      businessHours: data.business_hours || data.businessHours || undefined,
      cashClosingReminderEnabled: data.cash_closing_reminder_enabled ?? data.cashClosingReminderEnabled ?? (data.business_hours as any)?.cashClosingReminderEnabled,
      cashClosingReminderTime: data.cash_closing_reminder_time || data.cashClosingReminderTime || (data.business_hours as any)?.cashClosingReminderTime || undefined,
      cashClosingReminderMessage: data.cash_closing_reminder_message || data.cashClosingReminderMessage || (data.business_hours as any)?.cashClosingReminderMessage || undefined,
    };
  } catch (err) {
    console.error("Supabase company query exception:", err);
    return null;
  }
}

export async function dbSaveCompanyProfile(userId: string, profile: CompanyProfile): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("company_profile")
      .upsert({
        user_id: userId,
        trading_name: profile.tradingName,
        phone: profile.phone,
        cep: profile.cep,
        address: profile.address,
        number: profile.number,
        neighborhood: profile.neighborhood,
        city: profile.city,
        state: profile.state,
        cnpj_cpf: profile.cnpjCpf,
        logo: profile.logo,
        pix_key: profile.pixKey || null,
        business_hours: profile.businessHours || null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.warn("Error upserting company profile with business_hours column, trying fallback without business_hours:", error);
      const { error: fallbackError } = await supabase
        .from("company_profile")
        .upsert({
          user_id: userId,
          trading_name: profile.tradingName,
          phone: profile.phone,
          cep: profile.cep,
          address: profile.address,
          number: profile.number,
          neighborhood: profile.neighborhood,
          city: profile.city,
          state: profile.state,
          cnpj_cpf: profile.cnpjCpf,
          logo: profile.logo,
          pix_key: profile.pixKey || null,
          updated_at: new Date().toISOString()
        });

      if (fallbackError) {
        console.warn("Error upserting with pix_key column, trying fallback without pix_key:", fallbackError);
        const { error: secondFallbackError } = await supabase
          .from("company_profile")
          .upsert({
            user_id: userId,
            trading_name: profile.tradingName,
            phone: profile.phone,
            cep: profile.cep,
            address: profile.address,
            number: profile.number,
            neighborhood: profile.neighborhood,
            city: profile.city,
            state: profile.state,
            cnpj_cpf: profile.cnpjCpf,
            logo: profile.logo,
            updated_at: new Date().toISOString()
          });

        if (secondFallbackError) {
          console.error("Second fallback company profile upsert failed too:", secondFallbackError);
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    console.error("Supabase upsert company exception:", err);
    return false;
  }
}

// ==========================================
// SALES & BUDGETS DATABASE SYNCHRONIZATION
// ==========================================

export async function dbGetSales(userId: string): Promise<Sale[] | null> {
  // 1. Primary: fetch through secure server API with service_role to avoid RLS 42501
  try {
    const res = await fetch(`/api/sales?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/sales GET error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // Collect all related user IDs for this company (the owner and all attendants)
    const userIds = [userId];
    try {
      const { data: usersData } = await supabase
        .from("users")
        .select("id")
        .or(`id.eq.${userId},owner_id.eq.${userId}`);
      if (usersData && usersData.length > 0) {
        usersData.forEach((u: any) => {
          if (u.id && !userIds.includes(u.id)) {
            userIds.push(u.id);
          }
        });
      }
    } catch (uErr) {
      // Ignore user list fallback error
    }

    // Check auth user id as well
    if (supabase.auth) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id && !userIds.includes(authData.user.id)) {
          userIds.push(authData.user.id);
        }
      } catch (aErr) {
        // Ignore auth check error
      }
    }

    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .in("user_id", userIds);

    if (error) {
      console.error("Error fetching sales from Supabase:", error);
      return null;
    }

    if (!data) return [];

    const filteredData = data.filter((d: any) => d.id !== "quick_sales_config" && !d.id.startsWith("cash_register_state") && !d.id.startsWith("deletion_audit_log"));

    return filteredData.map((d) => {
      let realPhone = d.client_phone || "";
      let orderDate = "";
      let deliveryDate = "";
      let deliveryReason = "";
      let payments: any[] = [];
      let materialEntregue = false;
      let sellerId = "";
      let sellerName = "";
      let sellerRole: "atendente" | "administrador" | undefined = undefined;
      let deliveredBy = "";
      let deliveredAt = "";
      let deliveredRole: "atendente" | "administrador" | undefined = undefined;
      let auditLog: any[] = [];

      let deliveryAddress = "";
      let metaObj: any = null;

      if (realPhone.includes("::")) {
        const parts = realPhone.split("::");
        realPhone = parts[0];
        try {
          metaObj = JSON.parse(parts[1]);
          orderDate = metaObj.orderDate || "";
          deliveryDate = metaObj.deliveryDate || "";
          deliveryReason = metaObj.deliveryReason || "";
          deliveryAddress = metaObj.deliveryAddress || "";
          payments = metaObj.payments || [];
          materialEntregue = !!metaObj.materialEntregue;
          sellerId = metaObj.sellerId || "";
          sellerName = metaObj.sellerName || "";
          sellerRole = metaObj.sellerRole || undefined;
          deliveredBy = metaObj.deliveredBy || "";
          deliveredAt = metaObj.deliveredAt || "";
          deliveredRole = metaObj.deliveredRole || undefined;
          auditLog = metaObj.auditLog || [];
        } catch (e) {}
      }
      return {
        id: d.id,
        clientName: d.client_name,
        clientPhone: realPhone,
        items: d.items || [],
        useMotoboy: d.use_motoboy !== undefined ? d.use_motoboy : (metaObj?.useMotoboy || false),
        motoboyCost: Number(d.motoboy_cost !== undefined ? d.motoboy_cost : (metaObj?.motoboyCost || 0)),
        deliveryAddress: deliveryAddress || d.delivery_address || undefined,
        discount: Number(d.discount),
        downPayment: Number(d.down_payment),
        operationCost: Number(d.operation_cost),
        costItems: d.cost_items || [],
        totalValue: Number(d.total_value),
        balance_due: d.balance_due, // Handle balanceDue column mapping correctly
        balanceDue: Number(d.balance_due),
        netProfit: d.net_profit ? Number(d.net_profit) : Number(d.total_value) - Number(d.operation_cost),
        clientImage: d.client_image || null,
        date: d.date,
        isBudget: d.is_budget,
        paymentMethod: d.payment_method || d.paymentMethod || 'dinheiro',
        orderDate: orderDate || undefined,
        deliveryDate: deliveryDate || undefined,
        deliveryReason: deliveryReason || undefined,
        payments: payments,
        materialEntregue: materialEntregue,
        sellerId: sellerId || undefined,
        sellerName: sellerName || undefined,
        sellerRole: sellerRole,
        deliveredBy: deliveredBy || undefined,
        deliveredAt: deliveredAt || undefined,
        deliveredRole: deliveredRole,
        auditLog: auditLog
      };
    });
  } catch (err) {
    console.error("Supabase query sales exception:", err);
    return null;
  }
}

export async function dbSaveSale(userId: string, sale: Sale): Promise<boolean> {
  // 1. Primary: save through secure server API with service_role to avoid RLS 42501
  try {
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sale })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        notifyRealtimeSync(userId, "sales_updated", { saleId: sale.id });
        notifyRealtimeSync("global", "sales_updated", { saleId: sale.id });
        return true;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/sales POST error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return false;

  const metaStr = JSON.stringify({ 
    orderDate: sale.orderDate, 
    deliveryDate: sale.deliveryDate,
    deliveryReason: sale.deliveryReason || "",
    deliveryAddress: sale.deliveryAddress || "",
    motoboyCost: Number(sale.motoboyCost) || 0,
    useMotoboy: !!sale.useMotoboy,
    payments: sale.payments || [],
    materialEntregue: !!sale.materialEntregue,
    sellerId: sale.sellerId || "",
    sellerName: sale.sellerName || "",
    sellerRole: sale.sellerRole || "",
    deliveredBy: sale.deliveredBy || "",
    deliveredAt: sale.deliveredAt || "",
    deliveredRole: sale.deliveredRole || "",
    auditLog: sale.auditLog || []
  });
  const clientPhoneWithMeta = `${sale.clientPhone || ""}::${metaStr}`;

  try {
    const { error } = await supabase
      .from("sales")
      .upsert({
        id: sale.id,
        user_id: userId,
        client_name: sale.clientName,
        client_phone: clientPhoneWithMeta,
        items: sale.items,
        use_motoboy: sale.useMotoboy,
        motoboy_cost: sale.motoboyCost,
        discount: sale.discount,
        down_payment: sale.downPayment,
        operation_cost: sale.operationCost,
        cost_items: sale.costItems || [],
        total_value: sale.totalValue,
        balance_due: sale.balanceDue,
        net_profit: sale.netProfit,
        client_image: sale.clientImage,
        date: sale.date,
        is_budget: !!sale.isBudget,
        payment_method: sale.paymentMethod || 'dinheiro'
      });

    if (error) {
      console.warn("Error upserting sale with payment_method column, trying fallback:", error);
      const { error: fallbackError } = await supabase
        .from("sales")
        .upsert({
          id: sale.id,
          user_id: userId,
          client_name: sale.clientName,
          client_phone: clientPhoneWithMeta,
          items: sale.items,
          use_motoboy: sale.useMotoboy,
          motoboy_cost: sale.motoboyCost,
          discount: sale.discount,
          down_payment: sale.downPayment,
          operation_cost: sale.operationCost,
          cost_items: sale.costItems || [],
          total_value: sale.totalValue,
          balance_due: sale.balanceDue,
          net_profit: sale.netProfit,
          client_image: sale.clientImage,
          date: sale.date,
          is_budget: !!sale.isBudget
        });

      if (fallbackError) {
        console.warn("Direct client sales fallback notice (offline or RLS enforced):", fallbackError.message);
        return false;
      }
    }
    notifyRealtimeSync(userId, "sales_updated", { saleId: sale.id });
    notifyRealtimeSync("global", "sales_updated", { saleId: sale.id });
    return true;
  } catch (err) {
    console.error("Supabase upsert sale exception:", err);
    return false;
  }
}

export async function dbDeleteSale(saleId: string): Promise<boolean> {
  // 1. Primary: delete through secure server API
  try {
    const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        notifyRealtimeSync("global", "sales_updated", { deletedId: saleId });
        return true;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/sales DELETE error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("sales")
      .delete()
      .eq("id", saleId);

    if (error) {
      console.error("Error deleting sale:", error);
      return false;
    }
    notifyRealtimeSync("global", "sales_updated", { deletedId: saleId });
    return true;
  } catch (err) {
    console.error("Supabase delete sale exception:", err);
    return false;
  }
}

// ==========================================
// EXPENSES DATABASE SYNCHRONIZATION
// ==========================================

export async function dbGetExpenses(userId: string): Promise<Expense[] | null> {
  // 1. Primary: fetch via server API with service_role and company scoping
  try {
    const res = await fetch(`/api/expenses?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/expenses GET error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching expenses from Supabase:", error);
      return null;
    }

    if (!data) return [];

    return data.map((d) => ({
      id: d.id,
      description: d.description,
      value: Number(d.value),
      date: d.date,
      category: d.category
    }));
  } catch (err) {
    console.error("Supabase query expenses exception:", err);
    return null;
  }
}

export async function dbSaveExpense(userId: string, expense: Expense): Promise<boolean> {
  let cleanId = expense.id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cleanId)) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      cleanId = crypto.randomUUID();
    } else if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
      cleanId = window.crypto.randomUUID();
    } else {
      cleanId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    expense.id = cleanId;
  }

  // 1. Primary: save via server API with service_role and company scoping
  try {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, expense: { ...expense, id: cleanId } })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch (apiErr) {
    console.warn("Direct /api/expenses POST error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("expenses")
      .upsert({
        id: cleanId,
        user_id: userId,
        description: expense.description,
        value: expense.value,
        date: expense.date,
        category: expense.category
      });

    if (error) {
      console.error("Error saving expense to Supabase:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase upsert expense exception:", err);
    return false;
  }
}

export async function dbDeleteExpense(expenseId: string): Promise<boolean> {
  // 1. Primary: delete via server API
  try {
    const res = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch (apiErr) {
    console.warn("Direct /api/expenses DELETE error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);

    if (error) {
      console.error("Error deleting expense:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase delete expense exception:", err);
    return false;
  }
}

// ==========================================
// GOALS SYSTEM DATABASE SYNCHRONIZATION
// ==========================================

interface DBGoals {
  goalValue: number;
  goalType: "daily" | "overall";
  notifiedGoalValue: number;
  notifiedGoalDate: string;
}

export async function dbGetGoals(userId: string): Promise<DBGoals | null> {
  // 1. Primary: Server API with service_role to avoid FK 23503 and RLS
  try {
    const res = await fetch(`/api/goals?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch (apiErr) {
    // Non-blocking, fallback to direct client
  }

  // 2. Direct client fallback
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return null;
    }

    if (!data) return null;

    return {
      goalValue: Number(data.goal_value),
      goalType: (data.goal_type || "daily") as "daily" | "overall",
      notifiedGoalValue: Number(data.notified_goal_value),
      notifiedGoalDate: data.notified_goal_date || "",
    };
  } catch (err) {
    return null;
  }
}

export async function dbSaveGoals(
  userId: string,
  goalValue: number,
  goalType: "daily" | "overall",
  notifiedGoalValue: number,
  notifiedGoalDate: string
): Promise<boolean> {
  // 1. Primary: Server API with service_role to avoid FK 23503 and RLS
  try {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        goalValue,
        goalType,
        notifiedGoalValue,
        notifiedGoalDate
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return true;
      }
    }
  } catch (apiErr) {
    // Fallback to direct client
  }

  // 2. Direct client fallback
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("goals")
      .upsert({
        user_id: userId,
        goal_value: goalValue,
        goal_type: goalType,
        notified_goal_value: notifiedGoalValue,
        notified_goal_date: notifiedGoalDate,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    if (error) {
      console.warn("Direct client save goals notice:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Uploads a list of local Files to the 'comprovantes' public bucket on Supabase Storage.
 * Generates random unique file names to avoid name collisions.
 */
export async function dbUploadImages(files: File[]): Promise<string[]> {
  const supabase = getSupabase();
  const urls: string[] = [];
  const filesToUploadViaServer: { name: string; base64: string; type: string }[] = [];

  for (const file of files) {
    let uploaded = false;
    if (supabase) {
      try {
        const cleanName = file.name.replace(/[^A-Za-z0-9.]/g, "_");
        const randomId = Math.random().toString(36).substring(2, 10);
        const uniqueName = `${Date.now()}_${randomId}_${cleanName}`;
        const bucketName = "comprovantes";
        
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(uniqueName, file, {
            cacheControl: "3600",
            upsert: true
          });
          
        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
          if (publicUrlData?.publicUrl) {
            urls.push(publicUrlData.publicUrl);
            uploaded = true;
          }
        }
      } catch (e) {
        console.warn("Direct storage upload failed, will fallback to server upload API:", e);
      }
    }

    if (!uploaded) {
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        filesToUploadViaServer.push({
          name: file.name,
          base64: b64,
          type: file.type || "image/jpeg"
        });
      } catch (readErr) {
        console.error("Failed to read file for server upload:", readErr);
      }
    }
  }

  // If any file couldn't be uploaded directly to Supabase client-side, upload through server /api/upload
  if (filesToUploadViaServer.length > 0) {
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesToUploadViaServer })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.urls)) {
          urls.push(...json.urls);
        }
      }
    } catch (srvErr) {
      console.error("Server /api/upload failed:", srvErr);
    }
  }

  return urls;
}

/**
 * Uploads a local company logo File to the 'logos' public bucket on Supabase Storage.
 * Auto-creates bucket if necessary, falls back to 'comprovantes' bucket if required.
 */
export async function dbUploadLogo(file: File): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  try {
    const cleanName = file.name.replace(/[^A-Za-z0-9.]/g, "_");
    const randomId = Math.random().toString(36).substring(2, 10);
    const uniqueName = `logo_${Date.now()}_${randomId}_${cleanName}`;
    const bucketName = "logos";

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) {
      console.warn("Supabase Storage Logo Upload Error:", error);

      // Try to provision 'logos' bucket if it doesn't exist
      if (error.message?.includes("bucket") || error.message?.includes("not found")) {
        try {
          console.log(`Bucket '${bucketName}' not found. Attempting creation...`);
          await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 5242880 // 5MB Limit
          });

          // Retry upload
          const { data: retryData, error: retryError } = await supabase.storage
            .from(bucketName)
            .upload(uniqueName, file, {
              cacheControl: "3600",
              upsert: false
            });

          if (!retryError && retryData) {
            const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
            return publicUrlData?.publicUrl || null;
          } else {
            console.warn("Retry logo upload failed:", retryError);
          }
        } catch (createErr) {
          console.error("Bucket creation or retry exception for logos:", createErr);
        }
      }

      // Fallback: use comprovantes bucket
      console.log("Trying to upload logo to fallack comprovantes bucket...");
      const { data: compData, error: compError } = await supabase.storage
        .from("comprovantes")
        .upload(uniqueName, file, {
          cacheControl: "3600",
          upsert: false
        });

      if (!compError && compData) {
        const { data: publicUrlData } = supabase.storage.from("comprovantes").getPublicUrl(uniqueName);
        return publicUrlData?.publicUrl || null;
      }

      return null;
    }

    if (data) {
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
      return publicUrlData?.publicUrl || null;
    }
  } catch (err) {
    console.error("dbUploadLogo unexpected error:", err);
  }
  return null;
}

/**
 * Safely parses the client_image column from database into an array of string URLs.
 * Handles single legacy Base64s, legacy single URLs, and JSON arrays of multiple public URLs.
 */
export function parseClientImages(clientImage: string | null): string[] {
  if (!clientImage) return [];
  const trimmed = clientImage.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string");
      }
    } catch (e) {
      console.error("Failed to parse clientImage as JSON string:", e);
    }
  }
  // Fallback to comma separation
  if (trimmed.includes(",") && !trimmed.startsWith("data:")) {
    return trimmed.split(",").map(url => url.trim()).filter(Boolean);
  }
  return [trimmed];
}

// ==========================================
// BULK DATA BACKUP & RESTORE SERVICES & REALTIME SYNC
// ==========================================

/**
 * Universal real-time notification engine for instant multi-terminal synchronization.
 * Broadcasts to SSE stream endpoint (/api/realtime/notify), Supabase Realtime channel, and local window events.
 */
export async function notifyRealtimeSync(
  companyId: string,
  event: string,
  data?: any
): Promise<void> {
  const safeCompanyId = companyId || "global";
  const payload = { companyId: safeCompanyId, event, data, timestamp: Date.now() };

  // 1. Post to Server-Sent Events (SSE) stream endpoint to notify all connected terminals
  try {
    fetch("/api/realtime/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((e) => console.warn("[Realtime Notify] SSE fetch warning:", e));
  } catch (e) {
    // ignore
  }

  // 2. Broadcast via Supabase Realtime channel if available
  try {
    const supabase = getSupabase();
    if (supabase) {
      const channel = supabase.channel("multi-terminal-sync");
      channel.send({
        type: "broadcast",
        event: event,
        payload
      }).catch(() => {});
      channel.send({
        type: "broadcast",
        event: "sync_broadcast",
        payload
      }).catch(() => {});
    }
  } catch (e) {
    // ignore
  }

  // 3. Local window dispatch for same-window / tabs reactivity
  try {
    window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: payload }));
  } catch (e) {}
}

export async function dbExportAllData(ownerId: string): Promise<{
  backup_type: string;
  schema_version: string;
  exported_at: string;
  company_profile: any | null;
  goals: any | null;
  sales: any[];
  budgets: any[];
  expenses: any[];
  produtos: any[];
  gastos_mensais: any[];
  clientes: any[];
  cash_register: any | null;
  sessoes_caixa: any[];
  localStorageDump: Record<string, string>;
} | null> {
  const supabase = getSupabase();

  try {
    const fetchTableSafe = async (tableName: string, isSingle = false) => {
      if (!supabase) return isSingle ? null : [];
      try {
        const query = supabase.from(tableName).select("*").eq("user_id", ownerId);
        const { data, error } = isSingle ? await query.maybeSingle() : await query;
        if (error) {
          console.warn(`[dbExportAllData] Fetch note for ${tableName}:`, error.message);
          return isSingle ? null : [];
        }
        return data || (isSingle ? null : []);
      } catch (e: any) {
        console.warn(`[dbExportAllData] Exception fetching ${tableName}:`, e.message || e);
        return isSingle ? null : [];
      }
    };

    // 1. Fetch remote tables in parallel
    const [
      produtosRemote,
      salesRawRemote,
      expensesRemote,
      gastosMensaisRemote,
      clientesRemote,
      companyProfileRemote,
      goalsRemote,
      sessoesCaixaRemote
    ] = await Promise.all([
      fetchTableSafe("produtos"),
      fetchTableSafe("sales"),
      fetchTableSafe("expenses"),
      fetchTableSafe("gastos_mensais"),
      fetchTableSafe("clientes"),
      fetchTableSafe("company_profile", true),
      fetchTableSafe("goals", true),
      fetchTableSafe("sessoes_caixa")
    ]);

    // 2. Extract and merge local storage data so offline or un-synced data is NEVER lost
    let localSales: any[] = [];
    let localBudgets: any[] = [];
    let localExpenses: any[] = [];
    let localProducts: any[] = [];
    let localBills: any[] = [];
    let localClients: any[] = [];
    let localCompany: any = null;
    let localGoals: any = null;
    let localCashRegister: any = null;
    const localStorageDump: Record<string, string> = {};

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("NUCLEO_") || key.startsWith("nexvolt_"))) {
          const val = localStorage.getItem(key);
          if (val) localStorageDump[key] = val;
        }
      }

      if (localStorageDump["NUCLEO_SALES"]) {
        localSales = JSON.parse(localStorageDump["NUCLEO_SALES"]);
      }
      if (localStorageDump["NUCLEO_BUDGETS"]) {
        localBudgets = JSON.parse(localStorageDump["NUCLEO_BUDGETS"]);
      }
      if (localStorageDump["NUCLEO_EXPENSES"]) {
        localExpenses = JSON.parse(localStorageDump["NUCLEO_EXPENSES"]);
      }
      if (localStorageDump["NUCLEO_PRODUCTS"]) {
        localProducts = JSON.parse(localStorageDump["NUCLEO_PRODUCTS"]);
      }
      if (localStorageDump["NUCLEO_CARDAPIO_ITEMS"]) {
        const cardapio = JSON.parse(localStorageDump["NUCLEO_CARDAPIO_ITEMS"]);
        if (Array.isArray(cardapio)) localProducts = [...localProducts, ...cardapio];
      }
      if (localStorageDump["NUCLEO_MONTHLY_BILLS"]) {
        localBills = JSON.parse(localStorageDump["NUCLEO_MONTHLY_BILLS"]);
      } else if (localStorageDump["NUCLEO_RECURRING_EXPENSES"]) {
        localBills = JSON.parse(localStorageDump["NUCLEO_RECURRING_EXPENSES"]);
      }
      if (localStorageDump["NUCLEO_CLIENTS"]) {
        localClients = JSON.parse(localStorageDump["NUCLEO_CLIENTS"]);
      }
      const fallbackClientKey = "NUCLEO_CLIENTS_FALLBACK_" + ownerId;
      if (localStorageDump[fallbackClientKey]) {
        try {
          const fb = JSON.parse(localStorageDump[fallbackClientKey]);
          if (Array.isArray(fb)) localClients = [...localClients, ...fb];
        } catch (e) {}
      }
      if (localStorageDump["NUCLEO_COMPANY_PROFILE"]) {
        localCompany = JSON.parse(localStorageDump["NUCLEO_COMPANY_PROFILE"]);
      }
      if (localStorageDump["NUCLEO_CASH_REGISTER"]) {
        localCashRegister = JSON.parse(localStorageDump["NUCLEO_CASH_REGISTER"]);
      }
      if (localStorageDump["NUCLEO_GOALS"]) {
        localGoals = JSON.parse(localStorageDump["NUCLEO_GOALS"]);
      }
    } catch (err) {
      console.warn("[dbExportAllData] Local storage extraction warning:", err);
    }

    // 3. Intelligent Deduplication and Normalization (remote + local)
    // Helper to deduplicate by ID
    const mergeDeduplicate = (remoteList: any[], localList: any[]): any[] => {
      const map = new Map<string, any>();
      (remoteList || []).forEach(item => {
        if (item && item.id) map.set(item.id, item);
      });
      (localList || []).forEach(item => {
        if (item && item.id) {
          if (!map.has(item.id)) {
            map.set(item.id, item);
          } else {
            // merge properties so neither side loses data
            map.set(item.id, { ...map.get(item.id), ...item });
          }
        }
      });
      return Array.from(map.values());
    };

    // Filter out internal system rows from sales
    const cleanSalesRemote = (salesRawRemote || []).filter(
      (d: any) => d && d.id !== "quick_sales_config" && !d.id.startsWith("cash_register_state") && !d.id.startsWith("deletion_audit_log")
    );

    const mergedSales = mergeDeduplicate(cleanSalesRemote, localSales);
    const mergedExpenses = mergeDeduplicate(expensesRemote || [], localExpenses);
    const mergedProducts = mergeDeduplicate(produtosRemote || [], localProducts);
    const mergedBills = mergeDeduplicate(gastosMensaisRemote || [], localBills);
    const mergedClients = mergeDeduplicate(clientesRemote || [], localClients);
    const mergedBudgets = mergeDeduplicate(
      mergedSales.filter((s: any) => s.isBudget || s.is_budget),
      localBudgets
    );

    const finalCompany = companyProfileRemote || localCompany;
    const finalGoals = goalsRemote || localGoals;

    return {
      backup_type: "full_system_backup",
      schema_version: "2.0.0",
      exported_at: new Date().toISOString(),
      company_profile: finalCompany,
      goals: finalGoals,
      sales: mergedSales,
      budgets: mergedBudgets,
      expenses: mergedExpenses,
      produtos: mergedProducts,
      gastos_mensais: mergedBills,
      clientes: mergedClients,
      cash_register: localCashRegister,
      sessoes_caixa: sessoesCaixaRemote || [],
      localStorageDump
    };
  } catch (err) {
    console.error("Error exporting all data:", err);
    return null;
  }
}

export async function dbImportAllData(
  currentOwnerId: string,
  backupData: {
    produtos?: any[];
    sales?: any[];
    budgets?: any[];
    expenses?: any[];
    gastos_mensais?: any[];
    clientes?: any[];
    company_profile?: any;
    goals?: any;
    cash_register?: any;
    sessoes_caixa?: any[];
    localStorageDump?: Record<string, string>;
  }
): Promise<{
  success: boolean;
  error: string | null;
  counts: {
    produtos: number;
    sales: number;
    budgets: number;
    expenses: number;
    gastos_mensais: number;
    clientes: number;
    company_profile: boolean;
    goals: boolean;
    cash_register: boolean;
  };
}> {
  const counts = {
    produtos: 0,
    sales: 0,
    budgets: 0,
    expenses: 0,
    gastos_mensais: 0,
    clientes: 0,
    company_profile: false,
    goals: false,
    cash_register: false
  };

  const supabase = getSupabase();

  try {
    // 0. Primary: Send full backup to server-side API with service_role to ensure all tables are inserted directly into Supabase and broadcasted instantly to ALL connected computers!
    try {
      const srvRes = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentOwnerId, backupData })
      });
      if (srvRes.ok) {
        const srvJson = await srvRes.json();
        if (srvJson.success && srvJson.counts) {
          Object.assign(counts, srvJson.counts);
        }
      }
    } catch (srvErr) {
      console.warn("Direct /api/backup/restore error, continuing with local mirror:", srvErr);
    }

    // 0. Unpack full LocalStorage dump first if present to seed the new PC with all application configurations
    if (backupData.localStorageDump && typeof backupData.localStorageDump === "object") {
      try {
        Object.entries(backupData.localStorageDump).forEach(([key, value]) => {
          if (key && value && typeof value === "string") {
            try {
              localStorage.setItem(key, value);
            } catch (e) {}
          }
        });
      } catch (e) {
        console.warn("Aviso ao desembalar LocalStorageDump:", e);
      }
    }

    // 1. Restore Company Profile
    if (backupData.company_profile) {
      const companyPayload = { ...backupData.company_profile, user_id: currentOwnerId };
      try {
        localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(backupData.company_profile));
      } catch (e) {}

      if (supabase) {
        try {
          const { error: err } = await supabase.from("company_profile").upsert(companyPayload);
          if (err) console.warn("Supabase company_profile upsert note:", err.message);
        } catch (e) {}
      }
      counts.company_profile = true;
    }

    // 2. Restore Goals
    if (backupData.goals) {
      const goalsPayload = { ...backupData.goals, user_id: currentOwnerId };
      try {
        localStorage.setItem("NUCLEO_GOALS", JSON.stringify(backupData.goals));
      } catch (e) {}

      if (supabase) {
        try {
          const { error: err } = await supabase.from("goals").upsert(goalsPayload);
          if (err) console.warn("Supabase goals upsert note:", err.message);
        } catch (e) {}
      }
      counts.goals = true;
    }

    // 3. Restore Clientes (normalize and persist to both LocalStorage and Supabase)
    if (Array.isArray(backupData.clientes) && backupData.clientes.length > 0) {
      const normalizedClientes = backupData.clientes.map((c: any) => {
        const id = c.id || "client_" + Math.random().toString(36).substring(2, 9);
        return {
          id,
          user_id: currentOwnerId,
          name: c.name || c.nome || "Cliente Sem Nome",
          phone: c.phone || c.telefone || "",
          email: c.email || "",
          address: c.address || c.endereco || "",
          notes: c.notes || c.observacao || c.observation || "",
          cpf_cnpj: c.cpf_cnpj || c.cpfCnpj || "",
          created_at: c.created_at || c.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      // Save locally
      try {
        localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(normalizedClientes));
        localStorage.setItem("NUCLEO_CLIENTS_FALLBACK_" + currentOwnerId, JSON.stringify(normalizedClientes));
      } catch (e) {}

      // Save to Supabase
      if (supabase) {
        try {
          await supabase.from("clientes").delete().eq("user_id", currentOwnerId);
          for (const item of normalizedClientes) {
            try {
              await supabase.from("clientes").upsert(item);
            } catch (e) {}
          }
        } catch (e) {
          console.warn("Supabase clientes import note:", e);
        }
      }
      counts.clientes = normalizedClientes.length;
    }

    // 4. Restore Produtos (normalize camelCase/snake_case to PT database schema + LocalStorage)
    if (Array.isArray(backupData.produtos) && backupData.produtos.length > 0) {
      const normalizedProducts: any[] = [];
      const localProducts: any[] = [];

      backupData.produtos.forEach((p: any) => {
        const id = p.id || "prod_" + Math.random().toString(36).substring(2, 9);
        const name = p.name || p.nome || p.description || p.descricao || "Produto";
        const cost = Number(p.costPrice ?? p.cost_price ?? p.preco_custo ?? p.valor_custo ?? 0);
        const sale = Number(p.salePrice ?? p.sale_price ?? p.preco_venda ?? p.valor_venda ?? 0);
        const minStock = Number(p.minStock ?? p.min_stock ?? p.estoque_minimo ?? 0);
        const currentStock = Number(p.currentStock ?? p.current_stock ?? p.estoque_atual ?? 0);
        const profit = sale - cost;

        localProducts.push({
          id,
          description: name,
          name,
          costPrice: cost,
          salePrice: sale,
          profit,
          minStock,
          currentStock
        });

        // PT-Snake payload for standard database
        normalizedProducts.push({
          id,
          user_id: currentOwnerId,
          nome: name,
          description: name,
          preco_custo: cost,
          preco_venda: sale,
          lucro: profit,
          estoque_minimo: minStock,
          estoque_atual: currentStock
        });
      });

      // Save locally
      try {
        localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(localProducts));
      } catch (e) {}

      // Save to Supabase
      if (supabase) {
        try {
          await supabase.from("produtos").delete().eq("user_id", currentOwnerId);
          for (const item of normalizedProducts) {
            const { error: ptErr } = await supabase.from("produtos").upsert(item);
            if (ptErr) {
              // Try EN schema fallback if PT fails
              try {
                await supabase.from("produtos").upsert({
                  id: item.id,
                  user_id: currentOwnerId,
                  name: item.nome,
                  description: item.nome,
                  cost_price: item.preco_custo,
                  sale_price: item.preco_venda,
                  profit: item.lucro,
                  min_stock: item.estoque_minimo,
                  current_stock: item.estoque_atual
                });
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("Supabase produtos import note:", e);
        }
      }
      counts.produtos = localProducts.length;
    }

    // 5. Restore Sales & Budgets (normalize camelCase to snake_case database schema + LocalStorage)
    const rawSales = Array.isArray(backupData.sales) ? backupData.sales : [];
    const rawBudgets = Array.isArray(backupData.budgets) ? backupData.budgets : [];
    const allSalesToProcess = [...rawSales];

    // Ensure budgets are also present in sales list with isBudget: true
    rawBudgets.forEach((b: any) => {
      if (!allSalesToProcess.some((s: any) => s.id === b.id)) {
        allSalesToProcess.push({ ...b, isBudget: true, is_budget: true });
      }
    });

    if (allSalesToProcess.length > 0) {
      const cleanSalesForLocal: any[] = [];
      const cleanBudgetsForLocal: any[] = [];
      const normalizedSalesForDb: any[] = [];

      allSalesToProcess.forEach((s: any) => {
        if (!s || !s.id || s.id === "quick_sales_config" || s.id.startsWith("cash_register_state")) return;

        const isBudget = !!(s.isBudget || s.is_budget);
        const id = s.id;
        const date = s.date || new Date().toISOString();
        const clientName = s.clientName || s.client_name || "Cliente";
        let clientPhone = s.clientPhone || s.client_phone || "";
        const items = Array.isArray(s.items) ? s.items : [];
        const useMotoboy = !!(s.useMotoboy || s.use_motoboy);
        const motoboyCost = Number(s.motoboyCost ?? s.motoboy_cost ?? 0);
        const discount = Number(s.discount ?? 0);
        const downPayment = Number(s.downPayment ?? s.down_payment ?? 0);
        const operationCost = Number(s.operationCost ?? s.operation_cost ?? 0);
        const costItems = Array.isArray(s.costItems) ? s.costItems : (Array.isArray(s.cost_items) ? s.cost_items : []);
        const totalValue = Number(s.totalValue ?? s.total_value ?? 0);
        const balanceDue = Number(s.balanceDue ?? s.balance_due ?? 0);
        const netProfit = Number(s.netProfit ?? s.net_profit ?? 0);
        const clientImage = s.clientImage || s.client_image || "";
        const paymentMethod = s.paymentMethod || s.payment_method || "dinheiro";

        // Preserve metadata in clientPhone (e.g. seller, orderDate, payments)
        const metaObj: any = {
          orderDate: s.orderDate || "",
          deliveryDate: s.deliveryDate || "",
          deliveryReason: s.deliveryReason || "",
          payments: s.payments || [],
          materialEntregue: !!s.materialEntregue,
          sellerId: s.sellerId || "",
          sellerName: s.sellerName || "",
          sellerRole: s.sellerRole || undefined,
          deliveredBy: s.deliveredBy || "",
          deliveredAt: s.deliveredAt || "",
          deliveredRole: s.deliveredRole || undefined,
          auditLog: s.auditLog || []
        };
        const purePhone = clientPhone.includes("::") ? clientPhone.split("::")[0] : clientPhone;
        const phoneWithMeta = `${purePhone}::${JSON.stringify(metaObj)}`;

        const localSaleObj = {
          id,
          date,
          clientName,
          clientPhone: purePhone,
          orderDate: metaObj.orderDate,
          deliveryDate: metaObj.deliveryDate,
          deliveryReason: metaObj.deliveryReason,
          payments: metaObj.payments,
          materialEntregue: metaObj.materialEntregue,
          sellerId: metaObj.sellerId,
          sellerName: metaObj.sellerName,
          sellerRole: metaObj.sellerRole,
          deliveredBy: metaObj.deliveredBy,
          deliveredAt: metaObj.deliveredAt,
          deliveredRole: metaObj.deliveredRole,
          auditLog: metaObj.auditLog,
          items,
          useMotoboy,
          motoboyCost,
          discount,
          downPayment,
          operationCost,
          costItems,
          totalValue,
          balanceDue,
          netProfit,
          clientImage,
          paymentMethod,
          isBudget
        };

        if (isBudget) {
          cleanBudgetsForLocal.push(localSaleObj);
        } else {
          cleanSalesForLocal.push(localSaleObj);
        }

        // Database payload (snake_case)
        normalizedSalesForDb.push({
          id,
          user_id: currentOwnerId,
          client_name: clientName,
          client_phone: phoneWithMeta,
          items,
          use_motoboy: useMotoboy,
          motoboy_cost: motoboyCost,
          discount,
          down_payment: downPayment,
          operation_cost: operationCost,
          cost_items: costItems,
          total_value: totalValue,
          balance_due: balanceDue,
          net_profit: netProfit,
          client_image: clientImage,
          date,
          is_budget: isBudget,
          payment_method: paymentMethod
        });
      });

      // Save locally
      try {
        localStorage.setItem("NUCLEO_SALES", JSON.stringify(cleanSalesForLocal));
        localStorage.setItem("NUCLEO_BUDGETS", JSON.stringify(cleanBudgetsForLocal));
      } catch (e) {}

      // Save to Supabase (row-by-row upsert to prevent partial failures)
      if (supabase) {
        try {
          for (const sPayload of normalizedSalesForDb) {
            const { error: sErr } = await supabase.from("sales").upsert(sPayload);
            if (sErr) {
              // Try without payment_method column if column not present
              try {
                const { payment_method, ...fallbackPayload } = sPayload;
                await supabase.from("sales").upsert(fallbackPayload);
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("Supabase sales import note:", e);
        }
      }

      counts.sales = cleanSalesForLocal.length;
      counts.budgets = cleanBudgetsForLocal.length;
    }

    // 6. Restore Expenses (normalize camelCase to snake_case database schema + LocalStorage)
    if (Array.isArray(backupData.expenses) && backupData.expenses.length > 0) {
      const localExpenses: any[] = [];
      const normalizedExpensesForDb: any[] = [];

      backupData.expenses.forEach((e: any) => {
        if (!e || !e.id) return;
        const id = e.id;
        const date = e.date || new Date().toISOString();
        const description = e.description || e.descricao || "Despesa";
        const category = e.category || e.categoria || "Geral";
        const value = Number(e.value ?? e.valor ?? 0);
        const observation = e.observation || e.observacao || "";
        const receiptUrls = e.receiptUrls || e.receipt_urls || [];
        const isRecurring = !!(e.isRecurring || e.is_recurring);
        const isFixedCost = !!(e.isFixedCost || e.is_fixed_cost);

        localExpenses.push({
          id,
          date,
          description,
          category,
          value,
          observation,
          receiptUrls,
          isRecurring,
          isFixedCost
        });

        normalizedExpensesForDb.push({
          id,
          user_id: currentOwnerId,
          date,
          description,
          category,
          value,
          observation,
          receipt_urls: receiptUrls,
          is_recurring: isRecurring,
          is_fixed_cost: isFixedCost
        });
      });

      // Save locally
      try {
        localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(localExpenses));
      } catch (e) {}

      // Save to Supabase
      if (supabase) {
        try {
          for (const ePayload of normalizedExpensesForDb) {
            const { error: eErr } = await supabase.from("expenses").upsert(ePayload);
            if (eErr) {
              // Fallback without receipt_urls / fixed cost columns
              try {
                await supabase.from("expenses").upsert({
                  id: ePayload.id,
                  user_id: currentOwnerId,
                  date: ePayload.date,
                  description: ePayload.description,
                  category: ePayload.category,
                  value: ePayload.value,
                  observation: ePayload.observation
                });
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("Supabase expenses import note:", e);
        }
      }
      counts.expenses = localExpenses.length;
    }

    // 7. Restore Gastos Mensais (normalize schema + LocalStorage)
    if (Array.isArray(backupData.gastos_mensais) && backupData.gastos_mensais.length > 0) {
      const localBills: any[] = [];
      const normalizedBillsForDb: any[] = [];

      backupData.gastos_mensais.forEach((g: any) => {
        if (!g || !g.id) return;
        const id = g.id;
        const name = g.name || g.nome || g.description || g.titulo || "Fatura";
        const value = Number(g.value ?? g.valor ?? 0);
        const category = g.category || g.categoria || "Outros";
        const dueDate = g.dueDate || g.due_date || g.vencimento || "";
        const observation = g.observation || g.observacao || "";

        localBills.push({
          id,
          name,
          value,
          category,
          dueDate,
          observation
        });

        normalizedBillsForDb.push({
          id,
          user_id: currentOwnerId,
          name,
          value,
          category,
          due_date: dueDate,
          observation
        });
      });

      // Save locally
      try {
        localStorage.setItem("NUCLEO_MONTHLY_BILLS", JSON.stringify(localBills));
        localStorage.setItem("NUCLEO_RECURRING_EXPENSES", JSON.stringify(localBills));
      } catch (e) {}

      // Save to Supabase
      if (supabase) {
        try {
          for (const gPayload of normalizedBillsForDb) {
            const { error: gErr } = await supabase.from("gastos_mensais").upsert(gPayload);
            if (gErr) {
              // Try PT schema fallback
              try {
                await supabase.from("gastos_mensais").upsert({
                  id: gPayload.id,
                  user_id: currentOwnerId,
                  nome: gPayload.name,
                  valor: gPayload.value,
                  categoria: gPayload.category,
                  vencimento: gPayload.due_date,
                  observacao: gPayload.observation
                });
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("Supabase gastos_mensais import note:", e);
        }
      }
      counts.gastos_mensais = localBills.length;
    }

    // 8. Restore Cash Register (state and session history)
    if (backupData.cash_register || (Array.isArray(backupData.sessoes_caixa) && backupData.sessoes_caixa.length > 0)) {
      try {
        let registerState = backupData.cash_register;
        if (!registerState && Array.isArray(backupData.sessoes_caixa)) {
          const openSession = backupData.sessoes_caixa.find((s: any) => s.status === "aberto");
          registerState = {
            currentSession: openSession || null,
            history: backupData.sessoes_caixa
          };
        }
        if (registerState) {
          localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(registerState));
          if (supabase) {
            dbSaveCashRegister(currentOwnerId, registerState).catch(() => {});
          }
          counts.cash_register = true;
        }
      } catch (e) {
        console.warn("Aviso ao restaurar estado do caixa:", e);
      }
    }

    // 9. Instant Multi-Terminal Broadcast to all devices via realtime
    notifyRealtimeSync(currentOwnerId, "backup_restored", counts);
    notifyRealtimeSync("global", "backup_restored", counts);
    notifyRealtimeSync(currentOwnerId, "products_updated", counts);
    notifyRealtimeSync("global", "products_updated", counts);
    notifyRealtimeSync(currentOwnerId, "sales_updated", counts);
    notifyRealtimeSync("global", "sales_updated", counts);
    notifyRealtimeSync(currentOwnerId, "expenses_updated", counts);
    notifyRealtimeSync("global", "expenses_updated", counts);
    notifyRealtimeSync(currentOwnerId, "clients_updated", counts);
    notifyRealtimeSync("global", "clients_updated", counts);

    return {
      success: true,
      error: null,
      counts
    };
  } catch (err: any) {
    console.error("Error importing backup metadata:", err);
    return {
      success: false,
      error: err.message || "Erro desconhecido durante a restauração",
      counts
    };
  }
}

export interface DbQuickSale {
  id: string;
  description: string;
  price: number;
  cost?: number;
  gradient: string;
}

export async function dbGetQuickSales(userId: string): Promise<DbQuickSale[] | null> {
  const supabase = getSupabase();
  if (!supabase && !isSupabaseConfigured()) return null;

  // 1. Try fetching via server API (which uses service_role and bypasses client RLS)
  try {
    const res = await fetch(`/api/quick-sales?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        try {
          localStorage.setItem(`NUCLEO_QUICK_SALES_${userId}`, JSON.stringify(json.data));
        } catch {}
        return json.data;
      }
    }
  } catch {
    // Continue to client direct queries if server API is unavailable
  }

  // 2. Direct query on quick_sales table
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("quick_sales")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const formatted: DbQuickSale[] = data.map((item: any) => ({
          id: item.id,
          description: item.description,
          price: Number(item.price) || 0,
          cost: Number(item.cost) || 0,
          gradient: item.gradient || "from-purple-600 via-fuchsia-600 to-pink-500",
        }));
        try {
          localStorage.setItem(`NUCLEO_QUICK_SALES_${userId}`, JSON.stringify(formatted));
        } catch {}
        return formatted;
      }

      // 3. Fallback: check sales table row quick_sales_config
      const { data: salesRow } = await supabase
        .from("sales")
        .select("items")
        .eq("id", "quick_sales_config")
        .maybeSingle();

      if (salesRow?.items && Array.isArray(salesRow.items) && salesRow.items.length > 0) {
        try {
          localStorage.setItem(`NUCLEO_QUICK_SALES_${userId}`, JSON.stringify(salesRow.items));
        } catch {}
        return salesRow.items;
      }
    } catch (err) {
      console.warn("Supabase quick_sales query notice:", err);
    }
  }

  // 4. Local storage fallback
  try {
    const saved = localStorage.getItem(`NUCLEO_QUICK_SALES_${userId}`) || localStorage.getItem("NUCLEO_QUICK_SALES");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  return [];
}

export async function dbSaveQuickSale(userId: string, item: DbQuickSale): Promise<boolean> {
  // Update local storage immediately for responsive UI
  try {
    const key = `NUCLEO_QUICK_SALES_${userId}`;
    const raw = localStorage.getItem(key);
    let list: DbQuickSale[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(q => q.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}

  // 1. Save via server API (uses service_role to avoid client RLS policy restrictions)
  try {
    const res = await fetch("/api/quick-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, item })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch {
    // Continue to direct Supabase write if server call failed
  }

  const supabase = getSupabase();
  if (!supabase) return true; // Saved locally

  // 2. Fallback to direct client upsert with graceful handling of RLS error 42501
  try {
    const { error } = await supabase
      .from("quick_sales")
      .upsert({
        id: item.id,
        user_id: userId,
        description: item.description,
        price: item.price,
        cost: item.cost || 0,
        gradient: item.gradient
      });

    if (error) {
      if (error.code === "42501") {
        console.warn("Notice: Client RLS restricted direct insert on quick_sales, persisted via local & config backup.");
      } else {
        console.warn("Notice upserting quick_sales:", error.message);
      }
      // Sync to sales table config row
      try {
        const raw = localStorage.getItem(`NUCLEO_QUICK_SALES_${userId}`);
        const items = raw ? JSON.parse(raw) : [item];
        await supabase.from("sales").upsert({
          id: `quick_sales_config_${userId}`,
          user_id: userId,
          client_name: "QUICK_SALES_CONFIG",
          client_phone: "CONFIG",
          items,
          date: new Date().toISOString()
        });
      } catch {}
      return true;
    }

    return true;
  } catch (err) {
    console.warn("Supabase quick_sales save notice:", err);
    return true;
  }
}

export async function dbDeleteQuickSale(userId: string, id: string): Promise<boolean> {
  // Update local storage
  try {
    const key = `NUCLEO_QUICK_SALES_${userId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: DbQuickSale[] = JSON.parse(raw);
      const filtered = list.filter(q => q.id !== id);
      localStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch {}

  // 1. Delete via server API
  try {
    const res = await fetch(`/api/quick-sales/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch {}

  const supabase = getSupabase();
  if (!supabase) return true;

  // 2. Direct client delete with graceful handling
  try {
    const { error } = await supabase
      .from("quick_sales")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.warn("Notice deleting quick_sales item:", error.message);
    }
    return true;
  } catch (err) {
    console.warn("Supabase quick_sales delete notice:", err);
    return true;
  }
}

export function isSystemAdminUser(): boolean {
  try {
    const userStr = localStorage.getItem("NUCLEO_CURRENT_USER");
    if (!userStr) return false;
    const user = JSON.parse(userStr);
    const email = (user.email || "").toLowerCase().trim();
    return email === "sistemadevendaadm@gmail.com";
  } catch (e) {
    return false;
  }
}

export async function dbPublishSystemStructure(
  adminEmail: string,
  structureSnapshot?: any
): Promise<{ success: boolean; countPublished: number }> {
  const safeEmail = adminEmail || "sistemadevendaadm@gmail.com";
  const supabase = getSupabase();
  let countPublished = 0;

  // 1. Activate all draft products in localStorage
  try {
    const localProductsStr = localStorage.getItem("NUCLEO_PRODUCTS");
    if (localProductsStr) {
      let list: any[] = JSON.parse(localProductsStr);
      list = list.map((p) => {
        if (p.status === "rascunho" || p.is_draft) {
          countPublished++;
          return { ...p, status: "ativo", is_draft: false };
        }
        return p;
      });
      localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(list));
      if (!structureSnapshot) {
        structureSnapshot = { produtos: list };
      } else if (!structureSnapshot.produtos) {
        structureSnapshot.produtos = list;
      }
    }
  } catch (e) {
    console.warn("Error activating draft products in localStorage:", e);
  }

  // 2. Activate draft products in Supabase 'produtos' table
  if (supabase) {
    try {
      await supabase
        .from("produtos")
        .update({ status: "ativo", is_draft: false })
        .eq("status", "rascunho");
    } catch (e) {
      console.warn("Notice updating draft products in Supabase:", e);
    }
  }

  // 3. Upsert into public.configuracoes_sistema table
  const configRecord = {
    id: "global_structure",
    versao: "ativa",
    status: "ativa",
    versao_timestamp: Date.now(),
    applied_by: safeEmail,
    applied_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dados_estrutura: structureSnapshot || null
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from("configuracoes_sistema")
        .upsert(configRecord, { onConflict: "id" });
      if (error) {
        console.warn("Supabase configuracoes_sistema upsert notice:", error.message);
        try {
          await supabase
            .from("configuracoes_sistema")
            .upsert({
              id: "global_structure",
              status: "ativa",
              updated_at: new Date().toISOString()
            }, { onConflict: "id" });
        } catch (subErr) {}
      }
    } catch (err) {
      console.warn("Exception updating configuracoes_sistema in Supabase:", err);
    }
  }

  try {
    localStorage.setItem("NUCLEO_SYSTEM_STRUCTURE_CONFIG", JSON.stringify(configRecord));
  } catch (e) {}

  // 4. Trigger Realtime Notifications to all client terminals
  await notifyRealtimeSync("global", "system_structure_published", configRecord);
  await notifyRealtimeSync("global", "structure_applied", configRecord);
  await notifyRealtimeSync("global", "products_updated", structureSnapshot);

  return { success: true, countPublished };
}

export async function dbGetSystemConfig(): Promise<any | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("configuracoes_sistema")
        .select("*")
        .eq("id", "global_structure")
        .maybeSingle();
      if (!error && data) {
        return data;
      }
    } catch (e) {}
  }
  try {
    const local = localStorage.getItem("NUCLEO_SYSTEM_STRUCTURE_CONFIG");
    if (local) return JSON.parse(local);
  } catch (e) {}
  return null;
}

export async function dbGetCatalogProducts(userId: string): Promise<CatalogProduct[]> {
  const isAdmin = isSystemAdminUser();

  // 1. Primary: fetch through secure server API with service_role to avoid RLS 42501
  try {
    const res = await fetch(`/api/products?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list = isAdmin ? json.data : json.data.filter((p: any) => p.status !== "rascunho" && !p.is_draft);
        try {
          localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(list));
        } catch (e) {}
        return list;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/products GET error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const mapped: CatalogProduct[] = data.map((d: any) => {
          const cost = Number(d.cost_price ?? d.costPrice ?? d.preco_custo ?? d.valor_custo ?? 0);
          const sale = Number(d.sale_price ?? d.salePrice ?? d.preco_venda ?? d.valor_venda ?? 0);
          return {
            id: d.id,
            description: d.description || d.name || d.nome || d.descricao || "",
            costPrice: cost,
            salePrice: sale,
            profit: Number(d.profit ?? d.lucro ?? (sale - cost)),
            minStock: Number(d.min_stock ?? d.minStock ?? d.estoque_minimo ?? 0),
            currentStock: Number(d.current_stock ?? d.currentStock ?? d.estoque_atual ?? 0),
            status: d.status || "ativo",
            is_draft: !!d.is_draft || d.status === "rascunho"
          };
        });
        const filtered = isAdmin ? mapped : mapped.filter((p: any) => p.status !== "rascunho" && !p.is_draft);
        try {
          localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(filtered));
        } catch (e) {}
        return filtered;
      }
    } catch (e) {
      console.warn("Direct Supabase produtos fetch error:", e);
    }
  }

  // 3. Fallback: LocalStorage
  try {
    const localStr = localStorage.getItem("NUCLEO_PRODUCTS");
    if (localStr) {
      const parsed = JSON.parse(localStr);
      if (!isAdmin) {
        return parsed.filter((p: any) => p.status !== "rascunho" && !p.is_draft);
      }
      return parsed;
    }
  } catch (e) {}

  return [];
}

export async function dbSaveCatalogProduct(userId: string, product: CatalogProduct): Promise<boolean> {
  const isAdmin = isSystemAdminUser();
  // Se for o administrador sistemadevendaadm@gmail.com, salva como 'rascunho' a menos que já esteja ativo
  const finalStatus = product.status || (isAdmin ? "rascunho" : "ativo");
  const finalDraft = product.is_draft !== undefined ? product.is_draft : (isAdmin && finalStatus === "rascunho");
  const effectiveProduct: CatalogProduct = {
    ...product,
    status: finalStatus,
    is_draft: finalDraft
  };

  // Update local storage mirror first for instant UI response
  try {
    const localStr = localStorage.getItem("NUCLEO_PRODUCTS");
    let list: CatalogProduct[] = localStr ? JSON.parse(localStr) : [];
    const idx = list.findIndex(p => p.id === effectiveProduct.id);
    if (idx >= 0) list[idx] = effectiveProduct;
    else list.unshift(effectiveProduct);
    localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(list));
  } catch (e) {}

  // 1. Primary: save through secure server API with service_role to avoid RLS 42501
  try {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, product: effectiveProduct })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        notifyRealtimeSync(userId, "products_updated", { product: effectiveProduct });
        notifyRealtimeSync("global", "products_updated", { product: effectiveProduct });
        return true;
      }
    }
  } catch (apiErr) {
    console.warn("Direct /api/products POST error, falling back to direct client:", apiErr);
  }

  // 2. Fallback: direct Supabase client
  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    const ptPayload = {
      id: effectiveProduct.id,
      user_id: userId,
      nome: effectiveProduct.description,
      description: effectiveProduct.description,
      preco_custo: effectiveProduct.costPrice,
      preco_venda: effectiveProduct.salePrice,
      lucro: effectiveProduct.profit,
      estoque_minimo: effectiveProduct.minStock,
      estoque_atual: effectiveProduct.currentStock,
      status: finalStatus,
      is_draft: finalDraft
    };
    const { error } = await supabase.from("produtos").upsert(ptPayload);
    if (!error) {
      notifyRealtimeSync(userId, "products_updated", { product: effectiveProduct });
      notifyRealtimeSync("global", "products_updated", { product: effectiveProduct });
      return true;
    }
  } catch (e) {}

  notifyRealtimeSync(userId, "products_updated", { product: effectiveProduct });
  notifyRealtimeSync("global", "products_updated", { product: effectiveProduct });
  return true;
}

export async function dbDeleteCatalogProduct(userId: string, productId: string): Promise<boolean> {
  try {
    const localStr = localStorage.getItem("NUCLEO_PRODUCTS");
    if (localStr) {
      const list: CatalogProduct[] = JSON.parse(localStr);
      localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(list.filter(p => p.id !== productId)));
    }
  } catch (e) {}

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      notifyRealtimeSync(userId, "products_updated", { deletedId: productId });
      notifyRealtimeSync("global", "products_updated", { deletedId: productId });
      return true;
    }
  } catch (apiErr) {
    console.warn("Direct /api/products DELETE error, falling back to direct client:", apiErr);
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("produtos").delete().eq("id", productId).eq("user_id", userId);
    } catch (e) {}
  }

  notifyRealtimeSync(userId, "products_updated", { deletedId: productId });
  notifyRealtimeSync("global", "products_updated", { deletedId: productId });
  return true;
}

export async function dbUpdateProductStock(ownerId: string, productId: string, newStock: number): Promise<boolean> {
  // Update local storage mirror
  try {
    const localStr = localStorage.getItem("NUCLEO_PRODUCTS");
    if (localStr) {
      const list: CatalogProduct[] = JSON.parse(localStr);
      const item = list.find(p => p.id === productId);
      if (item) {
        item.currentStock = newStock;
        localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(list));
        fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: ownerId, product: item })
        }).catch(() => {});
      }
    }
  } catch (e) {}

  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    // Attempt updating in Portuguese table scheme first:
    const { error: ptError } = await supabase
      .from("produtos")
      .update({ estoque_atual: newStock })
      .eq("id", productId)
      .eq("user_id", ownerId);

    if (!ptError) {
      notifyRealtimeSync(ownerId, "products_updated", { productId, newStock });
      notifyRealtimeSync("global", "products_updated", { productId, newStock });
      return true;
    }

    // Try fallback english column name if Portuguese fails:
    const { error: enError } = await supabase
      .from("produtos")
      .update({ current_stock: newStock })
      .eq("id", productId)
      .eq("user_id", ownerId);

    notifyRealtimeSync(ownerId, "products_updated", { productId, newStock });
    notifyRealtimeSync("global", "products_updated", { productId, newStock });
    return !enError;
  } catch (err) {
    console.error("Error updating product stock in Supabase:", err);
    return false;
  }
}

export function isCashSessionActiveOrOpen(row: any): boolean {
  if (!row || typeof row !== "object") return false;

  const statusRaw = String(row.status || row.situacao || row.estado || "").toLowerCase().trim();

  // Explicit closed / finished indicators
  if (
    statusRaw === "fechado" ||
    statusRaw === "fechada" ||
    statusRaw === "closed" ||
    statusRaw === "encerrado" ||
    statusRaw === "encerrada" ||
    statusRaw === "finalizado" ||
    statusRaw === "finalizada" ||
    statusRaw === "inativo" ||
    statusRaw === "cancelado" ||
    statusRaw === "cancelada"
  ) {
    return false;
  }

  // Explicit open / active indicators
  if (
    statusRaw === "aberto" ||
    statusRaw === "aberta" ||
    statusRaw === "ativo" ||
    statusRaw === "ativa" ||
    statusRaw === "open" ||
    statusRaw === "em_aberto" ||
    statusRaw === "em aberto" ||
    statusRaw === "abertos" ||
    statusRaw.includes("abert") ||
    statusRaw.includes("ativ")
  ) {
    return true;
  }

  // Explicit boolean indicators
  if (row.aberto === true || row.ativo === true || row.is_open === true) {
    return true;
  }

  // If no closing date is present, and there is an opening date or opening value or id, it is an open session
  if (!row.data_fechamento && !row.fechado_em && !row.closed_at) {
    if (row.data_abertura || row.valor_abertura !== undefined || row.id || row.created_at) {
      return true;
    }
  }

  return false;
}

export function isCashSessionExplicitlyClosed(row: any): boolean {
  if (!row || typeof row !== "object") return false;
  const statusRaw = String(row.status || row.situacao || row.estado || "").toLowerCase().trim();
  if (
    statusRaw === "fechado" ||
    statusRaw === "fechada" ||
    statusRaw === "closed" ||
    statusRaw === "encerrado" ||
    statusRaw === "encerrada" ||
    statusRaw === "finalizado" ||
    statusRaw === "finalizada" ||
    statusRaw === "inativo" ||
    statusRaw === "cancelado" ||
    statusRaw === "cancelada"
  ) {
    return true;
  }
  if (row.aberto === false || row.ativo === false || row.is_open === false) {
    return true;
  }
  if (row.data_fechamento || row.fechado_em || row.closed_at) {
    return true;
  }
  return false;
}

export async function dbGetCashRegister(userId: string): Promise<CashRegisterState | null> {
  // 1. Primary: fetch through secure server API with service_role to avoid RLS/table discrepancies across machines
  if (userId) {
    try {
      const res = await fetch(`/api/cash-register?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data as CashRegisterState;
        }
      }
    } catch (apiErr) {
      console.warn("Direct /api/cash-register GET error, falling back to direct client:", apiErr);
    }
  }

  const supabase = getSupabase();
  let effectiveUserId = userId;
  if (supabase?.auth) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        effectiveUserId = authData.user.id;
      }
    } catch (e) {}
  }

  // 2. Real table: check public.sessoes_caixa for any active open session
  if (supabase) {
    try {
      const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
      const { data: openSessions, error: sessErr } = await supabase
        .from("sessoes_caixa")
        .select("*")
        .eq("status", "aberto")
        .eq("empresa_id", UNIFIED_EMPRESA_ID)
        .order("data_abertura", { ascending: false })
        .limit(10);

      if (!sessErr && openSessions && openSessions.length > 0) {
        const sessRow = openSessions.find((s: any) => isCashSessionActiveOrOpen(s));
        if (sessRow) {
          // Fetch history from public.historico_caixas
          let historyItems: CashRegisterSession[] = [];
          try {
            const { data: histRows } = await supabase
              .from("historico_caixas")
              .select("*")
              .order("data_fechamento", { ascending: false })
              .limit(50);
            if (histRows && histRows.length > 0) {
              historyItems = histRows.map((h: any) => {
                if (h.dados_completos_json && typeof h.dados_completos_json === "object") {
                  return {
                    id: h.id || h.dados_completos_json.id,
                    ...h.dados_completos_json
                  };
                }
                return {
                  id: h.id,
                  status: "fechado",
                  valorAbertura: 0,
                  dataAbertura: h.data_fechamento,
                  operador: "Operador",
                  dataFechamento: h.data_fechamento,
                  valorFechamentoReal: Number(h.saldo_final) || 0,
                  valorFechamentoEsperado: Number(h.saldo_final) || 0,
                  observacoes: ""
                };
              });
            }
          } catch (hErr) {}

          const openState: CashRegisterState = {
            currentSession: {
              id: sessRow.id || sessRow.session_id || `session_${Date.now()}`,
              status: "aberto",
              valorAbertura: Number(sessRow.valor_abertura ?? sessRow.valor_inicial ?? sessRow.fundo_troco) || 0,
              dataAbertura: sessRow.data_abertura || new Date().toISOString(),
              operador: sessRow.operador || sessRow.usuario || "Operador"
            },
            history: historyItems
          };
          return openState;
        }
      }
    } catch (sessEx) {
      console.warn("Notice: sessoes_caixa query in dbGetCashRegister:", sessEx);
    }
  }

  // 2. Fallback: direct Supabase client sales table
  if (!supabase) return null;

  try {
    let { data, error } = await supabase
      .from("sales")
      .select("items")
      .eq("id", `cash_register_state_${effectiveUserId}`)
      .maybeSingle();

    if (!data?.items) {
      const { data: legacyData, error: legacyErr } = await supabase
        .from("sales")
        .select("items")
        .eq("id", "cash_register_state")
        .eq("user_id", effectiveUserId)
        .maybeSingle();
      if (legacyData?.items) {
        data = legacyData;
        error = null;
      } else if (!error && legacyErr) {
        error = legacyErr;
      }
    }

    // 3. Fallback attempt: if not found with userId, try with current auth UID if different
    if ((!data || !data.items) && supabase.auth) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id && authData.user.id !== userId) {
          const authId = authData.user.id;
          const { data: authScopedData } = await supabase
            .from("sales")
            .select("items")
            .eq("id", `cash_register_state_${authId}`)
            .maybeSingle();
          if (authScopedData?.items) {
            data = authScopedData;
            error = null;
          } else {
            const { data: authLegacyData } = await supabase
              .from("sales")
              .select("items")
              .eq("id", "cash_register_state")
              .eq("user_id", authId)
              .maybeSingle();
            if (authLegacyData?.items) {
              data = authLegacyData;
              error = null;
            }
          }
        }
      } catch (authErr) {
        // ignore fallback error
      }
    }

    if (error) {
      console.warn("Notice: could not fetch remote cash register state from Supabase:", error.message || error);
      return null;
    }

    // 4. Team-wide active check: If no open session found yet, check if ANY user/attendant in the company has an open session
    const currentActiveSession = (data?.items as any)?.currentSession;
    if (!currentActiveSession || currentActiveSession.status !== "aberto") {
      try {
        const { data: teamRows } = await supabase
          .from("sales")
          .select("items")
          .eq("client_name", "CASH_REGISTER_SYNCED_STATE")
          .order("date", { ascending: false })
          .limit(10);

        if (teamRows && teamRows.length > 0) {
          const openRow = teamRows.find((r: any) => r.items?.currentSession?.status === "aberto");
          if (openRow && openRow.items) {
            data = openRow;
          }
        }
      } catch (teamErr) {
        // Ignore team check error
      }
    }

    // 5. Auxiliary table check: if still no open session, verify if fluxo_caixa has an open session today
    const activeSessionNow = (data?.items as any)?.currentSession;
    if (!activeSessionNow || activeSessionNow.status !== "aberto") {
      const tableNames = ["fluxo_caixa", "fluxo_de_caixa", "fluxo_caixas", "fluxo_de_caixas"];
      for (const tableName of tableNames) {
        try {
          const { data: fluxoRows } = await supabase
            .from(tableName)
            .select("*")
            .eq("status", "aberto")
            .order("updated_at", { ascending: false })
            .limit(1);

          if (fluxoRows && fluxoRows.length > 0) {
            const row = fluxoRows[0];
            const reconstructedState: CashRegisterState = {
              currentSession: {
                id: row.session_id || `session_${row.data || "hoje"}`,
                status: "aberto",
                valorAbertura: Number(row.valor_abertura) || 0,
                dataAbertura: row.data_abertura || row.created_at || new Date().toISOString(),
                operador: row.operador || "Operador"
              },
              history: (data?.items as any)?.history || []
            };
            return reconstructedState;
          }
        } catch (fluxoErr) {
          // Continue to next table
        }
      }
    }

    if (!data || !data.items) {
      return null;
    }

    let parsed = data.items;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch (e) {}
    }
    return parsed as unknown as CashRegisterState;
  } catch (err) {
    console.warn("Notice: get cash register state exception:", err);
    return null;
  }
}

export async function dbSaveCashRegister(userId: string, state: CashRegisterState): Promise<boolean> {
  const nowISO = new Date().toISOString();
  const supabase = getSupabase();

  // Instant local persist as immediate source-of-truth protection
  try {
    localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", nowISO);
    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(state));
  } catch (e) {
    console.warn("Storage write failed:", e);
  }

  // Determine authoritative Auth UID
  let effectiveUserId = userId;
  if (supabase?.auth) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        effectiveUserId = authData.user.id;
      }
    } catch (e) {}
  }

  // 1. Primary: save through secure server API with service_role to broadcast SSE and save reliably
  let serverSaved = false;
  if (effectiveUserId) {
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: effectiveUserId, state })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          serverSaved = true;
        }
      }
    } catch (apiErr) {
      console.warn("Direct /api/cash-register POST error, continuing with direct client fallback:", apiErr);
    }
  }

  // 2. Real table: synchronize public.sessoes_caixa and public.historico_caixas
  if (supabase) {
    try {
      const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
      if (state.currentSession && state.currentSession.status === "aberto") {
        const isUUID = typeof state.currentSession.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.currentSession.id);
        if (isUUID) {
          await supabase.from("sessoes_caixa").upsert({
            id: state.currentSession.id,
            empresa_id: UNIFIED_EMPRESA_ID,
            status: "aberto",
            valor_abertura: state.currentSession.valorAbertura || 0,
            data_abertura: state.currentSession.dataAbertura || nowISO
          });
        }
      } else if (!state.currentSession) {
        // NUNCA fechar todas as sessões inadvertidamente!
        // Apenas marcar como fechado se houver uma sessão explicitamente encerrada recentemente no histórico
        const lastClosed = state.history && state.history.length > 0 ? state.history[0] : null;
        if (lastClosed && lastClosed.id && lastClosed.dataFechamento) {
          const closedRecently = (Date.now() - new Date(lastClosed.dataFechamento).getTime()) < 10 * 60 * 1000;
          if (closedRecently) {
            await supabase.from("sessoes_caixa").update({
              status: "fechado",
              data_fechamento: lastClosed.dataFechamento || nowISO
            }).eq("id", lastClosed.id);
          }
        }

        if (state.history && state.history.length > 0) {
          const lastClosed = state.history[0];
          const isUUID = typeof lastClosed.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastClosed.id);
          await supabase.from("historico_caixas").upsert({
            ...(isUUID ? { id: lastClosed.id } : {}),
            usuario_id: "62f892b2-3855-4ae9-8b2d-42d4b6223815",
            data_fechamento: lastClosed.dataFechamento || nowISO,
            total_vendas: Number((lastClosed as any).totalVendas || 0),
            total_despesas: Number((lastClosed as any).totalDespesas || 0),
            saldo_final: Number(lastClosed.valorFechamentoReal || 0),
            dados_completos_json: lastClosed
          });
        }
      }
    } catch (sessErr) {
      console.warn("Notice: syncing sessoes_caixa/historico_caixas:", sessErr);
    }
  }

  // 3. Direct Supabase client sales row
  if (supabase) {
    const createPayload = (rowId: string, uid: string) => ({
      id: rowId,
      user_id: uid,
      client_name: "CASH_REGISTER_SYNCED_STATE",
      client_phone: "CASH_REGISTER",
      items: state as any,
      total_value: 0,
      is_budget: true,
      operation_cost: 0,
      balance_due: 0,
      net_profit: 0,
      discount: 0,
      down_payment: 0,
      motoboy_cost: 0,
      date: nowISO
    });

    try {
      const scopedPayload = createPayload(`cash_register_state_${effectiveUserId}`, effectiveUserId);
      await supabase.from("sales").upsert(scopedPayload);
    } catch (err) {}
  }

  // 4. Instant multi-terminal broadcast via notifyRealtimeSync & local event
  notifyRealtimeSync(effectiveUserId, "cash_register_updated", { state });
  notifyRealtimeSync("global", "cash_register_updated", { state });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: { state } }));
  }

  return true;
}

// ==========================================
// CLIENTES (CUSTOMERS) MULTI-TENANT ISOLATION HELPERS
// ==========================================

export async function dbGetClientes(ownerId?: string): Promise<any[] | null> {
  // 1. Primary: fetch through secure server API with service_role to avoid RLS 42501
  if (ownerId) {
    try {
      const res = await fetch(`/api/clientes?userId=${encodeURIComponent(ownerId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          try {
            localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(json.data));
            localStorage.setItem("NUCLEO_CLIENTS_FALLBACK_" + ownerId, JSON.stringify(json.data));
          } catch (e) {}
          return json.data;
        }
      }
    } catch (apiErr) {
      console.warn("Direct /api/clientes GET error, falling back to direct client:", apiErr);
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    try {
      const localData = localStorage.getItem("NUCLEO_CLIENTS_FALLBACK_" + ownerId) || localStorage.getItem("NUCLEO_CLIENTS");
      return localData ? JSON.parse(localData) : [];
    } catch (e) {
      return [];
    }
  }

  try {
    let targetUserId = ownerId;
    if (!targetUserId) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error("Multi-tenant Auth Verification Failure (Select Clientes):", authError);
        return null;
      }
      targetUserId = authData.user.id;
    }

    // Fetch records filtered by target user/company owner id
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("user_id", targetUserId);

    if (error) {
      console.warn("Error selecting from clientes table, falling back to local storage:", error.message);
      try {
        const localData = localStorage.getItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId) || localStorage.getItem("NUCLEO_CLIENTS");
        return localData ? JSON.parse(localData) : [];
      } catch (e) {
        return [];
      }
    }

    return data || [];
  } catch (err: any) {
    console.warn("Exception in dbGetClientes, falling back to local storage:", err);
    try {
      const targetUserId = ownerId || (await supabase.auth.getUser())?.data?.user?.id;
      if (targetUserId) {
        const localData = localStorage.getItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId) || localStorage.getItem("NUCLEO_CLIENTS");
        return localData ? JSON.parse(localData) : [];
      }
    } catch (e) {}
    return [];
  }
}

export async function dbSaveCliente(cliente: any, ownerId?: string): Promise<boolean> {
  // Update local storage mirror first for instant UI response
  try {
    const targetUserId = ownerId || "default";
    const localDataStr = localStorage.getItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId) || localStorage.getItem("NUCLEO_CLIENTS");
    let list: any[] = localDataStr ? JSON.parse(localDataStr) : [];
    const index = list.findIndex(c => c.id === cliente.id);
    if (index >= 0) list[index] = { ...cliente, user_id: targetUserId };
    else list.unshift({ ...cliente, user_id: targetUserId });
    localStorage.setItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId, JSON.stringify(list));
    localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(list));
  } catch (e) {}

  // 1. Primary: save through secure server API with service_role to avoid RLS 42501
  if (ownerId) {
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ownerId, cliente })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          notifyRealtimeSync(ownerId, "clients_updated", { cliente });
          notifyRealtimeSync("global", "clients_updated", { cliente });
          return true;
        }
      }
    } catch (apiErr) {
      console.warn("Direct /api/clientes POST error, falling back to direct client:", apiErr);
    }
  }

  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    let targetUserId = ownerId;
    if (!targetUserId) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error("Multi-tenant Auth Verification Failure (Insert Clientes):", authError);
        return false;
      }
      targetUserId = authData.user.id;
    }

    const payload = {
      ...cliente,
      user_id: targetUserId,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("clientes")
      .upsert(payload);

    notifyRealtimeSync(targetUserId, "clients_updated", { cliente: payload });
    notifyRealtimeSync("global", "clients_updated", { cliente: payload });
    return !error;
  } catch (err) {
    console.warn("Exception in dbSaveCliente:", err);
    return true;
  }
}

export async function dbDeleteCliente(clienteId: string, ownerId?: string): Promise<boolean> {
  // Update local storage mirror
  try {
    const targetUserId = ownerId || "default";
    const localDataStr = localStorage.getItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId) || localStorage.getItem("NUCLEO_CLIENTS");
    if (localDataStr) {
      let list: any[] = JSON.parse(localDataStr);
      list = list.filter(c => c.id !== clienteId);
      localStorage.setItem("NUCLEO_CLIENTS_FALLBACK_" + targetUserId, JSON.stringify(list));
      localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(list));
    }
  } catch (e) {}

  // 1. Primary: delete through secure server API
  if (ownerId) {
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}?userId=${encodeURIComponent(ownerId)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        notifyRealtimeSync(ownerId, "clients_updated", { deletedId: clienteId });
        notifyRealtimeSync("global", "clients_updated", { deletedId: clienteId });
        return true;
      }
    } catch (apiErr) {
      console.warn("Direct /api/clientes DELETE error, falling back to direct client:", apiErr);
    }
  }

  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    let targetUserId = ownerId;
    if (!targetUserId) {
      const { data: authData } = await supabase.auth.getUser();
      targetUserId = authData?.user?.id;
    }

    if (targetUserId) {
      await supabase
        .from("clientes")
        .delete()
        .eq("id", clienteId)
        .eq("user_id", targetUserId);
    }

    notifyRealtimeSync(targetUserId || "global", "clients_updated", { deletedId: clienteId });
    notifyRealtimeSync("global", "clients_updated", { deletedId: clienteId });
    return true;
  } catch (err) {
    console.warn("Exception in dbDeleteCliente:", err);
    return true;
  }
}

// ==========================================
// GLOBAL CASH REGISTER LOGISTICS (WITHOUT LOCALSTORAGE)
// ==========================================

export async function dbCheckGlobalCashRegister(userId: string): Promise<boolean> {
  // 1. Primary: check canonical cash register state via dbGetCashRegister (which calls /api/cash-register first)
  try {
    const state = await dbGetCashRegister(userId);
    if (state?.currentSession && isCashSessionActiveOrOpen(state.currentSession)) {
      console.log(`[dbCheckGlobalCashRegister] Open session active in cash_register_state for user ${userId}`);
      return true;
    }
  } catch (err) {}

  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    let effectiveUserId = userId;
    if (supabase.auth) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          effectiveUserId = authData.user.id;
        }
      } catch (e) {}
    }

    // 2. Real table check on public.sessoes_caixa for any active session
    try {
      const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
      const { data: sessData, error: sessErr } = await supabase
        .from("sessoes_caixa")
        .select("*")
        .eq("status", "aberto")
        .eq("empresa_id", UNIFIED_EMPRESA_ID)
        .order("data_abertura", { ascending: false })
        .limit(5);

      if (!sessErr && sessData && sessData.length > 0) {
        const openItem = sessData.find((s: any) => isCashSessionActiveOrOpen(s));
        if (openItem) {
          console.log(`[dbCheckGlobalCashRegister] Open/active session found in sessoes_caixa:`, openItem.id);
          return true;
        }
      }
    } catch (err) {
      console.warn("[dbCheckGlobalCashRegister] sessoes_caixa check notice:", err);
    }

    return false;
  } catch (err) {
    console.error("Exception in dbCheckGlobalCashRegister:", err);
    return false;
  }
}

export async function dbOpenGlobalCashRegister(userId: string, session: any): Promise<boolean> {
  const supabase = getSupabase();
  let effectiveUserId = userId;
  if (supabase?.auth) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        effectiveUserId = authData.user.id;
      }
    } catch (e) {}
  }

  const nowISO = new Date().toISOString();

  // 1. Primary: open via server API with service_role privileges
  try {
    const apiRes = await fetch("/api/cash-register/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: effectiveUserId,
        session,
        state: { currentSession: session }
      })
    });
    if (apiRes.ok) {
      console.log("[dbOpenGlobalCashRegister] Successfully opened register via server API");
    }
  } catch (apiErr) {
    console.warn("[dbOpenGlobalCashRegister] /api/cash-register/open notice:", apiErr);
  }

  // 2. Direct client backup: upsert into public.sessoes_caixa
  if (supabase) {
    try {
      const isUUID = typeof session.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
      if (isUUID) {
        const { error: sessErr } = await supabase
          .from("sessoes_caixa")
          .upsert({
            id: session.id,
            empresa_id: "62f892b2-3855-4ae9-8b2d-42d4b6223815",
            status: "aberto",
            valor_abertura: session.valorAbertura || 0,
            data_abertura: session.dataAbertura || nowISO
          });
        if (!sessErr) {
          console.log("[dbOpenGlobalCashRegister] Successfully opened register in sessoes_caixa");
        }
      }
    } catch (e) {}

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const payload = {
      user_id: effectiveUserId,
      company_id: effectiveUserId,
      data: todayStr,
      data_abertura: session.dataAbertura || nowISO,
      valor_abertura: session.valorAbertura || 0,
      operador: session.operador || "Operador",
      status: "aberto",
      session_id: session.id,
      updated_at: nowISO
    };

    const tableNames = ["fluxo_caixa", "fluxo_de_caixa", "fluxo_caixas", "fluxo_de_caixas"];
    for (const tableName of tableNames) {
      try {
        const { error } = await supabase
          .from(tableName)
          .upsert(payload, { onConflict: "user_id,data" });

        if (!error) {
          console.log(`[dbOpenGlobalCashRegister] Successfully opened register in ${tableName}`);
        }
      } catch (err) {
        // Try next
      }
    }
  }

  // 2. Realtime notification broadcast
  notifyRealtimeSync(effectiveUserId, "cash_register_updated", { session, isOpen: true, state: { currentSession: session } });
  notifyRealtimeSync("global", "cash_register_updated", { session, isOpen: true, state: { currentSession: session } });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: { session, isOpen: true, state: { currentSession: session } } }));
  }

  return true;
}

export async function dbCloseGlobalCashRegister(userId: string, sessionId?: string, closingData: any = {}): Promise<boolean> {
  const supabase = getSupabase();
  let effectiveUserId = userId;
  if (supabase?.auth) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        effectiveUserId = authData.user.id;
      }
    } catch (e) {}
  }

  const nowISO = new Date().toISOString();
  const safeClosingData = closingData || {};

  // 0. High priority server-side closure with service_role privileges
  try {
    await fetch("/api/cash-register/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: effectiveUserId || "62f892b2-3855-4ae9-8b2d-42d4b6223815",
        closingData: { id: sessionId, ...safeClosingData }
      })
    });
  } catch (apiErr) {
    console.warn("[dbCloseGlobalCashRegister] /api/cash-register/close fallback notice:", apiErr);
  }

  // 1. Primary: update public.sessoes_caixa using empresa_id
  if (supabase) {
    try {
      await supabase
        .from("sessoes_caixa")
        .update({
          status: "fechado",
          data_fechamento: safeClosingData.dataFechamento || nowISO
        })
        .eq("empresa_id", "62f892b2-3855-4ae9-8b2d-42d4b6223815")
        .eq("status", "aberto");
      console.log("[dbCloseGlobalCashRegister] Successfully marked sessoes_caixa as fechado");
    } catch (e) {}

    // 2. Primary: record in public.historico_caixas
    try {
      const isUUID = typeof sessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
      await supabase
        .from("historico_caixas")
        .upsert({
          ...(isUUID ? { id: sessionId } : {}),
          usuario_id: "62f892b2-3855-4ae9-8b2d-42d4b6223815",
          data_fechamento: safeClosingData.dataFechamento || nowISO,
          total_vendas: Number(safeClosingData.totalVendas || 0),
          total_despesas: Number(safeClosingData.totalDespesas || 0),
          saldo_final: Number(safeClosingData.valorFechamentoReal || 0),
          dados_completos_json: {
            id: sessionId,
            status: "fechado",
            valorAbertura: safeClosingData.valorAbertura || 0,
            dataAbertura: safeClosingData.dataAbertura || nowISO,
            operador: safeClosingData.operador || "Operador",
            dataFechamento: safeClosingData.dataFechamento || nowISO,
            valorFechamentoReal: safeClosingData.valorFechamentoReal || 0,
            valorFechamentoEsperado: safeClosingData.valorFechamentoEsperado || 0,
            observacoes: safeClosingData.observacoes || ""
          }
        });
      console.log("[dbCloseGlobalCashRegister] Successfully logged closing to historico_caixas");
    } catch (e) {}

    const payload = {
      status: "fechado",
      valor_fechamento_esperado: safeClosingData.valorFechamentoEsperado || 0,
      valor_fechamento_real: safeClosingData.valorFechamentoReal || 0,
      data_fechamento: safeClosingData.dataFechamento || nowISO,
      observacoes: safeClosingData.observacoes || "",
      updated_at: nowISO
    };

    const tableNames = ["fluxo_caixa", "fluxo_de_caixa", "fluxo_caixas", "fluxo_de_caixas"];
    for (const tableName of tableNames) {
      try {
        await supabase
          .from(tableName)
          .update(payload)
          .or(`user_id.eq.${effectiveUserId},company_id.eq.${effectiveUserId}`)
          .eq("status", "aberto");
      } catch (err) {}
    }
  }

  // 3. Realtime notification broadcast
  notifyRealtimeSync(effectiveUserId, "cash_register_updated", { closed: true, sessionId });
  notifyRealtimeSync("global", "cash_register_updated", { closed: true, sessionId });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: { closed: true, sessionId } }));
  }

  return true;
}

export async function dbGetSupportFeedbacks(userId?: string): Promise<SupportFeedback[]> {
  const supabase = getSupabase();
  let localFeedbacks: SupportFeedback[] = [];
  try {
    const saved = localStorage.getItem("NUCLEO_SUPPORT_FEEDBACKS");
    if (saved) {
      localFeedbacks = JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to parse local support feedbacks", e);
  }

  if (!supabase) {
    if (userId) {
      return localFeedbacks.filter(f => f.user_id === userId);
    }
    return localFeedbacks;
  }

  try {
    let query = supabase.from("support_feedbacks").select("*").order("created_at", { ascending: false });
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("Could not query support_feedbacks from Supabase, falling back to local storage.", error);
      if (userId) {
        return localFeedbacks.filter(f => f.user_id === userId);
      }
      return localFeedbacks;
    }

    const remoteFeedbacks = data || [];
    const merged = [...remoteFeedbacks];
    localFeedbacks.forEach(lf => {
      if (!merged.some(rf => rf.id === lf.id)) {
        merged.push(lf);
      }
    });
    localStorage.setItem("NUCLEO_SUPPORT_FEEDBACKS", JSON.stringify(merged));

    return remoteFeedbacks;
  } catch (err) {
    console.error("Exception in dbGetSupportFeedbacks, falling back:", err);
    if (userId) {
      return localFeedbacks.filter(f => f.user_id === userId);
    }
    return localFeedbacks;
  }
}

export async function dbSaveSupportFeedback(userId: string, userName: string, audioUrl: string, message?: string): Promise<SupportFeedback | null> {
  const feedbackId = Math.random().toString(36).substring(2, 11);
  const newFeedback: SupportFeedback = {
    id: feedbackId,
    user_id: userId,
    user_name: userName,
    audio_url: audioUrl,
    message: message,
    created_at: new Date().toISOString()
  };

  try {
    const saved = localStorage.getItem("NUCLEO_SUPPORT_FEEDBACKS") || "[]";
    const list = JSON.parse(saved);
    list.unshift(newFeedback);
    localStorage.setItem("NUCLEO_SUPPORT_FEEDBACKS", JSON.stringify(list));
  } catch (e) {
    console.error("Failed to save support feedback to local storage", e);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return newFeedback;
  }

  try {
    // Attempt inserting with message column if provided
    const insertPayload: any = {
      id: newFeedback.id,
      user_id: newFeedback.user_id,
      user_name: newFeedback.user_name,
      audio_url: newFeedback.audio_url,
      created_at: newFeedback.created_at
    };
    if (message) {
      insertPayload.message = message;
    }

    const { data, error } = await supabase
      .from("support_feedbacks")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      // If error is related to missing column "message", retry without it, encoding the text in audio_url
      if (message && (error.message?.includes("column") || error.message?.includes("message"))) {
        console.warn("Table support_feedbacks does not have 'message' column. Falling back to storing in audio_url.");
        const fallbackAudioUrl = `text:${message}`;
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("support_feedbacks")
          .insert({
            id: newFeedback.id,
            user_id: newFeedback.user_id,
            user_name: newFeedback.user_name,
            audio_url: fallbackAudioUrl,
            created_at: newFeedback.created_at
          })
          .select()
          .single();

        if (fallbackError) {
          console.warn("Fallback insert failed:", fallbackError);
          return newFeedback;
        }
        return fallbackData || newFeedback;
      }

      console.warn("Could not insert support_feedback in Supabase, cached in local storage.", error);
      return newFeedback;
    }
    return data || newFeedback;
  } catch (err) {
    console.error("Exception in dbSaveSupportFeedback:", err);
    return newFeedback;
  }
}

export async function dbSubmitAdminResponse(feedbackId: string, respostaAdmin: string): Promise<boolean> {
  const respondidoEm = new Date().toISOString();

  try {
    const saved = localStorage.getItem("NUCLEO_SUPPORT_FEEDBACKS") || "[]";
    const list: SupportFeedback[] = JSON.parse(saved);
    const updated = list.map(f => f.id === feedbackId ? { ...f, resposta_admin: respostaAdmin, respondido_em: respondidoEm } : f);
    localStorage.setItem("NUCLEO_SUPPORT_FEEDBACKS", JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to update support feedback in local storage", e);
  }

  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    const { error } = await supabase
      .from("support_feedbacks")
      .update({
        resposta_admin: respostaAdmin,
        respondido_em: respondidoEm
      })
      .eq("id", feedbackId);

    if (error) {
      console.warn("Could not update support_feedback response in Supabase, updated locally only.", error);
      return true;
    }
    return true;
  } catch (err) {
    console.error("Exception in dbSubmitAdminResponse:", err);
    return true;
  }
}

export async function dbGetSupportConfig(): Promise<SupportConfig> {
  const defaultConfig: SupportConfig = {
    id: "default",
    horario_inicio: "09:00",
    horario_fim: "19:00",
    mensagem_fechado: "Suporte Fechado. Nosso horário de atendimento é das 09:00 às 19:00. Deixe sua mensagem assim que abrirmos!"
  };

  try {
    const saved = localStorage.getItem("NUCLEO_SUPPORT_CONFIG");
    if (saved) {
      Object.assign(defaultConfig, JSON.parse(saved));
    }
  } catch (e) {
    console.error("Failed to parse local support config", e);
  }

  const supabase = getSupabase();
  if (!supabase) return defaultConfig;

  try {
    const { data, error } = await supabase
      .from("configuracoes_suporte")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.warn("Could not query configuracoes_suporte from Supabase, using local.", error);
      return defaultConfig;
    }

    if (data) {
      localStorage.setItem("NUCLEO_SUPPORT_CONFIG", JSON.stringify(data));
      return data;
    } else {
      try {
        await supabase.from("configuracoes_suporte").insert(defaultConfig);
      } catch (insertErr) {
        // Safe to ignore if write fails
      }
      return defaultConfig;
    }
  } catch (err) {
    console.error("Exception in dbGetSupportConfig:", err);
    return defaultConfig;
  }
}

export async function dbSaveSupportConfig(config: Partial<SupportConfig>): Promise<boolean> {
  const payload = {
    id: "default",
    horario_inicio: config.horario_inicio || "09:00",
    horario_fim: config.horario_fim || "19:00",
    mensagem_fechado: config.mensagem_fechado || "Suporte Fechado. Nosso horário de atendimento é das 09:00 às 19:00. Deixe sua mensagem assim que abrirmos!"
  };

  try {
    localStorage.setItem("NUCLEO_SUPPORT_CONFIG", JSON.stringify(payload));
  } catch (e) {
    console.error("Failed to save support config to local storage", e);
  }

  const supabase = getSupabase();
  if (!supabase) return true;

  try {
    const { error } = await supabase
      .from("configuracoes_suporte")
      .upsert(payload);

    if (error) {
      console.warn("Could not upsert configuracoes_suporte in Supabase, saved locally only.", error);
      return true;
    }
    return true;
  } catch (err) {
    console.error("Exception in dbSaveSupportConfig:", err);
    return true;
  }
}

export async function dbUploadSupportAudio(audioBlob: Blob): Promise<string | null> {
  const supabase = getSupabase();
  const fileType = audioBlob.type || "audio/wav";
  const fileExt = fileType.split("/")[1] || "wav";
  const randomId = Math.random().toString(36).substring(2, 10);
  const uniqueName = `audio_support_${Date.now()}_${randomId}.${fileExt}`;
  
  // Safe helper to read Blob as base64 data URL
  const readAsDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  if (!supabase) {
    try {
      return await readAsDataUrl(audioBlob);
    } catch {
      return null;
    }
  }

  try {
    const bucketName = "comprovantes";
    const file = new File([audioBlob], uniqueName, { type: fileType });
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) {
      console.warn("Could not upload support audio to Supabase Storage, using Base64 data URL fallback.", error);
      try {
        return await readAsDataUrl(audioBlob);
      } catch {
        return null;
      }
    }

    if (data) {
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
    return null;
  } catch (err) {
    console.error("Exception in dbUploadSupportAudio, fallback to Base64:", err);
    try {
      return await readAsDataUrl(audioBlob);
    } catch {
      return null;
    }
  }
}

export async function dbUploadSupportImage(imageBlob: Blob): Promise<string | null> {
  const supabase = getSupabase();
  const fileType = imageBlob.type || "image/png";
  const fileExt = fileType.split("/")[1] || "png";
  const randomId = Math.random().toString(36).substring(2, 10);
  const uniqueName = `image_support_${Date.now()}_${randomId}.${fileExt}`;
  
  const readAsDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  if (!supabase) {
    try {
      return await readAsDataUrl(imageBlob);
    } catch {
      return null;
    }
  }

  try {
    const bucketName = "comprovantes";
    const file = new File([imageBlob], uniqueName, { type: fileType });
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) {
      console.warn("Could not upload support image to Supabase Storage, using Base64 fallback.", error);
      try {
        return await readAsDataUrl(imageBlob);
      } catch {
        return null;
      }
    }

    if (data) {
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
    return null;
  } catch (err) {
    console.error("Exception in dbUploadSupportImage, fallback to Base64:", err);
    try {
      return await readAsDataUrl(imageBlob);
    } catch {
      return null;
    }
  }
}






