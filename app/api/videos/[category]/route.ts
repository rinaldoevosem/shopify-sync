import { NextRequest, NextResponse } from "next/server";
import { getVideoQueue, storeVideoQueue, Category, CATEGORIES } from "@/lib/kv";
import { uploadVideoToProduct } from "@/lib/shopify";

export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const queue = await getVideoQueue(cat);
  const count = queue.reduce((sum, e) => sum + e.videoUrls.length, 0);
  return NextResponse.json({ category: cat, products: queue.length, videos: count });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const cat = category as Category;

  if (!CATEGORIES.find((c) => c.id === cat)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const queue = await getVideoQueue(cat);
  if (queue.length === 0) {
    return NextResponse.json({ processed: 0, errors: [] });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const entry of queue) {
    for (let i = 0; i < entry.videoUrls.length; i++) {
      const videoUrl = entry.videoUrls[i];
      const filename = entry.filenames[i] ?? `video_${i}.mov`;
      const uploadErrors = await uploadVideoToProduct(entry.productGid, videoUrl, filename);
      if (uploadErrors.length > 0) {
        errors.push(`SKU ${entry.sku} (${filename}): ${uploadErrors.join("; ")}`);
      } else {
        processed++;
      }
    }
  }

  // Clear the queue after processing
  await storeVideoQueue(cat, []);

  return NextResponse.json({ processed, errors });
}
