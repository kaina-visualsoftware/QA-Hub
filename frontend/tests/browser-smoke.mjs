import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const issues = [];
try {
  for (const width of [390, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on("pageerror", (error) => issues.push(width + "px: " + error.message));
    await page.goto("http://127.0.0.1:4173/QA-Hub/", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Entrar" }).waitFor({ timeout: 10000 });
    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    );
    if (overflow > 1) issues.push(width + "px: overflow horizontal " + overflow + "px");
    await page.getByRole("button", { name: "Criar uma conta" }).click();
    await page.getByRole("heading", { name: "Criar conta" }).waitFor();
    await page.getByRole("button", { name: "Já tenho conta" }).click();
    await page.getByRole("heading", { name: "Entrar" }).waitFor();
    await page.close();
  }
} finally {
  await browser.close();
}
if (issues.length) throw Error(issues.join("\n"));
console.log("React browser smoke: login e responsividade verificados em 390/768/1366 px.");
