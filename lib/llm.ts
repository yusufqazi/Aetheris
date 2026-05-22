import OpenAI from "openai";

export function hasLlmAccess() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function runStructuredGeneration<T>({
  system,
  user,
  fallback,
}: {
  system: string;
  user: string;
  fallback: () => T;
}) {
  if (!process.env.OPENAI_API_KEY) {
    return fallback();
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return fallback();
    }

    return JSON.parse(content) as T;
  } catch {
    return fallback();
  }
}
