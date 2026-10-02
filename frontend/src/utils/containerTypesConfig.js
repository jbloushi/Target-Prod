/**
 * Container Types Configuration
 * Supports dynamic configuration via VITE_CONTAINER_TYPES_CONFIG env var (JSON array)
 * Falls back to standard Target Logistics brand defaults.
 */

export const DEFAULT_CONTAINER_TYPES = [
  { id: 'Box', name: 'Box', nameAr: 'صندوق', icon: 'inventory_2', length: 20, width: 15, height: 10, weight: 1.0, unit: 'cm', weightUnit: 'kg' },
  { id: 'Envelope', name: 'Envelope', nameAr: 'مظروف', icon: 'mail', length: 32, width: 24, height: 2, weight: 0.2, unit: 'cm', weightUnit: 'kg' },
  { id: 'Pallet', name: 'Pallet', nameAr: 'طبلية شحن', icon: 'pallet', length: 120, width: 80, height: 100, weight: 100.0, unit: 'cm', weightUnit: 'kg' },
  { id: 'Bag', name: 'Bag', nameAr: 'كيس شحن', icon: 'category', length: 30, width: 20, height: 5, weight: 0.5, unit: 'cm', weightUnit: 'kg' },
  { id: 'Crate', name: 'Crate', nameAr: 'صندوق خشبي', icon: 'deployed_code', length: 60, width: 40, height: 40, weight: 15.0, unit: 'cm', weightUnit: 'kg' },
  { id: 'Tube', name: 'Tube', nameAr: 'أسطوانة', icon: 'crop_square', length: 100, width: 10, height: 10, weight: 1.0, unit: 'cm', weightUnit: 'kg' }
];

export function getContainerTypes() {
  try {
    const envVal = import.meta.env?.VITE_CONTAINER_TYPES_CONFIG;
    if (envVal) {
      const parsed = typeof envVal === 'string' ? JSON.parse(envVal) : envVal;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[ContainerTypes] Failed to parse VITE_CONTAINER_TYPES_CONFIG from env, using defaults:', err);
  }
  return DEFAULT_CONTAINER_TYPES;
}

export function getContainerTypeById(id) {
  const types = getContainerTypes();
  return types.find(t => String(t.id).toLowerCase() === String(id).toLowerCase()) || types[0];
}
