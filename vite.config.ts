import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('/@supabase/')) return 'supabase-vendor'
          if (id.includes('/zod/') || id.includes('/react-hook-form/') || id.includes('/@hookform/')) return 'forms-vendor'
          if (id.includes('/framer-motion/')) return 'motion-vendor'
        },
      },
      onwarn(warning, defaultHandler) {
        // Zod ships two misplaced pure annotations; Rollup removes them safely.
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/node_modules/zod/')) return
        defaultHandler(warning)
      },
    },
  },
})
