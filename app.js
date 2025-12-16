/* ============================================================
   MULTI-MAPPING VERSION (1, 2, 3 Applicants + Minor)
   ============================================================ */

const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

let currentTemplateBytes = null;
let currentMapping = null;

// --- NAVIGATION FUNCTIONS (Called from HTML) ---

function goHome() {
  document.getElementById("form-screen").classList.remove("active");
  document.getElementById("home-screen").classList.add("active");
  document.getElementById("dynamicForm").innerHTML = ""; // Clear form
}

async function loadForm(mappingFilename) {
  try {
    // Show Loading or just switch screens
    const [mapping, templateBytes] = await Promise.all([
      fetch(mappingFilename).then(r => {
        if (!r.ok) throw new Error(`Could not find ${mappingFilename}`);
        return r.json();
      }),
      // We assume the same template.pdf is used for all. 
      // If 'Minor' uses a different PDF, you can change this logic.
      fetch("template.pdf").then(r => r.arrayBuffer()) 
    ]);

    currentMapping = mapping;
    currentTemplateBytes = templateBytes;

    // Switch Screens
    document.getElementById("home-screen").classList.remove("active");
    document.getElementById("form-screen").classList.add("active");
    
    // Initialize the Form
    initApp(mapping);

  } catch (err) {
    alert("Error loading form: " + err.message);
  }
}

// --- CORE LOGIC ---

function fieldId(name, group) {
  const g = (group || "General").replace(/[^A-Z0-9]/gi, "_");
  const n = name.replace(/[^A-Z0-9]/gi, "_");
  return `f_${g}__${n}`;
}

function initApp(mapping) {
  const uniqueFields = {}; 
  const patterns = {};

  // 1. Scan fields
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      if (f.type === "whiteout" || f.type === "static") continue;

      const group = f.group || "General";
      const key = `${group}::${f.name}`;

      if (!uniqueFields[key]) {
        uniqueFields[key] = {
          name: f.name,
          group: group,
          multiline: !!f.multiline,
          id: fieldId(f.name, group)
        };
      }
      
      if (f.pattern) {
        patterns[key] = {
          pattern: f.pattern,
          targetId: fieldId(f.name, group),
          group: group
        };
      }
    }
  }

  // 2. Build UI
  const form = document.getElementById("dynamicForm");
  form.innerHTML = ""; 
  const groupNames = mapping.groups || ["General"]; 

  for (const groupName of groupNames) {
    const groupFields = Object.values(uniqueFields).filter(f => f.group === groupName);
    if (groupFields.length === 0) continue;

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = groupName;
    fieldset.appendChild(legend);

    for (const field of groupFields) {
      const label = document.createElement("label");
      label.textContent = field.name;

      const input = field.multiline
        ? document.createElement("textarea")
        : Object.assign(document.createElement("input"), { type: "text" });

      input.id = field.id; 

      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase();
        updatePatterns(patterns);
      });

      const key = `${field.group}::${field.name}`;
      if (patterns[key]) {
        input.readOnly = true;
        input.classList.add("readonly");
      }

      fieldset.appendChild(label);
      fieldset.appendChild(input);
    }
    form.appendChild(fieldset);
  }

  // 3. Setup Generate Button
  const genBtn = document.getElementById("generate");
  // Remove old event listeners to prevent duplicates
  const newBtn = genBtn.cloneNode(true);
  genBtn.parentNode.replaceChild(newBtn, genBtn);
  
  newBtn.onclick = () => generatePDF(mapping, patterns);
}

function updatePatterns(patterns) {
  for (const p of Object.values(patterns)) {
    let val = p.pattern.replace(/\{(.+?)\}/g, (_, varName) => {
      const sourceId = fieldId(varName, p.group);
      const el = document.getElementById(sourceId);
      return el ? el.value : "";
    });
    const out = document.getElementById(p.targetId);
    if (out) out.value = val.toUpperCase();
  }
}

async function generatePDF(mapping, patterns) {
  try {
    const pdfDoc = await PDFDocument.load(currentTemplateBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const [pageIndexStr, pageFields] of Object.entries(mapping.pages)) {
      const page = pages[Number(pageIndexStr)];
      const pageHeight = page.getHeight();

      // PASS 1: Whiteout
      for (const f of pageFields) {
        if (f.type === "whiteout" && f.rect) {
          const [x, y, w, h] = f.rect;
          page.drawRectangle({
            x: x * SCALE,
            y: pageHeight - (y + h) * SCALE,
            width: w * SCALE,
            height: h * SCALE,
            color: rgb(1, 1, 1),
          });
        }
      }

      // PASS 2: Text
      for (const f of pageFields) {
        if (f.type === "whiteout" || !f.rect) continue;

        let valueToPrint = "";
        if (f.type === "static") {
          valueToPrint = f.static_value || "";
        } else {
          const el = document.getElementById(fieldId(f.name, f.group || "General"));
          if (el) valueToPrint = el.value;
        }
        
        if (!valueToPrint) continue;

        const [x, y, w, h] = f.rect;
        const boxWidth = w * SCALE;
        let fontSize = f.font_size * SCALE;
        let textX = x * SCALE;
        let textY;

        if (f.multiline) {
           textY = pageHeight - (y * SCALE) - fontSize;
           page.drawText(valueToPrint, {
             x: textX, y: textY, size: fontSize,
             maxWidth: boxWidth, lineHeight: fontSize + 2, font: helveticaFont,
           });
        } else {
           // Auto-Scale
           let textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
           while (textWidth > boxWidth && fontSize > 6) {
             fontSize -= 0.5;
             textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
           }
           // Align
           if (f.align === "center") textX += (boxWidth - textWidth) / 2;
           else if (f.align === "right") textX += (boxWidth - textWidth);
           
           textY = pageHeight - ((y + h) * SCALE) + 4;

           page.drawText(valueToPrint, {
             x: textX, y: textY, size: fontSize, font: helveticaFont, color: rgb(0, 0, 0)
           });
        }
      }
    }

    const bytes = await pdfDoc.save();
    download(bytes, "filled_form.pdf");
  } catch (err) {
    alert("Generation failed: " + err.message);
  }
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
