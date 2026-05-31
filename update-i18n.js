const fs = require('fs');

const filePath = 'd:/MT/utang/src/lib/i18n.ts';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = "lender: { en: 'Lender', tl: 'Nagpapautang', ko: '대부업자', zh: '贷方', ja: '貸主' },";
const replacementStr = "lender: { en: 'Lender', tl: 'Nagpapautang', ko: '채권자', zh: '贷方', ja: '貸主' },\n  user: { en: 'Member', tl: 'User', ko: '이용자', zh: '用户', ja: 'ユーザー' },";

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Success: i18n file updated successfully with new key mappings!');
} else {
  console.log('Error: Target string not found in i18n file.');
}
