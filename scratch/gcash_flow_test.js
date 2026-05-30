// GCash End-to-End Integration Test for Two Real Test Accounts
// Running in Node.js

const SUPABASE_URL = "https://bqkviztmboddwfwhcoyh.supabase.co";
const ANON_KEY = "sb_publishable_Dy7m96PitQHwL8wqlbRr7Q_34iLlvEQ";

// Deployed Edge Function Endpoints
const MANUAL_CONFIRM_URL = `${SUPABASE_URL}/functions/v1/confirm-payment`;
const AUTO_CONFIRM_URL = `${SUPABASE_URL}/functions/v1/auto-confirm-payments`;

// Real Test Accounts from Database
const LENDER_ID = "bd4ee601-7c03-4c2f-a9c7-e4f945470793";   // 테스트 대부업자
const BORROWER_ID = "e50dcdb6-c554-442b-9278-fe9b6baea04d"; // 테스트 대출자

async function runFullTestSuite() {
  console.log("=== 시작: GCash 상환 증빙 및 수동/자동 확정 통합 테스트 ===");
  console.log(`대부업자 ID (Lender): ${LENDER_ID}`);
  console.log(`대출자 ID (Borrower): ${BORROWER_ID}`);

  // 우리는 이 스크립트에서 직접 DB 상태를 복사하고 Edge Function을 호출하여
  // 수동 승인 흐름과 자동 승인 흐름을 차례대로 검증합니다.
  
  // 시나리오 1: 대출자가 증빙 제출 -> 대부업자가 수동으로 확정(승인)하는 흐름
  console.log("\n[테스트 시나리오 1: 대부업자 수동 승인 플로우]");
  const proofId1 = "11111111-1111-1111-1111-111111111111";
  
  console.log("1. 대부업자 수동 승인 API 호출 중...");
  try {
    const res1 = await fetch(MANUAL_CONFIRM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify({
        proof_id: proofId1,
        confirmer_id: LENDER_ID,
        action: "confirm"
      })
    });
    
    const data1 = await res1.json();
    console.log("수동 승인 API 응답:", JSON.stringify(data1, null, 2));
  } catch (err) {
    console.error("수동 승인 API 호출 실패:", err);
  }

  // 시나리오 2: 대출자가 증빙 제출 -> 1시간 경과 후 시스템이 자동으로 확정하는 흐름
  console.log("\n[테스트 시나리오 2: 시스템 1시간 경과 자동 확정 플로우]");
  
  console.log("2. 자동 확정 배치 워커 API 호출 중...");
  try {
    const res2 = await fetch(AUTO_CONFIRM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`
      }
    });
    
    const data2 = await res2.json();
    console.log("자동 확정 API 응답:", JSON.stringify(data2, null, 2));
  } catch (err) {
    console.error("자동 확정 API 호출 실패:", err);
  }

  console.log("\n=== 완료: 통합 테스트 실행 완료 ===");
}

runFullTestSuite();
