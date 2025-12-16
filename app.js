/* ============================================================
   FINAL PRO VERSION 
   (Matches Python Logic: Groups + Auto-Scale + Alignment)
   ============================================================ */

const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

function fieldId(name) {
  return "f_" + name.replace(/[^A-Z0-9]/gi, "_");
}

/* ---------------- LOAD FILES ---------------- */
Promise.all([
  fetch("mapping.json").then(r => r.json()),
  fetch("template.pdf").then(r => r.arrayBuffer())
]).then(initApp).catch(err => {
  alert("Failed to load files: " + err);
});

/* ---------------- INIT APP ---------------- */

function initApp([mapping, templatePdfBytes]) {

  const uniqueFields = {};
  const patterns = {};

  // 1. Scan and Deduplicate Fields
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      if (f.type === "whiteout" || f.type === "static") continue;

      if (!uniqueFields[f.name]) {
        uniqueFields[f.name] = {
          name: f.name,
          multiline: !!f.multiline,
          group: f.group || "General"
        };
      }
      if (f.pattern) patterns[f.name] = f.pattern;
    }
  }

  // 2. Build UI with Groups
  const form = document.getElementById("dynamicForm");
  form.innerHTML = ""; 
  const groupNames = mapping.groups || ["General"]; 

  for (const groupName of groupNames) {
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

      input.id = fieldId(field.name);

      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase();
        updatePatterns();
      });

      if (patterns[field.name]) {
        input.readOnly = true;
        input.classList.add("readonly");
        input.style.backgroundColor = "#eee";
      }

      fieldset.appendChild(label);
      fieldset.appendChild(input);
    }
    form.appendChild(fieldset);
  }

  /* -------- Pattern Engine -------- */
  function updatePatterns() {
    for (const [target, pattern] of Object.entries(patterns)) {
      let val = pattern.replace(/\{(.+?)\}/g, (_, k) => {
        const el = document.getElementById(fieldId(k));
        return el ? el.value : "";
      });
      const out = document.getElementById(fieldId(target));
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
          
          // --- 1. Handle Whiteout ---
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

          if (!f.rect) continue; // Skip data-only fields

          // --- 2. Get Value ---
          let valueToPrint = "";
          if (f.type === "static") {
            valueToPrint = f.static_value || "";
          } else {
            const el = document.getElementById(fieldId(f.name));
            if (el) valueToPrint = el.value;
          }
          if (!valueToPrint) continue;

          // --- 3. Auto-Scaling & Alignment ---
          const [x, y, w, h] = f.rect;
          const boxWidth = w * SCALE;
          const boxHeight = h * SCALE;
          
          let fontSize = f.font_size * SCALE;
          let textX = x * SCALE;
          let textY;

          if (f.multiline) {
             // Multiline: Standard wrap, Top Anchored
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
             // Single Line: Auto-Scale + Alignment + Bottom Anchor
             
             // Shrink to fit logic
             let textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
             while (textWidth > boxWidth && fontSize > 6) {
               fontSize -= 0.5;
               textWidth = helveticaFont.widthOfTextAtSize(valueToPrint, fontSize);
             }

             // Alignment logic
             if (f.align === "center") {
               textX += (boxWidth - textWidth) / 2;
             } else if (f.align === "right") {
               textX += (boxWidth - textWidth);
             }

             // Bottom Anchor
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
