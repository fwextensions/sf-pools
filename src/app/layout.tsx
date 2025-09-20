import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "SF Pools Schedule Viewer",
	description: "Centralized, searchable schedules for San Francisco public swimming pools.",
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
		</head>
		<body className="min-h-screen bg-white text-slate-900 antialiased">
			{children}
		</body>
		</html>
	);
}
