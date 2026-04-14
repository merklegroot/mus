import path from "node:path";
import { defineConfig } from "drizzle-kit";

const resolved = path.resolve(
  process.cwd(),
  process.env.DATABASE_PATH ?? path.join("data", "mus.db"),
);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${resolved}`,
  },
});
