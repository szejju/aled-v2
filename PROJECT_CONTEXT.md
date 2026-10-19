# ALE-Dart System Architecture — Master Context

## 1. Architektura Systemowa (Cloud-Centric)
- **Backend / Engine:** Firebase Cloud Functions (Node.js/TS). 
  - Wszystkie przeliczenia tabel, tie-breaków, statystyk (7 rankingów), pucharu i kar odbywają się na serwerze po wyzwalaczach (triggers) wpisania wyniku meczu.
  - Serwer zapisuje gotowe, zunifikowane struktury w Firebase Realtime DB.
- **Frontend Web (`web_v2`):** Vue 3 (Composition API) + TypeScript + Tailwind CSS (Bento UI System).
  - Służy do wyświetlania gotowych danych z bazy, prezentowania rozbudowanych statystyk, interakcji użytkownika oraz panelu administratora.
- **Mobile App (`app`):** Flutter (Dart).
  - Służy do rozgrywania meczów na żywo (Vosk głosowo, Agora wideo) oraz wyświetlania tych samych gotowych danych z Firebase.

## 2. Zasady Projektowe Web v2
- **Wydajność & Lekkość:** Web nie przelicza ciążących algorytmów na kliencie — pobiera gotowe, wstępnie przetworzone struktury z Firebase.
- **Design System Bento UI:** Spójne widoki z nagłówkiem `flex flex-col gap-6`, `label text-lime`, pogrubionym tytułem `font-display text-5xl font-black uppercase italic` z elementem `<span class="text-glow text-accent">` oraz kartami `bg-surface border border-line rounded-2xl`.
- **Surgical Development:** Punktowe, precyzyjne modyfikacje kwarantannujące legacy kod.

## 3. Aktualny Stan & Priorytety
- ✅ **Widoki Główne:** StandingsView, ScheduleView, CupView, PlayersView, RankingsView (Spójny layout Bento UI).
- ⏳ **Prace Do Wykonania:**
  1. **HomeView (Dashboard):** Wykończenie kafelków Bento na stronie głównej (Ostatnie mecze, nadchodzące hity, szybkie skróty, aktualności).
  2. **FirebaseService.ts:** Podłączenie pod struktury wygenerowane przez Cloud Functions.
  3. **Panel Admina & Auth:** Logowanie, zarządzanie uprawnieniami, edycja wyników/kolejek.