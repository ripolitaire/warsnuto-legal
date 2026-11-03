const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
function walk(directory, nested = false) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (nested || ['server', 'api', 'scripts', 'tests', 'ops'].includes(entry.name))) walk(path.join(directory, entry.name), true);
    else if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) { cp.execFileSync(process.execPath, ['--check', path.join(directory, entry.name)], { stdio: 'pipe' }); count++; }
  }
}
walk(root); JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
console.log(count + ' JavaScript files parsed; Vercel JSON valid.');
