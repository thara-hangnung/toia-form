/* pdf-generator.js */
const { PDFDocument, rgb } = window.PDFLib; 
const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

import { fieldId } from './ui.js';

export async function generatePDF(mapping, templateBytes, fontBytes, getFieldValFn) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  
  // Register FontKit & Embed Custom Font
  pdfDoc.registerFontkit(window.fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);

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
          width: w*SCALE, height: rectH