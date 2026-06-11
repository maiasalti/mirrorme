// Generates simple brand icons (ink square, accent "collar" notch) without
// any image dependencies — raw PNG encoding via zlib.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const INK = [0x18, 0x14, 0x10]
const ACCENT = [0xd4, 0x35, 0x1c]
const PAPER = [0xf4, 0xf0, 0xe6]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixelFn) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x / size, y / size)
      row[1 + x * 3] = r
      row[2 + x * 3] = g
      row[3 + x * 3] = b
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Ink field, paper "M" stroke, accent triangle collar in the top-right.
function pixel(u, v) {
  if (u > 0.62 && v < 0.38 && u - 0.62 > v) return ACCENT
  const inBand = (a, b) => u > a && u < b
  const stroke = 0.1
  const mTop = 0.28
  const mBottom = 0.78
  if (v > mTop && v < mBottom) {
    if (inBand(0.16, 0.16 + stroke) || inBand(0.74 - stroke + 0.1, 0.84)) return PAPER
    const diag1 = Math.abs(u - (0.21 + (v - mTop) * 0.55)) < stroke / 2
    const diag2 = Math.abs(u - (0.79 - (v - mTop) * 0.55)) < stroke / 2
    if ((diag1 || diag2) && v < 0.62) return PAPER
  }
  return INK
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(dir, { recursive: true })
for (const size of [16, 48, 128]) {
  writeFileSync(join(dir, `${size}.png`), png(size, pixel))
}
console.log('icons written to', dir)
