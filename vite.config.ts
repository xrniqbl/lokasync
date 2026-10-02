import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  build: {
    // Vendor splitting: react + router + charts land in separate long-lived
    // chunks so repeat visits only re-download the changed app chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["sonner", "lucide-react"],
          "vendor-radix": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-slot",
          ],
          "vendor-data": ["@supabase/supabase-js"],
        },
      },
    },
    // Warn earlier so new heavy deps get noticed before the bundle regresses.
    chunkSizeWarningLimit: 600,
  },
})
