/**
 * components.json points the shadcn CLI's utils alias here. The app imports `cn`
 * from the package directly, so nothing in src/ reads this module; it exists so
 * `shadcn add` has a real target. Listed as a Knip entry for that reason.
 */
export { cn } from "./cn";
