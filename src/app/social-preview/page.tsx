import type { Metadata } from "next";
import SocialPreview from "@/components/header/SocialPreview";

// One-off page for grabbing GitHub's 1280x640 repository social preview image
// off the header animation. Not linked from anywhere and kept out of search
// results, like the header tuning lab next door.
export const metadata: Metadata = {
	title: "Social preview",
	robots: { index: false, follow: false },
};

export default function SocialPreviewPage() {
	return <SocialPreview />;
}
