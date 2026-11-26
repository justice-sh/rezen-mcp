CREATE TABLE "school_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "school_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "school_tokens_token_hash_format" CHECK ("school_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "school_tokens" ADD CONSTRAINT "school_tokens_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_tokens_school_id_idx" ON "school_tokens" USING btree ("school_id");