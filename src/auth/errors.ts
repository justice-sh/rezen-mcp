export type TokenErrorKind = "unknown-school" | "invalid-label";

/** A token problem the caller can fix. Messages never contain a token. */
export class TokenError extends Error {
  override readonly name = "TokenError";

  constructor(
    readonly kind: TokenErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
