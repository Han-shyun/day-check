const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['src'];
const TARGET_FILES = ['index.html', 'server.js', 'README.md'];
const EXTENSIONS = new Set(['.js', '.css', '.html', '.json', '.md']);
const MOJIBAKE_MARKERS = ['?꾨', '?몃', '?곗', '?놁', '濡쒓', '遺꾨', '移댁', '踰꾪궥', '猷⑦'];

const decoder = new TextDecoder('utf-8', { fatal: true });
const issues = [];

function addIssue(filePath, message) {
  issues.push(`${filePath}: ${message}`);
}

function collectFiles(dirPath, acc) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      return;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
      return;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) {
      return;
    }
    acc.push(fullPath);
  });
}

function checkFile(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    text = decoder.decode(buf);
  } catch {
    addIssue(relPath, 'UTF-8 디코딩 실패');
    return;
  }

  if (text.includes('\uFFFD')) {
    addIssue(relPath, '치환 문자(�) 발견');
  }

  MOJIBAKE_MARKERS.forEach((marker) => {
    if (!text.includes(marker)) {
      return;
    }
    addIssue(relPath, `깨진 문자열 패턴 발견: "${marker}"`);
  });
}

const files = [];
TARGET_DIRS.forEach((dir) => collectFiles(path.join(ROOT, dir), files));
TARGET_FILES.forEach((file) => {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    files.push(fullPath);
  }
});

Array.from(new Set(files)).forEach(checkFile);

if (issues.length > 0) {
  console.error('[check:text] 인코딩/문자열 이상 탐지');
  issues.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('[check:text] OK');
