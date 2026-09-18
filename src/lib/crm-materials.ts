export type MaterialFormat = "text" | "audio" | "both";

export const MATERIAL_FORMAT_LABELS: Record<MaterialFormat, string> = {
  text: "Texto",
  audio: "Áudio",
  both: "Áudio e texto",
};

export const MATERIAL_FORMAT_BADGE_STYLES: Record<MaterialFormat, string> = {
  text: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  audio: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  both: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

export const normalizeMaterialFormat = (value: string | null | undefined): MaterialFormat =>
  value === "audio" || value === "both" ? value : "text";

export const materialFavoritesStorageKey = (userId: string) => `crm-material-favorites:${userId}`;

export const readFavoriteMaterialIds = (userId: string): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(materialFavoritesStorageKey(userId));
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
};
