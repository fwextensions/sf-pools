"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { poolPageSlug } from "@/lib/pool-pages";

/**
 * Old links to the full schedules page pointed at a pool's section of it,
 * /schedules#pool-<id>. That page now redirects to the pools list, keeping
 * the hash, and this sends the reader on to the pool's own page.
 */
export default function PoolAnchorRedirect() {
	const router = useRouter();

	useEffect(() => {
		const id = window.location.hash.match(/^#pool-(.+)$/)?.[1];
		const slug = id ? poolPageSlug(decodeURIComponent(id)) : null;
		if (slug) router.replace(`/pools/${slug}`);
	}, [router]);

	return null;
}
