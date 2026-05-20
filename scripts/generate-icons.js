#!/usr/bin/env node
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF]
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0
  const result = Buffer.alloc(4)
  result.writeUInt32BE(crc)
  return result
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = crc32(Buffer.concat([typeBuffer, data]))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function createPNG(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // RGB
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace

  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0  // filter: None
    for (let x = 0; x < size; x++) {
      const offset = y * rowSize + 1 + x * 3
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 })

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = path.join(__dirname, '..', 'public')

// Dark green: #1a3a1a = rgb(26, 58, 26)
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPNG(192, 26, 58, 26))
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPNG(512, 26, 58, 26))

console.log('Icons generated: icon-192.png and icon-512.png')
