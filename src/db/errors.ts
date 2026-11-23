export type DatabaseErrorKind = "invalid-url" | "unreachable" | "rejected" | "not-test-mode";

/** A database problem. Messages never contain credentials. */
export class DatabaseError extends Error {
  override readonly name = "DatabaseError";

  constructor(
    readonly kind: DatabaseErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
