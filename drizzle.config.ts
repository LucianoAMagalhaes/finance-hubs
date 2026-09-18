import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/persistencia/esquema.ts",
  out: "./drizzle",
});
