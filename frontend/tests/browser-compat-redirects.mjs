import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.QA_COMPAT_BASE || "http://127.0.0.1:8766/";
const tf = "33333333-3333-4333-8333-333333333333";
const routes = [
  ["index.html", "/react/#/"],
  ["index.html#/ferramentas", "/react/#/ferramentas"],
  ["index.html#/perfil", "/react/#/perfil"],
  ["index-legacy.html", "/react/#/"],
  ["qa.html", "/react/#/"],
  ["qa-legacy.html", "/react/#/"],
  ["qa-legacy.html?code=synthetic", "/react/auth.html?code=synthetic"],
  ["qa.html?type=recovery#access_token=synthetic&type=recovery",
    "/react/auth.html?type=recovery#access_token=synthetic&type=recovery"],
  ["public.html", "/react/#/publicas"],
  ["public.html?tf=" + tf, "/react/#/publicas?tf=" + tf],
  ["geradores.html#release", "/react/#/ferramentas"],
  ["geradores.html#post", "/react/#/"]
];
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  for (const [start,end] of routes) {
    await page.goto(base + start, {waitUntil:"domcontentloaded"});
    await page.waitForURL(url => url.href.includes(end), {timeout:12000});
    const actual = new URL(page.url());
    assert.equal(actual.pathname + actual.search + actual.hash, end,
      "Legacy entry should map to the expected React destination: "+start);
    console.log("PASS "+start+" -> "+end);
  }
} finally {
  await browser.close();
}
