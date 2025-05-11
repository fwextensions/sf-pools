import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const SF_REC_PARK_BASE_URL = 'https://sfrecpark.org';
const POOLS_LIST_URL = `${SF_REC_PARK_BASE_URL}/482/Swimming-Pools`;
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'discovered_pool_schedules.json');

interface PoolInfo {
  poolName: string;
  poolPageUrl: string;
  pdfScheduleUrl?: string;
}

/**
 * Fetches HTML content from a given URL.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Error fetching ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Phase 1: Scrapes the main pools list page to find links to individual pool pages.
 */
async function scrapePoolList(): Promise<PoolInfo[]> {
  console.log(`Fetching pool list from ${POOLS_LIST_URL}...`);
  const html = await fetchHtml(POOLS_LIST_URL);
  if (!html) {
    return [];
  }

  const $ = cheerio.load(html);
  const discoveredPools: PoolInfo[] = [];

  // Tentative selector: looking for links within a common content div structure
  $('div[class*="content"] a, section[class*="content"] a, article a').each((index, element) => {
    const poolName = $(element).text().trim();
    const relativePoolPageUrl = $(element).attr('href');

    // Basic filtering to avoid non-pool links and ensure essential data exists
    if (poolName && relativePoolPageUrl && relativePoolPageUrl.startsWith('/') && !relativePoolPageUrl.includes('/DocumentCenter/')) {
        // Further filter by keywords that might indicate it's a pool page link
        if (poolName.toLowerCase().includes('pool') || poolName.toLowerCase().includes('center') || relativePoolPageUrl.toLowerCase().includes('pool')) {
            const poolPageUrl = new URL(relativePoolPageUrl, SF_REC_PARK_BASE_URL).toString();
            // Avoid duplicates
            if (!discoveredPools.some(p => p.poolPageUrl === poolPageUrl)) {
                console.log(`Found potential pool: ${poolName} - ${poolPageUrl}`);
                discoveredPools.push({
                    poolName,
                    poolPageUrl,
                });
            }
        }
    }
  });

  console.log(`Found ${discoveredPools.length} potential pool pages after initial filtering.`);
  return discoveredPools;
}

/**
 * Phase 2: Scrapes an individual pool page to find the link to its schedule PDF.
 */
async function scrapeSchedulePdfLink(poolInfo: PoolInfo): Promise<string | undefined> {
  console.log(`Fetching schedule PDF link from ${poolInfo.poolPageUrl} for ${poolInfo.poolName}...`);
  const html = await fetchHtml(poolInfo.poolPageUrl);
  if (!html) {
    return undefined;
  }

  const $ = cheerio.load(html);
  let pdfUrl: string | undefined;

  const keywords = [
    'schedule', 'spring', 'summer', 'fall', 'winter', 'jan', 'feb', 'mar', 'apr',
    'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    // Add parts of the pool name as keywords
    ...poolInfo.poolName.toLowerCase().split(' ').filter(word => word.length > 2) // e.g., 'balboa', 'coffman', 'martin', 'luther', 'king'
  ];

  $('a').each((index, element) => {
    const linkElement = $(element);
    const href = linkElement.attr('href');
    const linkText = linkElement.text().toLowerCase().trim();

    if (href && href.includes('/DocumentCenter/View/')) {
      // Check if link text contains any of the keywords
      const foundKeyword = keywords.some(keyword => linkText.includes(keyword));

      if (foundKeyword) {
        pdfUrl = new URL(href, SF_REC_PARK_BASE_URL).toString();
        console.log(`Found PDF link for ${poolInfo.poolName}: ${pdfUrl} (text: "${linkElement.text().trim()}")`);
        return false; // Stop after finding the first relevant match
      }
    }
  });

  if (!pdfUrl) {
    console.log(`No matching PDF schedule link found for ${poolInfo.poolName} on ${poolInfo.poolPageUrl}`);
  }
  return pdfUrl;
}

async function main() {
  console.log('Starting SF Pools schedule scraping process...');
  const poolInfos = await scrapePoolList();

  if (poolInfos.length === 0) {
    console.log('No pool pages found. Exiting.');
    return;
  }

  const results: PoolInfo[] = [];
  for (const poolInfo of poolInfos) {
    const pdfScheduleUrl = await scrapeSchedulePdfLink(poolInfo); // Pass the whole poolInfo object
    if (pdfScheduleUrl) {
      results.push({ ...poolInfo, pdfScheduleUrl });
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Scraping complete. Results saved to ${OUTPUT_FILE}`);
  console.log(`Found ${results.length} schedules.`);
}

main().catch(error => {
  console.error('Scraping script failed:', error);
  process.exit(1);
});
