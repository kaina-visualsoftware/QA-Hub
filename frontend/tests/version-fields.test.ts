import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatTaskVersionInput, normalizeTaskVersion } from "../src/lib/task-version";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("versões de TF e release em todas as páginas React", () => {
  it("máscara e normalização são compatíveis com as releases", () => {
    expect(formatTaskVersionInput("1210160003")).toBe("12.10.16.0003");
    expect(normalizeTaskVersion("12.10.16.3")).toBe("12.10.16.0003");
    expect(normalizeTaskVersion("12.10.16.0003")).toBe("12.10.16.0003");
  });
  it("Ferramentas e vínculos usam o mesmo campo de versão", () => {
    const tools = read("../src/pages/ToolsPage.tsx");
    const links = read("../src/features/links/LinksPanel.tsx");
    expect(tools).toMatch(/<VersionInput\s+value=\{version\}/);
    expect(links).toMatch(/<VersionInput\s+value=\{version\}/);
    expect(links).toContain("transform(normalizeTaskVersion)");
  });
  it("o campo compartilhado formata ao digitar e ao perder foco", () => {
    const input = read("../src/components/ui/VersionInput.tsx");
    expect(input).toContain("formatTaskVersionInput(event.target.value)");
    expect(input).toContain("normalizeTaskVersion(event.target.value)");
    expect(input).toContain("maxLength={13}");
  });
});
