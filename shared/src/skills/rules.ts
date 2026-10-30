/** The skill rules the browser form and the server both run. */
import { z } from "zod";

/** The directory name under `<agent home>/skills`, and the URL segment. */
export const skillNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, digits, dashes and underscores");

export const skillDescriptionSchema = z.string().min(1);
