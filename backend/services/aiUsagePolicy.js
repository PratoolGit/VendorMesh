export function getDailyAIRequestLimit(value = process.env.AI_MAX_REQUESTS_PER_DAY) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : 25;
}

export function safeTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function extractAIAnswer(response) {
  if (!Array.isArray(response?.content)) return '';
  return response.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 12_000);
}
