import { describe, expect, it } from "vitest";
import { consumeGeneratorSse } from "../src/features/generators/stream";

function makeStream(frames: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    }
  });
}
describe("SSE de geração", () => {
  it("monta chunks separados sem perder caracteres UTF-8", async () => {
    const updates: string[] = [];
    const result = await consumeGeneratorSse(makeStream([
      'event: chunk\ndata: {"text":"Primeiro "}\n\n',
      'event: chunk\ndata: {"text":"cenário"}\n\n',
      'event: done\ndata: {"truncated":false}\n\n'
    ]), (text) => updates.push(text));
    expect(result).toEqual({ text: "Primeiro cenário", truncated: false });
    expect(updates).toHaveLength(2);
  });

  it("rejeita resposta incompleta sem tratar como conteúdo final", async () => {
    await expect(consumeGeneratorSse(makeStream([
      'event: chunk\ndata: {"text":"parcial"}\n\n'
    ]), () => {})).rejects.toThrow("não concluiu");
  });

  it("não descarta erros do provedor", async () => {
    await expect(consumeGeneratorSse(makeStream([
      'event: error\ndata: {"message":"Limite atingido"}\n\n'
    ]), () => {})).rejects.toThrow("Limite atingido");
  });
});
