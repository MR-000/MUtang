const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'pwa-client', 'dist');
const dest = path.join(__dirname, 'public', 'pwa');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

try {
  if (fs.existsSync(src)) {
    // 기존 public/pwa 폴더 비우기
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      console.log('[Post-Build] 기존 public/pwa 폴더를 정리하였습니다.');
    }
    copyRecursiveSync(src, dest);
    console.log('[Post-Build] PWA 빌드 결과물(dist/*)을 public/pwa 경로로 성공적으로 통합 이관 완료하였습니다.');
  } else {
    console.warn('[Post-Build] Warning: pwa-client/dist 폴더를 찾을 수 없습니다.');
  }
} catch (e) {
  console.error('[Post-Build] Error during folder copy:', e);
  process.exit(1);
}
