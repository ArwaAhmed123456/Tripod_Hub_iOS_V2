const babel = require('@babel/core');
const fs    = require('fs');
const path  = require('path');

const files = [
  'src/screens/ManagerScreen.js',
  'src/screens/SecurityGuardScreen.js',
  'App.js',
];

let allOk = true;
for (const f of files) {
  try {
    const code = fs.readFileSync(f, 'utf8');
    babel.transformSync(code, { filename: f, presets: ['module:@react-native/babel-preset'] });
    // Brace balance
    const opens  = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    const parO   = (code.match(/\(/g) || []).length;
    const parC   = (code.match(/\)/g) || []).length;
    const balanced = opens === closes && parO === parC;
    console.log(`OK  ${f}  (braces ${opens}/${closes} parens ${parO}/${parC})${balanced ? '' : '  *** UNBALANCED ***'}`);
    if (!balanced) allOk = false;
  } catch (e) {
    console.error(`ERR ${f} — ${e.message.split('\n')[0]}`);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
