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
			<body className="min-h-screen bg-white text-slate-900 antialiased">
				{children}
			</body>
		</html>
	);
}
