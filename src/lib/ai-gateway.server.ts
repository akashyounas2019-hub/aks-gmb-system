// Minimal fetch wrapper for the Lovable AI Gateway (OpenAI-compatible).
// Server-only.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

export async function callLovableAI(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object";
}): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": params.apiKey,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      ...(params.responseFormat ? { response_format: { type: params.responseFormat } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}
