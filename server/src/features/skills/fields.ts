/** Parsers for frontmatter values, which are whatever the file's YAML holds. */
import { z } from "zod";

/** `.safeParse(value).data` is the string, or undefined for any other shape. */
export const textField = z.string();

/** `.safeParse(value).data` is the string map, or undefined for any other shape. */
export const stringMapField = z.record(z.string(), z.string());
