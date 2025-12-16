/* ui.js */

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

export function fieldId(name, group) {
  const g = (group || "General").replace(/[^A-Z0-9]/gi, "_");
  const n = name.replace(/[^A-Z0-9]/gi, "_");
  return `f_${g}__${n}`;
}

export function renderForm(mapping, patterns) {
  const form = document.getElementById("dynamicForm");
  form.innerHTML = "";
  
  const uniqueFields = {};
  
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
      
      // === IMPROVEMENT: INPUT MASKS ===
      inp.addEventListener("input", (e) => {
        let val = e.target.value.toUpperCase(); 
        
        // Aadhaar: 0000 0000 0000
        if (f.name.includes("AADHAAR")) {
          val = val.replace(/\D/g, '').substring(0, 12);
          val = val.replace(/(\d{4})(?=\d)/g, '$1 '); 
        } 
        // Date: DD/MM/YYYY
        else if (f.name.includes("DOB") || f.name.includes("DATE")) {
          val = val.replace(/\D/g, '').substring(0, 8); 
          if (val.length > 4) val = val.slice(0,2) + '/' + val.slice(2,4) + '/' + val.slice(4);
          else if (val.length > 2) val = val.slice(0,2) + '/' + val.slice(2);
        }
        // Mobile: 10 Digits
        else if (f.name.includes("MOBILE") || f.name.includes("PHONE")) {
          val = val.replace(/\D/g, '').substring(0, 10);
        }
        
        e.target.value = val;
        updatePatterns(patterns);
      });
      // ================================

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
      el.dispatchEvent(new Event('input')); 
    }
  }
}