import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const executable = path.resolve(directory, '../../build/bin/Pixtorio.exe');
const child = spawn(executable, ['--mcp'], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
const pending = new Map();
let sequence = 0;
createInterface({input: child.stdout}).on('line', line => {
  const response = JSON.parse(line);
  const entry = pending.get(response.id);
  if (!entry) return;
  pending.delete(response.id);
  clearTimeout(entry.timeout);
  if (response.error) entry.reject(new Error(JSON.stringify(response.error)));
  else entry.resolve(response.result);
});
child.stderr.on('data', data => process.stderr.write(data));
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 35000);
    pending.set(id, {resolve, reject, timeout});
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n');
  });
}
async function call(name, args = {}) {
  const result = await request('tools/call', {name: `pixtorio_${name}`, arguments: args});
  if (result.isError) throw new Error(JSON.stringify(result.content));
  const text = result.content.find(item => item.type === 'text')?.text;
  return text ? JSON.parse(text) : result;
}

const colors = {
  outline: '#202B30', shadow: '#136B69', deep: '#159C8E',
  teal: '#38CCAF', mint: '#8CF1CD', shine: '#C9FFE8',
  coral: '#FF7469', coralLight: '#FFB198', coralDark: '#B84454',
};
const shape = new Set();
function block(set, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(`${x},${y}`);
}
block(shape, 8, 7, 19, 11);
block(shape, 7, 8, 12, 25);
block(shape, 20, 8, 21, 11);
block(shape, 22, 10, 22, 11);
block(shape, 19, 12, 23, 16);
block(shape, 12, 17, 22, 18);
block(shape, 12, 19, 20, 20);
block(shape, 12, 21, 18, 21);

const layerPixels = [new Map(), new Map(), new Map()];
function pixel(layer, x, y, color) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const px = x * 2 + dx, py = y * 2 + dy;
    if (px >= 0 && px < 64 && py >= 0 && py < 64) layer.set(`${px},${py}`, {x: px, y: py, color});
  }
}
const coordinates = [...shape].map(key => key.split(',').map(Number));
for (const [x, y] of coordinates) {
  for (let offset = 0; offset <= 2; offset++) {
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      pixel(layerPixels[0], x + offset + dx, y + offset + dy, colors.outline);
    }
  }
}
for (const [x, y] of coordinates) pixel(layerPixels[0], x + 2, y + 2, colors.shadow);
for (const [x, y] of coordinates) {
  const upperEdge = !shape.has(`${x},${y - 1}`);
  const lowerEdge = !shape.has(`${x},${y + 1}`);
  const rightEdge = !shape.has(`${x + 1},${y}`);
  const color = upperEdge ? colors.mint : lowerEdge || rightEdge ? colors.deep : colors.teal;
  pixel(layerPixels[1], x, y, color);
}
for (let x = 9; x <= 16; x++) pixel(layerPixels[1], x, 8, colors.shine);
for (let y = 10; y <= 23; y++) pixel(layerPixels[1], 8, y, colors.mint);

// A detached pixel tile adds a warm accent to the P-shaped canvas mark.
for (let y = 4; y <= 9; y++) for (let x = 24; x <= 29; x++) {
  pixel(layerPixels[2], x, y, colors.outline);
}
for (let y = 5; y <= 8; y++) for (let x = 25; x <= 28; x++) {
  pixel(layerPixels[2], x, y, y === 5 ? colors.coralLight : y === 8 ? colors.coralDark : colors.coral);
}

try {
  await request('initialize', {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'pixtorio-logo-draft', version: '1.0'}});
  child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
  const before = await call('list_documents');
  console.log('Existing documents:', before.documents.length);
  let document = await call('create_document', {name: 'Pixtorio - Pixel P draft', width: 64, height: 64, colorMode: 'rgba'});
  const documentId = document.documentId;
  console.log('Created:', documentId);
  document = await call('edit_document', {documentId, operations: [
    {type: 'update_layer', layerId: document.layers[0].id, name: '01 - Silhouette'},
    {type: 'add_layer', name: '02 - Mint P'},
    {type: 'add_layer', name: '03 - Coral pixel'},
    {type: 'set_palette', colors: Object.values(colors)},
  ]});
  const names = ['01 - Silhouette', '02 - Mint P', '03 - Coral pixel'];
  await call('edit_document', {documentId, operations: layerPixels.map((pixels, index) => ({
    type: 'set_pixels', layerId: document.layers.find(layer => layer.name === names[index]).id,
    pixels: [...pixels.values()],
  }))});
  console.log(await call('save_project', {documentId, path: path.join(directory, 'pixtorio-pixel-p.pixio')}));
  console.log(await call('export_image', {documentId, format: 'png', scale: 1, path: path.join(directory, 'pixtorio-pixel-p.png')}));
  console.log(await call('export_image', {documentId, format: 'png', scale: 8, path: path.join(directory, 'pixtorio-pixel-p-preview.png')}));
  const preview = await request('tools/call', {name: 'pixtorio_get_preview', arguments: {documentId}});
  if (preview.isError || !preview.content.some(item => item.type === 'image' && item.data.length > 0)) throw new Error('Missing MCP preview');
  console.log('MCP preview verified. Draft left open:', documentId);
} finally {
  child.stdin.end();
}
