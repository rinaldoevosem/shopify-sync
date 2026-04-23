import { NextRequest, NextResponse } from "next/server";
import { getAllConfigs, getConfig, saveConfig, appendLog, getCsvData, Category, CATEGORIES } from "@/lib/kv";
import { fetchSkuMap, upsertProduct } from "@/lib/shopify";
import { shouldSkip } from "@/lib/converters/shared";
import { convertRing } from "@/lib/converters/rings";

const PRODUCT_TYPE: Record<Category, string> = {
  rings: "Rings",
  bracelets: "Bracelets",
  necklaces: "Necklaces",
  earrings: "Earrings",
  bags: "Bags",
  "mens-rings": "Mens Rings",
  "designer-jewelry": "Designer Jewelry",
};

function getConverter(cat: Category) {
  if (cat === "rings") return convertRing;
  return null;
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
  // Protect cron endpoint
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await getAllConfigs();
  const current = currentHHMM();
  const today = todayStr();
  const fired: string[] = [];

  for (const { id: cat } of CATEGORIES) {
    const config = configs[cat];
    if (!config.scheduleEnabled) continue;
    if (!config.scheduleTime) continue;
    if (current < config.scheduleTime) continue; // not time yet
    if (config.lastRunAt && config.lastRunAt.slice(0, 10) === today) continue; // already ran today

    const converter = getConverter(cat);
    if (!converter) continue;

    const csvData = await getCsvData(cat);
    if (!csvData) continue;

    const { records } = csvData;
    const eligible = records.filter((row) => !shouldSkip(row));
    const startedAt = new Date().toISOString();
    let created = 0, updated = 0, skipped = records.length - eligible.length, errors = 0;
    const errorDetails: string[] = [];

    const skuMap = await fetchSkuMap(PRODUCT_TYPE[cat]);

    for (const row of eligible) {
      try {
        const product = converter(row);
        if (!product.sku) { skipped++; continue; }
        const existingGid = skuMap.get(product.sku);
        const result = await upsertProduct(product, existingGid);
        if (result.errors.length > 0) {
          errors++;
          errorDetails.push(`SKU ${product.sku}: ${result.errors.join("; ")}`);
        } else if (result.action === "created") {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        errors++;
        errorDetails.push(`SKU ${row["Item No."] ?? "unknown"}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(300);
    }

    const completedAt = new Date().toISOString();
    await appendLog(cat, { category: cat, startedAt, completedAt, created, updated, skipped, errors, errorDetails });
    const current2 = await getConfig(cat);
    await saveConfig(cat, { ...current2, lastRunAt: completedAt });
    fired.push(cat);
  }

  return NextResponse.json({ fired, time: currentHHMM() });
}
