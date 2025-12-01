import { chromium } from 'playwright';
import fs from 'fs';

async function acceptCookies(page) {
  try {
    const cookieButton = page
      .locator(
        'button:has-text("Aceptar"), button:has-text("Accept"), button:has-text("Entendido")'
      )
      .first();
    if (await cookieButton.isVisible()) {
      await cookieButton.click();
      console.log('Accepted cookies');
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.log('No cookie banner found or error clicking:', e.message);
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= 500) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

export async function scrapeMatches() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  const matchIds = new Set();
  const processedIds = new Set();
  const allMatchesData = [];
  let currentScrapingId = null;

  page.on('response', async (response) => {
    const url = response.url();

    // Intercept GetLiveOverview/GetLivenow to find ALL Match IDs
    if (url.includes('GetLiveOverview') || url.includes('GetLivenow')) {
      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const json = await response.json();

          let events = [];
          if (Array.isArray(json)) events = json;
          else if (json.events && Array.isArray(json.events))
            events = json.events;
          else if (json.data && Array.isArray(json.data)) events = json.data;

          if (events.length > 0) {
            events.forEach((event) => {
              const id = event.id || event.eventId;
              if (id) {
                if (!matchIds.has(id)) {
                  console.log(`Found new Match ID: ${id}`);
                  matchIds.add(id);
                }
              }
            });
          }
        }
      } catch (e) {}
    }

    // Intercept GetEventDetails to get match data directly
    if (url.includes('GetEventDetails')) {
      // console.log('Intercepted GetEventDetails!'); // Reduce noise
      try {
        const json = await response.json();

        // Determine ID from the JSON response
        const responseId = json.id;

        if (responseId) {
          // Check if we already have this ID in our data to avoid duplicates
          if (processedIds.has(responseId)) return;

          console.log(`Captured details for match: ${responseId}`);

          // Process the data
          const matchData = {
            matchId: responseId,
            name: json.name || 'Unknown vs Unknown',
            url: null,
            data: {},
          };

          // Create a map of odds for easy lookup
          const oddsMap = new Map();
          const oddsArray = json.odds || (json.data && json.data.odds);

          if (oddsArray) {
            oddsArray.forEach((odd) => {
              oddsMap.set(odd.id, odd);
            });
          }

          // Process markets
          const processedData = {};
          const marketsArray = json.markets || (json.data && json.data.markets);

          if (marketsArray) {
            marketsArray.forEach((market) => {
              const marketName = market.name;
              const marketOdds = [];

              // Collect all odd IDs
              const oddIds = market.desktopOddIds
                ? market.desktopOddIds.flat()
                : [];

              oddIds.forEach((oddId) => {
                const oddData = oddsMap.get(oddId);
                if (oddData) {
                  marketOdds.push({
                    name: oddData.name || oddData.shortName,
                    price: oddData.price,
                    id: oddData.id,
                  });
                }
              });

              if (marketOdds.length > 0) {
                processedData[marketName] = marketOdds;
              }
            });
          }

          matchData.data = processedData;
          allMatchesData.push(matchData);

          // Mark as processed
          processedIds.add(responseId);
        }
      } catch (e) {
        console.log('Error parsing GetEventDetails JSON:', e);
      }
    }
  });

  const listingUrl = 'https://ecuabet.com/deportes/66';
  console.log(`Navigating to listing page to gather IDs: ${listingUrl}...`);

  await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);

  console.log('Waiting for IDs to be collected...');
  // Wait longer to ensure we populate the list.
  // We can also check periodically if the list size stops growing, but a fixed wait is simpler for now.
  await page.waitForTimeout(10000);

  // Scroll once to trigger more lazy loading if needed
  await autoScroll(page);
  await page.waitForTimeout(5000);

  const idsToProcess = Array.from(matchIds);
  console.log(`\nTotal unique matches found: ${idsToProcess.length}`);
  console.log('Starting batch processing...');

  for (const id of idsToProcess) {
    if (processedIds.has(id)) {
      console.log(`Match ${id} already processed. Skipping.`);
      continue;
    }

    console.log(`\n--- Processing Match ID: ${id} ---`);
    currentScrapingId = id;

    const detailUrl = `https://ecuabet.com/deportes/partido/${id}`;
    try {
      await page.goto(detailUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for the data to be captured
      // We poll processedIds until the ID appears or timeout
      let retries = 0;
      const maxRetries = 15; // 15 * 1s = 15 seconds wait for API response

      while (!processedIds.has(id) && retries < maxRetries) {
        await page.waitForTimeout(1000);
        retries++;
      }

      if (processedIds.has(id)) {
        console.log(`Successfully processed match ${id}.`);
      } else {
        console.log(`Timeout waiting for data for match ${id}.`);
      }
    } catch (err) {
      console.log(`Error navigating to match ${id}: ${err.message}`);
    }
  }

  console.log('\nBatch processing complete.');
  console.log(`Total processed: ${processedIds.size} / ${idsToProcess.length}`);

  if (allMatchesData.length > 0) {
    const finalFilename = 'all_matches.json';
    fs.writeFileSync(finalFilename, JSON.stringify(allMatchesData, null, 2));
    console.log(`\nSaved all match data to ${finalFilename}`);
  } else {
    console.log('\nNo match data collected to save.');
  }

  await browser.close();
  return allMatchesData;
}

async function scrapeMatchInFrame(frameOrPage) {
  console.log('Attempting to scrape match details from frame/page...');

  try {
    // Try to find tabs
    const tabs = await frameOrPage.$$(
      'div[class*="Tab"], button[class*="Tab"], li[class*="tab"]'
    );
    console.log(`Found ${tabs.length} tab candidates.`);

    if (tabs.length > 0) {
      for (const tab of tabs) {
        const text = await tab.innerText();
        console.log(`Tab text: ${text}`);
      }
    } else {
      console.log('No tabs found using generic selectors.');
    }

    // Try to find market headers
    const headers = await frameOrPage.$$(
      'div[class*="Header"], div[class*="title"]'
    );
    console.log(`Found ${headers.length} potential market headers.`);
  } catch (e) {
    console.log(`Error in scrapeMatchInFrame: ${e.message}`);
  }
}
