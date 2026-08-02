import type { Metadata } from "next";
import HeaderLab from "@/components/header/HeaderLab";

// Internal tuning page for the animated header. Not linked from anywhere and
// kept out of search results — it exists so the shader constants can be A/B'd
// against each other with identical input rather than tuned by recompiling.
export const metadata: Metadata = {
	title: "Header tuning lab",
	robots: { index: false, follow: false },
};

export default function HeaderLabPage() {
	return <HeaderLab />;
}
