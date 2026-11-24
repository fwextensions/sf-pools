import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// posthog is proxied under a first-party path so content blockers, which
	// routinely drop requests to *.i.posthog.com, don't quietly take the
	// analytics with them. The path is deliberately not /analytics or
	// /tracking, which are themselves on the blocklists
	async rewrites() {
		return [
			// a page's markdown copy is its URL plus ".md", as llms.txt proposes.
			// The copies are prerendered route handlers under /md, since a route
			// folder can't end in ".md"
			{ source: "/pools.md", destination: "/md/pools" },
			{ source: "/pools/:slug([a-z-]+).md", destination: "/md/pools/:slug" },
			{ source: "/about.md", destination: "/md/about" },
			{ source: "/lane/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
			{ source: "/lane/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
			{ source: "/lane/:path*", destination: "https://us.i.posthog.com/:path*" },
		];
	},
	// the full schedules page gave way to a page per pool. A browser carries
	// an old #pool-<id> link's hash across the redirect, and the pools list
	// sends it on to that pool's page. Now & Soon moved under the grid on the
	// home page; its ?program= means the same there, and the query carries over
	async redirects() {
		return [
			{ source: "/schedules", destination: "/pools", permanent: true },
			{ source: "/now", destination: "/", permanent: true },
			// each markdown copy has one public URL
			{ source: "/md/pools", destination: "/pools.md", permanent: true },
			{ source: "/md/pools/:slug", destination: "/pools/:slug.md", permanent: true },
			{ source: "/md/about", destination: "/about.md", permanent: true },
		];
	},
	// posthog's api is sensitive to a trailing slash being added by a redirect
	skipTrailingSlashRedirect: true,
	turbopack: {
		rules: {
			"*.frag": { loaders: ["raw-loader"], as: "*.js" },
			"*.vert": { loaders: ["raw-loader"], as: "*.js" },
			"*.glsl": { loaders: ["raw-loader"], as: "*.js" },
		},
	},
	webpack(config) {
		config.module.rules.push({
			test: /\.(frag|vert|glsl)$/,
			type: "asset/source",
		});
		return config;
	},
};

export default nextConfig;
