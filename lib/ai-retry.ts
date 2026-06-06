// Gemini の一時的なエラー（高負荷時の 503 / レート超過の 429 など）を
// 指数バックオフで数回リトライする小さなヘルパー。
// 恒久的なエラー（APIキー不正・400 など）は即座に投げ直す。

const TRANSIENT = /\b(429|500|502|503|504)\b|overloaded|unavailable|resource[_ ]?exhausted|high demand|try again/i;

function isTransient(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err);
  return TRANSIENT.test(msg);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * fn を実行し、一時的なエラーなら最大 retries 回までリトライする。
 * 待機時間は 600ms, 1200ms, ... と指数的に増やし、わずかにゆらぎを加える。
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isTransient(e)) throw e;
      const backoff = 600 * 2 ** attempt + Math.floor(Math.random() * 300);
      await sleep(backoff);
    }
  }
  throw lastErr;
}
