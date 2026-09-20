/**
 * Next runs this on the client before anything else, which is where PostHog
 * wants to be initialized: earlier than any component, and once per session.
 * The work itself lives in lib/analytics so that the no-key case and the
 * event vocabulary stay in one file.
 */
import { initAnalytics } from "@/lib/analytics";

initAnalytics();
