import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useSnackbar } from 'notistack';
import { settingsService } from '../../services/api';

export const RateCardsManager = () => {
  const { lang, isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef(null);

  const [rateCards, setRateCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    id: '',
    name: '',
    carrierCode: 'DGR',
    currency: 'KWD',
    pricingMode: 'SELLING_PRICE',
    file: null,
    fileBase64: '',
    fileName: '',
    fileSize: 0,
  });

  // Matrix View Modal State
  const [viewCard, setViewCard] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixSearch, setMatrixSearch] = useState('');

  // Delete State
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRateCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settingsService.getRateCards();
      setRateCards(res?.data || []);
    } catch (err) {
      console.error('Failed to load rate cards:', err);
      enqueueSnackbar(lang === 'ar' ? 'فشل تحميل بطاقات الأسعار' : 'Failed to load rate cards', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar, lang]);

  useEffect(() => {
    fetchRateCards();
  }, [fetchRateCards]);

  // Handle Download Sample Template
  const handleDownloadSample = async () => {
    try {
      await settingsService.downloadRateCardSample();
      enqueueSnackbar(
        lang === 'ar' ? 'تم بدء تحميل نموذج بطاقة الأسعار التجريبي' : 'Sample rate card template downloaded',
        { variant: 'success' }
      );
    } catch (err) {
      console.error('Failed to download sample template:', err);
      enqueueSnackbar(
        lang === 'ar' ? 'فشل تحميل النموذج التجريبي' : 'Failed to download sample template',
        { variant: 'error' }
      );
    }
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      enqueueSnackbar(
        lang === 'ar' ? 'يرجى رفع ملف بصيغة Excel (.xlsx)' : 'Please upload an Excel file (.xlsx)',
        { variant: 'warning' }
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target.result;
      const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
      const guessedId = cleanFileName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');

      setUploadForm((prev) => ({
        ...prev,
        file,
        fileBase64: base64,
        fileName: file.name,
        fileSize: file.size,
        // Auto-fill ID and name if empty
        id: prev.id || guessedId,
        name: prev.name || cleanFileName,
      }));
    };
    reader.readAsDataURL(file);
  };

  // Handle Form Submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadForm.id.trim()) {
      enqueueSnackbar(lang === 'ar' ? 'معرف البطاقة مطلوب' : 'Card ID is required', { variant: 'warning' });
      return;
    }
    if (!uploadForm.name.trim()) {
      enqueueSnackbar(lang === 'ar' ? 'اسم البطاقة مطلوب' : 'Display name is required', { variant: 'warning' });
      return;
    }
    if (!uploadForm.fileBase64) {
      enqueueSnackbar(lang === 'ar' ? 'يرجى اختيار ملف Excel' : 'Please select an Excel file', { variant: 'warning' });
      return;
    }

    setUploading(true);
    try {
      await settingsService.uploadRateCard({
        id: uploadForm.id.trim().toUpperCase(),
        name: uploadForm.name.trim(),
        carrierCode: uploadForm.carrierCode,
        currency: uploadForm.currency,
        pricingMode: uploadForm.pricingMode,
        fileBase64: uploadForm.fileBase64,
        filename: uploadForm.fileName,
      });

      enqueueSnackbar(
        lang === 'ar' ? `تم استيراد بطاقة الأسعار ${uploadForm.id} بنجاح` : `Rate card ${uploadForm.id} imported successfully`,
        { variant: 'success' }
      );

      setUploadModalOpen(false);
      setUploadForm({
        id: '',
        name: '',
        carrierCode: 'DGR',
        currency: 'KWD',
        pricingMode: 'SELLING_PRICE',
        file: null,
        fileBase64: '',
        fileName: '',
        fileSize: 0,
      });
      fetchRateCards();
    } catch (err) {
      console.error('Upload failed:', err);
      const msg = err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل استيراد الملف' : 'Upload failed');
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // View Matrix Details
  const handleOpenMatrix = async (cardId) => {
    setMatrixLoading(true);
    try {
      const res = await settingsService.getRateCardDetails(cardId);
      if (res?.data) {
        setViewCard(res.data);
      }
    } catch (err) {
      console.error('Failed to get matrix details:', err);
      enqueueSnackbar(lang === 'ar' ? 'فشل تحميل تفاصيل المصفوفة' : 'Failed to load rate card matrix', { variant: 'error' });
    } finally {
      setMatrixLoading(false);
    }
  };

  // Delete Card
  const handleDeleteCard = async (cardId) => {
    setDeleting(true);
    try {
      await settingsService.deleteRateCard(cardId);
      enqueueSnackbar(lang === 'ar' ? 'تم حذف بطاقة الأسعار بنجاح' : 'Rate card deleted successfully', { variant: 'success' });
      setDeleteConfirmId(null);
      fetchRateCards();
    } catch (err) {
      console.error('Delete failed:', err);
      const msg = err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل حذف البطاقة' : 'Delete failed');
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered Cards
  const filteredCards = rateCards.filter((card) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      card.id?.toLowerCase().includes(q) ||
      card.name?.toLowerCase().includes(q) ||
      card.carrierCode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="card bg-base-100 border border-base-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">table_chart</span>
              <h2 className="text-xl font-bold tracking-tight">
                {lang === 'ar' ? 'إدارة بطاقات الأسعار وعقود الشحن' : 'Carrier Contract Rate Cards & Matrices'}
              </h2>
            </div>
            <p className="text-sm text-base-content/70">
              {lang === 'ar'
                ? 'اربط أسعار العقود الخاصة للعملاء بناءً على شرائح الوزن ومناطق الشحن (Zones 1-9) مثل عقود DHL Express وغيرها.'
                : 'Manage customer contract rate cards with zone-based pricing tiers (Zones 1-9). Used by DHL Express contracts and customer-specific tariffs.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadSample}
              className="btn btn-outline btn-sm gap-2"
              title={lang === 'ar' ? 'تحميل نموذج Excel المعتمد' : 'Download standard Excel sample template'}
            >
              <span className="material-symbols-outlined text-base text-success">download</span>
              <span>{lang === 'ar' ? 'تحميل نموذج Excel' : 'Download Sample (.xlsx)'}</span>
            </button>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="btn btn-primary btn-sm gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              <span>{lang === 'ar' ? 'رفع بطاقة أسعار جديدة' : 'Upload Rate Card'}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-base-200">
          <div className="bg-base-200/50 rounded-xl p-3">
            <div className="text-xs text-base-content/60">{lang === 'ar' ? 'إجمالي البطاقات' : 'Total Rate Cards'}</div>
            <div className="text-xl font-black text-primary mt-1">{rateCards.length}</div>
          </div>
          <div className="bg-base-200/50 rounded-xl p-3">
            <div className="text-xs text-base-content/60">{lang === 'ar' ? 'العقد الافتراضي' : 'Default Contract'}</div>
            <div className="text-sm font-bold text-base-content mt-1">5535 - AMANI (DGR)</div>
          </div>
          <div className="bg-base-200/50 rounded-xl p-3">
            <div className="text-xs text-base-content/60">{lang === 'ar' ? 'المناطق المغطاة' : 'Zones Supported'}</div>
            <div className="text-sm font-bold text-base-content mt-1">9 DHL Zones (1-9)</div>
          </div>
          <div className="bg-base-200/50 rounded-xl p-3">
            <div className="text-xs text-base-content/60">{lang === 'ar' ? 'شرائح الوزن' : 'Weight Brackets'}</div>
            <div className="text-sm font-bold text-base-content mt-1">0.5 kg - 30.0 kg + Flat/KG</div>
          </div>
        </div>
      </div>

      {/* Cards Table Section */}
      <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-base-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base">
              {lang === 'ar' ? 'البطاقات المتاحة للنظام' : 'Active System Rate Cards'}
            </span>
            <span className="badge badge-sm badge-neutral">{filteredCards.length}</span>
          </div>

          <div className="w-full sm:w-64">
            <div className="relative">
              <input
                type="text"
                placeholder={lang === 'ar' ? 'بحث بالاسم أو المعرف...' : 'Search by ID or name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input input-sm input-bordered w-full pl-8 rtl:pr-8"
              />
              <span className={`material-symbols-outlined text-sm absolute top-2.5 text-base-content/40 ${isRTL ? 'right-2.5' : 'left-2.5'}`}>
                search
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/50 mt-2">
              {lang === 'ar' ? 'جارٍ تحميل بطاقات الأسعار...' : 'Loading rate cards...'}
            </p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-base-content/30">playlist_remove</span>
            <p className="text-sm font-semibold text-base-content/70">
              {lang === 'ar' ? 'لم يتم العثور على بطاقات أسعار' : 'No rate cards found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full text-sm">
              <thead className="bg-base-200/60 text-xs uppercase font-semibold text-base-content/70">
                <tr>
                  <th>{lang === 'ar' ? 'معرف البطاقة (ID)' : 'Card ID'}</th>
                  <th>{lang === 'ar' ? 'اسم البطاقة' : 'Display Name'}</th>
                  <th>{lang === 'ar' ? 'الناقل' : 'Carrier'}</th>
                  <th>{lang === 'ar' ? 'طريقة التسعير' : 'Pricing Mode'}</th>
                  <th>{lang === 'ar' ? 'العملة' : 'Currency'}</th>
                  <th>{lang === 'ar' ? 'الشرائح والمناطق' : 'Coverage'}</th>
                  <th className="text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => {
                  const isBuiltIn = card.id === '5535_AMANI' || card.id === 'DHL_5535_AMANI';
                  return (
                    <tr key={card.id} className="hover">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{card.id}</span>
                          {isBuiltIn && (
                            <span className="badge badge-xs badge-info font-medium">
                              {lang === 'ar' ? 'نظامي' : 'System Default'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-semibold text-base-content">{card.name}</td>
                      <td>
                        <span className="badge badge-sm badge-outline font-semibold">
                          {card.carrierCode || 'DGR'}
                        </span>
                      </td>
                      <td>
                        {card.pricingMode === 'SELLING_PRICE' ? (
                          <span className="badge badge-sm badge-success gap-1 text-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-success-content" />
                            {lang === 'ar' ? 'سعر بيع للعميل' : 'Selling Price'}
                          </span>
                        ) : (
                          <span className="badge badge-sm badge-ghost gap-1 text-xs">
                            {lang === 'ar' ? 'تكلفة أساسية' : 'Base Cost'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="font-mono font-bold text-xs">{card.currency || 'KWD'}</span>
                      </td>
                      <td>
                        <div className="text-xs text-base-content/80">
                          <div>
                            <span className="font-semibold">{card.totalBrackets || 60}</span> {lang === 'ar' ? 'شريحة' : 'brackets'} (0.5 - {card.maxBracketWeight || 30.0} kg)
                          </div>
                          <div className="text-base-content/50 text-[11px]">
                            {card.zones?.length ? `Zones ${card.zones.join(', ')}` : 'Zones 1 - 9'}
                          </div>
                        </div>
                      </td>
                      <td className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenMatrix(card.id)}
                            className="btn btn-ghost btn-xs gap-1 text-primary"
                            title={lang === 'ar' ? 'عرض جدول الأسعار' : 'View full matrix'}
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            <span>{lang === 'ar' ? 'عرض' : 'View'}</span>
                          </button>

                          {!isBuiltIn ? (
                            <button
                              onClick={() => setDeleteConfirmId(card.id)}
                              className="btn btn-ghost btn-xs text-error"
                              title={lang === 'ar' ? 'حذف البطاقة' : 'Delete rate card'}
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          ) : (
                            <span
                              className="btn btn-ghost btn-xs btn-disabled opacity-30"
                              title={lang === 'ar' ? 'لا يمكن حذف البطاقة الافتراضية' : 'System card cannot be deleted'}
                            >
                              <span className="material-symbols-outlined text-sm">lock</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">upload_file</span>
                <h3 className="font-bold text-lg">
                  {lang === 'ar' ? 'رفع بطاقة أسعار جديدة (Excel .xlsx)' : 'Upload New Rate Card (.xlsx)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 mt-4">
              {/* Template Download Prompt Banner */}
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">info</span>
                  <span>
                    {lang === 'ar'
                      ? 'للحصول على التنسيق المعتمد، حمّل نموذج Excel الجاهز الذي يحتوي على أعمدة Zones 1-9 وشرائح الوزن.'
                      : 'Ensure your file matches the required layout (Weight column and Zone 1 to Zone 9 columns).'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="btn btn-xs btn-outline btn-primary whitespace-nowrap gap-1"
                >
                  <span className="material-symbols-outlined text-xs">download</span>
                  <span>{lang === 'ar' ? 'تحميل النموذج' : 'Get Template'}</span>
                </button>
              </div>

              {/* Identification Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs">
                      {lang === 'ar' ? 'معرف البطاقة (Card ID) *' : 'Card Identifier (ID) *'}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 6000_KHALID"
                    value={uploadForm.id}
                    onChange={(e) => setUploadForm({ ...uploadForm, id: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    className="input input-sm input-bordered w-full font-mono font-semibold"
                  />
                  <span className="text-[11px] text-base-content/50 mt-1 block">
                    {lang === 'ar' ? 'رمز فريد بالأحرف الإنجليزية (مثل: 6000_KHALID)' : 'Unique uppercase alphanumeric code'}
                  </span>
                </div>

                <div>
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs">
                      {lang === 'ar' ? 'اسم البطاقة للعرض *' : 'Display Name *'}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 6000 - Khalid Express"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    className="input input-sm input-bordered w-full"
                  />
                </div>
              </div>

              {/* Carrier & Currency Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs">
                      {lang === 'ar' ? 'الناقل *' : 'Carrier *'}
                    </span>
                  </label>
                  <select
                    value={uploadForm.carrierCode}
                    onChange={(e) => setUploadForm({ ...uploadForm, carrierCode: e.target.value })}
                    className="select select-sm select-bordered w-full"
                  >
                    <option value="DGR">DGR (DHL Express)</option>
                    <option value="DHL">DHL Direct</option>
                    <option value="ARAMEX">Aramex</option>
                    <option value="OTE">OTE / LogesTechs</option>
                    <option value="OTHER">Other Carrier</option>
                  </select>
                </div>

                <div>
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs">
                      {lang === 'ar' ? 'نوع التسعير *' : 'Pricing Mode *'}
                    </span>
                  </label>
                  <select
                    value={uploadForm.pricingMode}
                    onChange={(e) => setUploadForm({ ...uploadForm, pricingMode: e.target.value })}
                    className="select select-sm select-bordered w-full"
                  >
                    <option value="SELLING_PRICE">
                      {lang === 'ar' ? 'سعر البيع النهائي (شامل)' : 'Selling Price (Customer Final)'}
                    </option>
                    <option value="BASE_COST">
                      {lang === 'ar' ? 'سعر التكلفة (قبل الهامش)' : 'Base Cost (Before Markup)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs">
                      {lang === 'ar' ? 'العملة *' : 'Currency *'}
                    </span>
                  </label>
                  <select
                    value={uploadForm.currency}
                    onChange={(e) => setUploadForm({ ...uploadForm, currency: e.target.value })}
                    className="select select-sm select-bordered w-full font-mono"
                  >
                    <option value="KWD">KWD (Kuwaiti Dinar)</option>
                    <option value="SAR">SAR (Saudi Riyal)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              {/* Drag & Drop File Upload Area */}
              <div>
                <label className="label py-1">
                  <span className="label-text font-bold text-xs">
                    {lang === 'ar' ? 'ملف Excel للأسعار (.xlsx) *' : 'Excel Matrix File (.xlsx) *'}
                  </span>
                </label>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    uploadForm.fileName
                      ? 'border-success/60 bg-success/5'
                      : 'border-base-300 hover:border-primary/50 hover:bg-base-200/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {uploadForm.fileName ? (
                    <div className="space-y-1">
                      <span className="material-symbols-outlined text-3xl text-success">check_circle</span>
                      <p className="font-bold text-sm text-base-content">{uploadForm.fileName}</p>
                      <p className="text-xs text-base-content/60">
                        {(uploadForm.fileSize / 1024).toFixed(1)} KB — {lang === 'ar' ? 'جاهز للاستيراد' : 'Ready for import'}
                      </p>
                      <span className="badge badge-sm badge-ghost mt-2">
                        {lang === 'ar' ? 'انقر للتغيير' : 'Click to change file'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="material-symbols-outlined text-4xl text-primary/70">upload_file</span>
                      <p className="font-semibold text-sm">
                        {lang === 'ar' ? 'اسحب ملف Excel هنا أو انقر للاختيار' : 'Drag & drop Excel file here, or click to browse'}
                      </p>
                      <p className="text-xs text-base-content/50">
                        {lang === 'ar' ? 'يدعم ملفات .xlsx (الحد الأقصى 5 ميجابايت)' : 'Supports .xlsx spreadsheets (up to 5MB)'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="modal-action border-t border-base-200 pt-3">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setUploadModalOpen(false)}
                  className="btn btn-sm btn-ghost"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadForm.fileBase64}
                  className="btn btn-sm btn-primary gap-2"
                >
                  {uploading ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>{lang === 'ar' ? 'جارٍ المعالجة والتحقق...' : 'Parsing Matrix...'}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>{lang === 'ar' ? 'استيراد وحفظ' : 'Import & Save'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Matrix View Modal */}
      {viewCard && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl max-h-[85vh] flex flex-col p-6">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg text-primary">{viewCard.id}</span>
                  <span className="badge badge-sm badge-outline">{viewCard.carrierCode}</span>
                  <span className="badge badge-sm badge-success font-semibold">{viewCard.pricingMode}</span>
                </div>
                <p className="text-xs text-base-content/70">{viewCard.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewCard(null)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            {/* Over 30kg Excess Rates Banner */}
            {viewCard.over30KgPerKgRate && Object.keys(viewCard.over30KgPerKgRate).length > 0 && (
              <div className="my-3 p-3 bg-base-200/60 rounded-xl text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-base-content">
                  <span className="material-symbols-outlined text-sm text-warning">info</span>
                  <span>{lang === 'ar' ? 'سعر الكيلو الإضافي فوق 30 كجم (Flat per-kg rate):' : 'Excess Rate Above 30 kg (per additional kg):'}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 font-mono">
                  {Object.entries(viewCard.over30KgPerKgRate).map(([zone, rate]) => (
                    <span key={zone} className="badge badge-sm badge-neutral">
                      Zone {zone}: +{Number(rate).toFixed(3)} {viewCard.currency}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Brackets Filter */}
            <div className="py-2 flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-base-content/70">
                {lang === 'ar' ? `إجمالي الشرائح: ${viewCard.brackets?.length || 0}` : `Weight Brackets: ${viewCard.brackets?.length || 0}`}
              </span>
              <div className="w-48">
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'تصفية بالوزن...' : 'Filter by weight...'}
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  className="input input-xs input-bordered w-full font-mono"
                />
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-auto flex-1 border border-base-200 rounded-xl">
              <table className="table table-xs table-pin-rows table-zebra w-full text-center">
                <thead>
                  <tr className="bg-base-200 font-bold text-base-content">
                    <th className="bg-base-300 font-mono">{lang === 'ar' ? 'الوزن (KG)' : 'Weight (KG)'}</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => (
                      <th key={z} className="font-mono">Zone {z}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {viewCard.brackets
                    ?.filter((b) => !matrixSearch || String(b.weight).includes(matrixSearch))
                    .map((bracket) => (
                      <tr key={bracket.weight}>
                        <td className="font-bold bg-base-200/40">{bracket.weight.toFixed(1)}</td>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => {
                          const val = bracket.rates?.[String(z)];
                          const isSpecialFix = z === 7 && Math.abs(bracket.weight - 3.0) < 0.01;
                          return (
                            <td key={z} className={isSpecialFix ? 'bg-success/20 font-bold text-success-content' : ''}>
                              {val !== undefined ? Number(val).toFixed(3) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="modal-action pt-3">
              <button
                type="button"
                onClick={() => setViewCard(null)}
                className="btn btn-sm btn-ghost"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-base text-error flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">warning</span>
              {lang === 'ar' ? 'تأكيد حذف بطاقة الأسعار' : 'Confirm Rate Card Deletion'}
            </h3>
            <p className="py-3 text-sm text-base-content/80">
              {lang === 'ar'
                ? `هل أنت متأكد من حذف بطاقة الأسعار "${deleteConfirmId}"؟ لن تتمكن العمليات المستقبلية من استخدام هذه المصفوفة.`
                : `Are you sure you want to delete rate card "${deleteConfirmId}"? Future shipments will no longer use this matrix.`}
            </p>
            <div className="modal-action">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmId(null)}
                className="btn btn-sm btn-ghost"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDeleteCard(deleteConfirmId)}
                className="btn btn-sm btn-error gap-1 text-white"
              >
                {deleting ? <span className="loading loading-spinner loading-xs" /> : <span className="material-symbols-outlined text-sm">delete</span>}
                <span>{lang === 'ar' ? 'حذف نهائي' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateCardsManager;
