/* js/auth.js */
const { createClient } = window.supabase;

let supabase = null;
let user = null;

export async function initSupabase() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (!config.url || !config.key) throw new Error("Missing Credentials");
    
    supabase = createClient(config.url, config.key);
    
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
  
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error && error.message.includes("Invalid login")) {
    const res = await supabase.auth.signUp({ email, password });
    if (res.error) return { error: res.error };
    return { message: "Account created! Ask Admin to activate subscription." };
  }
  
  if (data.user) user = data.user;
  return { user: data.user, error };
}

export async function logout() {
  if (supabase) await supabase.auth.signOut();
  user = null;
}

export async function updateProfile(metaData) {
  if (!supabase) return { error: { message: "No connection" } };
  const { data, error } = await supabase.auth.updateUser({
    data: metaData
  });
  if (data.user) user = data.user;
  return { user: data.user, error };
}

// --- ADMIN FUNCTIONS ---
export async function getAllUsers() {
  if (!supabase) return { error: { message: "No connection" } };
  // Calls the 'get_all_users' SQL function we created
  const { data, error } = await supabase.rpc('get_all_users');
  return { data, error };
}

export async function activateUser(targetId) {
  if (!supabase) return { error: { message: "No connection" } };
  // Calls the 'activate_subscription' SQL function
  const { error } = await supabase.rpc('activate_subscription', { target_user_id: targetId });
  return { error };
}
// ---------------------

export function checkSubscription() {
  if (!user) return { valid: false, reason: "Not logged in" };
  
  const expiryStr = user.user_metadata?.subscription_expiry;
  
  if (!expiryStr) {
    return { valid: false, reason: "No active subscription found." };
  }
  
  const expiryDate = new Date(expiryStr);
  const now = new Date();
  
  if (now > expiryDate) {
    return { valid: false, reason: "Subscription expired on " + expiryDate.toLocaleDateString() };
  }
  
  const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  return { valid: true, daysLeft, expiryStr };
}

export function getUser() { return user; }
export function getClient() { return supabase; }