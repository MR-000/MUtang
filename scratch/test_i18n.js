const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/lib/i18n.ts');

try {
  console.log('[i18n 번역 무결성 테스트 실행]');
  console.log(`대상 파일: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // translations 객체 덩어리를 추출
  const startIdx = content.indexOf('export const translations: Dictionary = {');
  if (startIdx === -1) {
    throw new Error('translations 딕셔너리를 찾을 수 없습니다.');
  }
  
  const braceStart = content.indexOf('{', startIdx);
  let braceCount = 1;
  let endIdx = braceStart + 1;
  
  while (braceCount > 0 && endIdx < content.length) {
    if (content[endIdx] === '{') braceCount++;
    if (content[endIdx] === '}') braceCount--;
    endIdx++;
  }
  
  const translationsBody = content.slice(braceStart, endIdx);
  
  // 객체 텍스트를 간접적으로 eval 하기 위해 안전하게 포맷팅
  // translationsBody는 JSON 형태가 아니므로 JS 코드로 파싱합니다.
  const parsedTranslations = eval(`(${translationsBody})`);
  
  const languages = ['en', 'tl', 'ko', 'zh', 'ja'];
  const keys = Object.keys(parsedTranslations);
  
  console.log(`\n총 검사 키 개수: ${keys.length}개`);
  
  let passedCount = 0;
  let failedCount = 0;
  const failureReports = [];
  
  const tableData = [];
  
  keys.forEach(key => {
    const item = parsedTranslations[key];
    const status = {};
    let isAllPassed = true;
    
    languages.forEach(lang => {
      const translation = item[lang];
      if (translation && typeof translation === 'string' && translation.trim() !== '') {
        status[lang] = 'OK';
      } else {
        status[lang] = 'MISSING';
        isAllPassed = false;
      }
    });
    
    if (isAllPassed) {
      passedCount++;
      tableData.push({ Key: key, ...status, Overall: 'PASSED' });
    } else {
      failedCount++;
      failureReports.push({ Key: key, Status: status });
      tableData.push({ Key: key, ...status, Overall: 'FAILED' });
    }
  });
  
  console.log('\n[테스트 통계 요약]');
  console.log(`- 무결성 통과 (PASSED): ${passedCount} / ${keys.length} (${((passedCount/keys.length)*100).toFixed(1)}%)`);
  console.log(`- 번역 누락 (FAILED): ${failedCount} / ${keys.length}`);
  
  if (failedCount > 0) {
    console.log('\n[누락된 번역 감지 상세 리포트]');
    failureReports.forEach(rep => {
      console.log(`키: "${rep.Key}" -> `, rep.Status);
    });
    process.exit(1);
  } else {
    console.log('\n[최종 무결성 합격] 모든 번역 키가 5개 국어(영어, 타갈로그어, 한국어, 중국어, 일본어)에 대해 100% 누락 없이 완벽히 정의되어 연동 가능합니다!');
    process.exit(0);
  }
  
} catch (err) {
  console.error('테스트 실행 중 치명적인 에러 발생:', err.message);
  process.exit(1);
}
