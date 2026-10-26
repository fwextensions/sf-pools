import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Chivo, Chivo_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site-url";

const chivo = Chivo({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-sans",
});

const chivoMono = Chivo_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-mono",
});

export const metadata: Metadata = {
	// relative canonical links and the like resolve against this
	metadataBase: new URL(SITE_URL),
	// pages set just their own name; the template adds the site's, and the
	// default covers pages that don't set one (the home page)
	title: {
		template: "%s | SF Pools",
		default: "SF Pools Schedule Viewer",
	},
	description: "Centralized, searchable schedules for San Francisco public swimming pools.",
};

// the page color for the browser's own UI around the page (the status bar
// tint, and in some iOS web views the area past the ends of the page), in
// step with the dark theme's --color-page
export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0c1a21" },
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="h-full">
		<head>
			<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
			<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
			<link rel="shortcut icon" href="/favicon.ico" />
			<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
			<meta name="apple-mobile-web-app-title" content="SF Pools" />
			<link rel="manifest" href="/site.webmanifest" />
			{/* where agents find the site described for them, as llmstxt.org proposes */}
			<link rel="describedby" href="/llms.txt" />
		</head>
		<body className={`${chivo.variable} ${chivoMono.variable} min-h-screen bg-page text-ink antialiased`}>
			{children}
		</body>
		</html>
	);
}
