/* ============================================================
   FULL APP: AUTH + DB + TWO-PASS PDF GENERATION
   ============================================================ */

const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
const { createClient } = window.supabase;

const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

let supabase;
let currentMapping = null;
let currentTemplateBytes = null;
let currentFormId = null; // ID of the form currently being edited

// --- INITIALIZATION ---
// Fetch env vars from Vercel API, then start app
fetch('/api/config')
  .then(res => res.json())
  .then(config => {
    if (!config.url || !config.key) throw new Error("Missing API Keys");
    supabase = createClient(config.url, config.key);
    checkUser();
  })
  .catch(err => {
    console.error(err);
    alert("Could not connect to backend. check api/config.js");
  });


// --- AUTHENTICATION ---

async function checkUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showScreen("home-screen");
    loadSavedForms();
  } else {
    showScreen("auth-screen");
  }
}

async function handleLogin() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const msg = document.getElementById("auth-msg");

  // Attempt Login
  let { error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    // Attempt Registration if login fails
    const { error: upError } = await supabase.auth.signUp({ email, password });
    if (upError) {
      msg.textContent = error.message;
      return;
    }
    alert("Account created! You are logged in.");
  }
  checkUser();
}

async function handleLogout() {
  await supabase.auth.signOut();
  checkUser();
}

// --- DATABASE OPERATIONS ---

async function loadSavedForms() {
  const list = document.getElementById("saved-list");
  list.innerHTML = "Loading...";

  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) { list.innerHTML = "Error loading data."; return; }

  list.innerHTML = "";
  if (data.length === 0) list.innerHTML = "<p style='color:#777; text-align:center'>No forms saved.</p>";

  data.forEach(form => {
    const div = document.createElement("div");
    div.className = "saved-item";
    div.innerHTML = `
      <div class="saved-info">
        <strong>${form.form_name || "Untitled"}</strong>
        <span>${new Date(form.updated_at).toLocaleDateString()}</span>
      </div>
      <div>
        <button class="btn-edit" onclick="editForm('${form.id}')">Open</button>
        <button class="btn-del" onclick="deleteForm('${form.id}')">Del</button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function saveForm() {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Harvest Data
  const inputs = document.querySelectorAll("#dynamicForm input, #dynamicForm textarea");
  const formData = {};
  let nameGuess = "";

  inputs.forEach(inp => {
    formData[inp.id] = inp.value;
    if (!nameGuess && inp.id.includes("NAME") && inp.value) nameGuess = inp.value;
  });

  const payload = {
    user_id: user.id,
    form_type: "mapping.json",
    form_name: nameGuess || "Untitled Form",
    form_data: formData,
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

  if (error) alert("Save failed: " + error.message);
  else {
    alert("Saved!");
    loadSavedForms(); // Refresh list in background
  }
}

async function deleteForm(id) {
  if(!confirm("Delete this form?")) return;
  await supabase.from('forms').delete().eq('id', id);
  loadSavedForms();
}

// --- FORM BUILDER & LOGIC ---

async function openNewForm() {
  currentFormId = null;
  await loadEnvironment();
}

async function editForm(id) {
  const { data } = await supabase.from('forms').select('*').eq('id', id).single();
  if (!data) return;
  
  currentFormId = id;
  await loadEnvironment();

  // Populate Fields
  for (const [key, val] of Object.entries(data.form_data)) {
    const el = document.getElementById(key);
    if (el) {
      el.value = val;
      el.dispatchEvent(new Event('input')); // Trigger pattern updates
    }
  }
}

async function loadEnvironment() {
  try {
    const [mapping, templateBytes] = await Promise.all([
      fetch("mapping.json").then(r => r.json()),
      fetch("template.pdf").then(r => r.arrayBuffer())
    ]);
    currentMapping = mapping;
    currentTemplateBytes = templateBytes;
    
    initFormBuilder(mapping);
    showScreen("form-screen");
  } catch(e) { alert("Error loading files: " + e); }
}

function fieldId(name, group) {
  const g = (group || "General").replace(/[^A-Z0-9]/gi, "_");
  const n = name.replace(/[^A-Z0-9]/gi, "_");
  return `f_${g}__${n}`;
}

function initFormBuilder(mapping) {
  const form = document.getElementById("dynamicForm");
  form.innerHTML = "";
  
  const uniqueFields = {};
  const patterns = {};

  // 1. Scan Fields
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      if (f.type === "whiteout" || f.type === "static") continue;
      const group = f.group || "General";
      const key = `${group}::${f.name}`;
      
      if (!uniqueFields[key]) {
        uniqueFields[key] = { ...f, group, id: fieldId(f.name, group) };
      }
      if (f.pattern) patterns[key] = { pattern: f.pattern, targetId: uniqueFields[key].id, group };
    }
  }

  // 2. Build DOM
  const groups = mapping.groups || ["General"];
  for (const gName of groups) {
    const fields = Object.values(uniqueFields).filter(f => f.group === gName);
    if (!fields.length) continue;

    const set = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = gName;
    set.appendChild(legend);

    for (const f of fields) {
      const lbl = document.createElement("label");
      lbl.textContent = f.name;
      const inp = f.multiline ? document.createElement("textarea") : document.createElement("input");
      inp.id = f.id;
      
      // Auto-Uppercase & Pattern Trigger
      inp.addEventListener("input", () => {
        inp.value = inp.value.toUpperCase();
        updatePatterns(patterns);
      });

      // Calculated Field Check
      if (patterns[`${f.group}::${f.name}`]) {
        inp.readOnly = true;
        inp.classList.add("readonly");
      }
      
      set.appendChild(lbl);
      set.appendChild(inp);
    }
    form.appendChild(set);
  }
}

function updatePatterns(patterns) {
  for (const p of Object.values(patterns)) {
    let val = p.pattern.replace(/\{(.+?)\}/g, (_, varName) => {
      const el = document.getElementById(fieldId(varName, p.group));
      return el ? el.value : "";
    });
    const target = document.getElementById(p.targetId);
    if (target) target.value = val.toUpperCase();
  }
}

// --- PDF GENERATION (TWO-PASS) ---

document.getElementById("generate").onclick = async () => {
  if (!currentTemplateBytes) return;
  
  const pdfDoc = await PDFDocument.load(currentTemplateBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const [idxStr, fields] of Object.entries(currentMapping.pages)) {
    const page = pages[Number(idxStr)];
    const h = page.getHeight();

    // PASS 1: Whiteout (Background)
    fields.forEach(f => {
      if (f.type === "whiteout" && f.rect) {
        const [x,y,w,rectH] = f.rect;
        page.drawRectangle({
          x: x*SCALE, y: h - (y+rectH)*SCALE,
          width: w*SCALE, height: rectH*SCALE,
          color: rgb(1,1,1), borderWidth: 0
        });
      }
    });

    // PASS 2: Text (Foreground)
    fields.forEach(f => {
      if (!f.rect || f.type === "whiteout") return;
      
      let val = "";
      if (f.type === "static") val = f.static_value;
      else {
        const el = document.getElementById(fieldId(f.name, f.group));
        if (el) val = el.value;
      }
      if (!val) return;

      const [x,y,w,rectH] = f.rect;
      let fontSize = f.font_size * SCALE;
      let textX = x * SCALE;
      let textY;

      if (f.multiline) {
        textY = h - (y*SCALE) - fontSize;
        page.drawText(val, {
          x: textX, y: textY, size: fontSize,
          maxWidth: w*SCALE, lineHeight: fontSize+2, font: helvetica
        });
      } else {
        // Auto-Scale
        let width = helvetica.widthOfTextAtSize(val, fontSize);
        while (width > w*SCALE && fontSize > 6) {
          fontSize -= 0.5;
          width = helvetica.widthOfTextAtSize(val, fontSize);
        }
        // Align
        if (f.align === "center") textX += (w*SCALE - width)/2;
        else if (f.align === "right") textX += (w*SCALE - width);
        
        textY = h - ((y+rectH)*SCALE) + 4;
        page.drawText(val, { x: textX, y: textY, size: fontSize, font: helvetica });
      }
    });
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "filled_form.pdf";
  a.click();
};

// --- UI UTILS ---
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
function goHome() {
  showScreen("home-screen");
  loadSavedForms();
}
