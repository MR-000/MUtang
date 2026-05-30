import os

filepath = "d:/MT/utang/src/app/(main)/debts/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Line mappings for fixing broken Korean text in page.tsx (0-indexed)
lines[1441] = "                    법적 지연이자 제한 안내: 필리핀 민법 및 중앙은행 규정에 의거하여 기한 후 미납 시 청구하는 지연이율은 법정 상한선인 연 6%를 초과할 수 없습니다.\n"
lines[1448] = '                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기일 설정 방식</Label>\n'
lines[1455] = "                    기간 선택 및 기일 조정\n"
lines[1462] = "                    특정 날짜 지정\n"
lines[1469] = '                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기간 선택</Label>\n'
lines[1502] = '                        placeholder="만기 일수를 입력하세요 (예: 15)"\n'
lines[1533] = '                  기일 조정 가능 (상호 합의 하에 기일 조율 가능)\n'
lines[1555] = "              취소\n"
lines[1562] = "              {isSubmitting ? '등록 중...' : '공고 등록하기'}\n"
lines[1578] = "              상환 결제 및 증빙 제출\n"
lines[1589] = "              GCash 상환\n"
lines[1596] = "              USDT / USDC 코인 상환\n"
lines[1606] = '                    <span className="font-bold text-slate-400">채권자 이름:</span>\n'
lines[1610] = '                    <span className="font-bold text-slate-400">GCash 송금 번호:</span>\n'
lines[1613] = "                        {payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone || '등록된 번호 없음'}\n"
lines[1624] = "                            toast.success('전화번호가 복사되었습니다.');\n"
lines[1627] = "                          복사\n"
lines[1637] = '                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">채권자 GCash QR 코드</span>\n'

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Encoding fixes applied successfully!")
