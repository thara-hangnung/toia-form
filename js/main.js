/* js/main.js */
import * as Auth from './auth.js';
import * as UI from './ui.js';
import * as PDF from './pdf-generator.js';

let currentMapping = null;
let currentTemplateBytes = null;
let currentFontBytes = null;
let currentFormId = null;
let currentFormType = "";
let currentFormName = "";
let patterns = {}; 

const OFFLINE_KEY = "offline_forms_queue";
// REPLACE THIS WITH YOUR EMAIL TO SEE THE ADMIN BUTTON
const ADMIN_EMAIL = "toia@toia.com"; 

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
  const user = await Auth.initSupabase();
  history.replaceState({ page: 'home' }, "", ""); 

  if (user) {
    verifyAndLoad();
  } else {
    UI.showScreen("auth-screen");
  }
});

// Helper: Check Sub before Loading Dashboard
function verifyAndLoad() {
  const user = Auth.getUser();
  
  // Admin Check: If you are the admin, skip sub check
  if (user.email === ADMIN_EMAIL) {
    document.getElementById("btn-admin").style.display = "block";
    loadDashboard();
    return;
  }

  const sub = Auth.checkSubscription();
  if (!sub.valid) {
    UI.showScreen("sub-screen");
    document.getElementById("sub-msg").textContent = sub.reason;
  } else {
    loadDashboard();
    syncOfflineData();
    if (sub.daysLeft < 7) UI.showToast(`Warning: Subscription ends in ${sub.daysLeft} days.`);
  }
}

// Network Status Listeners
window.addEventListener('online', () => {
  UI.showToast("Back Online! Syncing...");
  syncOfflineData();
});
window.addEventListener('offline', () => {
  UI.showToast("You are offline. Forms will be saved locally.");
});

// --- NAVIGATION ---
window.addEventListener("popstate", (event) => {
  if (!event.state || event.state.page === 'home') {
    Auth.getUser() ? verifyAndLoad() : UI.showScreen("auth-screen");
  } else if (event.state.page === 'editor') {
    UI.showScreen("form-screen");
  } else if (event.state.page === 'profile') {
    UI.showScreen("profile-screen");
  } else if (event.state.page === 'admin') {
    UI.showScreen("admin-screen");
  }
});

// --- EVENT LISTENERS ---

// Auth
document.getElementById("btn-login").onclick = async () => {
  const e = document.getElementById("email").value;
  const p = document.getElementById("password").value;
  const res = await Auth.login(e, p);
  if (res.error) document.getElementById("auth-msg").textContent = res.error.message;
  else {
    if (res.message) UI.showToast(res.message);
    verifyAndLoad();
  }
};

document.getElementById("btn-logout").onclick = async () => {
  await Auth.logout();
  UI.showScreen("auth-screen");
};

document.getElementById("btn-logout-sub").onclick = async () => {
  await Auth.logout();
  UI.showScreen("auth-screen");
};

// Profile Screen
document.getElementById("btn-profile").onclick = () => {
  history.pushState({ page: 'profile' }, "Profile", "#profile");
  loadProfile();
  UI.showScreen("profile-screen");
};
document.getElementById("btn-close-profile").onclick = () => history.back();

document.getElementById("btn-save-profile").onclick = async () => {
  const name = document.getElementById("profile-name").value;
  const phone = document.getElementById("profile-phone").value;
  const { error } = await Auth.updateProfile({ full_name: name, phone: phone });
  if (error) UI.showToast("Error: " + error.message);
  else UI.showToast("Profile Updated!");
};

// --- ADMIN SCREEN ACTIONS ---
document.getElementById("btn-admin").onclick = () => {
  history.pushState({ page: 'admin' }, "Admin", "#admin");
  loadAdminDashboard();
  UI.showScreen("admin-screen");
};
document.getElementById("btn-close-admin").onclick = () => history.back();

// Dashboard
document.querySelectorAll(".template-card").forEach(btn => {
  btn.onclick = () => loadEditor(btn.dataset.file, null);
});

document.getElementById("search-input").onkeyup = (e) => {
  const filter = e.target.value.toLowerCase();
  document.querySelectorAll(".saved-item").forEach(item => {
    item.style.display = item.innerText.toLowerCase().includes(filter) ? "" : "";
  });
};

// Editor Actions
document.getElementById("btn-back").onclick = () => window.history.back();

document.getElementById("btn-save").onclick = async () => {
  if (!UI.validateForm()) return;

  const { data, nameGuess } = UI.getFormData();
  const user = Auth.getUser();
  if (!user) return;

  const defaultName = currentFormName || nameGuess || "Untitled Form";
  const manualName = prompt("Save Form As:", defaultName);
  if (!manualName) return;

  currentFormName = manualName;
  
  const payload = {
    user_id: user.id,
    form_type: currentFormType,
    form_name: currentFormName,
    form_data: data,
    updated_at: new Date().toISOString()
  };

  if (!navigator.onLine) {
    saveOffline(payload, currentFormId);
    return;
  }

  const supabase = Auth.getClient();
  let error;
  if (currentFormId && currentFormId.startsWith("temp_")) currentFormId = null;

  if (currentFormId) {
    const res = await supabase.from('forms').update(payload).eq('id', currentFormId);
    error = res.error;
  } else {
    const res = await supabase.from('forms').insert([payload]).select();
    if (res.data) currentFormId = res.data[0].id;
    error = res.error;
  }

  if (error) UI.showToast("Error: " + error.message);
  else {
    UI.showToast("Saved Successfully!");
    loadSavedList();
  }
};

// SHARE BUTTON (Option 3)
document.getElementById("btn-share").onclick = async () => {
  if (!currentTemplateBytes) return;
  if (!UI.validateForm()) return;
  
  UI.showToast("Generating PDF...");
  
  let defaultName = (currentFormName || "filled_form").replace(".pdf", "") + ".pdf";
  const bytes = await PDF.generatePDF(
    currentMapping, currentTemplateBytes, currentFontBytes,
    (id) => { const el = document.getElementById(id); return el ? el.value : ""; }
  );
  
  const blob = new Blob([bytes], { type: "application/pdf" });
  const file = new File([blob], defaultName, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: defaultName,
        text: 'Here is the filled form.'
      });
    } catch (err) {
      console.log("Share failed:", err);
    }
  } else {
    UI.showToast("Sharing not supported on this device. Downloading instead.");
    // Fallback to download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
  }
};

document.getElementById("btn-print").onclick = async () => {
  if (!currentTemplateBytes) return;
  let defaultName = (currentFormName || "form").replace(".pdf", "") + ".pdf";
  const bytes = await PDF.generatePDF(
    currentMapping, currentTemplateBytes, currentFontBytes,
    (id) => { const el = document.getElementById(id); return el ? el.value : ""; }
  );
  
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  a.download = defaultName;
  a.click();
};

// --- ADMIN LOGIC ---
async function loadAdminDashboard() {
  const listEl = document.getElementById("admin-user-list");
  listEl.innerHTML = "Loading Users...";
  
  const { data, error } = await Auth.getAllUsers();
  
  if (error) {
    listEl.innerHTML = `<div style="color:red">Error: ${error.message} (Did you run the SQL?)</div>`;
    return;
  }
  
  listEl.innerHTML = "";
  
  data.forEach(u => {
    // Check expiry
    let expiry = u.raw_user_meta_data?.subscription_expiry;
    let isActive = false;
    let statusText = "Inactive";
    
    if (expiry) {
      const d = new Date(expiry);
      if (d > new Date()) {
        isActive = true;
        statusText = `Active until ${d.toLocaleDateString()}`;
      } else {
        statusText = `Expired on ${d.toLocaleDateString()}`;
      }
    }
    
    // Don't show activation button for self
    const isSelf = (u.email === Auth.getUser().email);
    
    const div = document.createElement("div");
    div.className = "user-list-item";
    div.innerHTML = `
      <div>
        <div class="user-email">${u.email} ${isSelf ? '(You)' : ''}</div>
        <div class="user-status ${isActive ? 'status-active' : ''}">${statusText}</div>
      </div>
      ${!isSelf ? '<button class="btn btn-outline" style="font-size:0.75rem; padding:4px 8px;">Activate 1 Yr</button>' : ''}
    `;
    
    if (!isSelf) {
      div.querySelector("button").onclick = async () => {
        if(confirm(`Activate ${u.email} for 1 year?`)) {
          UI.showToast("Activating...");
          await Auth.activateUser(u.id);
          UI.showToast("Done!");
          loadAdminDashboard(); // Refresh
        }
      };
    }
    listEl.appendChild(div);
  });
}

// --- LOGIC FUNCTIONS ---

function loadDashboard() {
  UI.showScreen("home-screen");
  loadSavedList();
  
  const user = Auth.getUser();
  const initial = (user?.user_metadata?.full_name || user?.email || "U")[0].toUpperCase();
  document.getElementById("btn-profile").textContent = initial;
}

function loadProfile() {
  const user = Auth.getUser();
  if (user && user.user_metadata) {
    document.getElementById("profile-name").value = user.user_metadata.full_name || "";
    document.getElementById("profile-phone").value = user.user_metadata.phone || "";
    
    const sub = Auth.checkSubscription();
    if (sub.valid) {
        document.getElementById("profile-sub").value = `Active (Expires: ${new Date(sub.expiryStr).toLocaleDateString()})`;
        document.getElementById("profile-sub").style.color = "green";
    } else {
        document.getElementById("profile-sub").value = "Inactive / Expired";
        document.getElementById("profile-sub").style.color = "red";
    }
  }
}

// --- OFFLINE & SYNC ---
function getOfflineForms() {
  return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
}
function saveOffline(payload, id) {
  const list = getOfflineForms();
  const formId = id || "temp_" + Date.now();
  payload.id = formId; 
  const idx = list.findIndex(f => f.id === formId);
  if (idx >= 0) list.splice(idx, 1);
  list.push(payload);
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(list));
  currentFormId = formId; 
  UI.showToast("Saved (Offline). Will sync later.");
  loadSavedList();
}
async function syncOfflineData() {
  if (!navigator.onLine) return;
  const list = getOfflineForms();
  if (list.length === 0) return;
  const statusEl = document.getElementById("sync-status");
  if(statusEl) statusEl.textContent = "Syncing...";
  const supabase = Auth.getClient();
  const failed = [];
  for (const form of list) {
    const { id, ...data } = form;
    let error;
    if (id.startsWith("temp_")) {
      const res = await supabase.from('forms').insert([data]);
      error = res.error;
    } else {
      const res = await supabase.from('forms').update(data).eq('id', id);
      error = res.error;
    }
    if (error) {
      console.error("Sync failed for", form.form_name, error);
      failed.push(form); 
    }
  }
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(failed));
  if(statusEl) statusEl.textContent = failed.length ? "Sync Incomplete" : "All Synced";
  loadSavedList();
}
async function loadSavedList() {
  const listEl = document.getElementById("saved-list");
  const supabase = Auth.getClient();
  const user = Auth.getUser();
  const offlineForms = getOfflineForms().filter(f => f.user_id === user.id);
  let onlineForms = [];
  if (navigator.onLine) {
    const { data } = await supabase.from('forms').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (data) onlineForms = data;
  }
  listEl.innerHTML = "";
  const renderItem = (form, isOffline) => {
    const div = document.createElement("div");
    div.className = "saved-item";
    const dateStr = new Date(form.updated_at).toLocaleDateString();
    const offlineTag = isOffline ? `<span class="tag-offline">Waiting to Sync</span>` : "";
    div.innerHTML = `
      <div class="saved-info">
        <strong>${form.form_name} ${offlineTag}</strong>
        <span>${form.form_type.replace(".json","").replace("mapping_","")} • ${dateStr}</span>
      </div>
      <div>
        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;">Open</button>
        ${!isOffline ? '<button class="btn-del btn-icon" style="color:var(--danger)">🗑</button>' : ''}
      </div>
    `;
    div.querySelector(".btn-outline").onclick = () => loadEditor(form.form_type, form);
    if (!isOffline) {
      div.querySelector(".btn-del").onclick = async (e) => {
        e.stopPropagation();
        if(confirm("Delete this form?")) {
          await supabase.from('forms').delete().eq('id', form.id);
          loadSavedList();
        }
      };
    }
    listEl.appendChild(div);
  };
  if (offlineForms.length === 0 && onlineForms.length === 0) {
    listEl.innerHTML = "<p style='text-align:center;color:#94a3b8; margin-top:30px;'>No saved forms yet.</p>";
    return;
  }
  offlineForms.forEach(f => renderItem(f, true));
  onlineForms.forEach(f => renderItem(f, false));
}
async function loadEditor(filename, existingData) {
  try {
    history.pushState({ page: 'editor' }, "Form Editor", "#editor");
    currentFormType = filename;
    currentFormId = existingData ? existingData.id : null;
    currentFormName = existingData ? existingData.form_name : "";
    patterns = {}; 
    const [mapping, pdfBytes, fontBytes] = await Promise.all([
      fetch(`assets/mappings/${filename}`).then(r => r.json()),
      fetch("assets/pdf/template.pdf").then(r => r.arrayBuffer()),
      fetch("assets/fonts/DejaVuSans.ttf").then(r => r.arrayBuffer()) 
    ]);
    currentMapping = mapping;
    currentTemplateBytes = pdfBytes;
    currentFontBytes = fontBytes;
    UI.renderForm(mapping, patterns);
    if (existingData) {
      UI.fillFormData(existingData.form_data);
    } 
    UI.showScreen("form-screen");
  } catch (err) {
    UI.showToast("Error: " + err.message);
    history.back();
  }
}

// --- INSTALL LOGIC ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('btn-install');
  if(btn) {
    btn.style.display = 'inline-block';
    btn.onclick = async () => {
      btn.style.display = 'none';
      deferredPrompt.prompt();
      deferredPrompt = null;
    };
  }
});