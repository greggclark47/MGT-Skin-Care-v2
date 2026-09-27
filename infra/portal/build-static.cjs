// Produce the legacy static preview referenced by .openai/hosting.json.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('Unexpected static output path');
}
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('Refusing to replace a linked static output path');
}

for (const name of ['index.html', 'app.js', 'styles.css']) {
  if (!fs.statSync(path.join(root, name)).isFile()) {
    throw new Error(`Missing static source: ${name}`);
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) {
  fs.copyFileSync(path.join(root, name), path.join(output, name));
}
fs.cpSync(path.join(root, 'images'), path.join(output, 'images'), { recursive: true });
console.log('Built root static preview in dist');
