export const palette = {
  ink: '#253139', mint: '#91F1CE', teal: '#24BFA5', tealDark: '#117F79',
  blue: '#397DD8', blueLight: '#8DCDF5', blueDark: '#254B94',
  coral: '#F96F71', coralLight: '#FFB29A', coralDark: '#B9405B',
  yellow: '#F6CD59', yellowLight: '#FFF1AD', white: '#F4FFFA',
};

// Drawing uses a 64-unit integer grid; every unit becomes 2x2 RGBA pixels.
export class Raster {
  constructor(name) { this.name = name; this.cells = new Map(); }
  dot(x, y, color) {
    if (x >= 0 && y >= 0 && x < 64 && y < 64) this.cells.set(`${x},${y}`, color);
    return this;
  }
  rect(x, y, width, height, color) {
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) this.dot(px, py, color);
    return this;
  }
  polygon(vertices, color) {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [ax, ay] = vertices[i], [bx, by] = vertices[j];
        if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside) this.dot(x, y, color);
    }
    return this;
  }
  line(x0, y0, x1, y1, width, color) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.rect(x0 - Math.floor(width / 2), y0 - Math.floor(width / 2), width, width, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
    return this;
  }
  cut(x, y, width, height) {
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) this.cells.delete(`${px},${py}`);
    return this;
  }
  stamp(other, dx = 0, dy = 0, color) {
    for (const [key, original] of other.cells) {
      const [x, y] = key.split(',').map(Number);
      this.dot(x + dx, y + dy, color ?? original);
    }
    return this;
  }
  outline(other, radius, color, dx = 0, dy = 0) {
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) this.stamp(other, dx + ox, dy + oy, color);
    return this;
  }
  pixels() {
    const result = [];
    for (const [key, color] of this.cells) {
      const [x, y] = key.split(',').map(Number);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) result.push({x: x * 2 + dx, y: y * 2 + dy, color});
    }
    return result;
  }
}

export function backed(body, depth = 2, shadow = palette.ink) {
  const backing = new Raster('01 - Edge and depth');
  backing.outline(body, 1, palette.ink);
  for (let d = 1; d <= depth; d++) backing.outline(body, 1, shadow, d, d);
  return backing;
}

export function flatten(layers) {
  const result = new Raster('Composite');
  for (const layer of layers) result.stamp(layer);
  return result;
}
