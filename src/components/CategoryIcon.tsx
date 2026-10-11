import type { ReactNode } from "react";

// Simple line drawings, kept inline so no image is loaded (02-ARCHITECTURE section 6).
const ICONS: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  apparel: <path d="M8 4l4 2 4-2 4 3-2 4-2-1v10H8V10l-2 1-2-4z" />,
  beauty: <path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" />,
  jewelry: <path d="M7 4h10l4 5-9 11L3 9zM3 9h18M9 4l3 16 3-16" />,
  flowers: (
    <>
      <circle cx="12" cy="8" r="2" />
      <path d="M12 3v3M12 10v11M7 8h3M14 8h3M8.5 4.5l2 2M13.5 9.5l2 2M15.5 4.5l-2 2M10.5 9.5l-2 2M12 16c-3 0-5-2-5-4M12 18c3 0 5-2 5-4" />
    </>
  ),
  alcohol: <path d="M10 3h4v5l2 3v10H8V11l2-3zM8 14h8" />,
  food: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 12h16M9.5 6v12M14.5 6v12" />
    </>
  ),
  electronics: (
    <path d="M5 14v-2a7 7 0 0 1 14 0v2M5 14h3v6H6a1 1 0 0 1-1-1zM19 14h-3v6h2a1 1 0 0 0 1-1z" />
  ),
  gift_card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  sports: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
    </>
  ),
  toys: (
    <>
      <rect x="4" y="12" width="7" height="7" />
      <rect x="13" y="12" width="7" height="7" />
      <rect x="8.5" y="5" width="7" height="7" />
    </>
  ),
  accessories: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 11h18M16 15h2M7 7V5h10v2" />
    </>
  ),
};

const BOX = <path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />;

export function CategoryIcon({ category }: { category: string | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[category ?? ""] ?? BOX}
    </svg>
  );
}
