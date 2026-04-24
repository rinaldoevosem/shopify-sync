import { NextRequest, NextResponse } from "next/server";
import { getAllConfigs, getConfig, saveConfig, appendLog, storeVideoQueue, VideoQueueEntry, Category, CATEGORIES } from "@/lib/kv";
import { fetchSkuMap, fetchOnlineStorePublicationId, upsertProduct, SkuEntry } from "@/lib/shopify";
import { shouldSkip, AirtableRecord } from "@/lib/converters/shared";
import { parseAirtableUrl, fetchAirtableRecords, flattenRecord } from "@/lib/airtable";
import { convertRing } from "@/lib/converters/rings";
import { convertBracelet } from "@/lib/converters/bracelets";
import { convertEarring } from "@/lib/converters/earrings";
import { convertNecklace } from "@/lib/converters/necklaces";

export const maxDuration = 300;

type Converter = (row: AirtableRecord) => ReturnType<typeof convertRing>;

function getConverter(cat: Category): Converter | null {
  switch (cat) {
    case "rings":
      return convertRing;
    case "bracelets":
      return convertBracelet;
    case "earrings":
      return convertEarring;
    case "necklaces":
      return convertNecklace;
    default:
      return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function currentHHMM(): string {
  const now = new Date();
  return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await getAllConfigs();
  const current = currentHHMM();
  const today = todayStr();
  const fired: string[] = [];
  const errors: { category: Category; message: string }[] = [];

  let skuMap: Map<string, SkuEntry> | null = null;
  let onlineStorePublicationId: string | null = null;

  for (const { id: cat } of CATEGORIES) {
    const config = configs[cat];
    if (!config.scheduleEnabled) continue;
    if (!config.scheduleTime) continue;
    if (current < config.scheduleTime) continue;
    if (config.lastRunAt && config.lastRunAt.slice(0, 10) === today) continue;

    const converter = getConverter(cat);
    if (!converter) continue;

    const airtableUrl = config.airtableUrl?.trim();
    if (!airtableUrl) continue;

    let records: AirtableRecord[];
    try {
      const { baseId, tableId, viewId } = parseAirtableUrl(airtableUrl);
      const raw = await fetchAirtableRecords(baseId, tableId, viewId);
      records = raw.map(flattenRecord);
    } catch (err) {
      errors.push({ category: cat, message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const eligible = records.filter((row) => !shouldSkip(row));
    const startedAt = new Date().toISOString();
    let created = 0, updated = 0, skipped = records.length - eligible.length, errCount = 0;
    const errorDetails: string[] = [];
    const videoQueue: VideoQueueEntry[] = [];

    if (!skuMap || !onlineStorePublicationId) {
      [skuMap, onlineStorePublicationId] = await Promise.all([fetchSkuMap(), fetchOnlineStorePublicationId()]);
    }

    for (const row of eligible) {
      try {
        const product = converter(row);
        if (!product.sku) { skipped++; continue; }
        const existingEntry = skuMap.get(product.sku);
        const result = await upsertProduct(product, existingEntry, false, onlineStorePublicationId);
        if (result.errors.length > 0) {
          errCount++;
          errorDetails.push(`SKU ${product.sku}: ${result.errors.join("; ")}`);
        } else if (result.action === "created") {
          created++;
        } else {
          updated++;
        }

        const videoMedia = product.media.filter((m) => m.mediaContentType === "VIDEO");
        if (videoMedia.length > 0 && result.productId && result.productId !== "dry-run") {
          videoQueue.push({
            productGid: result.productId,
            sku: product.sku,
            videoUrls: videoMedia.map((m) => m.originalSource),
            filenames: videoMedia.map((m) => m.filename),
          });
        }
      } catch (err) {
        errCount++;
        errorDetails.push(`SKU ${row["Item No."] ?? "unknown"}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(300);
    }

    const completedAt = new Date().toISOString();
    await appendLog(cat, { category: cat, startedAt, completedAt, created, updated, skipped, errors: errCount, errorDetails });
    const current2 = await getConfig(cat);
    await saveConfig(cat, { ...current2, lastRunAt: completedAt });
    if (videoQueue.length > 0) {
      await storeVideoQueue(cat, videoQueue);
    }
    fired.push(cat);
  }

  return NextResponse.json({ fired, errors, time: currentHHMM() });
}
