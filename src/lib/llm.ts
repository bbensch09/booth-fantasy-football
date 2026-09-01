/**
 * Narration layer. Fireworks by default, but the call is OpenAI-compatible so
 * pointing BOOTH_LLM_BASE_URL at any other provider is a one line change.
 *
 * Every recommendation is already computed and defensible before this runs.
 * If the key is missing or the call fails, Booth falls back to template text
 * and nothing breaks.
 */
const BASE = process.env.BOOTH_LLM_BASE_URL ?? "https://api.fireworks.ai/inference/v1";
const MODEL = process.env.BOOTH_LLM_MODEL ?? "accounts/fireworks/models/llama-v3p3-70b-instruct";

export function llmEnabled() {
  return Boolean(process.env.BOOTH_LLM_API_KEY);
}

export async function narrate(system: string, user: string, maxTokens = 220): Promise<string | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.BOOTH_LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch {
    return null;
  }
}
