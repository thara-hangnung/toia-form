/* pdf-generator.js */
const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

import { fieldId } from './ui.js';

export async function generatePDF(mapping, templateBytes, getFieldValFn) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const [idxStr, fields] of Object.entries(mapping.pages)) {
    const page = pages[Number(idxStr)];
    const h = page.getHeight();

    // PASS 1: Whiteouts
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

    // PASS 2: Text
    fields.forEach(f => {
      if (!f.rect || f.type === "whiteout") return;
      
      let val = "";
      if (f.type === "static") val = f.static_value;
      else val = getFieldValFn(fieldId(f.name, f.group));
      
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
        if (f.align === "center") textX += (w*SCALE - width)/2;
        else if (f.align === "right") textX += (w*SCALE - width);
        
        textY = h - ((y+rectH)*SCALE) + 4;
        page.drawText(val, { x: textX, y: textY, size: fontSize, font: helvetica });
      }
    });
  }

  const bytes = await pdfDoc.save();
  return bytes;
}