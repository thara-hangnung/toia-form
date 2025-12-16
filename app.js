/* ============================================================
   UPDATED VERSION (Supports Groups, Static Values, Whiteout)
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

  // 1. Scan all pages to find unique fields and their definitions
  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      // Skip if it's a whiteout or static field (no user input needed)
      if (f.type === "whiteout" || f.type === "static") continue;

      // Store unique fields by name so we only create one input per field
      if (!uniqueFields[f.name]) {
        uniqueFields[f.name] = {
          name: f.name,
          multiline: !!f.multiline,
          group: f.group || "General" // Default to General if no group
        };
      }

      // Store pattern if it exists
      if (f.pattern) patterns[f.name] = f.pattern;
    }
  }

  const form = document.getElementById("dynamicForm");
  form.innerHTML = ""; // Clear existing form

  // 2. Build the Form organized by Groups
  const groupNames = mapping.groups || ["General"]; // Use groups from JSON or default

  for (const groupName of groupNames) {
    // Find all fields that belong to this group
    const groupFields = Object.values(uniqueFields).filter(f => f.group === groupName);

    if (groupFields.length === 0) continue;

    // Create a container/header for the group
    const fieldset = document.createElement("fieldset");
    fieldset.style.border = "1px solid #ccc";
    fieldset.style.padding = "10px";
    fieldset.style.marginBottom = "15px";
    
    const legend = document.createElement("legend");
    legend.textContent = groupName;
    legend.style.fontWeight = "bold";
    legend.style.padding = "0 5px";
    fieldset.appendChild(legend);

    // Create inputs for this group
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

      // If this field is calculated by a pattern (read-only)
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
          
          // 1. Handle Whiteouts (Erase content)
          if (f.type === "whiteout") {
            const [x, y, w, h] = f.rect;
            page.drawRectangle({
              x: x * SCALE,
              y: pageHeight - (y + h) * SCALE,
              width: w * SCALE,
              height: h * SCALE,
              color: rgb(1, 1, 1), // White
              borderColor: undefined,
            });
            continue; // Done with this field
          }

          // 2. Skip fields with no printable area (e.g. data-only fields like LOCALITY used for patterns)
          if (!f.rect) continue;

          // 3. Determine Value to Print
          let valueToPrint = "";

          if (f.type === "static") {
            valueToPrint = f.static_value || "";
          } else {
            const el = document.getElementById(fieldId(f.name));
            if (el) valueToPrint = el.value;
          }

          if (!valueToPrint) continue;

          // 4. Draw Text
          const [x, y, w, h] = f.rect;
          
          // Alignment Logic
          let textY;
          if (f.multiline) {
             // Multi-line: Start at Top
             textY = pageHeight - (y * SCALE) - (f.font_size * SCALE);
          } else {
             // Single-line: Start at Bottom
             textY = pageHeight - ((y + h) * SCALE) + 4; 
          }

          page.drawText(valueToPrint, {
            x: x * SCALE,
            y: textY,
            size: f.font_size * SCALE,
            maxWidth: w * SCALE,
            lineHeight: f.multiline ? (f.font_size + 4) * SCALE : undefined,
            font: helveticaFont,
            color: rgb(0, 0, 0)
          });
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
