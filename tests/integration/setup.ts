import { beforeEach } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

// Tests share one process and one client address, so each starts with empty rate-limit windows.
beforeEach(() => resetRateLimits());
