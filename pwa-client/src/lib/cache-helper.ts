/**
 * 대용량 AI 모델 ONNX 자산을 브라우저 Cache API에 보관하여 오프라인 기동 시 고속 로딩 지원
 */
export async function fetchWithCache(url: string, onProgress?: (msg: string) => void): Promise<ArrayBuffer> {
  const cacheName = 'mutang-ai-models';
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      console.log(`[Cache] Found model in Cache Storage: ${url}`);
      if (onProgress) onProgress(`로컬 디스크 캐시에서 불러오는 중: ${url.split('/').pop()}`);
      return await cachedResponse.arrayBuffer();
    }
    
    console.log(`[Cache] Cache miss. Fetching from network: ${url}`);
    if (onProgress) onProgress(`네트워크에서 인공지능 다운로드 중 (최초 1회): ${url.split('/').pop()}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network response was not ok: ${url}`);
    
    // 캐시에 응답 복사본 저장
    await cache.put(url, response.clone());
    return await response.arrayBuffer();
  } catch (err) {
    console.warn(`[Cache] Cache API load failed, falling back to direct network fetch: ${err}`);
    if (onProgress) onProgress(`네트워크 직접 다운로드 중: ${url.split('/').pop()}`);
    const response = await fetch(url);
    return await response.arrayBuffer();
  }
}
