import type { Sport } from "@/lib/types";

type P = { size?: number; className?: string };
const S = ({ size = 18, children, className }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export const IconHome = (p: P) => <S {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></S>;
export const IconTrend = (p: P) => <S {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></S>;
export const IconList = (p: P) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></S>;
export const IconHeart = (p: P) => <S {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></S>;
export const IconTrophy = (p: P) => <S {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></S>;
export const IconUpload = (p: P) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>;
export const IconSync = (p: P) => <S {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5" /></S>;
export const IconX = (p: P) => <S {...p}><path d="M18 6L6 18M6 6l12 12" /></S>;
export const IconUp = (p: P) => <S {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>;
export const IconDown = (p: P) => <S {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M20 6L9 17l-5-5" /></S>;
export const IconAlert = (p: P) => <S {...p}><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></S>;
export const IconFlame = (p: P) => <S {...p}><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-3-6 0 4-5 7-5 12 0 4 4 7 9 7z" /></S>;
export const IconDownload = (p: P) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></S>;

export function SportIcon({ sport, size = 18 }: { sport: Sport; size?: number }) {
  switch (sport) {
    case "run": return <S size={size}><circle cx="15" cy="4" r="2" /><path d="M8 21l3-6 3 2v5M6 12l3-3 4 1 3 3 3 1M11 15l-2-4" /></S>;
    case "ride": return <S size={size}><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M15 5h2l1.5 12M5.5 17L9 9h6l-3 8M9 9L8 6H6" /></S>;
    case "swim": return <S size={size}><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 14c2 0 2-1.5 4-1.5S8 14 10 14s2-1.5 4-1.5 2 1.5 4 1.5" /><circle cx="17" cy="6" r="2" /><path d="M6 11l4-4 3 2 2 2" /></S>;
    case "walk": return <S size={size}><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6-2-3 1-4 3 3 3 1M9 12l-2 3M12 15l3 6" /></S>;
    case "hike": return <S size={size}><path d="M3 20l6-10 4 6 3-4 5 8z" /><path d="M14 6l2-3 2 3" /></S>;
    case "strength": return <S size={size}><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" /></S>;
    default: return <S size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></S>;
  }
}
