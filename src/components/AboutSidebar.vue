<template>
  <nav class="hidden md:block sticky top-32">
    <ul class="space-y-2">
      <li v-for="item in items" :key="item.href">
        <a :href="item.href" class="block px-4 py-2 rounded hover:text-accent">
          {{ item.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
interface NavItem {
  href: string;
  label: string;
}

const items: NavItem[] = [
  { href: '#vision', label: 'Vision' },
  { href: '#site-overview', label: 'Site Overview' },
  { href: '#how-it-works', label: 'How Ecash Works' },
  { href: '#who-for', label: 'Who It\u2019s For' },
  { href: '#navigation-map', label: 'Navigation Map' },
  { href: '#trust', label: 'Trust' },
  { href: '#faq', label: 'FAQ' },
];
</script>

<style scoped>
nav {
  color: var(--text-1);
}
</style>
