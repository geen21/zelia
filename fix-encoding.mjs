import { readFileSync, writeFileSync } from 'fs'
import { globSync } from 'fs'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

// Windows-1252 byte → Unicode code point mapping (for bytes 0x80–0x9F that differ from Latin-1)
const win1252ToUnicode = {
  0x80: 0x20AC, // €
  0x82: 0x201A, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201E, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02C6, // ˆ
  0x89: 0x2030, // ‰
  0x8A: 0x0160, // Š
  0x8B: 0x2039, // ‹
  0x8C: 0x0152, // Œ
  0x8E: 0x017D, // Ž
  0x91: 0x2018, // '
  0x92: 0x2019, // '
  0x93: 0x201C, // "
  0x94: 0x201D, // "
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02DC, // ˜
  0x99: 0x2122, // ™
  0x9A: 0x0161, // š
  0x9B: 0x203A, // ›
  0x9C: 0x0153, // œ
  0x9E: 0x017E, // ž
  0x9F: 0x0178, // Ÿ
}

// Reverse map: Unicode code point → Win-1252 byte
const unicodeToWin1252 = {}
for (const [byte, cp] of Object.entries(win1252ToUnicode)) {
  unicodeToWin1252[cp] = Number(byte)
}

function charToWin1252Byte(ch) {
  const cp = ch.codePointAt(0)
  if (cp <= 0x7F) return cp  // ASCII
  if (cp <= 0xFF) return cp  // Latin-1 range (same as Win-1252 for 0xA0-0xFF)
  if (unicodeToWin1252[cp] !== undefined) return unicodeToWin1252[cp]
  return null  // Can't map this character
}

function tryUnMojibake(str) {
  // Try to convert the string back: treat each char as a Win-1252 byte, then decode as UTF-8
  const bytes = []
  for (const ch of str) {
    const b = charToWin1252Byte(ch)
    if (b === null) return null  // Can't reverse this
    bytes.push(b)
  }
  
  try {
    const buf = Buffer.from(bytes)
    const decoded = buf.toString('utf8')
    // Check if decoding produced valid text (no replacement characters)
    if (decoded.includes('\uFFFD')) return null
    return decoded
  } catch {
    return null
  }
}

function fixMojibakeInString(str) {
  // We need to find sequences of characters that look like mojibake and fix them.
  // Mojibake sequences start with characters in the range Ã (U+00C0–U+00C3, U+00C5, etc.)
  // which are the UTF-8 lead bytes interpreted as Win-1252.
  
  // Strategy: find runs of non-ASCII characters and try to un-mojibake them
  let result = ''
  let i = 0
  
  while (i < str.length) {
    const cp = str.codePointAt(i)
    
    // If this is an ASCII character, just keep it
    if (cp <= 0x7F) {
      result += str[i]
      i++
      continue
    }
    
    // Collect a run of non-ASCII characters (potentially mojibaked)
    let runEnd = i
    while (runEnd < str.length) {
      const rcp = str.codePointAt(runEnd)
      if (rcp <= 0x7F) break
      runEnd += str[runEnd].length  // handle surrogate pairs
    }
    
    const run = str.slice(i, runEnd)
    const fixed = tryUnMojibake(run)
    
    if (fixed !== null && fixed !== run) {
      result += fixed
    } else {
      result += run
    }
    
    i = runEnd
  }
  
  return result
}

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8')
  const original = content
  
  // Apply multiple passes to handle triple encoding
  for (let pass = 0; pass < 3; pass++) {
    const fixed = fixMojibakeInString(content)
    if (fixed === content) break  // No more changes
    content = fixed
  }
  
  if (content !== original) {
    writeFileSync(filePath, content, 'utf8')
    return true
  }
  return false
}

// Recursively find all .jsx, .tsx, .js, .ts files (excluding node_modules)
function findFiles(dir, exts) {
  let files = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files = files.concat(findFiles(full, exts))
    } else if (exts.some(ext => full.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

const root = process.cwd()
const files = findFiles(root, ['.jsx', '.tsx', '.js', '.ts', '.html', '.xml', '.md', '.css'])

let fixedCount = 0
for (const f of files) {
  try {
    if (fixFile(f)) {
      console.log(`Fixed: ${f}`)
      fixedCount++
    }
  } catch (e) {
    console.error(`Error processing ${f}: ${e.message}`)
  }
}

console.log(`\nDone. Fixed ${fixedCount} file(s).`)
