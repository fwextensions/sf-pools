import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
