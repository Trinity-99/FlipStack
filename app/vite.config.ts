import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa';

import fs from 'fs'
import path from 'path'

/**
 * autoIncrementVersion reads the current version from src/version.json, increments the patch number, and writes it back to the file.
 * does this on each build
 */
function autoIncrementVersion() {
  return {
    name: 'auto-increment-version',
    buildStart() {
      const versionFilePath = path.resolve(__dirname, 'src/version.json');
      const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
      const versionParts = versionData.version.split('.').map(Number);
      versionParts[2] += 1; // Increment the patch number
      versionData.version = versionParts.join('.');
      fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 4));
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    autoIncrementVersion(),
    VitePWA({
  registerType: 'autoUpdate',
  // Ensure these exist in your /public/ folder. Use image_14.png as your base asset.
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'safari-pinned-tab.svg'],
  manifest: {
    // 1. BRAND IDENTITY
    name: 'FlipStack - Smart 3-Sided Flashcards', // Full descriptive title
    short_name: 'FlipStack',                   // App launcher name
    description: 'Learn language and concepts using a symmetrical 3-sided card architecture.',

    // 2. THEME COLORS (Sourced directly from the gradient and background in image_14.png)
    theme_color: '#0D1117',      // Match the deep indigo background (from image_14.png)
    background_color: '#0D1117', // Match the background, for a seamless splash screen
    display: 'standalone',       // Hides the browser UI

    // 3. ICONS (Must be generated from the final image_14.png asset)
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        // Purpose 'any maskable' is critical for Android adaptive icons.
        // It ensures the vibrant blue/teal FS icon is centered inside
        // a circle or squircle on a user's home screen.
        purpose: 'any maskable'
      }
    ]
  }
}),
  ],
  base: '/FlipStack/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
