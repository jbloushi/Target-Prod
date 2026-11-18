export const UI_VERSION_STORAGE_KEY = 'target_ui_version';

/**
 * Read the user's persisted UI version preference ('v1' | 'v2').
 * Defaults to 'v2' when unset or invalid.
 */
export const getStoredUiVersion = () => {
  try {
    const val = window.localStorage.getItem(UI_VERSION_STORAGE_KEY);
    return val === 'v1' ? 'v1' : 'v2';
  } catch {
    return 'v2';
  }
};

/**
 * Persist the user's explicit UI version choice ('v1' | 'v2') in localStorage.
 */
export const setStoredUiVersion = (version) => {
  const normalized = version === 'v1' ? 'v1' : 'v2';
  try {
    window.localStorage.setItem(UI_VERSION_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota or private browsing restrictions
  }
  return normalized;
};

/**
 * Resolve the default landing route for a user role based on stored UI version.
 */
export const getDefaultLandingPath = (role, version = getStoredUiVersion()) => {
  const isV1 = version === 'v1';
  if (role === 'driver') {
    return isV1 ? '/driver/pickup' : '/driver/pickup-v2';
  }
  return isV1 ? '/dashboard' : '/dashboard-v2';
};
