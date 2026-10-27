import { Link } from "@tanstack/react-router";

/** The header names the product. Session controls arrive with the session list in S3. */
export function SiteHeader() {
	return (
		<header className="flex items-center justify-between gap-2 px-6 py-3">
			<Link to="/" className="text-sm font-medium">
				epsilon
			</Link>
		</header>
	);
}
