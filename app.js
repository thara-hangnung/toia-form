/* ============================================================
   DEBUG VERSION: STANDARD FONTS + RED BOXES
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

  const fields = {};
  const patterns = {};

  // Parse mapping
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      fields[f.name] ??= { name: f.name, multiline: !!f.multiline };
      if (f.pattern) patterns[f.name] = f.pattern;
    }
  }

  const form = document.getElementById("dynamicForm");

  /* -------- Build Form -------- */
  for (const field of Object.values(fields)) {
    const label = document.createElement("label");
    label.textContent = field.name;

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
    }

    form.appendChild(label);
    form.appendChild(input);
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
          const el = document.getElementById(fieldId(f.name));
          
          // Even if empty, we might want to see the box to debug. 
          // If you only want to see boxes for filled fields, keep: if (!el || !el.value) continue;
          // For debugging, it is often better to see ALL boxes:
          if (!el) continue; 

          const [x, y, w, h] = f.rect;

          // --- DEBUG: Draw Red Rectangle ---
          page.drawRectangle({
            x: x * SCALE,
            y: pageHeight - (y + h) * SCALE, // Bottom-left corner of the box
            width: w * SCALE,
            height: h * SCALE,
            borderColor: rgb(1, 0, 0), // Red
            borderWidth: 1,
          });
          // ---------------------------------

          // Only draw text if there is a value
          if (el.value) {
            page.drawText(el.value, {
              x: x * SCALE,
              y: pageHeight - (y + h) * SCALE + 4, // Slight offset for text baseline
              size: f.font_size * SCALE,
              maxWidth: w * SCALE,
              lineHeight: f.multiline ? (f.font_size + 4) * SCALE : undefined,
              font: helveticaFont,
              color: rgb(0, 0, 0)
            });
          }
        }
      }

      const bytes = await pdfDoc.save();
      download(bytes, "debug_form.pdf");

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