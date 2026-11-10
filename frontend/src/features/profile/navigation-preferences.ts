/** Strict allowlist. Navigation preferences never grant permissions or change routes. */
export const NAV_PREF_KEY = "qa_navigation_v1" as const;
export const optionalMenuIds = ["dashboard", "tools", "public", "admin"] as const;
export type OptionalMenuId = (typeof optionalMenuIds)[number];
export type NavigationPreferences = Record<OptionalMenuId, boolean>;
export const defaultNavigationPreferences: NavigationPreferences = {
  dashboard: true, tools: true, public: true, admin: true
};
export const menuDescriptions: Record<OptionalMenuId, {label:string;description:string}> = {
  dashboard: {label:"Visão geral",description:"Indicadores e andamento das TFs"},
  tools: {label:"Ferramentas",description:"Releases e comparações de texto ou XML"},
  public: {label:"Públicas",description:"Biblioteca de tarefas compartilhadas"},
  admin: {label:"Administração",description:"Somente para contas autorizadas"}
};
export function parseNavigationPreferences(value: unknown): NavigationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {...defaultNavigationPreferences};
  }
  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(optionalMenuIds.map(id =>
    [id, typeof candidate[id] === "boolean" ? candidate[id] : defaultNavigationPreferences[id]]
  )) as NavigationPreferences;
}
export function navigationFromMetadata(metadata: unknown): NavigationPreferences {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return parseNavigationPreferences(null);
  }
  return parseNavigationPreferences((metadata as Record<string, unknown>)[NAV_PREF_KEY]);
}
