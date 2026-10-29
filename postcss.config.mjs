/** @type {import('postcss-load-config').Config} */
export default {
	plugins: {
		"@tailwindcss/postcss": {},
		// Tailwind puts all of its CSS in cascade layers, and Safari before 15.4
		// drops every @layer block it meets, which left iOS 12 with no styles
		// at all. This flattens the layers into plain rules, with specificity
		// bumps that keep the layer order, so every browser gets the same cascade.
		"@csstools/postcss-cascade-layers": {},
	},
};
