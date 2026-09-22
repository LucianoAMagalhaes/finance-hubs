// Runs once when the server starts: creates the database if needed, applies the
// migrations and leaves the backup copy, before the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { appDatabase } = await import("./server/app");
  appDatabase();
}
