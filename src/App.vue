<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AuthRequiredModal from '@/components/modals/AuthRequiredModal.vue'
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:font-semibold focus:text-on-lime"
    >Przejdź do treści</a
  >

  <AppHeader />

  <main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
    <!--
      Szkielet aplikacji (layout): header + główny obszar + router-view.
      Cała treść strony przeniosła się do src/views/* (patrz src/router/index.ts).
      Margin/padding `main` zostawiamy tutaj, aby każda podstrona dziedziczyła
      ten sam limit szerokości (max-w-7xl) i oddechy.
    -->
    <RouterView />
  </main>

  <AppFooter />

  <!-- Globalny modal auth – wyświetlany gdy użytkownik próbuje skorzystać z zastrzeżonej funkcji -->
  <AuthRequiredModal />
</template>
