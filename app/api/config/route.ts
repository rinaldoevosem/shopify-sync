import { NextRequest, NextResponse } from "next/server";
import { getAllConfigs, saveAllConfigs, getAllLogs, getAllVideoQueueCounts, Category } from "@/lib/kv";
import { parseAirtableUrl } from "@/lib/airtable";

export async function GET() {
  const [configs, logs, videoQueueCounts] = await Promise.all([
    getAllConfigs(),
    getAllLogs(),
    getAllVideoQueueCounts(),
  ]);

  return NextResponse.json({ configs, logs, videoQueueCounts });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<Category, {
    scheduleEnabled: boolean;
    scheduleTime: string;
    airtableUrl?: string;
  }>;

  for (const [cat, cfg] of Object.entries(body)) {
    const url = cfg.airtableUrl?.trim();
    if (url) {
      try {
        parseAirtableUrl(url);
      } catch (err) {
        return NextResponse.json(
          { error: `Invalid Airtable URL for ${cat}: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 },
        );
      }
    }
  }

  await saveAllConfigs(body);
  return NextResponse.json({ ok: true });
}
