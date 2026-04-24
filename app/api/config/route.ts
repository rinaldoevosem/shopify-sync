import { NextRequest, NextResponse } from "next/server";
import { getAllConfigs, saveAllConfigs, getAllLogs, getAllVideoQueueCounts, Category, getCsvData, CATEGORIES } from "@/lib/kv";

export async function GET() {
  const [configs, logs, videoQueueCounts] = await Promise.all([
    getAllConfigs(),
    getAllLogs(),
    getAllVideoQueueCounts(),
  ]);

  // Attach csv file names and eligible counts
  const csvMeta: Record<string, { fileName?: string; eligible?: number }> = {};
  await Promise.all(
    CATEGORIES.map(async ({ id }) => {
      const data = await getCsvData(id);
      if (data) {
        csvMeta[id] = { fileName: data.fileName };
      }
    })
  );

  return NextResponse.json({ configs, logs, csvMeta, videoQueueCounts });
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<Category, { scheduleEnabled: boolean; scheduleTime: string }>;
  await saveAllConfigs(body);
  return NextResponse.json({ ok: true });
}
