export const dynamic = "force-dynamic";

import { getAllConfigs, getAllLogs, getAllVideoQueueCounts } from "@/lib/kv";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const [configs, logs, videoQueueCounts] = await Promise.all([
    getAllConfigs(),
    getAllLogs(),
    getAllVideoQueueCounts(),
  ]);

  return <Dashboard initialConfigs={configs} initialLogs={logs} videoQueueCounts={videoQueueCounts} />;
}
