/* main.js - Entry Point */
import * as Auth from './auth.js';
import * as UI from './ui.js';
import * as PDF from './pdf-generator.js';

let currentMapping = null;
let currentTemplateBytes = null;
let currentFormId = null;
let currentFormType = "";
let currentFormName = "";
let patterns = {}; // Store pattern logic globally for updates

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
  const user = await Auth.initSupabase();
  if (user) {
    loadDashboard();
  } else {
    UI.showScreen("auth-screen");
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

// Editor
document.getElementById("btn-back").onclick = loadDashboard;

document.getElementById("btn-save").onclick = async () => {
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
    loadSavedList(); // Refresh list in background
  }
};

document.getElementById("btn-print").onclick = async () => {
  if (!currentTemplateBytes) return;
  
  let defaultName = (currentFormName || "filled_form").replace(".pdf", "") + ".pdf";
  const pdfName = prompt("PDF Filename:", defaultName);
  if (!pdfName) return;

  const bytes = await PDF.generatePDF(currentMapping, currentTemplateBytes, (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  });

  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = pdfName.endsWith(".pdf") ? pdfName : pdfName + ".pdf";
  a.click();
};

// --- LOGIC FUNCTIONS ---

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

  if (error || !data) {
    list.innerHTML = "Error loading forms.";
    return;
  }
  
  if (data.length === 0) list.innerHTML = "<p style='text-align:center;color:#777'>No saved forms.</p>";
  else list.innerHTML = ""; // Clear loading text

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
    
    // Attach events
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
    currentFormType = filename;
    currentFormId = existingData ? existingData.id : null;
    currentFormName = existingData ? existingData.form_name : "";
    patterns = {}; // Reset patterns

    const [mapping, pdfBytes] = await Promise.all([
      fetch(filename).then(r => r.json()),
      fetch("template.pdf").then(r => r.arrayBuffer())
    ]);

    currentMapping = mapping;
    currentTemplateBytes = pdfBytes;

    UI.renderForm(mapping, patterns);
    
    if (existingData) {
      UI.fillFormData(existingData.form_data);
    }
    
    UI.showScreen("form-screen");

  } catch (err) {
    UI.showToast("Error loading template: " + err.message);
  }
}