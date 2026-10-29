import { z } from "zod";

/**
 * The refusal body every REST route sends: one sentence the browser can show.
 * A resource that needs a code extends this, so no route invents a second shape.
 */
export const problemSchema = z.object({ message: z.string() });

export type Problem = z.infer<typeof problemSchema>;
