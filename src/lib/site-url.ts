// The site's own address, for canonical links, the sitemap and structured data.
// NEXT_PUBLIC_SITE_URL wins when it's set; otherwise Vercel's production
// domain, which follows whatever domain the project is given; otherwise a
// local build.
export const SITE_URL = (
	process.env.NEXT_PUBLIC_SITE_URL ??
	(process.env.VERCEL_PROJECT_PRODUCTION_URL
		? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
		: "http://localhost:3000")
).replace(/\/$/, "");
