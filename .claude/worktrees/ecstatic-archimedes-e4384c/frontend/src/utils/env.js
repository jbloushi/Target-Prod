export const getClientEnv = (key, fallback = '') => {
  const viteEnv = import.meta.env || {};
  const processEnv = typeof process !== 'undefined' ? process.env : {};

  return viteEnv[key] ?? processEnv?.[key] ?? fallback;
};

export const getApiBaseUrl = () => (
  getClientEnv('VITE_API_URL')
  || getClientEnv('REACT_APP_API_URL')
  || '/api'
);

export const getGoogleMapsApiKey = () => (
  getClientEnv('VITE_GOOGLE_MAPS_API_KEY')
  || getClientEnv('REACT_APP_GOOGLE_MAPS_API_KEY')
  || ''
);

export const getMapboxToken = () => (
  getClientEnv('VITE_MAPBOX_TOKEN')
  || getClientEnv('REACT_APP_MAPBOX_TOKEN')
  || ''
);

export const isDevelopmentMode = () => (
  getClientEnv('DEV') === true
  || getClientEnv('MODE') === 'development'
  || getClientEnv('NODE_ENV') === 'development'
);

export const isProductionMode = () => (
  getClientEnv('PROD') === true
  || getClientEnv('MODE') === 'production'
  || getClientEnv('NODE_ENV') === 'production'
);
