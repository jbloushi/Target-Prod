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
    resolve: {
      alias: [
        {
          find: /^@mui\/icons-material\/(.*)/,
          replacement: '@mui/icons-material/esm/$1'
        },
        {
          find: '@mui/icons-material',
          replacement: '@mui/icons-material/esm'
        }
      ]
    },
    envPrefix: ['VITE_', 'REACT_APP_'],
    define: {
      'process.env': JSON.stringify(processEnv)
    },
    optimizeDeps: {
      include: [
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled'
      ]
    },
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 3000,
      strictPort: false,
      allowedHosts: true, 
      proxy: {
        '^/api(?:/|$)': {
          target: 'http://127.0.0.1:8899',
          changeOrigin: true
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 3000,
      strictPort: false,
      allowedHosts: true
    },
    build: {
      outDir: 'build',
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react-core',
                test: (id) => id.includes('preload') || id.includes('vite/') || /[\\/]node_modules[\\/](react|react-dom|scheduler|@babel\/runtime)[\\/]/.test(id),
                priority: 40
              },
              {
                name: 'maps-vendor',
                test: /[\\/]node_modules[\\/](@react-google-maps|use-places-autocomplete|mapbox-gl)[\\/]/,
                priority: 20
              },
              {
                name: 'jspdf-vendor',
                test: /[\\/]node_modules[\\/](jspdf|jspdf-autotable)[\\/]/,
                priority: 20
              },
              {
                name: 'scanner-vendor',
                test: /[\\/]node_modules[\\/]react-qr-scanner[\\/]/,
                priority: 20
              },
              {
                name: 'canvas-vendor',
                test: /[\\/]node_modules[\\/]html2canvas[\\/]/,
                priority: 15
              },
              {
                name: 'qrcode-vendor',
                test: /[\\/]node_modules[\\/]qrcode[\\/]/,
                priority: 15
              },
              {
                name: 'mui-vendor',
                test: /[\\/]node_modules[\\/](@mui|@emotion)[\\/]/,
                priority: 10
              }
            ]
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
