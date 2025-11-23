import fs from 'fs';
const content = fs.readFileSync('src/commands/makepick.js', 'utf8');
const fixed = content.replace(/const ddEmoji = pick\.isDoubleDown \? '[^']*' : '';/g, "const ddEmoji = pick.isDoubleDown ? ' 💰' : '';");
fs.writeFileSync('src/commands/makepick.js', fixed, 'utf8');
console.log('Fixed emoji in handleMakepickFromDashboard!');