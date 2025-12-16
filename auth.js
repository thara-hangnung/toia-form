/* auth.js - Handles Supabase Auth */
const { createClient } = window.supabase;

let supabase = null;
let user = null;

export async function initSupabase() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (!config.url || !config.key) throw new Error("Missing Credentials");
    
    supabase = createClient(config.url, config.key);
    
    // Check active session
    const { data } = await supabase.auth.getSession();
    user = data.session?.user || null;
    return user;
  } catch (err) {
    console.error("Auth Init Error:", err);
    return null;
  }
}

export async function login(email, password) {
  if (!supabase) return { error: { message: "Supabase not initialized" } };
  
  // Try Login
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  // If user not found, try Registering
  if (error && error.message.includes("Invalid login")) {
    const res = await supabase.auth.signUp({ email, password });
    if (res.error) return { error: res.error };
    return { message: "Account created! You are logged in." };
  }
  
  if (data.user) user = data.user;
  return { user: data.user, error };
}

export async function logout() {
  if (supabase) await supabase.auth.signOut();
  user = null;
}

export function getUser() { return user; }
export function getClient() { return supabase; }