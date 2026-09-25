import type { Metadata } from "next";
import { loadPortfolio } from "@/portfolio/persistence";
import { PortfolioScreen } from "@/portfolio/ui/PortfolioScreen";
import { appDatabase, localToday } from "@/server/app";

// The state comes from the database on every request; nothing here is static.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carteira",
  description: "Carteira de investimentos: onde está × onde deveria estar",
};

export default function Page() {
  return <PortfolioScreen initialState={loadPortfolio(appDatabase())} today={localToday()} />;
}
