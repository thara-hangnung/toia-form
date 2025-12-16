/* ============================================================
   FIXED VERSION: SCOPED FIELDS (SEPARATE ADDRESSES)
   ============================================================ */

const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

// --- FIX 1: ID now includes the Group to prevent collisions ---
function fieldId(name, group) {
  const g = (group || "General").replace(/[^A-Z0-9]/gi, "_");
  const n = name.replace(/[^A-Z0-9]/gi, "_");
  return `f_${g}__${n}`;
}

Promise.all([
  fetch("mapping.json").then(r => r.json()),
  fetch("template.pdf").then(r => r.arrayBuffer())
]).then(initApp).catch(err => {
  alert("Failed to load files: " + err);
});

function initApp([mapping, templatePdfBytes]) {

  const uniqueFields = {}; 
  const patterns = {};

  // 1. Scan fields and identify them by (Group + Name)
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      if (f.type === "whiteout" || f.type === "static") continue;

      const group = f.group || "General";
      
      // --- FIX 2: Key by Group + Name so "Nominee City" != "Applicant City" ---
      const key = `${group}::${f.name}`;

      if (!uniqueFields[key]) {
        uniqueFields[key] = {
          name: f.name,
          group: group,
          multiline: !!f.multiline,
          id: fieldId(f.name, group) // Store the calculated ID
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

  // 2. Build UI Group by Group
  const form = document.getElementById("dynamicForm");
  form.innerHTML = ""; 
  const groupNames = mapping.groups || ["General"]; 

  for (const groupName of groupNames) {
    // Find all fields belonging to this group
    const groupFields = Object.values(uniqueFields).filter(f => f.group === groupName);
    
    if (groupFields.length === 0) continue;

    const fieldset = document.createElement("fieldset");
    fieldset.style.border = "1px solid #ccc";
    fieldset.style.padding = "10px";
    fieldset.style.marginBottom = "15px";
    
    const legend = document.createElement("legend");
    legend.textContent = groupName;
    legend.style.fontWeight = "bold";
    fieldset.appendChild(legend);

    for (const field of groupFields) {
      const label = document.createElement("label");
      label.textContent = field.name;
      label.style.marginTop = "10px";

      const input = field.multiline
        ? document.createElement("textarea")
        : Object.assign(document.createElement("input"), { type: "text" });

      input.id = field.id; // Use the scoped ID

      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase();
        updatePatterns();
      });

      // If it's a calculated field, make it read-only
      // We check if THIS specific field (group+name) has a pattern
      const key = `${field.group}::${field.name}`;
      if (patterns[key]) {
        input.readOnly = true;
        input.classList.add("readonly");
        input.style.backgroundColor = "#eee";
      }

      fieldset.appendChild(label);
      fieldset.appendChild(input);
    }
    form.appendChild(fieldset);
  }

  /* -------- Pattern Engine (Scoped) -------- */
  function updatePatterns() {
    for (const p of Object.values(patterns)) {
      // Replace {VAR} with the value of VAR *inside the same group*
      let val = p.pattern.replace(/\{(.+?)\}/g, (_, varName) => {
        const sourceId = fieldId(varName, p.group);
        const el = document.getElementById(sourceId);
        return el ? el.value : "";
      });

      const out = document.getElementById(p.targetId);
      if (out) out.value = val.toUpperCase();
    }
  }

  /* -------- Generate PDF -------- */
  document.getElementById("generate").onclick = async () => {
    try {
      const pdfDoc = await PDFDocument.load(templatePdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const [pageIndexStr, pageFields] of Object.entries(mapping.pages)) {
        const page = pages[Number(pageIndexStr)];
        const pageHeight = page.getHeight();

        for (const f of pageFields) {
          
          if (f.type === "whiteout") {
            const [x, y, w, h] = f.rect;
            page.drawRectangle({
              x: x * SCALE,
              y: pageHeight - (y + h) * SCALE,
              width: w * SCALE,
              height: h * SCALE,
              color: rgb(1, 1, 1), 
            });
            continue; 
          }

          if (!f.rect) continue; 

          // --- FIX 3: Retrieve value using the scoped ID ---
          let valueToPrint = "";
          if (f.type === "static") {
            valueToPrint = f.static_value || "";
          } else {
            const el = document.getElementById(fieldId(f.name, f.group || "General"));
            if (el) valueToPrint = el.value;
          }
          
          if (!valueToPrint) continue;

          // --- Draw Text (Auto-Scale + Align) ---
          const [x, y, w, h] = f.rect;
          const boxWidth = w * SCALE;
          const boxHeight = h * SCALE;
          
          let fontSize = f.font_size * SCALE;
          let textX = x * SCALE;
          let textY;

          if (f.multiline) {
             textY = pageHeight - (y * SCALE) - fontSize;
             page.drawText(valueToPrint, {
               x: textX,
               y: textY,
               size: fontSize,
               maxWidth: boxWidth,
               lineHeight: fontSize + 2,
               font: helveticaFont,
             });
          } else {
             // Shrink to fit
             let textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
             while (textWidth > boxWidth && fontSize > 6) {
               fontSize -= 0.5;
               textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
             }

             // Align
             if (f.align === "center") {
               textX += (boxWidth - textWidth) / 2;
             } else if (f.align === "right") {
               textX += (boxWidth - textWidth);
             }

             textY = pageHeight - ((y + h) * SCALE) + 4;

             page.drawText(valueToPrint, {
               x: textX,
               y: textY,
               size: fontSize,
               font: helveticaFont,
               color: rgb(0, 0, 0)
             });
          }
        }
      }

      const bytes = await pdfDoc.save();
      download(bytes, "filled_form.pdf");

    } catch (err) {
      alert("PDF generation failed: " + err);
      console.error(err);
    }
  };
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
