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

// --- INDIAN NUMBER TO WORDS LOGIC ---
function convertNumberToWords(amount) {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (num) => {
    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; 
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only ' : '';
    return str;
  };

  if (!amount || amount == 0) return "";
  const result = inWords(amount);
  return result ? result.trim() + " Rupees Only" : "";
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
      
      let inp;
      
      // 1. HANDLE DROPDOWNS (SELECT)
      if (f.type === "select") {
        inp = document.createElement("select");
        inp.id = f.id;
        // Default empty option
        const defOpt = document.createElement("option");
        defOpt.value = "";
        defOpt.textContent = "-- Select --";
        inp.appendChild(defOpt);
        
        if (f.options) {
          f.options.forEach(opt => {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            inp.appendChild(o);
          });
        }
      } 
      // 2. HANDLE TEXT AREAS
      else if (f.multiline) {
        inp = document.createElement("textarea");
        inp.id = f.id;
      } 
      // 3. HANDLE STANDARD INPUTS
      else {
        inp = document.createElement("input");
        inp.id = f.id;
      }
      
      // EVENT LISTENERS
      inp.addEventListener("input", (e) => {
        let val = e.target.value.toUpperCase(); 
        
        // Aadhaar (12 digits, spaced 4-4-4)
        if (f.name.includes("AADHAAR")) {
          val = val.replace(/\D/g, '').substring(0, 12);
          val = val.replace(/(\d{4})(?=\d)/g, '$1 '); 
        } 
        // Date (DD/MM/YYYY)
        else if (f.name.includes("DOB") || f.name.includes("DATE")) {
          val = val.replace(/\D/g, '').substring(0, 8); 
          if (val.length > 4) val = val.slice(0,2) + '/' + val.slice(2,4) + '/' + val.slice(4);
          else if (val.length > 2) val = val.slice(0,2) + '/' + val.slice(2);
        }
        // Mobile (10 digits)
        else if (f.name.includes("MOBILE") || f.name.includes("PHONE")) {
          val = val.replace(/\D/g, '').substring(0, 10);
        }
        // AUTO FILL AMOUNT IN WORDS
        else if (f.name === "AMOUNT") {
          const numericVal = val.replace(/[^0-9.]/g, ''); // keep numbers
          const wordFieldId = fieldId("AMOUNT IN WORDS", "General"); // Assuming "General" group
          const wordField = document.getElementById(wordFieldId);
          if (wordField) {
            wordField.value = convertNumberToWords(numericVal).toUpperCase();
            // Trigger input event on the word field so anything dependent on it updates too
            wordField.dispatchEvent(new Event('input')); 
          }
        }

        e.target.value = val;
        updatePatterns(patterns);
      });

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

export function validateForm() {
  // Added "select" to querySelector
  const inputs = document.querySelectorAll("#dynamicForm input, #dynamicForm select");
  let isValid = true;
  let firstError = null;

  inputs.forEach(inp => {
    inp.style.borderColor = "#ccc"; // Reset
    
    // Check Aadhaar Length
    if (inp.id.includes("AADHAAR") && inp.value.length > 0 && inp.value.length < 14) {
      isValid = false;
      inp.style.borderColor = "red";
      if (!firstError) firstError = inp;
    }
    // Check Mobile Length
    if ((inp.id.includes("MOBILE") || inp.id.includes("PHONE")) && inp.value.length > 0 && inp.value.length < 10) {
      isValid = false;
      inp.style.borderColor = "red";
      if (!firstError) firstError = inp;
    }
  });

  if (firstError) {
    firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    firstError.focus();
    showToast("Please fix the highlighted fields.");
  }
  
  return isValid;
}

export function getFormData() {
  // Added "select" to querySelector
  const inputs = document.querySelectorAll("#dynamicForm input, #dynamicForm textarea, #dynamicForm select");
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