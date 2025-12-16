/* ui.js - Handles DOM & UI */

export function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

export function showToast(msg) {
  const x = document.getElementById("toast");
  x.textContent = msg;
  x.className = "show";
  setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

// Generates the unique field ID used for mapping
export function fieldId(name, group) {
  const g = (group || "General").replace(/[^A-Z0-9]/gi, "_");
  const n = name.replace(/[^A-Z0-9]/gi, "_");
  return `f_${g}__${n}`;
}

export function renderForm(mapping, patterns) {
  const form = document.getElementById("dynamicForm");
  form.innerHTML = "";
  
  const uniqueFields = {};
  
  // 1. Organize Fields
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

  // 2. Create DOM Elements
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
      
      // Auto-Uppercase
      inp.addEventListener("input", () => {
        inp.value = inp.value.toUpperCase();
        updatePatterns(patterns);
      });
      
      // Pattern Logic
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

export function getFormData() {
  const inputs = document.querySelectorAll("#dynamicForm input, #dynamicForm textarea");
  const data = {};
  let nameGuess = "";
  inputs.forEach(inp => {
    data[inp.id] = inp.value;
    if (!nameGuess && inp.id.includes("NAME") && inp.value) nameGuess = inp.value;
  });
  return { data, nameGuess };
}

export function fillFormData(data) {
  for (const [key, val] of Object.entries(data)) {
    const el = document.getElementById(key);
    if (el) {
      el.value = val;
      el.dispatchEvent(new Event('input')); // Trigger patterns
    }
  }
}