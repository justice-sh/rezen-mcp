import { PostgresDatabase, type DatabaseOptions } from "./database.js";

/** A Postgres server installed and running on this machine. Never touches Docker. */
export class LocalDatabase extends PostgresDatabase {
  readonly provider = "local";

  constructor(url: string, options?: DatabaseOptions) {
    super(url, options);
  }

  protected unreachableHint(): string {
    return 'Make sure your local PostgreSQL server is running and DATABASE_URL points at it, or set DB_PROVIDER=docker and run "pnpm db:up".';
  }
}
