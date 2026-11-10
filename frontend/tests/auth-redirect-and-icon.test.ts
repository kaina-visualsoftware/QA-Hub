import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveAuthRedirectUrl, QA_HUB_EMAIL_CALLBACK_URL }
  from "../src/lib/auth-redirect";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("links de confirmação e recuperação de e-mail", () => {
  it("usa somente a página segura do QA Hub em produção, mesmo com env antiga", () => {
    for (const configuredUrl of [
      undefined,
      "http://localhost:3000",
      "http://localhost:5173/auth.html",
      "https://example.com/auth.html",
      "https://kaina-visualsoftware.github.io/QA-Hub/qa.html"
    ]) {
      const redirect = resolveAuthRedirectUrl({
        production: true, baseUrl: "/QA-Hub/react/",
        origin: "http://localhost:4173", configuredUrl
      });
      expect(redirect).toBe(QA_HUB_EMAIL_CALLBACK_URL);
      expect(redirect).not.toContain("localhost");
    }
  });

  it("usa a página de callback do Vite apenas durante o desenvolvimento", () => {
    expect(resolveAuthRedirectUrl({
      production: false, baseUrl: "/QA-Hub/",
      origin: "http://localhost:8765"
    })).toBe("http://localhost:8765/QA-Hub/auth.html");
  });
});

describe("ícone do QA Hub", () => {
  it("é declarado no HTML principal e na página de callback", () => {
    for (const html of [read("../index.html"), read("../auth.html")]) {
      expect(html).toContain('rel="icon"');
      expect(html).toContain("%BASE_URL%favicon.svg");
    }
    expect(read("../index.html")).toContain("%BASE_URL%site.webmanifest");
    expect(read("../public/favicon.svg")).toMatch(/<svg\s/);
    const manifest = JSON.parse(read("../public/site.webmanifest"));
    expect(manifest.short_name).toBe("QA Hub");
    expect(manifest.icons[0].src).toBe("favicon.svg");
  });
});
