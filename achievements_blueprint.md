# Architektura Gabloty Osiągnięć (ALED)

Ten dokument definiuje logikę i strukturę dla zautomatyzowanego systemu nagród i osiągnięć w aplikacji ALED. Całość opiera się na automatycznych wyzwalaczach w Firebase Cloud Functions po każdym zatwierdzonym protokole meczowym.

## 1. Struktura Danych (Firebase RTDB)
Węzeł gracza: `/achievements/{playerId}`

```typescript
interface PlayerAchievements {
  // Kamienie milowe - przechowują aktualny postęp i osiągnięty poziom
  milestones: {
    matches_played: { count: number, currentTier: Tier | null }, // Tier: 'bronze' | 'silver' | 'gold' | 'diamond'
    matches_won: { count: number, currentTier: Tier | null },
    seasons_completed: { count: number, currentTier: Tier | null },
    total_180s: { count: number, currentTier: Tier | null },
    total_100_checkouts: { count: number, currentTier: Tier | null }
  },
  // Historyczne puchary z końca sezonu
  trophies: string[], // np. ['s4_div1_champion', 's4_cup_taylor']
  // Unikalne momenty z tarczy
  epic_moments: string[] // np. ['nine_darter', 'big_fish', 'whitewash']
}
```

## 2. Kategorie Nagród

### 2.1. Kamienie Milowe (Milestones / Tiers)
Posiadają 4 progi (Brąz, Srebro, Złoto, Diament). Na froncie wyświetlany jest pasek postępu do kolejnego progu w kolorze limonkowym (`#9BE22D`). Zablokowane są wyszarzone.
*   **Weteran Tarczy (matches_played):** 10 / 50 / 100 / 250
*   **Kolekcjoner Skalpów (matches_won):** 5 / 25 / 50 / 150
*   **Sezonowiec (seasons_completed):** 2 / 5 / 10 / 20
*   **Klub 180's (total_180s):** 5 / 25 / 50 / 100
*   **Finish 100+ (total_100_checkouts):** 10 / 50 / 100 / 200

### 2.2. Trofea Sezonowe (Ceremoniarz)
Złote, srebrne i brązowe ikony (oddzielające się wizualnie od limonkowych progresów). Rozdawane WYŁĄCZNIE przez skrypt `archiveCurrentSeason`.
*   **Podium (Tylko Dywizja 1!):** `champion_div1`, `runner_up_div1`, `bronze_div1`
*   **Puchar MvG:** Najwyższe DPI (Power Ranking) całego sezonu.
*   **Puchar Taylora:** Najwyższa średnia całego sezonu.
*   **Puchar Littlera:** Najwięcej 180-tek w sezonie.
*   **Puchar Humphriesa:** Najwyższy checkout sezonu.
*   **Puchar Smitha:** Najszybszy leg sezonu.

### 2.3. Epickie Momenty (Epic Moments)
Wpadają z protokołu meczowego. Limonkowe ikony bez pasków postępu. Zablokowane są wyszarzone, na ciemnym tle (`#06090f`).
*   **Perfekcja:** `short === 9`
*   **Big Fish:** `checkout === 170` (lub `hf === 170`)
*   **Small Fish:** `checkout === 130` (lub `hf === 130`)
*   **Whitewash:** Wygrana do zera (np. 5:0, zależy od `bestOf`).
*   **Szybki Leg:** `short <= 15`
*   **High Five:** Seria 5 wygranych z rzędu w lidze (backend sprawdza 5 ostatnich spotkań).

## 3. Logika Backendowa (Cloud Functions)
1. **Brak wyścigów (Race Conditions):** "Archeolog" aktualizujący kamienie milowe i epiki startuje **tylko** przy zatwierdzeniu meczu (zmiana statusu na `played`). Zgłoszenie wyniku (`pending_result`) NIE nadaje odznak.
2. **Atomic Updates:** Aktualizacje liczników w węźle `/achievements` muszą dziać się transakcyjnie lub w jednym `update()`, by nie nadpisać danych z równoległego meczu.