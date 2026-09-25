import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/persistence/schema.ts", "./src/portfolio/persistence/schema.ts"],
  out: "./drizzle",
});
