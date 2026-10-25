import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// posthog is proxied under a first-party path so content blockers, which
	// routinely drop requests to *.i.posthog.com, don't quietly take the
	// analytics with them. The path is deliberately not /analytics or
	// /tracking, which are themselves on the blocklists
	async rewrites() {
		return [
			{ source: "/lane/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
			{ source: "/lane/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
			{ source: "/lane/:path*", destination: "https://us.i.posthog.com/:path*" },
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
