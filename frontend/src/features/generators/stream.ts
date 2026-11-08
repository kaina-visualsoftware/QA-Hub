import { z } from "zod";
import { supabase, publishableKey, qaGeneratorUrl } from "../../lib/supabase";

const chunkSchema = z.object({ text: z.string().max(115000) });
const doneSchema = z.object({ truncated: z.boolean().optional() });
const errorSchema = z.object({ message: z.string().min(1).max(500) });

export type GeneratorMode = "post" | "teste";
export type StreamResult = { text: string; truncated: boolean };

export async function consumeGeneratorSse(
  body: ReadableStream<Uint8Array>, onChunk: (text: string) => void, signal?: AbortSignal
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", result = "", complete = false, truncated = false;
  function parseEvent(raw: string) {
    const lines = raw.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!event || !data) return;
    let payload: unknown;
    try { payload = JSON.parse(data); } catch { throw Error("Resposta de IA inválida."); }
    if (event === "error") throw Error(errorSchema.parse(payload).message);
    if (event === "chunk") {
      const text = chunkSchema.parse(payload).text;
      result += text;
      if (result.length > 115000) throw Error("A resposta excedeu o limite permitido.");
      onChunk(text);
    }
    if (event === "done") {
      truncated = doneSchema.parse(payload).truncated ?? false;
      complete = true;
    }
  }
  function flush() {
    let position = buffer.search(/\r?\n\r?\n/);
    while (position !== -1) {
      const delimiter = buffer.slice(position).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
      const next = buffer.slice(0, position);
      buffer = buffer.slice(position + delimiter.length);
      parseEvent(next);
      position = buffer.search(/\r?\n\r?\n/);
    }
    if (buffer.length > 175000) throw Error("Resposta de IA com tamanho inválido.");
  }
  try {
    while (true) {
      if (signal?.aborted) throw Error("Geração cancelada.");
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush();
    }
    buffer += decoder.decode();
    flush();
    if (buffer.trim()) parseEvent(buffer);
    if (!complete || !result.trim()) throw Error("A IA não concluiu a resposta. Tente novamente.");
    return { text: result, truncated };
  } finally {
    try { await reader.cancel(); } catch { /* stream may be closed */ }
    reader.releaseLock();
  }
}

export async function generateWithNvidia(
  mode: GeneratorMode,
  tarefa: string,
  requisito: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<StreamResult> {
  if (!["post", "teste"].includes(mode) || !tarefa.trim() || tarefa.length > 30000 ||
      requisito.length > 20000) throw Error("Contexto inválido ou excedeu o limite.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw Error("Entre novamente no QA Hub.");
  const response = await fetch(qaGeneratorUrl, {
    method: "POST", signal,
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      apikey: publishableKey,
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ mode, tarefa, requisito })
  });
  if (!response.ok) {
    let message = "Não foi possível gerar o conteúdo.";
    try {
      const payload: unknown = await response.json();
      const parsed = errorSchema.safeParse(payload);
      if (parsed.success) message = parsed.data.message;
    } catch { /* non-JSON server response */ }
    throw Error(message);
  }
  if (!response.body) throw Error("O navegador não disponibilizou o streaming da IA.");
  return consumeGeneratorSse(response.body, onChunk, signal);
}
