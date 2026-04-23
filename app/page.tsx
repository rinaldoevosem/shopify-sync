export const dynamic = "force-dynamic";

import { getAllConfigs, getAllLogs, getCsvData, CATEGORIES } from "@/lib/kv";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const [configs, logs] = await Promise.all([getAllConfigs(), getAllLogs()]);

  const csvMeta: Record<string, { fileName?: string }> = {};
  await Promise.all(
    CATEGORIES.map(async ({ id }) => {
      const data = await getCsvData(id);
      if (data) csvMeta[id] = { fileName: data.fileName };
    })
  );

  return <Dashboard initialConfigs={configs} initialLogs={logs} csvMeta={csvMeta} />;
}
