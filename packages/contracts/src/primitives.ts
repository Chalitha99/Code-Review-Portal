import { z } from "zod";

/**
 * Shared scalar building blocks.
 *
 * Everything that crosses the network is described here first, so that ids,
 * timestamps and colours cannot drift between entities.
 */

/** Entity identifier. Opaque to the client — never parse or derive meaning from it. */
export const idSchema = z.string().min(1);

/** ISO-8601 timestamp, always UTC on the wire. Format for display via `lib/formatters`. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Calendar date with no time component (e.g. checklist "Checked Date"). */
export const isoDateSchema = z.iso.date();

export const emailSchema = z.email();

/** Hex colour assigned to a customer for its badge treatment. */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex colour such as #4f46e5");

export const nonEmptyStringSchema = z.string().trim().min(1);

/** Monotonic integer used for stable ordering of admin-managed lists. */
export const orderSchema = z.number().int().nonnegative();

export type Id = z.infer<typeof idSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
export type HexColor = z.infer<typeof hexColorSchema>;
