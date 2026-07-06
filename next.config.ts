import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		rules: {
			"*.frag": { type: "raw" },
			"*.vert": { type: "raw" },
			"*.glsl": { type: "raw" },
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
