// Direct provider callers for user-supplied API keys (Settings → Integrations).
// Lets post generation bypass the shared Lovable AI gateway credit pool
// entirely when a user has connected their own OpenAI, Gemini, Anthropic, or
// OpenRouter key. Server-only — never import from client code.

export type DirectProvider = "openai" | "gemini" | "anthropic" | "openrouter";

export type DirectChatMessage = {
  role: "system" | "user";
  text: string;
  imageUrls?: string[];
};

const DIRECT_MODELS: Record<DirectProvider, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5",
  openrouter: "google/gemini-2.5-flash",
};

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: DirectChatMessage[],
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.imageUrls?.length
          ? [
              { type: "text", text: m.text },
              ...m.imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            ]
          : m.text,
      })),
    }),
  });
  if (!res.ok) throw new Error(`${baseUrl} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function callGemini(apiKey: string, model: string, messages: DirectChatMessage[]): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.text;
  const user = messages.find((m) => m.role === "user");
  if (!user) throw new Error("No user message to send to Gemini");

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: user.text },
  ];
  for (const url of user.imageUrls ?? []) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) continue;
    const buf = await imgRes.arrayBuffer();
    const mime = imgRes.headers.get("content-type") || "image/jpeg";
    parts.push({ inline_data: { mime_type: mime, data: Buffer.from(buf).toString("base64") } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function callAnthropic(apiKey: string, model: string, messages: DirectChatMessage[]): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.text;
  const user = messages.find((m) => m.role === "user");
  if (!user) throw new Error("No user message to send to Claude");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [{ type: "text", text: user.text }];
  for (const url of user.imageUrls ?? []) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) continue;
    const buf = await imgRes.arrayBuffer();
    const mediaType = imgRes.headers.get("content-type") || "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: Buffer.from(buf).toString("base64") },
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

/**
 * Calls the given provider directly with the user's own API key. Throws on
 * failure — callers should catch and fall back to the shared Lovable gateway.
 */
export async function callDirectLLM(
  provider: DirectProvider,
  apiKey: string,
  messages: DirectChatMessage[],
): Promise<string> {
  const model = DIRECT_MODELS[provider];
  switch (provider) {
    case "openai":
      return callOpenAiCompatible("https://api.openai.com/v1", apiKey, model, messages);
    case "openrouter":
      return callOpenAiCompatible("https://openrouter.ai/api/v1", apiKey, model, messages, {
        "HTTP-Referer": "https://gmb-rank-pilot.app",
        "X-Title": "GMB Rank Pilot",
      });
    case "gemini":
      return callGemini(apiKey, model, messages);
    case "anthropic":
      return callAnthropic(apiKey, model, messages);
  }
}
