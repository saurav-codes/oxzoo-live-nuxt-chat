export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  app: { head: { title: "nuxt-chat", htmlAttrs: { lang: "en" } } },
  nitro: {
    replace: { __BUILT_AT__: JSON.stringify(new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) },
  },
});
