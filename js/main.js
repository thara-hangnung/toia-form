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

// --- DRAFT HELPERS ---
function saveDraft(filename, data) {
  localStorage.setItem("draft_" + filename, JSON.stringify(data));
}
function getDraft(filename) {
  const raw = localStorage.getItem("draft_" + filename);
  return raw ? JSON.parse(raw) : null;
}
function clearDraft(filename) {
  localStorage.removeItem("draft_" + filename);
}

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
  const user = await Auth.initSupabase();
  
  // Set initial history state so we don't exit immediately on first back
  history.replaceState({ page: 'home' }, "", ""); 

  if (user) loadDashboard();
  else UI.showScreen("auth-screen");
});

// --- NAVIGATION FIX (SYSTEM BACK BUTTON) ---
window.addEventListener("popstate", (event) => {
  if (!event.state || event.state.page === 'home') {
    const user = Auth.getUser();
    if (user) {
      UI.showScreen("home-screen");
      loadSavedList(); 
    } else {
      UI.showScreen("auth-screen");
    }
  } 
  else if (event.state.page === 'editor') {
    UI.showScreen("form-screen");
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
    if(res.message) UI.showToast(res.message);
    loadDashboard();
  }
};

document.getElementById("btn-logout").onclick = async () => {
  await Auth.logout();
  UI.showScreen("auth-screen");
};

// Dashboard
document.querySelectorAll(".template-btn").forEach(btn => {
  btn.onclick = () => loadEditor(btn.dataset.file, null);
});

document.getElementById("search-input").onkeyup = (e) => {
  const filter = e.target.value.toLowerCase();
  document.querySelectorAll(".saved-item").forEach(item => {
    item.style.display = item.innerText.toLowerCase().includes(filter) ? "" : "none";
  });
};

// Editor Actions
document.getElementById("btn-back").onclick = () => {
  window.history.back(); 
};

document.getElementById("btn-save").onclick = async () => {
  if (!UI.validateForm()) return;

  const { data, nameGuess } = UI.getFormData();
  const user = Auth.getUser();
  if (!user) return;

  const defaultName = currentFormName || nameGuess || "Untitled Form";
  const manualName = prompt("Save Form As:", defaultName);
  if (!manualName) return;

  currentFormName = manualName;
  const supabase = Auth.getClient();

  const payload = {
    user_id: user.id,
    form_type: currentFormType,
    form_name: currentFormName,
    form_data: data,
    updated_at: new Date()
  };

  let error;
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
    clearDraft(currentFormType); 
    loadSavedList(); 
  }
};

document.getElementById("btn-preview").onclick = async () => {
  if (!currentTemplateBytes || !currentFontBytes) return;
  const bytes = await PDF.generatePDF(
    currentMapping, currentTemplateBytes, currentFontBytes,
    (id) => { const el = document.getElementById(id); return el ? el.value : ""; }
  );
  const blob = new Blob([bytes], { type: "application/pdf" });
  window.open(URL.createObjectURL(blob), "_blank");
};

document.getElementById("btn-print").onclick = async () => {
  if (!currentTemplateBytes || !currentFontBytes) return;
  if (!UI.validateForm()) return;

  let defaultName = (currentFormName || "filled_form").replace(".pdf", "") + ".pdf";
  const pdfName = prompt("PDF Filename:", defaultName);
  if (!pdfName) return;

  const bytes = await PDF.generatePDF(
    currentMapping, currentTemplateBytes, currentFontBytes,
    (id) => { const el = document.getElementById(id); return el ? el.value : ""; }
  );

  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = pdfName.endsWith(".pdf") ? pdfName : pdfName + ".pdf";
  a.click();
};

// --- LOGIC ---

function loadDashboard() {
  UI.showScreen("home-screen");
  loadSavedList();
}

async function loadSavedList() {
  const list = document.getElementById("saved-list");
  list.innerHTML = "Loading...";
  const supabase = Auth.getClient();
  const user = Auth.getUser();

  const { data, error } = await supabase
    .from('forms').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });

  if (error || !data) { list.innerHTML = "Error loading forms."; return; }
  
  if (data.length === 0) list.innerHTML = "<p style='text-align:center;color:#777'>No saved forms.</p>";
  else list.innerHTML = ""; 

  data.forEach(form => {
    const div = document.createElement("div");
    div.className = "saved-item";
    div.innerHTML = `
      <div class="saved-info">
        <strong>${form.form_name}</strong>
        <span>${form.form_type} • ${new Date(form.updated_at).toLocaleDateString()}</span>
      </div>
      <div>
        <button class="btn-edit">Open</button>
        <button class="btn-del">Del</button>
      </div>
    `;
    div.querySelector(".btn-edit").onclick = () => loadEditor(form.form_type, form);
    div.querySelector(".btn-del").onclick = async () => {
      if(confirm("Delete?")) {
        await supabase.from('forms').delete().eq('id', form.id);
        loadSavedList();
      }
    };
    list.appendChild(div);
  });
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
    } else {
      const draft = getDraft(filename);
      if (draft && confirm("Unsaved draft found. Restore it?")) {
        UI.fillFormData(draft);
      }
    }
    
    document.getElementById("dynamicForm").oninput = () => {
       const { data } = UI.getFormData();
       saveDraft(filename, data);
    };
    
    UI.showScreen("form-screen");

  } catch (err) {
    UI.showToast("Error loading template: " + err.message);
    console.error(err);
    history.back();
  }
}

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installBtn = document.getElementById('btn-install');
  if (installBtn) {
    installBtn.style.display = 'block';
    
    installBtn.onclick = async () => {
      installBtn.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response: ${outcome}`);
      deferredPrompt = null;
    };
  }
});

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('btn-install');
  if (installBtn) installBtn.style.display = 'none';
  UI.showToast("App installed successfully!");
});