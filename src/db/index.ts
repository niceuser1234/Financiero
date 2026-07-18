import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://financiero:financiero@localhost:5432/financiero";

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
