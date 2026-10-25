// functions/src/league/utils.ts

export interface LeagueStructureConfig {
  groups?: number;
  promo?: number;
  playoffs?: number;
  releg?: number;
  [key: string]: any;
}

export interface DivisionSettings {
  name?: string;
  short?: string;
  limit?: number;
}

/**
 * Formatuje nazwę dywizji na pełną (np. "Dywizja 1")
 */
export function formatDivName(div?: string): string {
  if (!div) return "";
  const d = div.toUpperCase().replace(/DYWIZJA/gi, '').trim();
  return `Dywizja ${d}`;
}

/**
 * Formatuje nazwę dywizji na krótką (np. "DYW. 1")
 */
export function formatDivShort(div?: string): string {
  if (!div) return "";
  const d = div.toUpperCase().replace(/DYWIZJA/gi, '').trim();
  return `DYW. ${d}`;
}

/**
 * Pobiera listę dywizji i grup z drzewka ligi (wraz z obsługą baraży z terminarza)
 */
export function getDivisions(leagueStructureSettings: Record<string, LeagueStructureConfig> = {}, schedule: any[] = []): string[] {
  if (!leagueStructureSettings || Object.keys(leagueStructureSettings).length === 0) return [];

  const divsList: string[] = [];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // 1. Sortujemy poziomy ligowe (1, 2, 3...)
  const levels = Object.keys(leagueStructureSettings).sort((a, b) => parseInt(a, 10) - parseInt(b));

  // 2. Generujemy podstawowe nazwy z drzewka
  levels.forEach(levelStr => {
    const cfg = leagueStructureSettings[levelStr];
    if (!cfg) return;

    const groups = cfg.groups || 1;
    if (groups === 1) {
      divsList.push(`DYWIZJA ${levelStr}`);
    } else {
      for (let i = 0; i < groups; i++) {
        divsList.push(`DYWIZJA ${levelStr} GRUPA ${alphabet[i]}`);
      }
    }
  });

  // 3. Doklejanie baraży z terminarza
  if (schedule && schedule.length > 0) {
    const playoffDivs = new Set<string>();

    schedule.forEach(m => {
      if (m.isPlayoff && m.div && typeof m.div === 'string' && m.div.includes("BARAŻ")) {
        playoffDivs.add(m.div);
      }
    });

    playoffDivs.forEach(playoffName => divsList.push(playoffName));
  }

  return divsList;
}

/**
 * Pobiera konfigurację awansów/spadków dla konkretnego wiersza tabeli z drzewka
 */
export function getDivConfigFromTree(divString: string, leagueStructureSettings: Record<string, LeagueStructureConfig> = {}): { promo: number; playoffs?: number; releg: number } {
  const defaultCfg = { promo: 2, releg: 4 };
  if (!divString || !leagueStructureSettings) return defaultCfg;

  const levelMatch = divString.match(/\d+/);
  if (!levelMatch) return defaultCfg;

  const level = levelMatch[0];
  const cfg = leagueStructureSettings[level];

  return cfg ? { promo: cfg.promo || 2, playoffs: cfg.playoffs || 0, releg: cfg.releg || 4 } : defaultCfg;
}

/**
 * Pobiera szczegółową konfigurację dywizji ze słownika ustawień
 */
export function getDivConfig(divID: string, divisionsSettings: Record<string, DivisionSettings> = {}) {
  const cleanID = divID ? String(divID).replace(/DYWIZJA/gi, '').trim().toUpperCase() : '';
  const cfg = divisionsSettings[cleanID] || {};

  return {
    id: cleanID,
    name: cfg.name || formatDivName(cleanID),
    short: cfg.short || formatDivShort(cleanID),
    limit: cfg.limit || 0
  };
}