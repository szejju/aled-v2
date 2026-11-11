# Prompt: przebudowa modala na styl MatchCompareModal

Przebuduj wskazany modal tak, żeby wyglądał jak `src/components/home/MatchCompareModal.vue`. Kopiuj skalę typografii, kolory ról, muszlę i rytm odstępów. Zachowaj logikę, propsy, emity, dane, walidację, fokus i treść. Zmieniaj klasy, układ wizualny i hierarchię tekstu.

Źródło prawdy wizualnej: `src/components/home/MatchCompareModal.vue` oraz tokeny w `src/style.css`.

## Fonty

- **Display** (`font-display`): Saira Condensed. Tytuł, inicjały, nazwiska, „VS”, wszystkie liczby i wyniki.
- **Sans** (`font-sans`, domyślny na `body`): Chakra Petch. Etykiety, daty, opisy, komunikaty, wiersze historii.
- Liczby i wyniki: zawsze `tabular-nums`.
- Kursywa tylko na głównym tytule modala (`italic`). Nazwiska, etykiety i liczby zostają proste.

## Drabinka czcionek

Trzymaj się tych rozmiarów. Wybieraj szczebel według roli, nie według „żeby było większe”.

| Rola | Klasy | Rozmiar | Waga | Kolor | Przykład |
| --- | --- | --- | --- | --- | --- |
| Eyebrow / kontekst | `label text-accent` | 11px, tracking 0.14em, uppercase | 600 | `#9be22d` | LIGA · KOLEJKA 7 |
| Etykieta sekcji / metryki | `label text-muted` | 11px, tracking 0.14em, uppercase | 600 | `#8a96a8` | POWER RANKING, ŚREDNIA, BILANS BEZPOŚREDNI |
| Etykieta w pigułce | `label … text-muted` | 11px | 600 | muted | 12.11.2026 · 20:00 |
| Tytuł modala | `font-display text-2xl font-black uppercase italic` | 24px / lh 32px | 900 | `text-fg` | PORÓWNANIE |
| Inicjały w awatarze | `font-display text-xl font-extrabold` | 20px | 800 | lime albo danger | G1 / G2 |
| Nazwisko | `font-display text-base font-extrabold uppercase leading-tight` | 16px | 800 | fg, drugie imię `text-muted` | GRACZ / 1 |
| „VS” | `font-display text-3xl font-black text-muted/30` | 30px | 900 | muted 30% | VS |
| Liczba hero (jedna metryka na szerokość) | `font-display text-xl font-black tabular-nums sm:text-2xl` | 20px, od `sm` 24px | 900 | lime / danger | 74.80 / 61.20 |
| Liczba w kafelku | `font-display text-sm font-bold tabular-nums` | 14px | 700 | lime / danger | 62.40 / 55.10 |
| Wynik bilansu | `font-display text-3xl font-black tabular-nums` | 30px | 900 | lime : danger | 1:1 |
| Wynik drugorzędny (legi) | `font-display text-lg font-extrabold tabular-nums text-fg` | 18px | 800 | fg | 8:7 |
| Wynik w wierszu listy | `font-display font-extrabold tabular-nums` przy rodzicu `text-sm` | 14px | 800 | fg | 6:4 |
| Tekst pomocniczy obok liczby | `text-sm text-muted` | 14px | 400 | muted | Legi, opisy, komunikaty |
| Meta wiersza | `text-sm text-muted` | 14px | 400 | muted | Dywizja A · Kolejka 3 · data |

Utility `label` jest już zdefiniowane w `src/style.css`:

```css
font-sans text-[11px] font-semibold uppercase tracking-[0.14em]
```

Nie podmieniaj go na `text-xs` ani `text-[10px]`.

Separator między wartościami stron (`/` oraz `:`) jest `text-muted`, z `mx-1` w kafelku, `mx-1.5` w hero i `mx-1` w wielkim bilansie.

## Kolory ról

Tryb ciemny (tak wygląda referencja):

- Tło strony / overlay: `bg-black/80` + `backdrop-blur-sm`
- Panel: `bg-surface` (`#0d131d`), obrys `border-line` (`#1e2836`)
- Karty i wstawki: `bg-surface-2` (`#131b28`)
- Tekst główny: `text-fg` (`#ffffff`)
- Tekst drugorzędny: `text-muted` (`#8a96a8`)
- Strona 1 / wartość dodatnia / akcent: `text-lime` i `text-accent` (`#9be22d`)
- Strona 2 / wartość ostrzegawcza: `text-danger` (`#ff4d55`)
- Awatar strony 1: `bg-lime/10 text-lime ring-1 ring-lime/30`
- Awatar strony 2: `bg-danger/10 text-danger ring-1 ring-danger/30`

Lime i danger służą do rozróżnienia dwóch stron albo stanu sukces/błąd. W modalu z jedną stroną lime zostaje kolorem akcentu (eyebrow, główna liczba, pierścień), danger tylko dla błędu i destrukcyjnej akcji.

## Muszla

```html
<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
  <div class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl">
    …
  </div>
</div>
```

- Padding panelu: `p-6` (24px). Formularz potwierdzenia może zostać przy `max-w-md`; porównanie i treść bogata zostają przy `max-w-lg` (512px).
- Róg panelu: `rounded-3xl`. Wstawka sekcji: `rounded-2xl`. Kafelek metryki: `rounded-xl`.
- Zamknięcie: `absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg`, ikona `size-5`. Tytuł i eyebrow dostają `pr-8`, żeby nie wchodziły pod krzyżyk.
- Klik w overlay zamyka. Klik w panel stopuje propagację. Escape zamyka. `role="dialog"` i `aria-modal="true"` zostają.

## Rytm pionowy

- Eyebrow bezpośrednio nad tytułem, bez dodatkowego marginesu.
- Pierwszy blok treści: `mt-6` pod tytułem.
- Kolejne sekcje: `mt-6`.
- Stos kart jednej grupy: `gap-4`.
- Siatka kafelków: `gap-2`.
- Wiersze listy: `gap-2`, lista `mt-4` pod nagłówkiem sekcji.
- Wewnątrz kafelka hero: `px-4 py-4`. Wewnątrz małego kafelka: `px-2 py-3`, etykieta i liczba `gap-0.5`, wyśrodkowane.
- Wstawka sekcji (bilans): `rounded-2xl bg-surface-2 p-4`, bez dodatkowej ramki.

## Bloki, które wolno składać z tego wzoru

**Nagłówek.** Eyebrow `label text-accent`, pod nim jeden tytuł `text-2xl font-black uppercase italic`. Drugiego tytułu tej samej wielkości w modalu nie ma.

**Para stron.** Trzy kolumny: `flex items-center justify-between gap-3 text-center`. Awatar `size-16 sm:size-20 rounded-2xl`. Pod nim nazwisko `mt-2`. Środek węższy (`shrink-0`): wielkie przygaszone VS i pod nim pigułka `label max-w-24 rounded-full bg-surface-2 px-2 py-1 text-center text-muted`.

**Metryka hero.** Na pełną szerokość. Ramka `hit-motd-frame hit-motd-frame--slow rounded-xl p-[3px]` ze stylem `--split` (procent strony 1). Wnętrze `rounded-[10px] bg-surface-2 px-4 py-4 ring-1 ring-lime/15`, rząd `flex items-center justify-between`: etykieta po lewej, liczba po prawej. W modalu bez dwóch stron pomiń `--split` i zostaw spokojną ramkę `border border-line` albo sam `bg-surface-2`.

**Kafelki metryk.** `grid grid-cols-3 gap-2`. Ta sama ramka `p-[3px]`, wnętrze `rounded-[10px] bg-surface-2`, kolumna wyśrodkowana. Etykieta `label text-muted`, liczba `text-sm font-bold`. Przy dwóch stronach kolejne kafelki dostają `hit-motd-d1` i `hit-motd-d2`, żeby błysk na ramce był przesunięty w fazie.

**Sekcja bilansu.** Wstawka `surface-2`. Etykieta, pod nią `mt-3` rząd `flex items-end justify-between`: wielki wynik + podpis `label text-muted` po lewej, po prawej `text-right text-sm text-muted` z jedną liczbą `text-lg` w `text-fg`. Lista spotkań pod spodem: meta ucięte `truncate text-muted`, wynik `shrink-0`.

**Stany.** Ładowanie: `mt-6` siatka `h-14 animate-pulse rounded-xl bg-surface-2`. Błąd: `mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger`. Pusta informacja i dopisek o brakujących danych: `text-sm text-muted`.

## Czego trzymać się przy przebudowie

- Jeden tytuł 24px na modal. Reszta nagłówków to `label` 11px.
- Liczba, która jest bohaterem ekranu, ma 30px (`text-3xl`) albo 20–24px (`text-xl sm:text-2xl`). Liczba w gęstej siatce ma 14px (`text-sm`).
- Etykieta nigdy nie jest większa od wartości, którą opisuje.
- Tekst opisowy i komunikaty mają 14px (`text-sm`), kolor `text-muted`, font sans.
- Głębia powstaje ze złożenia `surface` → `surface-2`, nie z nowych szarości i nie z `bg-[#…]`.
- Ramka z limonką i czerwienią (`hit-motd-frame`) jest tylko przy porównaniu dwóch stron. Definicja klas zostaje w `MatchOfTheDay.vue` / `MatchCompareModal`; przy przebudowie formularza jej nie dokładaj.
- Przycisk główny, jeśli modal go potrzebuje: pełna szerokość, `rounded-xl bg-lime text-on-lime font-display font-extrabold uppercase tracking-wide`. Przycisk drugorzędny: `rounded-xl bg-surface-2 text-muted`.
- Po zmianie klas sprawdź modal w przeglądarce: tytuł, eyebrow, liczby, etykiety 11px, odstęp 24px pod tytułem, zamykanie overlayem i Escapem.
