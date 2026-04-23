import type { Metadata } from "next";
import { PolarisProvider } from "@/components/PolarisProvider";

export const metadata: Metadata = {
  title: "Stein Diamonds — Inventory Sync",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PolarisProvider>{children}</PolarisProvider>
      </body>
    </html>
  );
}
