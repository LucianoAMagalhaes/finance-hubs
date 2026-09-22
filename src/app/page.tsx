import { loadState } from "@/persistence";
import { appDatabase, localToday } from "@/server/app";
import { MonthScreen } from "@/ui/MonthScreen";

// The state comes from the database on every request; nothing here is static.
export const dynamic = "force-dynamic";

export default function Page() {
  return <MonthScreen initialState={loadState(appDatabase())} today={localToday()} />;
}
