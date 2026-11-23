import { PostgresDatabase, type DatabaseOptions } from "./database.js";

/** Postgres running in Docker: `pnpm db:up` locally, a service container in CI. */
export class DockerDatabase extends PostgresDatabase {
  readonly provider = "docker";

  constructor(url: string, options?: DatabaseOptions) {
    super(url, options);
  }

  protected unreachableHint(): string {
    return 'Start it with "pnpm db:up" (Docker must be running), or set DB_PROVIDER=local to use a Postgres installed on this machine.';
  }
}
