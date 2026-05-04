import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const processEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('REACT_APP_'))
  );

  processEnv.NODE_ENV = mode === 'production' ? 'production' : 'development';

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    define: {
      'process.env': JSON.stringify(processEnv)
    },
    server: {
      port: 3000,
      // Add the allowedHosts property here
      allowedHosts: ['3pl.mawthook.io'], 
      proxy: {
        '^/api(?:/|$)': {
          target: 'http://127.0.0.1:8899',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'build',
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-qr-scanner')) return 'scanner-vendor';
            if (id.includes('jspdf')) return 'jspdf-vendor';
            if (id.includes('html2canvas')) return 'canvas-vendor';
            if (id.includes('qrcode')) return 'qrcode-vendor';
            if (id.includes('@react-google-maps') || id.includes('mapbox-gl')) return 'maps-vendor';
            if (id.includes('@mui') || id.includes('@emotion')) return 'mui-vendor';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor';
            return 'vendor';
          }
        }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.test.{js,jsx}']
    }
  };
});
