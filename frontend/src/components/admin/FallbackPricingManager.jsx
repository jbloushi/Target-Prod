import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useSnackbar } from 'notistack';
import { settingsService } from '../../services/api';

// Static definitions matching the official fallback tariff cards
const FALLBACK_RATES_MATRIX = [
  { weight: 0.5, economy: 3.250, aramex: 4.750, dhlZ1: 5.750, dhlZ4: 8.500, dhlZ6: 9.500 },
  { weight: 1.0, economy: 3.750, aramex: 5.750, dhlZ1: 7.500, dhlZ4: 10.500, dhlZ6: 12.500 },
  { weight: 1.5, economy: 4.250, aramex: 6.750, dhlZ1: 9.250, dhlZ4: 12.500, dhlZ6: 15.750 },
  { weight: 2.0, economy: 4.750, aramex: 7.750, dhlZ1: 11.000, dhlZ4: 16.500, dhlZ6: 18.250 },
  { weight: 2.5, economy: 5.250, aramex: 8.750, dhlZ1: 12.750, dhlZ4: 19.000, dhlZ6: 20.000 },
  { weight: 3.0, economy: 5.750, aramex: 9.750, dhlZ1: 14.500, dhlZ4: 21.500, dhlZ6: 22.000 },
  { weight: 3.5, economy: 6.250, aramex: 10.750, dhlZ1: 16.250, dhlZ4: 23.500, dhlZ6: 24.000 },
  { weight: 4.0, economy: 6.750, aramex: 11.750, dhlZ1: 18.000, dhlZ4: 25.500, dhlZ6: 26.000 },
  { weight: 4.5, economy: 7.250, aramex: 12.750, dhlZ1: 19.750, dhlZ4: 27.500, dhlZ6: 28.000 },
  { weight: 5.0, economy: 7.750, aramex: 13.750, dhlZ1: 21.500, dhlZ4: 29.500, dhlZ6: 30.000 },
  { weight: 5.5, economy: 8.250, aramex: 14.750, dhlZ1: 23.250, dhlZ4: 31.500, dhlZ6: 32.000 },
  { weight: 6.0, economy: 8.750, aramex: 15.750, dhlZ1: 25.000, dhlZ4: 33.500, dhlZ6: 34.000 },
  { weight: 6.5, economy: 9.250, aramex: 16.750, dhlZ1: 26.750, dhlZ4: 35.500, dhlZ6: 36.500 },
  { weight: 7.0, economy: 9.750, aramex: 17.750, dhlZ1: 28.500, dhlZ4: 37.500, dhlZ6: 38.500 },
  { weight: 7.5, economy: 10.250, aramex: 18.750, dhlZ1: 30.250, dhlZ4: 39.500, dhlZ6: 40.500 },
  { weight: 8.0, economy: 10.750, aramex: 19.750, dhlZ1: 32.000, dhlZ4: 41.500, dhlZ6: 42.500 },
  { weight: 8.5, economy: 11.250, aramex: 20.750, dhlZ1: 33.750, dhlZ4: 43.500, dhlZ6: 45.000 },
  { weight: 9.0, economy: 11.750, aramex: 21.750, dhlZ1: 35.500, dhlZ4: 45.500, dhlZ6: 47.000 },
  { weight: 9.5, economy: 12.250, aramex: 22.750, dhlZ1: 37.250, dhlZ4: 47.500, dhlZ6: 49.000 },
  { weight: 10.0, economy: 12.750, aramex: 23.750, dhlZ1: 39.000, dhlZ4: 49.500, dhlZ6: 51.000 },
];

export const FallbackPricingManager = () => {
  const { lang, isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rateCards, setRateCards] = useState([]);
  const [tableFilter, setTableFilter] = useState('');

  // Fallback configuration state
  const [fallbackConfig, setFallbackConfig] = useState({
    enabled: true,
    economyRateCardId: 'FALLBACK_ECONOMY_GCC',
    aramexRateCardId: 'FALLBACK_ARAMEX_GCC',
    dhlRateCardId: 'FALLBACK_DHL_EXPORT',
    triggerOnZeroRate: true,
    triggerOnCarrierError: true,
  });

  // Simulator State
  const [simService, setSimService] = useState('ECONOMY');
  const [simCountry, setSimCountry] = useState('SA');
  const [simWeight, setSimWeight] = useState('2.5');
  const [simResult, setSimResult] = useState(null);

  // Fetch system settings and rate cards
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sysRes, cardsRes] = await Promise.all([
        settingsService.getSystemSettings(),
        settingsService.getRateCards(),
      ]);

      if (sysRes?.data?.fallbackPricing) {
        setFallbackConfig((prev) => ({
          ...prev,
          ...sysRes.data.fallbackPricing,
        }));
      }

      setRateCards(cardsRes?.data || []);
    } catch (err) {
      console.error('Failed to load fallback settings:', err);
      enqueueSnackbar(lang === 'ar' ? 'فشل تحميل إعدادات تسعير الطوارئ' : 'Failed to load fallback settings', {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar, lang]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save
  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.updateSystemSettings({
        fallbackPricing: fallbackConfig,
      });

      enqueueSnackbar(
        lang === 'ar'
          ? 'تم حفظ إعدادات تسعير الطوارئ والبدائل بنجاح'
          : 'Fallback pricing configuration saved successfully',
        { variant: 'success' }
      );
    } catch (err) {
      console.error('Error saving fallback settings:', err);
      enqueueSnackbar(lang === 'ar' ? 'فشل حفظ الإعدادات' : 'Failed to save settings', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Run Simulator Calculation
  const handleRunSimulation = () => {
    const w = parseFloat(simWeight);
    if (isNaN(w) || w <= 0) {
      enqueueSnackbar(lang === 'ar' ? 'يرجى إدخال وزن صالح' : 'Please enter a valid weight', { variant: 'warning' });
      return;
    }

    const roundedWeight = Math.min(10.0, Math.max(0.5, Math.ceil(w * 2) / 2));
    const bracket = FALLBACK_RATES_MATRIX.find((b) => Math.abs(b.weight - roundedWeight) < 0.01);

    if (!bracket) {
      enqueueSnackbar(lang === 'ar' ? 'الوزن خارج نطاق التغطية' : 'Weight out of coverage range', { variant: 'warning' });
      return;
    }

    const gccCountries = ['SA', 'QA', 'AE', 'BH', 'OM', 'KW'];
    const europeCountries = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'DK', 'SE', 'CH', 'AT'];

    let price = 0;
    let serviceTitle = '';
    let zoneDesc = '';

    if (simService === 'ECONOMY') {
      serviceTitle = lang === 'ar' ? 'الشحن الاقتصادي (GCC)' : 'Economy Shipping (GCC)';
      if (!gccCountries.includes(simCountry)) {
        enqueueSnackbar(
          lang === 'ar' ? 'الشحن الاقتصادي متاح لدول الخليج فقط' : 'Economy shipping only applies to GCC countries',
          { variant: 'warning' }
        );
        return;
      }
      price = bracket.economy;
      zoneDesc = 'Gulf GCC Zone';
    } else if (simService === 'ARAMEX') {
      serviceTitle = lang === 'ar' ? 'أرامكس الخليج (GCC)' : 'Aramex Shipping (GCC)';
      if (!gccCountries.includes(simCountry)) {
        enqueueSnackbar(
          lang === 'ar' ? 'شحن أرامكس الخليجي متاح لدول الخليج فقط' : 'Aramex shipping only applies to GCC countries',
          { variant: 'warning' }
        );
        return;
      }
      price = bracket.aramex;
      zoneDesc = 'Gulf GCC Zone';
    } else if (simService === 'DHL') {
      serviceTitle = lang === 'ar' ? 'شحن دي إتش إل إكسبريس (DHL)' : 'DHL Express Export';
      if (gccCountries.includes(simCountry)) {
        price = bracket.dhlZ1;
        zoneDesc = 'Zone 1: Gulf (Saudi, Qatar, UAE, Bahrain, Oman)';
      } else if (europeCountries.includes(simCountry)) {
        price = bracket.dhlZ4;
        zoneDesc = 'Zone 4: Europe (UK, Germany, France, etc.)';
      } else if (simCountry === 'US') {
        price = bracket.dhlZ6;
        zoneDesc = 'Zone 6: USA';
      } else {
        price = bracket.dhlZ4;
        zoneDesc = 'Zone 4: International Fallback';
      }
    }

    setSimResult({
      serviceTitle,
      zoneDesc,
      weight: roundedWeight,
      price: price.toFixed(3),
      currency: 'KD',
    });
  };

  // Filtered matrix rows
  const filteredMatrix = useMemo(() => {
    if (!tableFilter) return FALLBACK_RATES_MATRIX;
    const q = tableFilter.trim().toLowerCase();
    return FALLBACK_RATES_MATRIX.filter(
      (r) =>
        r.weight.toString().includes(q) ||
        r.economy.toFixed(3).includes(q) ||
        r.aramex.toFixed(3).includes(q) ||
        r.dhlZ1.toFixed(3).includes(q)
    );
  }, [tableFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <span className="text-sm text-base-content/60 font-medium">
          {lang === 'ar' ? 'جاري تحميل جدول أسعار الطوارئ...' : 'Loading fallback tariff tables...'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Master Switches */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'تسعير الطوارئ والبدائل التلقائي (Fallback Tariffs)' : 'Automated Fallback Pricing & Tariffs'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {lang === 'ar'
                ? 'جداول الأسعار الرسمية المعيارية (بالدينار الكويتي) التي يتم تفعيلها تلقائياً عند انقطاع الاتصال أو غياب سعر الناقل.'
                : 'Guaranteed fallback rate cards (in KWD) automatically invoked during quoting or booking if a carrier API returns 0 or times out.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
            <span>{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : lang === 'ar' ? 'حفظ إعدادات البدائل' : 'Save Fallback Settings'}</span>
          </button>
        </div>

        {/* Master Controls & Triggers */}
        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <label className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'تفعيل التسعير البديل' : 'Enable Fallback Pricing'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? 'تطبيق جداول الطوارئ عند الحاجة' : 'Apply tariffs when carrier has no quote'}
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={fallbackConfig.enabled}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, enabled: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'التفعيل عند سعر 0 د.ك' : 'Trigger on 0 KD Rates'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? 'تجاوز تسعير الناقل إذا عاد بصفر' : 'Overrides carrier 0 quote with fallback'}
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-secondary toggle-sm"
              checked={fallbackConfig.triggerOnZeroRate}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, triggerOnZeroRate: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'التفعيل عند انقطاع الـ API' : 'Trigger on Carrier Timeout'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? 'حماية من انقطاع شركات الشحن' : 'Protects checkout from carrier outages'}
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-accent toggle-sm"
              checked={fallbackConfig.triggerOnCarrierError}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, triggerOnCarrierError: e.target.checked })}
            />
          </label>
        </div>
      </div>

      {/* The 3 Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Economy GCC */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">local_shipping</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">
                  {lang === 'ar' ? 'الشحن الاقتصادي' : 'Economy Shipping'}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Gulf (GCC)</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md border border-primary/30 text-primary text-[11px] font-semibold">OTE / GCC</span>
          </div>

          <div className="text-xs space-y-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3 rounded-xl">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'نطاق التغطية:' : 'Applies to:'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-end">SA, AE, QA, BH, OM</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'سعر البداية (0.5 كجم):' : 'Base Rate (0.5 kg):'}</span>
              <span className="font-bold tabular-nums text-primary">3.250 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الزيادة لكل 0.5 كجم:' : 'Step (/ 0.5 kg):'}</span>
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">+0.500 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الحد الأقصى (10.0 كجم):' : 'Max (10.0 kg):'}</span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">12.750 KD</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
              {lang === 'ar' ? 'بطاقة الأسعار المربوطة' : 'Linked Fallback Rate Card'}
            </label>
            <select
              value={fallbackConfig.economyRateCardId}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, economyRateCardId: e.target.value })}
              className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="FALLBACK_ECONOMY_GCC">FALLBACK_ECONOMY_GCC (Default)</option>
              {rateCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card 2: Aramex GCC */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">flight_takeoff</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">
                  {lang === 'ar' ? 'شحن أرامكس' : 'Aramex Shipping'}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Gulf (GCC)</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">ARAMEX / GCC</span>
          </div>

          <div className="text-xs space-y-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3 rounded-xl">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'نطاق التغطية:' : 'Applies to:'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-end">SA, AE, QA, BH, OM</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'سعر البداية (0.5 كجم):' : 'Base Rate (0.5 kg):'}</span>
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">4.750 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الزيادة لكل 0.5 كجم:' : 'Step (/ 0.5 kg):'}</span>
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">+1.000 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الحد الأقصى (10.0 كجم):' : 'Max (10.0 kg):'}</span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">23.750 KD</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
              {lang === 'ar' ? 'بطاقة الأسعار المربوطة' : 'Linked Fallback Rate Card'}
            </label>
            <select
              value={fallbackConfig.aramexRateCardId}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, aramexRateCardId: e.target.value })}
              className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="FALLBACK_ARAMEX_GCC">FALLBACK_ARAMEX_GCC (Default)</option>
              {rateCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card 3: DHL Export */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">public</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">
                  {lang === 'ar' ? 'شحن دي إتش إل' : 'DHL Export Shipping'}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Export Zones 1, 4, 6</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md border border-sky-500/30 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">DHL / DGR</span>
          </div>

          <div className="text-xs space-y-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3 rounded-xl">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Zone 1 (Gulf):</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">5.750 – 39.000 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Zone 4 (Europe):</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">8.500 – 49.500 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Zone 6 (USA):</span>
              <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400">9.500 – 51.000 KD</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'شرائح الوزن:' : 'Brackets:'}</span>
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">0.5 – 10.0 kg (20 tiers)</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
              {lang === 'ar' ? 'بطاقة الأسعار المربوطة' : 'Linked Fallback Rate Card'}
            </label>
            <select
              value={fallbackConfig.dhlRateCardId}
              onChange={(e) => setFallbackConfig({ ...fallbackConfig, dhlRateCardId: e.target.value })}
              className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="FALLBACK_DHL_EXPORT">FALLBACK_DHL_EXPORT (Default)</option>
              {rateCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Simulator Section */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">calculate</span>
          <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
            {lang === 'ar' ? 'محاكي تسعير الطوارئ الفوري' : 'Live Fallback Rate Calculator & Test'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
              {lang === 'ar' ? 'خدمة الشحن' : 'Shipping Service'}
            </label>
            <select
              value={simService}
              onChange={(e) => setSimService(e.target.value)}
              className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="ECONOMY">Economy Shipping (Gulf GCC)</option>
              <option value="ARAMEX">Aramex Shipping (Gulf GCC)</option>
              <option value="DHL">DHL Export (Zones 1, 4, 6)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
              {lang === 'ar' ? 'بلد الوجهة' : 'Destination Country'}
            </label>
            <select
              value={simCountry}
              onChange={(e) => setSimCountry(e.target.value)}
              className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <optgroup label="Gulf (GCC)">
                <option value="SA">Saudi Arabia (KSA)</option>
                <option value="AE">United Arab Emirates (UAE)</option>
                <option value="QA">Qatar</option>
                <option value="BH">Bahrain</option>
                <option value="OM">Oman</option>
              </optgroup>
              <optgroup label="Europe (Zone 4)">
                <option value="GB">United Kingdom (UK)</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
              </optgroup>
              <optgroup label="Americas (Zone 6)">
                <option value="US">United States (USA)</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
              {lang === 'ar' ? 'الوزن (كجم)' : 'Weight (kg)'}
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="10"
              value={simWeight}
              onChange={(e) => setSimWeight(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={handleRunSimulation}
              className="w-full h-9 px-3 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary dark:text-sky-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">play_arrow</span>
              <span>{lang === 'ar' ? 'احسب السعر البديل' : 'Calculate Quote'}</span>
            </button>
          </div>
        </div>

        {simResult && (
          <div className="mt-4 p-4 rounded-xl bg-primary/5 dark:bg-sky-500/10 border border-primary/20 dark:border-sky-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-primary dark:text-sky-400">{simResult.serviceTitle}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {simResult.zoneDesc} | {simResult.weight} kg
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'السعر المحسوب:' : 'Calculated Price:'}</span>
              <span className="text-2xl font-black text-primary dark:text-sky-400 font-mono tabular-nums">
                {simResult.price} {simResult.currency}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Complete Matrix Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">table_chart</span>
            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'جدول أسعار الطوارئ الكامل (بالدينار الكويتي KD)' : 'Complete Fallback Tariff Rates (All rates in KD)'}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {filteredMatrix.length} brackets
            </span>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder={lang === 'ar' ? 'بحث بالوزن أو السعر...' : 'Filter by weight or rate...'}
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full border-collapse text-center text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-black text-slate-900 dark:text-slate-100 sticky start-0 bg-slate-100 dark:bg-slate-800 z-30 shadow-xs whitespace-nowrap">
                  {lang === 'ar' ? 'الوزن (كجم)' : 'Weight (kg)'}
                </th>
                <th className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                  {lang === 'ar' ? 'اقتصادي - الخليج' : 'Economy | Gulf (GCC)'}
                </th>
                <th className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                  {lang === 'ar' ? 'أرامكس - الخليج' : 'Aramex | Gulf (GCC)'}
                </th>
                <th className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                  {lang === 'ar' ? 'DHL - المنطقة 1 (الخليج)' : 'DHL | Zone 1 (Gulf)'}
                </th>
                <th className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                  {lang === 'ar' ? 'DHL - المنطقة 4 (أوروبا)' : 'DHL | Zone 4 (Europe)'}
                </th>
                <th className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap">
                  {lang === 'ar' ? 'DHL - المنطقة 6 (أمريكا)' : 'DHL | Zone 6 (USA)'}
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums text-xs divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMatrix.map((row) => {
                const isHighlighted = simResult && Math.abs(simResult.weight - row.weight) < 0.01;
                return (
                  <tr
                    key={row.weight}
                    className={
                      isHighlighted
                        ? 'bg-primary/10 dark:bg-sky-500/15 font-bold'
                        : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors'
                    }
                  >
                    <td
                      className={`py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 sticky start-0 z-10 shadow-xs whitespace-nowrap ${
                        isHighlighted ? 'bg-primary/10 dark:bg-sky-950' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {row.weight.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-semibold">{row.economy.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-semibold">{row.aramex.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">{row.dhlZ1.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">{row.dhlZ4.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">{row.dhlZ6.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FallbackPricingManager;
