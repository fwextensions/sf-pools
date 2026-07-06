import next from "eslint-config-next";
import * as espree from "espree";

export default [
	...next,
	{
		files: ["**/*.{js,jsx,mjs,mts,cts}"],
		languageOptions: {
			parser: espree,
		},
	},
	{
		settings: {
			// Fix for ESLint 10+: eslint-plugin-react uses context.getFilename() (legacy API)
			// which was removed in ESLint 10 flat config. Declaring the version explicitly
			// prevents the plugin from trying to auto-detect it and failing.
			react: { version: "19" },
		},
	},
];
