export async function getPhpExchangeRate(token: 'usdt' | 'usdc'): Promise<number> {
  const apiKey = process.env.COINGECKO_API_KEY;
  const tokenId = token === 'usdt' ? 'tether' : 'usd-coin';
  
  const fallbackRates = {
    'tether': 58.20,
    'usd-coin': 58.15
  };

  // 1. 브라우저 환경에서 로컬 스토리지 캐시 검사
  if (typeof window !== 'undefined') {
    try {
      const cacheKey = `utang_exchange_rate_${tokenId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { rate, expiresAt } = JSON.parse(cached);
        if (expiresAt && Date.now() < expiresAt && typeof rate === 'number') {
          console.log(`[Exchange Cache Hit] ${token.toUpperCase()} to PHP cached rate: ${rate}`);
          return rate;
        }
      }
    } catch (cacheError) {
      console.warn('[Exchange Cache Read Error] Failed to read from localStorage:', cacheError);
    }
  }

  if (!apiKey) {
    console.warn('[Exchange] COINGECKO_API_KEY is not defined. Using fallback rate.');
    return fallbackRates[tokenId];
  }

  try {
    const url = `https://demo-api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=php`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-cg-demo-api-key': apiKey,
        'Accept': 'application/json'
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const rate = data[tokenId]?.php;

    if (rate && !isNaN(rate) && rate > 0) {
      console.log(`[Exchange] Fetched real-time ${token.toUpperCase()} to PHP rate: ${rate}`);
      
      // 2. 브라우저 환경에서 5분 캐시 기록 (300,000 밀리초)
      if (typeof window !== 'undefined') {
        try {
          const cacheKey = `utang_exchange_rate_${tokenId}`;
          const cacheValue = JSON.stringify({
            rate,
            expiresAt: Date.now() + 5 * 60 * 1000
          });
          localStorage.setItem(cacheKey, cacheValue);
        } catch (cacheSaveError) {
          console.warn('[Exchange Cache Save Error] Failed to save to localStorage:', cacheSaveError);
        }
      }

      return rate;
    }
    
    throw new Error('Invalid rate response format');
  } catch (error) {
    console.error(`[Exchange] CoinGecko fetch failed. Using fallback rate for ${token.toUpperCase()}:`, error);
    return fallbackRates[tokenId];
  }
}

export async function convertTokenToCredit(amount: number, token: 'usdt' | 'usdc'): Promise<number> {
  const phpRate = await getPhpExchangeRate(token);
  const phpAmount = amount * phpRate;
  const credit = phpAmount / 10;
  return Number(credit.toFixed(4));
}

