// ===================================================================
// check-html.js — syntax check inline <script> ใน index.html + ไฟล์ทุกตัวใน js/
// วิธีใช้: node check-html.js
// ===================================================================
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync('index.html', 'utf8');
const m = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let bad = 0;
if (!m.length) { console.log('ไม่พบ inline script'); process.exit(1); }
m.forEach((x, i) => {
  try {
    new Function(x[1]); // parse เท่านั้น ไม่ run
    console.log('inline script ' + i + ' : OK (' + x[1].length + ' chars)');
  } catch (e) {
    bad++;
    console.log('inline script ' + i + ' : SYNTAX ERROR -> ' + e.message);
  }
});

const jsDir = 'js';
if (fs.existsSync(jsDir)) {
  fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort().forEach(f => {
    const code = fs.readFileSync(path.join(jsDir, f), 'utf8');
    try {
      new Function(code); // parse เท่านั้น ไม่ run
      console.log('js/' + f + ' : OK (' + code.length + ' chars)');
    } catch (e) {
      bad++;
      console.log('js/' + f + ' : SYNTAX ERROR -> ' + e.message);
    }
  });
}

process.exit(bad ? 1 : 0);
