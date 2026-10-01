/**
 * Responsive + console check for every UI change (docs/ENGINEERING_RULES.md §2.6).
 *
 * Loads each page at phone, tablet and desktop widths in light and dark themes and FAILS if:
 *   - the layout viewport is wider than the screen (a phone would zoom out; bottom sheets and
 *     sticky footers slip off-screen). This is stricter than "scrollWidth > innerWidth", which
 *     misses the case: an unbreakable word made the page 397px wide on a 375px phone in BS-2
 *     and innerWidth grew with it.
 *   - the page logs a console error or throws.
 * Screenshots go to .responsive-shots/ (gitignored) for a visual review.
 *
 * Usage (against a running server; a production build is the most faithful):
 *   npm run build && npx next start -p 3100
 *   npx playwright install chromium        # once per machine
 *   BASE_URL=http://localhost:3100 npm run check:responsive -- / /design-system
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/design-system"];
const mangled = paths.find((path) => !path.startsWith("/"));
if (mangled) {
  // Git Bash on Windows rewrites "/x" arguments into "C:/Program Files/Git/x".
  console.error(`Not a site path: "${mangled}". In Git Bash, prefix the command with MSYS_NO_PATHCONV=1.`);
  process.exit(2);
}
const WIDTHS = [320, 375, 414, 768, 1024, 1440];
const THEMES = ["light", "dark"];
const OUT = ".responsive-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const failures = [];

for (const path of paths) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const phone = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: phone ? 800 : 900 },
        colorScheme: theme,
        isMobile: phone,
        hasTouch: phone,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
      const { layoutWidth, scrollWidth } = await page.evaluate(() => ({
        layoutWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      // Paths may carry a query string; keep file names portable (no ? or = on Windows).
      const slug = path === "/" ? "home" : path.slice(1).replace(/[^A-Za-z0-9-]+/g, "_");
      const name = `${slug}-${theme}-${width}`;
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      if (layoutWidth !== width || scrollWidth > width + 1 || errors.length) {
        failures.push({ page: name, layoutWidth, scrollWidth, errors });
      }
      await context.close();
    }
  }
}

await browser.close();
if (failures.length) {
  console.error("Responsive check FAILED:\n" + JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(`Responsive check passed: ${paths.length} page(s) × ${WIDTHS.length} widths × ${THEMES.length} themes.`);
