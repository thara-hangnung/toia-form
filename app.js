const { PDFDocument, rgb } = window.PDFLib;

/* ================= CONFIG ================= */

const SOURCE_DPI = 200;
const PDF_DPI = 72;
const SCALE = PDF_DPI / SOURCE_DPI;

/* ================= UTILS ================= */

function fieldId(name) {
  return "f_" + name.replace(/[^A-Z0-9]/gi, "_");
}

/* -------- Amount → Words (Indian) -------- */

function amountToWords(num) {
  if (!num || isNaN(num)) return "";

  const ones = ["","ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE",
    "TEN","ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN",
    "SEVENTEEN","EIGHTEEN","NINETEEN"];
  const tens = ["","","TWENTY","THIRTY","FORTY","FIFTY","SIXTY","SEVENTY","EIGHTY","NINETY"];

  const two = n => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
  const three = n => n < 100 ? two(n) : ones[Math.floor(n/100)]+" HUNDRED"+(n%100?" "+two(n%100):"");

  let n = parseInt(num,10), out="";
  const crore = Math.floor(n/10000000); n%=10000000;
  const lakh = Math.floor(n/100000); n%=100000;
  const thousand = Math.floor(n/1000); n%=1000;

  if (crore) out+=three(crore)+" CRORE ";
  if (lakh) out+=three(lakh)+" LAKH ";
  if (thousand) out+=three(thousand)+" THOUSAND ";
  if (n) out+=three(n);

  return out.trim();
}

/* ================= LOAD FILES ================= */

Promise.all([
  fetch("mapping.json").then(r=>r.json()),
  fetch("template.pdf").then(r=>r.arrayBuffer()),
  fetch("DejaVuSans.ttf").then(r=>r.arrayBuffer())
]).then(initApp);

function initApp([mapping, pdfBytes, fontBytes]) {

  const fields = {};
  const patterns = {};

  for (const pageFields of Object.values(mapping.pages)) {
    for (const f of pageFields) {
      fields[f.name] ??= { name:f.name, multiline:!!f.multiline };
      if (f.pattern) patterns[f.name] = f.pattern;
    }
  }

  const form = document.getElementById("dynamicForm");

  for (const field of Object.values(fields)) {
    const label = document.createElement("label");
    label.textContent = field.name;

    const input = field.multiline ? document.createElement("textarea") : document.createElement("input");
    if (!field.multiline) input.type="text";
    input.id = fieldId(field.name);

    input.addEventListener("input",()=>{
      input.value = input.value.toUpperCase();

      if (field.name==="AMOUNT") {
        const tgt=document.getElementById(fieldId("AMOUNT IN WORDS"));
        if (tgt) tgt.value=amountToWords(input.value);
      }
      updatePatterns();
    });

    if (patterns[field.name]) {
      input.readOnly=true;
      input.classList.add("readonly");
    }

    form.appendChild(label);
    form.appendChild(input);
  }

  function updatePatterns() {
    for (const [target,pattern] of Object.entries(patterns)) {
      let val=pattern.replace(/\{(.+?)\}/g,(_,k)=>{
        const el=document.getElementById(fieldId(k));
        return el?el.value:"";
      });
      const out=document.getElementById(fieldId(target));
      if (out) out.value=val.toUpperCase();
    }
  }

  document.getElementById("generate").onclick = async ()=> {
  	alert("Generate clicked");
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(fontBytes);
    const pages = pdfDoc.getPages();

    for (const [pi, pageFields] of Object.entries(mapping.pages)) {
      const page = pages[Number(pi)];
      const h = page.getHeight();

      for (const f of pageFields) {
        const el=document.getElementById(fieldId(f.name));
        if (!el||!el.value) continue;

        const [x,y,w,hh]=f.rect;
        page.drawText(el.value,{
          x:x*SCALE,
          y:h-(y+hh)*SCALE+4,
          size:f.font_size*SCALE,
          maxWidth:w*SCALE,
          lineHeight:f.multiline?(f.font_size+4)*SCALE:undefined,
          font,
          color:rgb(0,0,0)
        });
      }
    }

    const out=await pdfDoc.save();
    const blob=new Blob([out],{type:"application/pdf"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="filled_form.pdf";
    a.click();
  };
}