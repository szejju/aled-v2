# Architektura Modułu "Liga Lato" (ALED)  
  
## 1. Cel i Założenia (Core Concept)  
"Liga Lato" to opcjonalne, luźniejsze rozgrywki w okresie wakacyjnym.   
**Główna zasada (Zero Data Pollution):** Wyniki meczów, statystyki i uczestnictwo w Lidze Lato są **całkowicie odizolowane** od głównego silnika ligowego. Ich wyniki nie wpływają na Dart Performance Index (DPI), historyczny ranking punktowy ELO, ani na osiągnięcia sezonowe gracza.   
  
Moduł ten funkcjonuje jako aplikacja w aplikacji (wzorzec Sandbox).  
  
---  
  
## 2. Struktura Bazy Danych (Realtime Database)  
Aby zapobiec wyciekowi danych do głównego silnika `StatsEngine`, cała logika Ligi Lato operuje wewnątrz jednego, izolowanego węzła nadrzędnego: `/summer_league`.  
  
```json  
{  
  "summer_league": {  
    "settings": {  
      "isActive": true,  
      "registrationOpen": false,  
      "seasonName": "Lato 2027",  
      "playersLimit": 64,
      "matchFormat": { "kind": "firstTo", "target": 6 }  
    },  
    "participants": {  
      "uid_123": {  
        "name": "DartVader",  
        "registeredAt": 1690000000,  
        "group": "A"   
      }  
    },  
    "schedule": {  
      "SL-G1-M1": {  
        "p1Id": "uid_123",  
        "p2Id": "uid_456",  
        "score1": 6,  
        "score2": 2,  
        "status": "played",  
        "p1Stats": { "avg": 45.2, "sl": 18 },  
        "timestamp": 1690005000  
      }  
    },  
    "standings": {  
      "A": [  
        {  
          "uid": "uid_123",  
          "name": "DartVader",  
          "matchesPlayed": 1,  
          "points": 3,  
          "legsWon": 6,  
          "legsLost": 2  
        }  
      ]  
    }  
  }  
}  


Główny StatsEngine u nas obserwuje /schedule i /participants. Dopóki letnie dane lądują w /summer_league/..., DPI pozostaje bezpieczne.

3. Backend: Cloud Functions (Izolowany Silnik)

Nie rozbudowujemy istniejących, ciężkich funkcji głównej ligi. Tworzymy dedykowany zestaw lekkich funkcji operujących wyłącznie na węźle /summer_league.

Nowy plik: functions/src/summer_league/actions.ts(Pamiętaj o używaniu db() z connection.ts do inicjalizacji!)

1. `registerForSummerLeague (onCall)`
   - **Weryfikuje** `settings/registrationOpen`**.**
   - **Zapisuje gracza do** `/summer_league/participants`**.**
2. `submitSummerMatchResult (onCall)`
   - **Walidacja legów według `settings.matchFormat` (domyślnie kto pierwszy do 6, remis tylko 5:5; albo stała suma legów). Checkout, short leg i próby na doublach jak w lidze.**
   - **Zapisuje wynik w** `/summer_league/schedule/MATCH_ID`**.**
   - **Wywołuje (Trigger) funkcję recalculate.**
3. `recalculateSummerStandings (Wewnętrzna logika / background trigger)`
   - **Odpalana po zmianie na węźle** `/summer_league/schedule`**.**
   - **Przelicza punkty, różnicę legów (lub setów) i aktualizuje** `/summer_league/standings`**.**
   - **Nie uruchamia aktualizacji w głównym** `/players/UID` **(DPI się nie zmienia).**

4. Frontend: Routing we Vue (Vue Router)

Zakładka Ligi Lato funkcjonuje jako wydzielona przestrzeń dla użytkownika.

W pliku router/index.ts podepnij:

JavaScript

{  
  path: '/lato',  
  component: () => import('@/views/summer/SummerLayout.vue'), // Wrapper z letnim menu/motywem  
  children: [  
    {  
      path: '',  
      name: 'SummerHome',  
      component: () => import('@/views/summer/SummerDashboard.vue') // Zapisy / info  
    },  
    {  
      path: 'tabela',  
      name: 'SummerStandings',  
      component: () => import('@/views/summer/SummerStandings.vue')  
    },  
    {  
      path: 'terminarz',  
      name: 'SummerSchedule',  
      component: () => import('@/views/summer/SummerSchedule.vue')  
    },  
    {  
      path: 'protokol/:matchId',  
      name: 'SummerMatchModal',  
      // UWAGA: Nie reużywamy głównego MatchResultModal, jeśli letnie statystyki   
      // i sposób wysyłki są inne, lub przekazujemy flagę isSummerLeague=true   
      // dla letniego endpointu! Rekomendacja: utwórz dedykowany komponent,  
      // aby zapobiec wplątaniu letniego kodu do głównego protokołu.  
      component: () => import('@/components/summer/SummerMatchModal.vue')   
    }  
  ]  
}  


5. UI/UX & Kwestie Bezpieczeństwa

1. **Wizualna Separacja: Widoki Ligi Lato (np. Tabele, Terminarz) powinny posiadać distinctywną (np. słoneczną/pomarańczową) paletę barw lub baner nagłówkowy, aby gracz miał 100% pewności, że nie przegląda tabeli głównego sezonu.**
2. **Rozdział Protokołów: Nie podpinaj meczów Ligi Lato pod główny "Radar" wyświetlający się na kokpicie gracza, bo wyślesz je do złego endpointu. Zbuduj mały, osobny "Letni Radar" zaczytujący mecze wyłącznie z** `/summer_league/schedule`**.**
3. **Flaga Profilu: Możesz dodać do głównego widoku profilu gracza małą odznakę ("Gra w Lidze Lato") – to jedyne miejsce styku głównego widoku z węzłem** `/summer_league`**. Zrób to przez lekki odczyt, bez twardego sprzęgania modeli danych.**