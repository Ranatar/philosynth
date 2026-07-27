import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://philosynth:philosynth_dev@localhost:5432/philosynth",
  },
  // Расширения, используемые схемой (idx_syntheses_title_trgm)
  extensionsFilters: [],
  strict: true,
  verbose: true,
});
