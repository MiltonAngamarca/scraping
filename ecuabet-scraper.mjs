import { chromium } from 'playwright';
import fs from 'fs';

async function autoScroll(page, { maxRounds = 20, waitMs = 800 } = {}) {
  for (let i = 0; i < maxRounds; i++) {
    const before = await page
      .locator(
        'div[class^="EventBoxstyled__EventBoxRoot"], div[class*=" EventBoxRoot-"]'
      )
      .count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(waitMs);
    const after = await page
      .locator(
        'div[class^="EventBoxstyled__EventBoxRoot"], div[class*=" EventBoxRoot-"]'
      )
      .count();
    if (after === before) break;
  }
}

async function acceptCookies(page) {
  const selectors = [
    'button:has-text("Aceptar")',
    'button:has-text("Aceptar todo")',
    'button:has-text("Entendido")',
    'button:has-text("Aceptar y continuar")',
    'button:has-text("Accept")',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel);
    if (await btn.count()) {
      await btn
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
      break;
    }
  }
}

function cleanText(t) {
  return (t || '').replace(/\s+/g, ' ').trim();
}

async function extractEvents(page) {
  const selector = 'div[class*="EventBoxstyled__EventBoxRoot"]';
  const locator = page.locator(selector);
  const count = await locator.count();
  console.log(`Found ${count} events using locator '${selector}'`);

  return await locator.evaluateAll((eventNodes) => {
    function text(el) {
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    }

    return eventNodes.map((node) => {
      // Helper to find element piercing shadow roots if necessary,
      // but simple querySelector works if not nested deep in another shadow root.
      // If styles are just classes, querySelector is fine.

      const header =
        node.querySelector('[class*="EventBoxInfo"]') ||
        node.querySelector('[class*="EventBoxIntro"]');

      const competitorNameEls = Array.from(
        node.querySelectorAll(
          '[class*="CompetitorName"], [class*="CompetitorNameBase"]'
        )
      );
      const scoreEls = Array.from(
        node.querySelectorAll('[class*="ScoreBase"], [class*="Score"]')
      );

      const competitors = competitorNameEls.map((el, i) => ({
        name: text(el),
        score: text(scoreEls[i]),
      }));

      const marketContainers = Array.from(
        node.querySelectorAll(
          'div[class^="MarketBoxstyled__MarketBoxContainer"], div[class*="MarketBoxContainer"]'
        )
      );

      const markets = marketContainers
        .map((mc) => {
          const oddButtons = Array.from(
            mc.querySelectorAll('button, [class*="OddBoxButton"]')
          );
          const odds = oddButtons
            .map((btn) => {
              const v = btn.querySelector('[class*="OddValue"]');
              const l = btn.querySelector('[class*="OddLabel"]');
              return v || l ? { value: text(v), label: text(l) } : null;
            })
            .filter(Boolean);
          return odds.length ? { odds } : null;
        })
        .filter(Boolean);

      return {
        status: text(header),
        competitors,
        markets,
      };
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto('https://ecuabet.com/deportes/66', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(15000);
  await acceptCookies(page);

  // Wait for at least one event to load
  const eventSelector = 'div[class*="EventBoxstyled__EventBoxRoot"]';
  try {
    await page
      .locator(eventSelector)
      .first()
      .waitFor({ timeout: 60000, state: 'attached' });
  } catch (e) {
    console.log(
      'Wait for event selector timed out, trying to continue anyway...'
    );
  }

  // Generic scroll to trigger lazy loading
  await autoScroll(page, { maxRounds: 30, waitMs: 1500 });

  const events = await extractEvents(page);
  const result = {
    scraped_at: new Date().toISOString(),
    url: 'https://ecuabet.com/deportes/66',
    count: events.length,
    events,
  };
  fs.writeFileSync('ecuabet.json', JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('Error:', err?.message || err);
  process.exit(1);
});
