/* ==========================================================
   ZAYAIN — Pengelola Uang Masuk & Keluar
   Semua panggilan localStorage di file ini sudah diganti jadi
   `cloudStorage` (lihat cloud-sync.js, dimuat sebelum file ini).
   cloudStorage.getItem/setItem/removeItem PUNYA API PERSIS SAMA
   dengan localStorage biasa (tetap menulis ke localStorage juga,
   sinkron/instan), tapi setItem/removeItem JUGA mendorong
   perubahan ke tabel `kv_store` di Supabase di latar belakang.
   Jadi data yang diketik di satu perangkat otomatis tersedia di
   perangkat lain, selama login pakai akun yang sama.
========================================================== */

/* FIX lanjutan "flash ke Beranda sekilas saat refresh di halaman
   Tagihan & Hutang": class paksa `zp-tagihan-restore` (ditambahkan
   di <head> index.html, SEBELUM <body> sempat digambar sama sekali,
   supaya overlay #bdAllOverlay langsung tampil penuh dari frame
   PERTAMA tanpa transisi) dilepas lagi di sini, SEBAGAI BARIS PALING
   ATAS yang dieksekusi file ini. Alasannya dilepas justru di awal
   (bukan di akhir): supaya kontrol visual overlay diserahkan
   sepenuhnya ke mekanisme ASLI (class .open yang ditoggle oleh
   openBdAllPage()/closeBdAllPage(), lihat lebih bawah) SEBELUM
   mekanisme itu sempat dipanggil ulang di akhir init() -- kalau
   class paksa ini masih ada saat closeBdAllPage() nanti melepas
   class .open, overlay akan "nyangkut" tetap kelihatan terbuka
   (di-paksa CSS !important) walau harusnya sudah tertutup.
   TIDAK menyebabkan kedipan apa pun: dari baris ini sampai
   openBdAllPage() dipanggil ulang di akhir init() (lihat paling
   bawah file ini) semuanya berjalan SINKRON dalam satu eksekusi
   script yang sama -- browser tidak pernah sempat menggambar ulang
   di tengah-tengahnya, jadi transisi "class paksa dilepas -> class
   .open asli dipasang lagi" ini sama sekali tidak terlihat mata. */
try {
  document.documentElement.classList.remove('zp-tagihan-restore');
  document.documentElement.classList.remove('zp-app-loading');
  // Lepas juga class pemulihan tab Laporan/Dompet/Pengaturan (lihat
  // <style>/<script> paling atas <head> index.html) -- sama-sama
  // sinkron & tanpa kedip seperti 2 class di atas. Setelah ini,
  // kendali visual halaman aktif sepenuhnya balik ke mekanisme ASLI
  // (showPage()/restoreActivePage() di akhir <body>), yang sudah
  // dibuat "sadar" akan pemulihan ini supaya tidak memutar ulang
  // animasi masuk (lihat zpApplyActiveNoAnim di sana).
  document.documentElement.classList.remove('zp-page-restore-laporan');
  document.documentElement.classList.remove('zp-page-restore-dompet');
  document.documentElement.classList.remove('zp-page-restore-saya');
} catch (e) { /* abaikan */ }

/* ==========================================================
   GERBANG LOGIN UNTUK FITUR CLOUD
   Sekarang app BISA dipakai sepenuhnya tanpa login (data
   tersimpan lokal di perangkat ini saja, lihat cloud-sync.js
   yang tidak lagi memaksa overlay login tampil di awal & selalu
   memuat file ini walau belum ada sesi). Popup login/daftar
   HANYA dipanggil di sini, tepat pada aksi yang benar-benar
   butuh akun cloud (sinkron antar perangkat & Tanya AI, juga
   pengaturan akun spt Ubah PIN/Password & Login Biometrik).
   Kembalikan true kalau sudah login (boleh lanjut), atau false
   sambil menampilkan notifikasi toast singkat + membuka popup
   login/daftar (dengan pesan alasan yang sama di dalam kartunya)
   kalau belum -- pemanggil WAJIB berhenti (return) saat hasilnya
   false, jangan lanjut menjalankan aksi yang butuh akun. */
function requireCloudLogin(reason) {
  if (typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn()) return true;
  const msg = reason || 'Fitur ini butuh akun. Silakan masuk/daftar dulu.';
  // Notifikasi toast singkat di pojok layar (spt notifikasi lain di
  // app ini, lihat showToast() di bawah) supaya user langsung sadar
  // KENAPA popup login tiba-tiba muncul, tanpa harus baca pesan kecil
  // di dalam kartu popup dulu.
  if (typeof showToast === 'function') showToast(msg, 'err');
  if (typeof window.cloudRequireLogin === 'function') window.cloudRequireLogin(msg);
  return false;
}

/* PENTING (fix "patah-patah" saat refresh di HP): ExcelJS, jsPDF, &
   jspdf-autotable dulu dimuat lewat <script src> statis di index.html
   dan dieksekusi BLOCKING berurutan setiap kali halaman dibuka —
   padahal ketiganya cuma dipakai kalau tombol ekspor Excel/PDF benar-
   benar diklik. Total ukurannya lumayan besar, jadi setiap refresh
   HP terpaksa parse & eksekusi semuanya duluan sebelum halaman
   sungguhan interaktif/mulus — itulah salah satu penyebab "patah-
   patah" yang terasa tepat setelah refresh, terutama di HP/koneksi
   yang tidak terlalu kencang.
   Sekarang ketiganya dimuat ON-DEMAND (baru di-fetch & dieksekusi
   saat tombol ekspor diklik) lewat loadScriptOnce() + ensureExportLibsLoaded()
   di bawah, dipanggil di awal tiap fungsi export sebelum memakai
   ExcelJS/jsPDF. Kalau ekspor tidak pernah dipakai dalam sesi itu,
   ketiga pustaka ini tidak pernah membebani proses refresh sama
   sekali. */
const EXPORT_LIB_URLS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js'
];
const _loadedScriptPromises = {};
function loadScriptOnce(src) {
  if (_loadedScriptPromises[src]) return _loadedScriptPromises[src];
  _loadedScriptPromises[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { delete _loadedScriptPromises[src]; reject(new Error('Gagal memuat ' + src)); };
    document.body.appendChild(s);
  });
  return _loadedScriptPromises[src];
}
let _exportLibsLoadedPromise = null;
function ensureExportLibsLoaded() {
  if (!_exportLibsLoadedPromise) {
    // jspdf-autotable HARUS dimuat setelah jspdf selesai (dia menempel
    // ke objek window.jspdf yang sudah ada), jadi dua yang pertama
    // dimuat berurutan, baru sisanya bisa paralel. ExcelJS independen.
    _exportLibsLoadedPromise = Promise.all([
      loadScriptOnce(EXPORT_LIB_URLS[0]),
      loadScriptOnce(EXPORT_LIB_URLS[1]).then(() => loadScriptOnce(EXPORT_LIB_URLS[2]))
    ]);
  }
  return _exportLibsLoadedPromise;
}

const STORAGE_KEY = 'alirin_transactions_v1';

const CATEGORIES = {
  masuk: ['Gaji', 'Bonus', 'Penjualan', 'Investasi', 'Hadiah', 'Lainnya'],
  keluar: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya']
};

/* Ringkasan kartu di beranda — masing-masing punya "halaman" sendiri
   yang dibuka saat kartu diklik, menampilkan data khusus sesuai namanya. */
const SUMMARY_PAGES = {
  todayIn: { label: 'Pemasukan Hari Ini', sub: 'Transaksi masuk hari ini', type: 'masuk', range: 'today', totalLabel: 'Total Pemasukan Hari Ini', periodLabel: 'Hari Ini', periodClass: 'daily' },
  todayOut: { label: 'Pengeluaran Hari Ini', sub: 'Transaksi keluar hari ini', type: 'keluar', range: 'today', totalLabel: 'Total Pengeluaran Hari Ini', periodLabel: 'Hari Ini', periodClass: 'daily' },
  monthIn: { label: 'Pemasukan Bulan Ini', sub: 'Transaksi masuk bulan ini', type: 'masuk', range: 'month', totalLabel: 'Total Pemasukan Bulan Ini', periodLabel: 'Bulan Ini', periodClass: 'monthly' },
  monthOut: { label: 'Pengeluaran Bulan Ini', sub: 'Transaksi keluar bulan ini', type: 'keluar', range: 'month', totalLabel: 'Total Pengeluaran Bulan Ini', periodLabel: 'Bulan Ini', periodClass: 'monthly' },
};

/* Target/goal per halaman ringkasan — disimpan terpisah di localStorage */
const STORAGE_KEY_TARGETS = 'alirin_page_targets_v1';
function loadPageTargets() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_TARGETS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat target', e); }
  return {};
}
function persistPageTargets(data = pageTargets) {
  try { cloudStorage.setItem(STORAGE_KEY_TARGETS, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan target.', 'err'); }
}
let pageTargets = loadPageTargets();

/* Timer countdown kartu gabungan "Uang Masuk & Keluar" — menghitung
   mundur ke tengah malam (pergantian hari), dipakai di header kartu
   sebagai kotak JAM/MNT/DTK gaya "Flash Deals". */
let flowResetTimerInterval = null;
let flowResetTimerVisHandler = null;
function startFlowResetTimer() {
  clearInterval(flowResetTimerInterval);
  if (flowResetTimerVisHandler) {
    document.removeEventListener('visibilitychange', flowResetTimerVisHandler);
    flowResetTimerVisHandler = null;
  }
  const elH = document.getElementById('flowTimerH');
  const elM = document.getElementById('flowTimerM');
  const elS = document.getElementById('flowTimerS');
  if (!elH || !elM || !elS) return;
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    let diff = Math.max(0, Math.floor((midnight - now) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    elH.textContent = pad(h);
    elM.textContent = pad(m);
    elS.textContent = pad(s);
  }
  tick();
  flowResetTimerInterval = setInterval(tick, 1000);
  // FIX BUG "LOMPAT" YANG SAMA SEPERTI KURS: hentikan interval detik
  // ini saat halaman disembunyikan (HP dikunci/pindah app), lalu
  // sinkronkan ulang begitu terlihat lagi, supaya angka countdown-nya
  // tidak sempat "meloncat" pas kembali ke app.
  flowResetTimerVisHandler = () => {
    if (document.hidden) {
      clearInterval(flowResetTimerInterval);
    } else {
      tick();
      clearInterval(flowResetTimerInterval);
      flowResetTimerInterval = setInterval(tick, 1000);
    }
  };
  document.addEventListener('visibilitychange', flowResetTimerVisHandler);
}

/* ==========================================================
   PENDAPATAN PER SUMBER — fitur khusus & berdiri sendiri.
   Data ini TIDAK pernah digabung/dijumlahkan ke Saldo Total,
   Pemasukan Bulan Ini, atau grafik/riwayat transaksi utama —
   disimpan terpisah di localStorage (alirin_income_sources_v1).
========================================================== */
const STORAGE_KEY_INCOME_SOURCES = 'alirin_income_sources_v1';
/* Preferensi tampilan kartu "Sumber Pendapatan" di beranda — Gelembung
   (visual) atau Daftar (rinci dengan batang persentase). Disimpan di
   localStorage supaya pilihan pengguna tetap diingat tiap kartu
   dirender ulang / dibuka lagi nanti. */
const STORAGE_KEY_INCOME_SOURCE_VIEW = 'alirin_income_source_view_v1';
function loadIncomeSourceView() {
  try {
    const v = cloudStorage.getItem(STORAGE_KEY_INCOME_SOURCE_VIEW);
    return v === 'list' ? 'list' : 'bubble';
  } catch (e) { return 'bubble'; }
}
function persistIncomeSourceView(v) {
  try { cloudStorage.setItem(STORAGE_KEY_INCOME_SOURCE_VIEW, v); } catch (e) { /* abaikan */ }
}
let incomeSourceViewMode = loadIncomeSourceView();
const INCOME_SOURCES = ['Adsense', 'Meta', 'Affiliate', 'Makelar', 'Kelas', 'Store', 'Sosial Media', 'Jasa & Rekber'];
const INCOME_SOURCE_COLORS = {
  Adsense: '#2563EB', Meta: '#0082FB', Affiliate: '#C4287C',



  Makelar: '#D97706', Kelas: '#0891B2', Store: '#DB2777', 'Sosial Media': '#7C3AED', 'Jasa & Rekber': '#0D9488'
};
/* Ikon kecil generik dipakai berulang di daftar detail platform
   (mis. YouTube & Web untuk Adsense, Shopee/Tokopedia untuk Affiliate,
   dst). Digambar sendiri (bukan aset logo pihak ketiga) tapi bentuknya
   dibuat familiar supaya mudah dikenali sekilas. */
const PLATFORM_ICON_LIB = {
  youtube: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s0-4 .5-5.5A3 3 0 0 1 4.6 4.4C8 4 12 4 12 4s4 0 7.4.4a3 3 0 0 1 2.1 2.1C22 8 22 12 22 12s0 4-.5 5.5a3 3 0 0 1-2.1 2.1C16 20 12 20 12 20s-4 0-7.4-.4a3 3 0 0 1-2.1-2.1C2 16 2 12 2 12Z"/><path d="m10 9 5 3-5 3Z"/></svg>',
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.5 14.5 0 0 1 0 18"/><path d="M12 3a14.5 14.5 0 0 0 0 18"/></svg>',
  facebook: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 22v-9h3l.5-3.5H14V7.2c0-1 .3-1.7 1.8-1.7H18V2.3C17.6 2.2 16.5 2 15.2 2 12.5 2 10.6 3.7 10.6 6.7v2.8H7.5V13h3.1v9Z"/></svg>',
  instagram: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>',
  tiktok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18a4 4 0 1 0 4-4V4h3.2a4.2 4.2 0 0 0 4 4"/></svg>',
  threads: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 12v1.6a2.6 2.6 0 0 0 5 0V12a9 9 0 1 0-5.5 8.3"/></svg>',
  bag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  car: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h2v-3.4a1 1 0 0 0-.8-1L19 11l-2.5-3.3a1 1 0 0 0-.8-.4H5.6a2 2 0 0 0-1.8 1.1l-.9 1.8A6 6 0 0 0 2 13v3h2"/><circle cx="6.5" cy="16.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/></svg>',
  home: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>',
  wrench: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.5 7.5l-6.7 6.7a2.1 2.1 0 0 1-3-3l6.7-6.7a6 6 0 0 1 7.5-7.5Z"/></svg>',
  video: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  film: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M7 4v16M17 4v16M2.5 9h4.5M17 9h4.5M2.5 15h4.5M17 15h4.5"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  sparkle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
  apps: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9.5 4.6-1.1 8-4.5 8-9.5V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
};
/* Sub-platform per sumber pendapatan — dipakai untuk menampilkan
   rincian saat kartu/label sumber diklik (mis. Adsense -> YouTube & Web).
   Sumber manual (custom) tidak punya daftar tetap di sini. */
const INCOME_SOURCE_PLATFORMS = {
  Adsense: [
    { name: 'YouTube', icon: PLATFORM_ICON_LIB.youtube },
    { name: 'Website / Blog', icon: PLATFORM_ICON_LIB.globe },
    { name: 'Apps (AdMob)', icon: PLATFORM_ICON_LIB.apps },
  ],
  Meta: [
    { name: 'Facebook Ads', icon: PLATFORM_ICON_LIB.facebook },
    { name: 'Instagram Ads', icon: PLATFORM_ICON_LIB.instagram },
    { name: 'Threads', icon: PLATFORM_ICON_LIB.threads },
  ],
  Affiliate: [
    { name: 'Shopee', icon: PLATFORM_ICON_LIB.bag },
    { name: 'Tokopedia', icon: PLATFORM_ICON_LIB.bag },
    { name: 'TikTok Shop', icon: PLATFORM_ICON_LIB.tiktok },
    { name: 'Lazada', icon: PLATFORM_ICON_LIB.bag },
    { name: 'Amazon', icon: PLATFORM_ICON_LIB.bag },
  ],
  Makelar: [
    { name: 'Properti', icon: PLATFORM_ICON_LIB.home },
    { name: 'Kendaraan', icon: PLATFORM_ICON_LIB.car },
    { name: 'Jasa Lainnya', icon: PLATFORM_ICON_LIB.wrench },
  ],
  Kelas: [
    { name: 'Kelas Live/Zoom', icon: PLATFORM_ICON_LIB.video },
    { name: 'Kelas Rekaman', icon: PLATFORM_ICON_LIB.film },
    { name: 'Mentoring Privat', icon: PLATFORM_ICON_LIB.users },
  ],
  Store: [
    { name: 'Shopee', icon: PLATFORM_ICON_LIB.bag },
    { name: 'Tokopedia', icon: PLATFORM_ICON_LIB.bag },
    { name: 'TikTok Shop', icon: PLATFORM_ICON_LIB.tiktok },
    { name: 'Website Sendiri', icon: PLATFORM_ICON_LIB.globe },
  ],
  'Sosial Media': [
    { name: 'TikTok', icon: PLATFORM_ICON_LIB.tiktok },
    { name: 'Instagram', icon: PLATFORM_ICON_LIB.instagram },
    { name: 'YouTube Shorts', icon: PLATFORM_ICON_LIB.youtube },
    { name: 'Facebook', icon: PLATFORM_ICON_LIB.facebook },
  ],
  'Jasa & Rekber': [
    { name: 'Rekber (Rekening Bersama)', icon: PLATFORM_ICON_LIB.shield },
    { name: 'Jasa Titip', icon: PLATFORM_ICON_LIB.bag },
    { name: 'Jasa Lainnya', icon: PLATFORM_ICON_LIB.wrench },
  ],
};
/* Ikon SVG per sumber pendapatan — ditampilkan di kartu "Pendapatan
   per Sumber". Digambar sendiri dengan gaya yang familiar (bukan aset
   logo resmi pihak ketiga) supaya tiap sumber gampang dikenali sekilas.
   Tambahkan entri baru di sini kalau menambah nama sumber baru di
   INCOME_SOURCES (kalau tidak ada yang cocok, dipakai ikon koin bawaan). */
const INCOME_SOURCE_ICONS = {
  Adsense: '<svg width="19" height="17" viewBox="0 0 113 100" fill="none"><line x1="55.3" y1="18.5" x2="18.5" y2="81.5" stroke="#FBBB03" stroke-width="37" stroke-linecap="round"/><line x1="94.6" y1="49.2" x2="76.3" y2="80.7" stroke="#4184F3" stroke-width="36.6" stroke-linecap="round"/><circle cx="18.5" cy="81.5" r="18.5" fill="#34A852"/></svg>',
  Meta: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAQPElEQVR42u2ceZBV9ZXHP+d3732vXze70yzCiAs4gyEBo2NQ3A3giGjFLVJTM5ZJZsoliUk5xnE0YlPlEidGJ1pOXEaZlHHBaIIQxxAdExRN4oRNDKDjqMi+CDS9vX739zvzx+/et9AN73UDqUG4Vb1Uv37nnd/3d873bL97hd1dM14NaTor9r/vHEy2zxScm4S68cAwVOs5kC6RNpB1GFmC05cxwUvcLJu7rHXXt3X9kwozEJrEcXP7UeQy1yF6GUEwDACXfKnjwALIgMF/KeDsOkSeId/5Q5pyHzJDDU0oiO4eoBlqaBK/8pmd1xMGt5Ix/cgDtuAS0eK/RA4shFQT/f0agsiQBfJuB1abuDW8twsGFQClL1y/voGBjT+mLriIdgdqY5QAOdAAqYqXIlgkCMkZ6LA/pbDxCpqGt5WDJMk/C7chtGzIMbDxReqC02ktFIDwUwdMd0BBTJ8oor3wawqbp8LhHdyGIqIGVHgWj1j/xp8UwRGJPvXgePIWRCJaCgXqojMJhjxBkziexYAgzNaAy8RyW+cN9I3upiUB52C8VAv0iSKaC9fTlPkBszWQxL1GEtkVQIR15qCwnN25WxA4cJ1oYQy35FYbRJSg80bqgjqc04MWnNTdnFXqwhwa3YCICrfrEGy8AmMG4CwHXvjeD+mACcC5bdhwjMEWLiQTDsRZPQSONyOcVTLhIMROM6iZUpZAHboSMwIUceca0HFYBMUcwqUIj8EiIOMMosNwjoOanLslawXRYSFKzlefh65KK3Kg5PZrKVEuWfcxw0l5Jan7j0DDfS0wSOr82IHasvrfQJCwnHO9W5DgZTj1MrD7TvZ+B8iIV8zmk35RFvrnIBNAp4UdHWDbkgVlIAjA9sCzAwPWQtzmAcnmoF8WrML2DrDtyWZkey57vwMUGLAdXvFzRguXHCdMGCEM7ydkA8jHsKFVWbReeWGVMu9dpbMNTC6Jp7pnqzHGg1vfAF8eZ7hojDB2sDAw54HY3KYsXg8/X+mYs0rpqFF2bVY7s6B7wzECuDaYOEq4/WzDGUdWp7Q/blZuX+B4colCCCZMXKY7DlPQDrh0vJc/+rA9y1+xRZn5a8fTSxQyHlynvWQ5dbbXAIn45qTrhFvONsw8y3iw1H8ZqWxXavKaiOcpgNnvKFfNtWxrgyBb6RYinsOMwv1TDdf8lSeZ2JXkpRYmu1gzwI+XetntcbIB+icESMQrbgvw6EUBXx3v0waltPg0chV7tGV/T0EMDSzfrFz4pOV/t0BQ50ES8QScEXh2esC00ULsEp7TEgjll3XeWrRM9msfK9OesOzI9wakvQAoFIg74OGLDX9/vKHgvEJSBkBK3OWg7ApgwUFkYHUzfPE/LO9tUsK6JAWxMOdvAs4fLV5+2gkHmvPw1lplSys09oHjhwkD60qfYwQKFqIAXv9YmTTLUlBwpiec1EuAAgO2FW44x3D3OaaoSHEntQTCljZo7lAG5IRBudICpMz94gTcD3fAqY/GrN8JzsKjF3vLTMFJLfD7bzjue9OxdnsSLQ0M7QdXft5w8+mGhqgrSE8sV/72aUtYB/H+BCiNVhOOEhZeGeASc5cyMw8MvLlGuXOBY+HHSksM/TJw4lDh6xMMU0dL0f3SRacgLd6onPSA5ZpTDf86xZQsB+iwMP2nljlLFHJggoSn1ANKB4wfKTx3ecDRA8pASqz0K3Mdj7/pCBpqTQF6CFBKhqHCH64OGNsoFdaSLvL+txzfmudwsc9JPHMDBf9///AFwwNTDZGpBCmV9foa5fjBQi4qK6sVzn/K8svlStQ3SUK1khNDA4U2OKoRFn41ZGifRH4iozkPxz0Ys7HZJzfV+cgDVHMFbwy4drh6gmFsoyfNFBybgPPgHxzf/JmDEML6kiuJgSAHYQ4eXui44ClL3lbmKYF4pU8dITRk/O67BLRr/tPxy7c9OAXblUdUE3eqhw82weXP2VKASOQMqIOZZxlcZ8+6XqZW63Ex9O8PN000qJYI2CZu9ts1yjfmOoKcf0PsSk0mTUCMHUT94KXlyvTnLEb8+7UsG0/J3CaRaNYy5ZGFrgjOnq6ChagBFqxU7vudI5DS5jmFK8YZjh0huM7KALLXAAUGNA9XHm8Y0uCVT0sLwZcSX5vnfLJXJTErWIj6ws8WKTe84rzybpeSJZG/fJNy3S8sJls7ucYOTB3M/I1jY2tl6I8MXHeSoIXaragmgKyDKAdXnSBoWfi2SW7y6GLHO6uVMFsbARYshH3g+686nl+pnvy1MiUQYOEapXkHmKj28Kzqc54dO+D+3ztkl8g6faxh0CCwcW0gVQUoEG89px0l/MVhUtxdTSyrPYa733RI1LNEzOEXfsUcy6bW5HOS96cu8bXxhlPHCHFb98nhbmUrSAb+fYmjpdPLI3G3gXUw7VgDnZU5Wa8BkiQKffk4KZYLqfUIMPdd5aMNYDI9A0gEXAFOHiH0y5byo11d+0fnGTJZr4P0ACATwYat8NL7WtQ35cNL/tJHj1qs0lQj59hCpgEmHe1rrdS90p+zlroez0LSOqtPPTxyfkBd2H37JHbwmUbhxtMNtt3zSU96R6Lw3ApX6iUlUXXiEcLA/r59Uk13U9V6YvjMYOHIART5J3WzDS2w4CNFM91X43tyW9cBd042jOxPRZ1VboUpN9000TDqcHoUfZyCRvDaaqU9Tlw0iZID6+CEYQKF6vJMtSYYMUwYLp7sXCm0AyxYrbTu9A2qWr0rMBC3w8RjhWtPNMUwXCyCpbJSRyEXwr1TAtTWHn2cggSwdju8s1krimSAk4ZLTW5rarHVEw/vXsyCj3zSIj0wexxksvDwVFOs8lPA572nPLtCi5GnaEUOzh8tTPusYHtA2IHxGfziDdqlLz5+iICpvrF7/CirPi0f82eVTfiU/RdtUAhqD8GB8a3Rm880HNdYamGku/uPLzu+/qKlvZCUCFrGWcC9kwNy9Z6/aqY9heWbdvEKYPQgIKpODWZPu60OslkY0U9Kf0sUbi3AB9s9QLXQjxGI8zB2pHDTKaaYgacly6ylyqp1yqZtcOcbrphlp++1Do4ZCDeeZnDttVmRJit8f5t2mbIM7SM0ZP0apVcWlIT3gTkYVFe2k4nSG1uULUkDvRYCSt3poamm1B5JyL45D9991SKB7yz+y2uO//lEixOMcsL+zimGUcMFWwNhq3r91reUgE7f0r/O12dUOZGwRwtCoX+2VFmXtzo3t0Fc8IVoNXzCpOl+zcmGU0aUCt20ZPneG451myGIvEYd7fDtX7lKNysj7Af+2lTd+fKFbO/wllr+/3Uh9M1IVeVNNRutjyrrrlRgc963RU0NrmU74YjBcMdZplihpz8/2A73veEwSbvVOgjqYd7byi/e0yJJFyOggynHCNM/X52wNQGovaDk464GkIvoPUApGGGwi+kkV97WXuyphX87P6BfttQDSn/e9Kqlrc2HZC1zDQng2/MdHXHSmtml4r93csBhA0Dj6q4Wu8paT+naEu4xQCn6xeJTuroNNbhW3AZfmWA4b1TiWqbUIln4sfLMEiXIVRa5TiHIwHtrlXt+W2pblFf7QxrgnnMDXL6GZG+XU93l7d69q8UEWvKl6lrLpB+WY48RzBiIO+HoocJ9k0qupWUgfGu+260Am7Qt7viN44NtdCVsB1d8Tjjvc7svZlMv6JMR6sOuVtXSSVUiM9VC5JZ29XyTRp3k12MGCv13k5OIgEmI+ImLDH2zpfTAJn9/aJHjv99XP+rR7j9fAmhrg2/Ot8WZW0U9p/Dw1IBB/bp3NQHEwZEDKgEG2JGHre1aNVk0ewqRYmBbG6zeoSWlk+gzKAenHSHQWcZTiTkH4l3rh9MMJ5dFrdSK1u2Ef37ZYbJ77gAUCXuZMvuP6qOhq+Si4X3h8S8FuEJyK0YZSEHggZt8tFSMngDWNCvb25IorL10scD4se9b67Wi1ZGCdctpBkIo5Et+7mKIW+DWcw3XnGCKzfzykc+1L1m2N4OE1bNwTVoX33jRsqWt1GMuj2oXHCt8b6ohbvWfn9Z0nS3QeBhcOd4UZ3IpSIvWq+8Jmb3goNTN5r6rFdPRtLn1heHC7MsDRvb3iqmFowcIj11uaDqjshBNgZq1TPn5EiWsr6376BQkgk3b4KoXbdFyKnIsB9852fDQpYbhfb3VOAtjhwkvTA9orC9FzXQ6k/aJ9urwQkpydSGsvDbkz/tR0XJNZ0+tBVixWQkExjQKdWHptfKRzqqtyok/srTbnk45k4jYCg9ebLj6BFOcd1U0yQR2dsKqzUoYwNghQliWUqTBZks7jLo/prljT4luDWMfTfy4vQXuWOiKJFuRBCo0RL7iP36YB8e6riC2dMIlsx0tedCg58dSrPrR0XXzHAvXKJGpDNOpLn0zcOJwYfxQD47bZfYm4md3zTsgDPeymk9dI8jBI79zvPKhEiUHoip61smHF+fvprKp7xQufdayfI0SZHvWXKs4CCFQULjoScvKrZ60C1V0STcqtbhVW5UfvF7K3PfJVMOJV+7y2ZbFG5VM4JWIXeVBhfQ8T/paYLz7felpy0vv1M471XrNm1pg0izL4g1+w1wNukTGu9bFzzha89TUC6oZIFUfcba0wtmPW37ytueb0JQqZCmr2NPX3lqnnP6YZe5yJWyoLXOtCpIDk4U1zXDGY5ZHF/nWSDVdfr9WOeMxyzvrtWp6UTNJd5eyO+vbsGccI/zdOGHiEcLwvgn3KHzSDks3KE8tdzy5TInjroej9sVV1KXgD1NcOV44faQ/9pdLgsTWdli2UXl6ufLEUkcce3Dd/ji8UJ7BCuCSw5pBDgY3QEPkj6p80q7sbPWVPnV0Ccv78pI09+rwupgyXazzmXLvdfEAhb0iS7xVpMXs+h1ljRvjZ2QifqfcfrwDRDVJJLOlMmbDPtal16dcbTKFk0SKlCnt/sS3xrj9qEtYeUqnF7uYfPv/cKvQ/tDFoHQgh2706X5qSodBZGNyRuTQ/WIlclOMAZENBvRtAhQ5dMtPWQBzBCjocoOa+Qj+7udDV2pBPtdU5hs6O+eQj3cShLLvb1o6MNEhCIXOuJmgMMdwe/3HwPNkTXK+/aC/LHVGUH2OWxrW+kdTWHsXnTZGzEFuRaqIEfK2gHN3gYphNoamupUU7F3UBwFKfPDiQ0x9EBDrHTTVvctsP2USZidV/crCy+SiM2k7CJ/foVqgPopoL/wXb0eTuRS4DFd6PI4AMxhIxr5CJhjvQSL89D9sQNVbThSRt4sJgnP4J7YnyaKa9JfksVyfsDP4Inn7Kn2iKBkXxp9OXlL1axOhTxSRt6/Q0jqJm2QbtyGIaGXDrEkcM9Rwl2zlV69Npi2+k1AsuShEQkGdS25U0gMcFIc6h4RCLgoJTIEOdztLn5/CXf237v4RXeVJkhhf8s3MjyMIr0f1QqKgH+mdxs5y4D3JQvwtQmGy6oLdgZE55ON7aMouA5VkMrqHh7yVUPLEfZn4vOgOHQVcgLOTcPpZYDBwoJF4AZGNCMuRYD6OF/iuvA+QPGTKdbfr/wegUgsEEUuNbwAAAABJRU5ErkJggg==" width="15" height="15" alt="Meta" style="border-radius:50%;object-fit:cover;display:block;">',
  Affiliate: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAfzklEQVR42s2ceZwcVbn3v8+pqt5nejJJJpnsGwLZiIRVAkkEchFEBZmggCBXbuBFEJQrIKiTUURUDAICrggooBm9IqgsiiHKTtwICSELWUjIPpmlp7eqc573j+4ZkphAIONSn09PZjrdVad+51l+z1bCP+FQkLnTm725C3FCi+t5f37TVdnElsIkL4qmqHOTfXiXbxmK2qyHqzcu8gQFzyjodhHtMujr1rDC9+RFE0v8rTAos3jm/fO27XytJ6ZP92YsXGgFtK/vRfoamNam+WZ262zb8969J3zqgJo8x/uOk4x1U40wLCGCQXHqEOtwWJxGiDg8FFHwRTBYAlE8BEEpE+IMm1Tkb/jyaNiQ+v0xD9z5Ug8s2tTk0drq+hKovgJI5u8ETPP0izMTwtgHk07OE+dm1HqJAOcIXZmQCFFnRS2IilHE4BCcGHUY0eqiVEUtglWjqKAYrBcYiIshECGnVjVmnnJx8+O1wwb84vQf37a9r4Hab4DmNzV5s1tbLcANJ8zJjinUXBCz5pNpgtFGI4o2RHGRQUVwRkRF1CFYBDCqGBzg2A0gjFoEh6BUAHIoTkWdM4r6qn7SFwIRuj23seT7399RX3f7CQ/9cPPua/t3ANQrNXOmTg3emzzhokTIFSkvGBlGIZGLbBUEYwQRdRgUxLE/AAkOtPK3pygSOVElLs5LeT45dEuYjt26euzYmz905ze65oPXBO9Ymt4RQM00my/R4hT4wXs+O7NOE9+okWBqyRYIXTkyYAyYHlBE4J8EEIitnBerxqkNRP2M59MVyPKOuszVRz7y01/ujzTJ21ep+d7s1tl26tSpwWeCWdenJP6/gROKrmhFIiMgpnoD/0qADLYqI05F1SbF+V7MpzuR+NGaQ4ZffvKtt3YumD7dn7lwYfRPA2jB9GZ/5sKW6NtHfXrcAFNzdy2p9+SinEMdnmCEqHpj/z6Aej4P1hnntF8Q93YEsnTb0AHnTfvFjxe9XZDk7YJzxzFXntjfZe5L4A/Ih4XIGPw3Fv+fA5BgEVVAohrULwVeoauh4ROH/Pbe+xcw3Z/JvoFk3h44n5vd32YfFpUBOVu0IuLzH36I4HertaZUTDZs23zfS+89/ZKZLIwWMN3vE4B6wLl92rX/rz/ZnzmnEqp1RsTbdSGCeB4i0rsy8QziyX8ASOKFIlooFG1jV8etr5x2VstM+WOk098apDcFqLkKzq3Trm3qr3W3h1HkLFYE2eV74hls2VLakaOcLxE5S1QqU27vJsyVqn7+3wuUAVFjTK5QiBo2bPzi30740Kdk4cK3BEneylt96+gvHD+A9KPiHFYjE4AgWtF1pxhPCDu7SQ3LMurUdzP4mININWSJiiV2vLiG9b95gfZnlxHEYxgP4F9rg0QEoxajjsoeOfVtaBOppL9paOM5k395/71vZrj3CFBzc7NpaWlx3zj22tGDoroXfNX6UMtqUOOpIlWAPIRyLs+IU6dwxLWnEcskKHbmyb/ehp9JUDtsAACrf/UML19/Pya0mMCAs30LkPTEt/SeFyIksv8AkOAAqzHnnCQT0fZR7zp20vzvv7A3nuTvMeBcOkHmTJ0T1EWZ++Mm1r8QdtmKzdGd1EootxcY9sEpTLv+o+Q27eDZz/+E7c+txOWLGA9SI/pz0EUnMfqDRxPvl+avl92BUdO39sXzoFAgKuRRKptnnMP44KeSFcpqo92lQkIjpIuFeO1rq3666obvHjrm6gu7FGR3xu3tfsEJVdW6YORpX6/3s025MB95UgGysosgBlwpIjG4hpm3nU9hWwePn3cb7X9+FT/m4QU+xjNE2zpY/9DzePUpRp96NIWObnY89zJ+OgbOIVURrvCWKjWQN8S6R3J2/pxU1y8ieEDU2Yk3spHs6Scx4LwzqDvtfSSmTkaNR2nderxSCRMLKmotu5zDhKpRfxf1z21YN7r/ulWtc884w2tZulT3qmK9dmf6l6f1j2r+ZKMoUqzvYas34PBUMb5Q2tHJ5E+dwJSLZrHw8rvY+MjfSQ5M48rlXh5kDJgoIhLLex9oxgQ+C0/9PJ51iLGIvkMVQxHnoBTS/8LZDLvkHDzPq/xPuYwXiwHQ9bclbPrSjehLSwnSaeg9n32Drzkb1SYT/vpRIz4yofW+n2lTkyc7qdrO8i5N45fod6fOCVLl2O1GDQ5r9miknCKBx9BpB1Foz7HpuZXEsilcOdxVXa1DYj6us8iGR14g1VBHenQjrlTeL68mIkTFIoPmXsLIy86j++WVLP/kF3h5RhOvzGhi2akfZ+N3f0J6ygRG3v1tzKQJuO58Rd12NynGmHKh6LLrN8xb9d3vZmltVd1JcMxO0mOkpcXZxLg5NX7tpKItRUbE7Mmqq1O8hE+qoZb8hjbIh+z1fp1ijEduzWZQJTUgi1oL7xQgzxB25qg7bRZDZ7+PLQ8/wcqPXErpsT9CWyfkCuiqNWz/yk2s+u/L8BIxGr/xBVwqgVi7Jy9liuDqi8Uh5pcPXSPgaGoyuwCkIE2tTa55enPGc+baki2rCEb3nDUEAbVKVIzwa5LwZmRQQFG8dBJECIvlPZjCt3FEFjIphl98NqWt21k/9xYCEUy/LPg++B4kkwSNgyj/7o9s+tb3SI8ZTerk47FduYpR3wOR7IxCF9+x45Lll145jNZWp83NphegudObPUF0QJicU2PSjWVXdiB7dTfGM0SFMtuWvEbtsP4kh9bjihHimT1RfZw6Bk2biLOO/NrNeDEf9B0gJAZXLJM8YBTJYYPY9sDv0a07kGQKoqhyTlVwDg1D/H5Zuh58lKhcJn3iDJyRvV1XInD9yuVUsOzF/xVQli6VHoCkZWGLbX7/nFRg/c+UbajmLQyEquJ5Hqsf/AtiDOPnzKRYKKKRw/heNcQwGN+nsKWD/sdNoHHaBDb84a8U1m9D4jG0Z6G9IYmHGIMYqf5beQ9j3lBHAY0igqENoErh5VWIZ1B1exZ1z0fbOyi9vpH4yOFIPA7O7TUc6QxDjXXnLlg6b16jtLZabW42pnl6swfogPYxH8h4maFlDd1bhSDqlCATZ/NTK3j1sb8z7tTDOeTKDxDZiOL2Lkod3ZTacxTbOug3YwKHXf/f5De3s+LbD+LHArTKcMUzEFnCjm7KbR2UO7uJckXCrm7KHTnCtk5sVzdY1xvnqYDYCmNR33uzAkLFXgoYz0dthLo3lVqxIra+VEynFi78GABPPGH8uTPmupaFLXjqz1Hdd8ugCkEsxqKW/yPIxJn4ieMZMWsya3+ziNzaLcQzSRqOOZBhMw4BYOUv/kTX4tWkG+tRG+GKIa5YJja4jn7HTqTu3eNIjx5Coi4DzlFo66S4Yh2df32ZwouvUN7eRjydxI/HKa7fCEBm6kQ6f/4IYgxqd+UsYgQtlfAbG4gPGUzHI49DqQSpONg9JxZVjCmHIf6OzvMXqM5DxArAvOObx6RLdcu8UHzFIkbF9MQ1Wo1zduJBPaGGoSLyKo5xZx3NQeccR3pgdpeLvvrA02RGDqLh3WN5/srvseWBZ/B8ITFmICPOnsXwD04jlooDYMsRUVceDHi1GfyqTStua2fjzx9l208fQTduIrKW8T+/hdTY4bz84Ysxa9fj1WXQqMpzBAyOcMsmBn75GgadN5u1n/ws9tE/YGoziAt3y1spIhXialzoEqmkyR197HuG3XzjMz5ArFTzX2mTCfLaFVVyPPsmSOq0YnOcsPJ7T7C29WkyYweS7l+LLRTJr9lMfvVGUiMaOO7+qzj0uvN58rWt9Js0iolXfRTPM2z/20o2/fpJOv+6nHBzG5QKlYWm4iSG1FN32HgaPjiT0RedydCPnMzKL9+Bl0qSOmAEsXSK0Tdew+pLm3Hr1uPFYyCKRiGRDan977MZdN5s2p9dROkPTxKrqQFn37Syp0Zculw2nauWnwo8IwDfnvbNB7PUnpov56wR9cQ49kWCxPX8rngeEJawpXI1SAQvMMRTAWFnnuxhozjy5k9CzCeejNOx4jWWfv2ndD29BBOWMTGD7xuMV1UVa6FcQsMSkorT7/ijGPO5T5AY2A8FOl5aTm7RSwz7+OmUu3Js/mEr+Rf+ghRKeMMG0e/091E/4z3kVrzKhgs+TbB1GxIPqNba9iJBCuJc1lrTPnDgoiF/ePwIufmkm2tjHfpyTGJDoqikRlTeCUAGh0hUFW8q6U5n8XCICGGhm6Pu+SwNU8bxausClt9wHxRKxDMpjCiqUTXU6LElO4UezmLbuzCDs4y97jIGzDiC9T/7Les/9WX6n3UKQy8/n9TIobvyU2Dbz39L20134LW14SXiiEa9qZC9ASTiNBZFEmZq8sWzPzrR10I42TPxxshGiMj+FSO1QgEqLrx6Yc9Q7swxce5ZNEwZx4p7fseyr/yERG0cqU1DZFFxFaMaWVy5wspNzEc8KqwbxetfC515Vl56HfamzzHszJOJ1m9i6ze+T/6pRSQmHUDq4HF4iTjl1zdR/MuLuFWvEqTimGSiEtGLsA/3JxG4lI1S5cWLj/R9J1PixKVI0e4put+/VIQh7OxmwHsPYezs6by+8O+8csPPSGTTIA61DjUgFsqd3cQG1JAYMwSspbxhK2FHB0FNouKwI4tJxPDKJdZcdSOp+25k2KUfo/PpRZilKyg//WdKC57tNdJewsevralsmLNvo3yjIEaD0CLbth3mCzq5yhj6Ps9pHSQCJlz+Icq5Aku+cj9+4KNG3uAyUYQ1hlFXfJQRZx5PPJsGoLCpjXU/+hVb7/s1sSCo6K11EI9h2rtY0/JtJt33TYZcci6vXXQtsWwGSesbZR8XVoLltxnziQqI4pzFK+YnGZx/oNN/AjieIewuMmDawdSNG8Kqe/9Acc0WvHQcbCVeFlWcwPh5l3DAnA9Q2LiNVd/5Bavv/BXWRhz4ufMZ8fkLCUtFpEcGIouXzZB//kW2PPoUA2YeRXz8AWiuG1WHWltRy3d4T4oiiITOImE01qgyzGmE7mMJ6O0U3Jw6hp1yOGod6x98liAZR62rEjmPqCvPkLNm0XjcIay6+7csOu0q1s27n7VfvYdFp17OpseeYcSZs6g7/miiru7edIWq4nse2+//NQDZE4+peM8+KAxUdck45zBRNNgI1GpfNwoJuMgSZNM0HHkwO15ZT+G1bZieGEwqblxSMUY0zaR743ZW3zSfeDxGrD5LfEA/grJl1VfvIiqFDD7jRHZeozqHpBIUliyn1NFF7bTD0FgM3P5rQs91rAgahmlj8Po5tQh9WJcRQUNLoqGORF2atr+vglIIpkdRpAJgbYb0sAba/74CLZSQeIBGES4MMakkbmsb+TWvkx43DNMjfT2r9Dy0I0f+5RUkxo3Cq61BbbT/O93zfWMw3TkMDk9FUelLARKctQT9MgB0v97We2Wt/hQjuCjClsrE6mtxVFPm1Vcla+zh16aJ8kU0sr15JNFKVpHIUtqwpZKcr01XYyzpu7twFvPP8F7ao8hBhTVoOfpHT+r7hG1dbH9+KQMOP5iaQw6gvKkNcZV8TmnTNupmTiXVOIC2J/+KFkt7rNJqoVzZcN/r81sRwOCJ9jlGWpEGW6os3k/G9lAlUDzfY/X3HyLKFznkpk9Rd/LRuHiAJuMM/NhJHHTdxRQ2bmPz/Y/gp5NoNZejVTqrAiaTRKGSD+/j6q0zHr7D7fDFq3dq+9RWG99QasuhQHpEAyq6ixEE8GIx2v70d1bd/zsOuuADHHr7ZykXSxjP4AcBDlj2zXvIL1lJevAAwO7EVxTxfeIjG4k6u9DOLsTz+47POYemavAV7TRIvetjCTKBT2lzO/lNO6g/dCwmGevN5okxaLGE1iSY/O1PM/zUY7BO6V65nrCtEwzEB/YjPXoIEz9/IetGNrLh5nsJUAgEcYqGEaY+S/rAseQXL8N1dkMmDS7aP7WqFGgr/ZCJRNFH9HUj/ijUKn1lqrXa0NBRZPOTSxl9xjFkxjVSfGU9fjpesSf9Mky94zPUHzyS13/3Amt/+CCl5evQYgGDYDJxMhPHMuLiMxh5/odIjBnCq5/+OjHrwPewXd3UHHsoQSpJxxPPYqKoT1RMKy3H6iMS+f4mo0aXV6o7fUyntWJj1v/mOQQYeeYMwlKIiCFylsk3XEj9wSNZ8rV7WXzxN+leshpPhFgmTZBJ4Vmh+5nFLDn3Wtbe/SsGTT+CEdfMIcwX8ERwIgw69zRsFNH5+DOYZKLXRu2vZRZV53seNh5fbTCyuGIU+tbAqVP8TJK2RSvZ+ueVjP7wNGrfPZb8hi0MOW0ag44az/J7HuG17zxEon+WIJmoGF7nKi8BvyZFPJlk7Vd+wObHn2XoGbPIHHs4xdc2kn3fcfQ7YjJb/u9RorXrMZlUJc8t1QKA573DW6romPE8vFRisTEp89dQy/vcbfZ2WalnDC9+bT5RocwhXzwHqa9h1FknUO7oZs13HyJWV4ta3cPuayWu8gzxWMBr836CqtJw+gkwvJFR11xIOZdn8x33Y8KQcHs7Ya6bMF8g3NFB1NGJOPZYTX0rEVJ1Yv2AcPDQP/uxdPR32y5bA/EGRmpV3gnuQu/u9dSl0EojQk9aFqDf+JEc/oMrqBnTyPoHn8K2dRGrS0MYvmlGQNJJwjUbaF/0Mtmjp3DQj64n0dAfBWrfdxz55/7GwNNOJHHQOCTmUV6znq4FT5Ff8CeCfB5JxiuZgH2Ns1HTHQQlmTTpOf9/Wq9ou2P6LX8NbDDL2rJD3l5OqKd0ExXLqC0hAn7g4Sd8iCJcMmDqV84DYO0jLzDypMMB6Hh5DVFnHtKJN6qdO8VSlU4MU4niyyFRWyedS5bT7/DxxOtqWXXjnfSbdiijr5zTu6OlHR1oGFIzeTwDPjCL3NLlbPrCDbjFS/Ay6bfIR/dKvUuImK5M5pWnP/GJlZX+IOMeMSqzEN13N1aNCkrt3cSycWonDyU1oAZXKpFbs5Xihq3YrgJTbjiX2tGD+dvX57P69gcpfv6jHHjBKRx06YfBeGx78Cmi7TsQo/i+AU8q6VrrcGERxRFrHMjwOR9m+DnvJ4oiVn/pDrbe+wB1x01FgK2/+QNbf/gzorUbwEX4/bPUvv94hl4+hxE/uoV1H7sYXl4OmeReC4c7uXkXDwLp6Jd9fHZP2ee2M286OPa6eUnLruIfjL55TtpTJAyx1jHuo0cy/mPHkhncbxfbs/bhF2hbvIZDr2zi9aeWsOiiW0ikEpQ7u2g48d0cfOVHqBk2kGJ7js2PPc+O516iuG4jmssjIgS1aRJjhtDvmEkMPPEogliM9sXLWfuNO8k9+idG3nAFw84/nXXfuZdtX/sOQTKOFwsq7TFRhO3oID5rGmO/903yK1bzetPHiRmv0oa815w0iA1dpjZt2k8++fjhX/jCH6SZZjNX5+p3Zsx7Jl1OHVFyeSdGvb0B5KOgFhXl6K82MWrmRDo3trHmoUXk1mwhSMcYdNS7GHH8FABym3fw5Nlfx23vwot5GKNEHV2YbILGk49kxBkzqTt45Jvu6o4XlrDxZ7+l8/fPYvLd+MMbmfyb79C9Yg3LZ19KMpUA45DIvVEXCwzRxo30v/oyBl/8cdZdehXhw7/Hr83A3utiLunKpnvI0DX5Rx8+6ACRsj9jOkZEom/P+uYPvYgjd69Q7qk3p9xd5oivnM6omRNZcu+feOmmh3G5fLVP0LH6xwtYceQBHHnDx/ETMYJsmtLWTlBFrcOvTUNY5vWfPM7mn/+R1KgGMuNHkBnZSNCvBlQJt+0gv+o18stWEa3diIkiYtkU1jMkJxyAn4izrfVhvNCCMUgU7cLBNIrwamroevBhGi46l8yM99D268fenEw65xLxuMkNHvzjd4mUdPp035+xcK6FFglGhfO7lxSv943f37Hn+rwYIewqMeDwURz4gcNY87sX+ct1vyJZkyTevxa0ujMCO55ezvNX38V77/4M4//3NJ7/n5vxq22OaitVjKBfBmMdpVc3Uli2hq0uwtupJc83ihfzCNKJikcUh0aWxJCBoEp5zQYk8Kq1/t3CMK00ebntbdhcjmDoEPC8vfNhERV1Xkemruy//70/4p67YMYMZwTR5unN3oXfu7ojioW3J/y44HB7CvpEhCiKGHNKRX0Wf+dxgngM8Q0uspUqhXXVZFmWtmeWse6xv9B49ATSoxuISjtF3FWgVBWTjBHUZYjXZ4nV1xKrzxKrz+JnM5VOEFeRvGq8i612skk89uYBgFLpGQpiaBi+0VGyR+LvbDYIpNww8L7GM89brU1NnrS0uEp/0MK5VkFsNrql2+V3+MavNtXu3iymmLjHgInDyG3pILduO17C680z786kPeOx5akllUaDUY17T0lUAdDI9ibdKy+3CwBajeALK9eCCOnDJuFK4R77kvAMrljEHzOaIJmguOSVSl/jnq4vqGed6cykQ3nvzOtRFcaP1172LIi2Ns03lz5wzXZN2nkJP25Q/pE0uEok7icCwlwJjdwb1Ya9pF5trlSJyxLxah/z/qQgFC+VoPDiK3Sv3cCgM0/GHzUU194JgY+YyqSa+D4SWiJr6XfhOTig69EFlZz4Hty8qtpsLDCl4cPvGn7xxSu0qclIS2UYuRf6ptbZrplmk5jCTV3SvSZmAg927UwSI9gwontLJ+nBtXjpeOUTspe8tLOkRgwEEQrb2jHG7H+2xjNQKLLuxh8Qq6tl9E2fh6ENhFvbsF05XC5HtL2Nchgy8ItXUH/ce9h6//9hX1yKSaX+QSVV0FhkzY76/u2Jyy/9YrOq6ZGeXQAS0AlNE+Tcb362W7Nc6geB4MTt3k4nkbLhyVeIpRI0HjuOUkcOL/B3AamHXUsyYMT7j6TY0U1uxXq8ROytmpj2qRjp12boeuwpVt94J7VTDubgh+9i4LWXkjphGsnjjiQ752zGPHgPg889k7bH/0j7V28lSKX33IkWRTaVrTHFiYdcM+jIIzfNbWqSHunZYwg/v2m+N/vns+0PZn79rmw5dV6unIs8cT49XezliKAuxvt/fikaWR47/w7yK7aSyCYwxqIoWiwTdueZdNVpjL/gJBbf+itevf3XJLOpShm4D2Y1jIB25UjPOpohl5xHzUFjdrmP8o52ttx5H7m7foaPYDxTveYbRBFVW4d67QeO/d3I+ff9F7NnG9ltHEH2UFmUucyVCc0DU91PFBbFy/6Boc1bETzBEQiUcwWGnHggx887l8L2Ll644QG2PP0K2p1HPCE9pI53XXAiYz94FK8/t4y/fPI2fDGIKH05zOKLIcp1IIkYyYNHkxg9AmIedv1GSkuWwdatBLW1lWYvZ3tnNQSLirpEGIltHLzNXvmpKSNmzdpIc/Mu0rPXJJA2NxtpaXE/avr6lGCz/zTFcsxKZAwqvlMkEMqdOYafOIGjvng6ibo0xa7qEEsyRu2IBgDWPLyIJV++HylGmECqXqRvp33E10r/c74bjaLKZKMneIlYpari3D8Os4hTPyzZWP0Av/uEmSeNab760d077N8UIKjMirUsbInuPv1rZya3BT8tFoqRmMjzFBFRjKdE7XkSQ2oZdcoUGo89iMzgOmypRNvi11j38PPseHIZsbhfWai1/9yRTFMpBxgcqKv0Ajm327RP5dxeVAprs9lgxxGHfmb0t752U8/Q4JvVEfd49Hzxzvddd0ldd/LW7kJ35AmeiIrg8ETQcpkwX8LzwcRBrMWVQnwjxNOx6tyo/ttmVncGCCN4YTnsV5MKNo4/+KsH3XXbNXrscb68yZDvW9KSHpBam77VEmxxX8x3d1k8NQYVcYr0DMmrBVdtfqp2bmCjf/tQbw9AgqrYyNan037nYZO+P/J7t8zRMPR4i4cOvGU+cubClqh5erPf1Hp5cy5bviyZSnhGRbTHZ1YD0B73rb1/92khaX8rFc6UQ83W1vpbJ0+4fuT3bq6Ao/qWT2TYp4Rty8KWqJlm/5wHr74lGuJ/zE8EpYQERlUj/sMPRaJYFBpvQL3pOOrQK971w29dOz+MKuCIvCUp2+eMdgst0YLpzX7TT6/4STQ6PcOlzYoaP+k75+zujPs/AhgRVeeiWsF3Q4ZsCk+cecrYeV+Zt8Cp3wT7BM7brmTMXFgB6SN3X/asPaXhqLDe3FebSnu+ej3SpP92ZARVJfKiSOoyGb/wrrGP5K/8nyPHffGK3y6YPt2fCdHb6VR9R7Fjz2QiBh48+1tn6YbcV+NFN6IY5rC4yIBnUPlXPnlBsIqq82zk1QYBxfrabTpl4twDbr3uNkoltGm+Jzs9+GnfKxzv4Ghd2qqKygRd6p3+4rwXP/GZ834cbiuoRm5ySv2kjSJRNKrOm8obs6KVrPieZlHf9sxqbypCnahaYyMv68eMzaZL9oAxP0xedOE5oy8+6/dqrdDcbGbefol7ZwK5n0evNAEPX3XHKPvy1sukKzw/XnLZqFwidGUVI9bgjKl0Jcl+SpCqqoqq86w1caMmHQvI1yQKZlDDfeaYd990wCUfXwKVJ1HJv/EBS7vEb61Nrb2P6Hr+tl8Ob/vjsrPo6D7H744mxiKIwhKRC3FiK65VIhFEPFR62O8uAEkVIHUquEoTnEbiqzMxhHjMxyVihHXJFcGggT/1T572k7EfPmV5tXK8z17qXwJQb3jS3GwmtCyV2VR2TVXNs1ff+Z786o3vc12FE7RQGh9ELuOHEc5FWBshzqI4xLDLQ95wFqMWX5SYMfie4AJDFPMKXib5il9f+3hi4thHxnx2zp9EpAQwH7ym5mbdPeD8jwFoZ6BmPIHZJb6J+Sy+9cGxuSWrDrfbO6aG+dJkCcOxUi4P0nKY0e484qrM2zOYVBwT9/NeIFtIxFcHmeTi+KB+f66bMumFxo+cuGxn6Vgwfbo/Y8YM15fA9Bz/H61JoxDWmvv3AAAAAElFTkSuQmCC" width="15" height="15" alt="Affiliate" style="border-radius:50%;object-fit:cover;display:block;">',
  Makelar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.4 2.2 10.6a1 1 0 0 0 1.3 1.5l1-.8V20a1 1 0 0 0 1 1H10v-6.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21h4.5a1 1 0 0 0 1-1v-8.7l1 .8a1 1 0 0 0 1.3-1.5Z"/></svg>',
  Kelas: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.7 1.6 7.6a1 1 0 0 0 0 1.8L12 14.3l8-3.7v4.9a1.1 1.1 0 0 0 0 2.2v1.6l-1.6 3.1h4l-1.6-3.1v-1.6a1.1 1.1 0 0 0 0-2.2v-5.8l1.6-.7a1 1 0 0 0 0-1.8Z"/><path d="M6.2 11.3v3.9c0 1.7 2.6 3.1 5.8 3.1s5.8-1.4 5.8-3.1v-3.9L12 14.2Z"/></svg>',
  Store: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M4.6 3a1 1 0 0 0-1 .8L2.1 9a2.9 2.9 0 0 0 4.9 2.4A2.9 2.9 0 0 0 12 11a2.9 2.9 0 0 0 5 .4A2.9 2.9 0 0 0 21.9 9l-1.5-5.2a1 1 0 0 0-1-.8Z"/><path d="M5 12.8V21h5.5v-4.8h3V21H19v-8.2c-.6.3-1.3.5-2 .5a4.9 4.9 0 0 1-3-1 4.9 4.9 0 0 1-6 0 4.9 4.9 0 0 1-3 1c-.7 0-1.4-.2-2-.5Z"/></svg>',
  'Sosial Media': '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.8-1.2A9 9 0 1 0 12 3Z"/></svg>',
  'Jasa & Rekber': '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5.2 3.4 9 8 10 4.6-1 8-4.8 8-10V5Z"/></svg>',
};
const INCOME_SOURCE_ICON_DEFAULT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm0 2.4A2.6 2.6 0 1 1 8 10.6 2.6 2.6 0 0 1 8 5.4Z"/><path d="M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z"/></svg>';
/* ---- Sumber pendapatan manual (custom) yang ditambahkan pengguna ----
   Terpisah dari INCOME_SOURCES bawaan, disimpan sendiri di localStorage
   supaya tidak tertimpa saat daftar bawaan di atas diperbarui. */
const STORAGE_KEY_INCOME_SOURCE_CUSTOM = 'alirin_income_source_custom_v1';
const CUSTOM_SOURCE_COLOR_PRESETS = ['#2563EB', '#0F9D6C', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626', '#EA580C', '#059669', '#4338CA'];
function loadCustomIncomeSources() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_INCOME_SOURCE_CUSTOM);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat sumber kustom', e); }
  return [];
}
function persistCustomIncomeSources() {
  try { cloudStorage.setItem(STORAGE_KEY_INCOME_SOURCE_CUSTOM, JSON.stringify(customIncomeSources)); }
  catch (e) { showToast('Gagal menyimpan sumber manual.', 'err'); }
}
let customIncomeSources = loadCustomIncomeSources();
function getAllIncomeSourceNames() {
  return INCOME_SOURCES.concat(customIncomeSources.map(c => c.name));
}
function customSourceByName(name) {
  return customIncomeSources.find(c => c.name === name);
}
/* ---- Platform kustom per Sumber Pendapatan (opsional) ----
   Selain daftar platform bawaan di INCOME_SOURCE_PLATFORMS (mis.
   Adsense -> YouTube/Website), pengguna bisa menambah pilihan
   platformnya sendiri lewat tombol "Kelola" di form Tambah/Edit
   Pendapatan (mis. Adsense -> tambah "Snack Video"). Disimpan
   terpisah per nama Sumber di localStorage supaya tidak tertimpa
   saat daftar bawaan diperbarui. Platform bawaan tidak bisa dihapus
   dari sini; hanya platform kustom yang bisa dihapus. */
const STORAGE_KEY_INCOME_PLATFORM_CUSTOM = 'alirin_income_platform_custom_v1';
function loadCustomIncomePlatforms() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_INCOME_PLATFORM_CUSTOM);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat platform kustom', e); }
  return {};
}
function persistCustomIncomePlatforms() {
  try { cloudStorage.setItem(STORAGE_KEY_INCOME_PLATFORM_CUSTOM, JSON.stringify(customIncomePlatforms)); }
  catch (e) { showToast('Gagal menyimpan platform kustom.', 'err'); }
}
let customIncomePlatforms = loadCustomIncomePlatforms();
function getCustomPlatformsForSource(source) {
  return customIncomePlatforms[source] || [];
}
/* Gabungan platform bawaan + kustom untuk satu Sumber, dipakai di
   dropdown Platform pada form & di modal Kelola Platform. */
function getAllPlatformsForSource(source) {
  const builtin = (INCOME_SOURCE_PLATFORMS[source] || []).map(p => ({ name: p.name, icon: p.icon, custom: false }));
  const custom = getCustomPlatformsForSource(source).map(p => ({ name: p.name, icon: PLATFORM_ICON_LIB.sparkle, custom: true, id: p.id }));
  return builtin.concat(custom);
}
/* ---- Detail Akun per Platform (opsional) ----
   Data tambahan non-finansial per kombinasi Sumber+Platform, mis.
   nama akun, jumlah follower, status monetisasi, status pelanggaran,
   jenis akun, dan saldo di platform tsb — terpisah dari catatan
   pendapatan bulanan. Dibuka lewat ikon info kecil pada tiap baris
   platform di modal Rincian Platform. Disimpan di localStorage per
   kombinasi "Sumber::Platform". */
const STORAGE_KEY_PLATFORM_ACCOUNT_DETAILS = 'alirin_platform_account_details_v1';
function loadPlatformAccountDetails() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_PLATFORM_ACCOUNT_DETAILS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat detail akun platform', e); }
  return {};
}
function persistPlatformAccountDetails() {
  try { cloudStorage.setItem(STORAGE_KEY_PLATFORM_ACCOUNT_DETAILS, JSON.stringify(platformAccountDetails)); }
  catch (e) { showToast('Gagal menyimpan detail akun.', 'err'); }
}
let platformAccountDetails = loadPlatformAccountDetails();
function platformAccountKey(source, platform) { return `${source}::${platform || ''}`; }
function getPlatformAccountDetail(source, platform) {
  return platformAccountDetails[platformAccountKey(source, platform)] || null;
}
function savePlatformAccountDetail(source, platform, data) {
  platformAccountDetails[platformAccountKey(source, platform)] = { ...data, updatedAt: new Date().toISOString() };
  persistPlatformAccountDetails();
}
/* ---- Jenis Akun kustom (opsional) ----
   Pilihan bawaan di field "Jenis Akun" pada modal Detail Akun adalah
   Personal/Bisnis/Kreator/Lainnya, tapi field ini bebas diisi teks
   apa saja. Setiap jenis baru yang diketik pengguna disimpan di sini
   supaya muncul sebagai saran (datalist) di isian berikutnya. */
const STORAGE_KEY_ACCOUNT_TYPE_CUSTOM = 'alirin_account_type_custom_v1';
function loadCustomAccountTypes() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_ACCOUNT_TYPE_CUSTOM);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat jenis akun kustom', e); }
  return [];
}
function persistCustomAccountTypes() {
  try { cloudStorage.setItem(STORAGE_KEY_ACCOUNT_TYPE_CUSTOM, JSON.stringify(customAccountTypes)); }
  catch (e) { showToast('Gagal menyimpan jenis akun kustom.', 'err'); }
}
let customAccountTypes = loadCustomAccountTypes();
const AD_TYPE_DEFAULTS = ['Personal', 'Bisnis', 'Kreator', 'Lainnya'];
function registerCustomAccountType(label) {
  const trimmed = (label || '').trim();
  if (!trimmed) return;
  const alreadyKnown = AD_TYPE_DEFAULTS.some(v => v.toLowerCase() === trimmed.toLowerCase())
    || customAccountTypes.some(v => v.toLowerCase() === trimmed.toLowerCase());
  if (alreadyKnown) return;
  customAccountTypes.push(trimmed);
  persistCustomAccountTypes();
}
/* ---- Ikon kustom per sumber pendapatan (opsional) ----
   User bisa mengganti ikon bawaan tiap sumber (termasuk sumber
   manual) dengan gambar sendiri lewat tombol pensil kecil di pojok
   bubble pada kartu beranda (lihat openSourceIconModal di bawah).
   Disimpan terpisah di localStorage sebagai data-URL, per NAMA
   sumber, supaya tidak tertimpa saat daftar ikon bawaan
   (INCOME_SOURCE_ICONS) diperbarui. Kalau tidak ada override,
   sourceIcon() jatuh kembali ke ikon SVG bawaan seperti biasa. */
const STORAGE_KEY_SOURCE_ICON_OVERRIDES = 'alirin_income_source_icons_v1';
function loadSourceIconOverrides() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_SOURCE_ICON_OVERRIDES);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat ikon kustom sumber', e); }
  return {};
}
function persistSourceIconOverrides() {
  try { cloudStorage.setItem(STORAGE_KEY_SOURCE_ICON_OVERRIDES, JSON.stringify(sourceIconOverrides)); }
  catch (e) { showToast('Gagal menyimpan ikon kustom.', 'err'); }
}
let sourceIconOverrides = loadSourceIconOverrides();
/* Logo default per sumber — kalau sumbernya tidak punya ikon bawaan
   (INCOME_SOURCE_ICONS) maupun foto/ikon kustom unggahan sendiri,
   dipakai lencana INISIAL (huruf pertama nama sumber) sebagai logo
   default yang rapi & konsisten — dipakai di mana pun sourceIcon()
   dipanggil (bubble beranda, daftar peringkat, aktivitas terbaru,
   rincian platform), jadi tiap sumber (termasuk sumber manual) selalu
   punya identitas visual yang jelas walau belum diberi ikon sendiri. */
function sourceInitialBadge(source) {
  const initial = (source || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="isc-initial-badge">${escapeHtml(initial)}</span>`;
}
function sourceIcon(source) {
  if (sourceIconOverrides[source]) return `<img src="${sourceIconOverrides[source]}" alt="">`;
  if (INCOME_SOURCE_ICONS[source]) return INCOME_SOURCE_ICONS[source];
  return sourceInitialBadge(source);
}

/* ---- Ikon kustom per Platform (opsional) ----
   Selain ikon per Sumber (di atas), tiap baris platform di modal
   Rincian Platform (mis. "Facebook Ads", "Instagram Ads" di bawah
   Sumber "Meta") juga bisa diberi ikon/logo sendiri lewat tombol
   pensil kecil di pojok ikon baris tsb (lihat openPlatformIconModal
   di bawah). Disimpan terpisah di localStorage sebagai data-URL, per
   kombinasi "Sumber::Platform" supaya platform dengan nama sama di
   sumber berbeda tidak saling tertimpa. */
const STORAGE_KEY_PLATFORM_ICON_OVERRIDES = 'alirin_platform_icon_overrides_v1';
function loadPlatformIconOverrides() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_PLATFORM_ICON_OVERRIDES);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat ikon kustom platform', e); }
  return {};
}
function persistPlatformIconOverrides() {
  try { cloudStorage.setItem(STORAGE_KEY_PLATFORM_ICON_OVERRIDES, JSON.stringify(platformIconOverrides)); }
  catch (e) { showToast('Gagal menyimpan ikon kustom platform.', 'err'); }
}
let platformIconOverrides = loadPlatformIconOverrides();
function platformIconKey(source, platform) { return `${source}::${platform || ''}`; }
/* fallbackIcon = ikon bawaan platform tsb (dari getAllPlatformsForSource),
   dipakai kalau belum ada ikon kustom yang diunggah. */
function platformIcon(source, platform, fallbackIcon) {
  const override = platformIconOverrides[platformIconKey(source, platform)];
  if (override) return `<img src="${override}" alt="">`;
  return fallbackIcon || PLATFORM_ICON_LIB.sparkle;
}
/* Cari ikon bawaan (bukan ikon kustom unggahan) milik satu kombinasi
   Sumber+Platform dari daftar platform resmi/kustom sumber tsb (mis.
   Meta -> "Facebook Ads" = logo Facebook) — dipakai sebagai ikon
   default gelembung platform di kartu beranda, supaya tetap logo yang
   sesuai (bukan ikon generik) selama user belum mengunggah ikon
   sendiri untuk platform itu. */
function getPlatformBuiltinIcon(source, platform) {
  const match = getAllPlatformsForSource(source).find(p => p.name === platform);
  return match ? match.icon : PLATFORM_ICON_LIB.sparkle;
}

/* ---- Tampil/Sembunyikan Platform sebagai gelembung di beranda ----
   Secara bawaan, tiap sumber pendapatan tampil sebagai SATU gelembung
   gabungan di kartu "Sumber Pendapatan" beranda. Lewat tombol
   Aktifkan/Jangan Tampilkan di tiap baris platform pada modal Rincian
   Platform, pengguna bisa memilih platform mana yang justru tampil
   sebagai gelembungnya SENDIRI (terpisah dari sumber induknya) di
   beranda — mis. "Facebook Ads" & "Instagram Ads" masing-masing jadi
   gelembung sendiri alih-alih digabung jadi satu gelembung "Meta".
   Status ini murni soal TAMPILAN gelembung; tidak mengubah data
   pendapatan maupun Total Saldo. Disimpan per kombinasi
   "Sumber::Platform" di cloudStorage. */
const STORAGE_KEY_PLATFORM_BUBBLE_ENABLED = 'alirin_platform_bubble_enabled_v1';
function loadPlatformBubbleEnabled() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_PLATFORM_BUBBLE_ENABLED);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat status gelembung platform', e); }
  return {};
}
function persistPlatformBubbleEnabled() {
  try { cloudStorage.setItem(STORAGE_KEY_PLATFORM_BUBBLE_ENABLED, JSON.stringify(platformBubbleEnabled)); }
  catch (e) { showToast('Gagal menyimpan pengaturan gelembung platform.', 'err'); }
}
let platformBubbleEnabled = loadPlatformBubbleEnabled();
function isPlatformBubbleEnabled(source, platform) {
  return !!platformBubbleEnabled[platformIconKey(source, platform)];
}
function setPlatformBubbleEnabled(source, platform, enabled) {
  const key = platformIconKey(source, platform);
  if (enabled) platformBubbleEnabled[key] = true;
  else delete platformBubbleEnabled[key];
  persistPlatformBubbleEnabled();
}

/* (Dulu di sini ada sourceChartIconSvg() — ikon generik "mini grafik
   gelembung" yang dipakai sebagai wajah default tiap bubble. Sekarang
   tiap gelembung sumber di beranda memakai sourceIcon(name) yang sama
   dengan yang dipakai di daftar/aktivitas, jadi ikonnya selalu cocok
   dengan sumbernya masing-masing: SVG bawaan per sumber
   [INCOME_SOURCE_ICONS], foto/ikon kustom kalau ada, atau lencana
   inisial huruf kalau sumbernya belum punya ikon.) */

function loadIncomeSources() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_INCOME_SOURCES);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data pendapatan', e); }
  return [];
}
function persistIncomeSources(data = incomeSources) {
  try { cloudStorage.setItem(STORAGE_KEY_INCOME_SOURCES, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan data pendapatan.', 'err'); }
}
let incomeSources = loadIncomeSources();
let editingIncomeId = null;

/* ==========================================================
   SALDO BANK & E-WALLET — fitur khusus, berdiri sendiri.
   Menampilkan saldo tiap rekening bank/e-wallet/aset kripto milik
   user. Nilainya TIDAK ikut dijumlahkan ke Saldo Total, Pemasukan/
   Pengeluaran, grafik, riwayat, maupun leaderboard — data & totalnya
   berdiri sendiri, disimpan terpisah di localStorage
   (alirin_bank_wallets_v1).
========================================================== */
const STORAGE_KEY_WALLETS = 'alirin_bank_wallets_v1';

/* Daftar cepat bank/e-wallet/aset yang umum dipakai, dipakai sebagai
   pilihan cepat ("chip") saat menambah akun baru dan sebagai data awal
   (seed) supaya kartu langsung terisi saat pertama kali dibuka (saldo
   awal 0, tinggal diedit). Tiap akun diberi warna khas mendekati warna
   identitas resminya, ditampilkan sebagai lencana bulat berwarna +
   inisial (bukan logo gambar asli, supaya tidak menyalin logo berhak
   cipta pihak lain) — kalau mau logo asli, unggah foto logo sendiri
   lewat "Ganti Foto" saat menambah/edit akun. Tambah/kurangi/ubah
   warnanya di sini. */
const WALLET_PRESETS = [
  { key: 'bri', name: 'BRI', category: 'bank', color: '#00529C', initials: 'BRI' },
  { key: 'bni', name: 'BNI', category: 'bank', color: '#F5821F', initials: 'BNI' },
  { key: 'mandiri', name: 'Mandiri', category: 'bank', color: '#00366E', initials: 'MDR' },
  { key: 'btn', name: 'BTN', category: 'bank', color: '#00539B', initials: 'BTN' },
  { key: 'bsi', name: 'BSI', category: 'bank', color: '#00A19C', initials: 'BSI' },
  { key: 'seabank', name: 'SeaBank', category: 'bank', color: '#00AA5B', initials: 'SEA' },
  { key: 'jago', name: 'Jago', category: 'bank', color: '#FF6644', initials: 'JGO' },
  { key: 'octo', name: 'Octo', category: 'bank', color: '#E4032E', initials: 'OCT' },
  { key: 'allobank', name: 'Allo Bank', category: 'bank', color: '#8B2FCE', initials: 'ALO' },
  { key: 'krombank', name: 'Krom Bank', category: 'bank', color: '#17171A', initials: 'KRM' },
  { key: 'superbank', name: 'Super Bank', category: 'bank', color: '#6C4EF5', initials: 'SPR' },
  { key: 'gopay', name: 'GoPay', category: 'ewallet', color: '#00AA13', initials: 'GP' },
  { key: 'ovo', name: 'OVO', category: 'ewallet', color: '#4C3494', initials: 'OVO' },
  { key: 'dana', name: 'DANA', category: 'ewallet', color: '#118EEA', initials: 'DNA' },
  { key: 'linkaja', name: 'LinkAja', category: 'ewallet', color: '#E4002B', initials: 'LA' },
  { key: 'flip', name: 'Flip', category: 'ewallet', color: '#0A6CFF', initials: 'FLP' },
  { key: 'paypal', name: 'PayPal', category: 'ewallet', color: '#003087', initials: 'PP' },
  { key: 'binance', name: 'Binance', category: 'crypto', color: '#F0B90B', initials: 'BNB' },
  { key: 'minipay', name: 'MiniPay', category: 'crypto', color: '#00C48C', initials: 'MP' },
];
const WALLET_CATEGORY_LABELS = { bank: 'Bank', ewallet: 'E-Wallet', crypto: 'Kripto', other: 'Lainnya' };
const WALLET_ICON_BANK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 21V10l8-6 8 6v11"/><path d="M9 21v-7h6v7"/><path d="M4 10h16"/></svg>';
const WALLET_ICON_EWALLET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.4"/><path d="M3 10h18"/><circle cx="16.2" cy="14.4" r="1.25" fill="currentColor" stroke="none"/></svg>';
const WALLET_ICON_CRYPTO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9 9.2c0-1.1 1.2-1.7 3-1.7s3 .8 3 2c0 3-6 1-6 4 0 1.3 1.3 2 3 2s3-.6 3-1.9"/></svg>';
const WALLET_ICON_OTHER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>';
function walletCategoryIcon(category) {
  if (category === 'ewallet') return WALLET_ICON_EWALLET;
  if (category === 'crypto') return WALLET_ICON_CRYPTO;
  if (category === 'bank') return WALLET_ICON_BANK;
  return WALLET_ICON_OTHER;
}
/* Logo tiap akun: pakai foto/logo custom kalau user unggah gambar sendiri,
   kalau tidak, tampilkan lencana bulat berwarna dengan inisial nama akun. */
function walletLogoHtml(w) {
  if (w.photo) return `<img src="${w.photo}" alt="${escapeHtml(w.name)}">`;
  const initials = (w.initials || w.name || '?').trim().slice(0, 3).toUpperCase();
  return `<span class="wallet-logo-badge">${escapeHtml(initials)}</span>`;
}
// Sengaja dikosongkan -- database baru/default tidak berisi akun
// bank/e-wallet contoh apa pun, user menambahkan sendiri lewat tombol
// "Tambah Akun" (yang tetap memakai WALLET_PRESETS di atas sebagai
// daftar pilihan cepat saat menambah, bukan diisi otomatis di sini).
function seedWallets() {
  return [];
}
function loadWallets() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_WALLETS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data saldo bank/e-wallet', e); }
  const seeded = seedWallets();
  persistWallets(seeded);
  return seeded;
}
function persistWallets(data = wallets) {
  try { cloudStorage.setItem(STORAGE_KEY_WALLETS, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan data saldo bank/e-wallet.', 'err'); }
}
let wallets = loadWallets();
let editingWalletId = null;
let walletPhotoData = null; // base64 dataURL sementara di form, sebelum disimpan
let selectedWalletCategory = 'bank'; // 'bank' | 'ewallet' | 'crypto' | 'other'
let selectedWalletColor = WALLET_PRESETS[0].color;

const rupiahFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* nilai `n` selalu disimpan dalam Rupiah; fungsi ini yang memutuskan tampilannya
   sesuai toggle mata uang aktif (lihat setDisplayCurrency di bawah) */
function fmtRupiah(n) {
  const amount = Number(n) || 0;
  if (typeof displayCurrency !== 'undefined' && displayCurrency === 'USD' && fxBaseRate) {
    return usdFormatter.format(amount / fxBaseRate);
  }
  return rupiahFormatter.format(Math.round(amount));
}
/* Format Rupiah polos (selalu IDR, dipakai khusus di file ekspor Excel/PDF
   supaya angka di laporan konsisten apa pun toggle mata uang di layar). */
function fmtRupiahPlain(n) {
  return rupiahFormatter.format(Math.round(Number(n) || 0));
}
/* Trigger unduh sebuah Blob dengan nama file tertentu (dipakai ekspor
   Excel/PDF). */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/* Menu dropdown ekspor (Excel/PDF) yang dipakai berulang di beberapa
   halaman — buka/tutup saat tombol diklik, tutup saat klik di luar atau
   tekan Escape. */
function setupExportMenu(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) return;
  const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const open = () => { menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.export-menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
    menu.classList.contains('open') ? close() : open();
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  menu._close = close;
}
/* FIX BUG TANGGAL/KALENDER: sebelumnya pakai new Date().toISOString(),
   yang mengonversi ke zona waktu UTC. Untuk pengguna di zona waktu
   lebih maju dari UTC (mis. WIB/UTC+7), antara jam 00:00-06:59
   waktu setempat, tanggal UTC-nya MASIH tanggal KEMARIN -- jadi
   "hari ini" versi app bisa salah mundur 1 hari persis di jam-jam
   itu (memengaruhi kalender, filter riwayat, status tagihan jatuh
   tempo, dsb). localDateStr/localMonthStr di bawah mengambil
   tanggal dari zona waktu SETEMPAT (getFullYear/getMonth/getDate),
   bukan dari UTC, supaya selalu sesuai kalender di HP pengguna. */
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function localMonthStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
const todayStr = () => localDateStr();
const thisMonthStr = () => localMonthStr();
const thisYearStr = () => String(new Date().getFullYear());

/* ---------- Helper minggu (ISO 8601) ---------- */
function getISOWeekString(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function getISOWeekRange(weekStr) {
  const [yearStr, weekPart] = (weekStr || '').split('-W');
  const year = Number(yearStr);
  const week = Number(weekPart);
  if (!year || !week) return null;
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

/* ---------- State ---------- */
let transactions = loadData();
let activeTab = 'bulan';
// Nilai bulan ('YYYY-MM') & rentang tanggal ('YYYY-MM-DD') yang dipilih
// lewat sub-picker "Pilih Bulan"/"Pilih Tanggal" pada popup Filter Laporan
// -- lihat listener #lapFilterMonthInput/#lapFilterDateFromInput/
// #lapFilterDateToInput & pemakaiannya di getFilteredTransactions().
let lapFilterMonth = thisMonthStr();
let lapFilterDateFrom = '';
let lapFilterDateTo = '';
// Tipe transaksi yang dipilih lewat pil "Semua/Uang Masuk/Uang Keluar" di
// dalam popup Filter halaman Laporan (menggantikan <select id="typeFilter">
// yang lama -- lihat #lapFilterTypeRow di index.html & openLapFilterOverlay()).
let lapTypeFilter = 'semua';
let editingId = null;
let deletingId = null;
let detailPageContext = null; // key halaman detail yang sedang terbuka (jika ada)

/* Riwayat transaksi ditampilkan berkelompok per tanggal, dimuat bertahap
   (pagination per "hari") supaya tetap ringan walau datanya banyak. */
const HISTORY_GROUPS_PER_PAGE = 15;
let historyVisibleGroups = HISTORY_GROUPS_PER_PAGE;

/* ==========================================================
   TAGIHAN & HUTANG — disimpan terpisah dari transaksi
========================================================== */
const STORAGE_KEY_BILLS = 'alirin_bills_v1';
const STORAGE_KEY_DEBTS = 'alirin_debts_v1';

// Sengaja dikosongkan -- database baru/default tidak berisi contoh
// tagihan/hutang apa pun, user menambahkan sendiri lewat tombol
// "Tambah Tagihan"/"Tambah Hutang".
function seedBills() {
  return [];
}
function seedDebts() {
  return [];
}

// Tambah `n` bulan ke tanggal (YYYY-MM-DD), dipakai untuk menjadwalkan ulang
// tagihan/hutang berulang otomatis begitu ditandai lunas.
function addMonthsToDateStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return localDateStr(d);
}

function loadBills() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_BILLS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data tagihan', e); }
  const seeded = seedBills();
  persistBills(seeded);
  return seeded;
}
function loadDebts() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_DEBTS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data hutang', e); }
  const seeded = seedDebts();
  persistDebts(seeded);
  return seeded;
}
function persistBills(data = bills) {
  try { cloudStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan data tagihan.', 'err'); }
}
function persistDebts(data = debts) {
  try { cloudStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan data hutang.', 'err'); }
}

let bills = loadBills();
let debts = loadDebts();

/* ==========================================================
   PERANGKAT SAYA — disimpan terpisah dari transaksi
========================================================== */
const STORAGE_KEY_DEVICES = 'alirin_devices_v1';
function loadDevices() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_DEVICES);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data perangkat', e); }
  return [];
}
function persistDevices(data = devices) {
  try { cloudStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan data perangkat.', 'err'); }
}
let devices = loadDevices();

/* ==========================================================
   AKUN SOSIAL MEDIA — tautan yang bisa diklik
========================================================== */
const STORAGE_KEY_SOCIAL = 'alirin_social_v1';
const SOCIAL_PLATFORMS = [
  { key: 'youtube', label: 'YouTube', color: '#DC2626',
    icon: '<path d="M22 8.5s-.2-1.6-.9-2.3c-.8-.9-1.8-.9-2.2-1C15.9 5 12 5 12 5h0s-3.9 0-6.9.2c-.4 0-1.4.1-2.2 1C2.2 6.9 2 8.5 2 8.5S1.8 10.4 1.8 12.3v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.8.9 1.9.9 2.4 1C7.1 21.4 12 21.5 12 21.5s3.9 0 6.9-.3c.4 0 1.4-.1 2.2-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.8c0-1.9-.2-3.8-.2-3.8Z"/><path d="M10 15.2V9.3l5.2 3-5.2 2.9Z" fill="currentColor" stroke="none"/>' },
  { key: 'facebook', label: 'Facebook', color: '#2563EB',
    icon: '<path d="M14 9h2.5V6h-2.5c-2 0-3.5 1.6-3.5 3.5V11H8v3h2.5v7h3v-7H16l.5-3h-3V9.7c0-.4.3-.7.5-.7Z"/>' },
  { key: 'instagram', label: 'Instagram', color: '#DB2777',
    icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/>' },
  { key: 'tiktok', label: 'TikTok', color: '#131A2A',
    icon: '<path d="M15 3v10.5a3.5 3.5 0 1 1-3-3.46"/><path d="M15 3c.5 2.6 2.2 4.2 4.5 4.5"/>' },
  { key: 'whatsapp', label: 'WhatsApp', color: '#0F9D6C',
    icon: '<path d="M3 21l1.4-4.2A8.5 8.5 0 1 1 8.2 20L3 21Z"/><path d="M8.7 8.5c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.4.4-.2.7.2.4 1 1.5 2.1 2.4 1.4 1.1 1.9 1 2.2.9.3-.1.9-.9 1.1-1.2.2-.3.4-.2.7-.1.3.1 1.8.9 2.1 1 .3.1.5.2.6.3.1.2.1 1-.3 1.8-.4.8-1.9 1.5-2.6 1.5-.7 0-1.6.1-4.6-1.9-2.4-1.6-3.9-4.1-4.1-4.4-.2-.3-1.3-1.8-1.3-3.4 0-1.6.8-2.4 1.1-2.7Z" fill="currentColor" stroke="none"/>' },
];

function loadSocialLinks() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_SOCIAL);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat tautan sosial media', e); }
  return {};
}
function persistSocialLinks(data = socialLinks) {
  try { cloudStorage.setItem(STORAGE_KEY_SOCIAL, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan tautan sosial media.', 'err'); }
}
let socialLinks = loadSocialLinks();

/* ---------- Seed data (hanya jika kosong) ----------
   Sengaja dikosongkan -- database baru/default tidak berisi contoh
   transaksi apa pun, user mencatat sendiri transaksi pertamanya
   lewat tombol tambah transaksi. */
function seedData() {
  return [];
}

function cryptoId() {
  return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadData() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat data', e); }
  const seeded = seedData();
  persist(seeded);
  return seeded;
}

function persist(data = transactions) {
  try {
    cloudStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    showToast('Gagal menyimpan data ke browser.', 'err');
  }
}

/* ==========================================================
   BANNER — tanggal & partikel animasi cash-flow
========================================================== */
function renderBannerDate() {
  const el = document.getElementById('bannerDate');
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  el.textContent = new Date().toLocaleDateString('id-ID', opts);
}

/* Sapaan dinamis di atas nama brand pada logo banner, menyesuaikan jam
   perangkat saat ini: 04:00-10:59 pagi, 11:00-14:59 siang,
   15:00-17:59 sore, selain itu (18:00-03:59) malam. Dipanggil sekali
   saat init() lalu disegarkan tiap menit lewat setInterval supaya tetap
   akurat kalau aplikasi dibiarkan terbuka melewati batas jam. */
function renderBrandGreeting() {
  const el = document.getElementById('brandGreetingText');
  if (!el) return;
  const hour = new Date().getHours();
  const greeting = (hour >= 4 && hour < 11) ? 'Selamat pagi 👋'
    : (hour >= 11 && hour < 15) ? 'Selamat siang 👋'
    : (hour >= 15 && hour < 18) ? 'Selamat sore 👋'
    : 'Selamat malam 👋';
  el.textContent = greeting;
}

/* ---------- Kurs mata uang: data asli diambil berkala dari API (basis USD),
   kurs USD/IDR utama ditampilkan "berdetak" tiap detik dengan fluktuasi kecil
   di sekitar nilai asli (bukan klaim data per-detik asli dari sumber). ---------- */
let fxBaseRate = null;   // berapa Rupiah per 1 USD
let fxDisplayedRate = null;
let fxFetchFailed = false;

async function fetchUsdIdrRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    if (data && data.rates && data.rates.IDR) {
      fxBaseRate = data.rates.IDR;
      fxFetchFailed = false;
      refreshAllAmountsIfNeeded();
    } else {
      throw new Error('no IDR rate');
    }
  } catch (e) {
    fxFetchFailed = true;
  }
}

function tickBannerFx() {
  const el = document.getElementById('fxValue');
  if (!el) return;

  if (fxBaseRate == null) {
    el.textContent = fxFetchFailed ? 'Kurs tidak tersedia' : 'Memuat...';
    return;
  }

  // fluktuasi kecil (+-4 rupiah) di sekitar kurs asli, biar terasa live tiap detik
  const jitter = (Math.random() - 0.5) * 8;
  const shown = Math.round(fxBaseRate + jitter);
  const prev = fxDisplayedRate;
  fxDisplayedRate = shown;

  el.textContent = `Rp ${shown.toLocaleString('id-ID')}`;
  // FIX: sebelumnya classList.remove('up','down') dipanggil TIAP detik
  // tanpa syarat, walau warnanya tidak berubah — itu artinya browser
  // dipaksa menghitung ulang style elemen ini 1x/detik selamanya,
  // termasuk pas lagi scroll. Sekarang DOM cuma disentuh kalau warnanya
  // benar-benar berubah (naik/turun/reset), jadi kerjanya jauh lebih
  // jarang dan tidak menyumbang beban recalculation tiap detik.
  const nextCls = prev != null && shown !== prev ? (shown > prev ? 'up' : 'down') : '';
  if (el.dataset.fxCls !== nextCls) {
    el.classList.remove('up', 'down');
    if (nextCls) el.classList.add(nextCls);
    el.dataset.fxCls = nextCls;
  }
}

let fxTickInterval = null;
let fxFetchInterval = null;
function initBannerFx() {
  fetchUsdIdrRate().then(tickBannerFx);

  // FIX BUG "LOMPAT" SAAT KEMBALI KE APP: timer detak kurs & fetch
  // berkala sebelumnya jalan terus tanpa peduli tab/layar HP lagi
  // aktif atau tidak. Saat HP dikunci lalu dibuka lagi setelah lama,
  // browser sering "mengejar" banyak tick yang tertunda sekaligus —
  // hasilnya banner kelihatan patah/lompat sesaat pas app dibuka
  // kembali. Sekarang kedua timer benar-benar DIHENTIKAN saat halaman
  // disembunyikan (document.hidden), dan dimulai ULANG bersih (tick
  // sekali dulu supaya tampilan langsung akurat, baru lanjut interval)
  // begitu halaman terlihat lagi.
  function startFxTimers() {
    stopFxTimers();
    fxTickInterval = setInterval(tickBannerFx, 1000);
    fxFetchInterval = setInterval(fetchUsdIdrRate, 5 * 60 * 1000);
  }
  function stopFxTimers() {
    clearInterval(fxTickInterval);
    clearInterval(fxFetchInterval);
    fxTickInterval = null;
    fxFetchInterval = null;
  }
  startFxTimers();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopFxTimers();
    } else {
      fetchUsdIdrRate().then(tickBannerFx);
      startFxTimers();
    }
  });
}

/* ==========================================================
   BERITA EKONOMI TERKINI
   App ini murni client-side (tidak ada backend sendiri), jadi RSS resmi
   CNBC Indonesia tidak bisa diambil langsung dari browser karena CORS.
   Untuk itu dipakai rangkaian sumber pengambil-berita, dicoba berurutan
   sampai salah satu berhasil, supaya tidak bergantung ke satu layanan
   pihak ketiga yang bisa kehabisan kuota:
     1. rss2json.com (JSON siap pakai, tanpa API key)
     2. api.allorigins.win (proxy CORS ke XML mentah, lalu di-parse sendiri)
     3. corsproxy.io (proxy CORS cadangan, XML di-parse sendiri)
   Kalau semua gagal, hasil sukses terakhir (disimpan di localStorage,
   terpisah per kategori) tetap ditampilkan supaya panel tidak kosong.
   Ada beberapa kategori berita yang bisa dipilih lewat tab, masing-masing
   segar otomatis tiap 5 menit + tombol segarkan manual. ---------- */
const NEWS_CATEGORIES = [
  { key: 'pasar', label: 'Pasar', tag: 'Pasar', rssUrl: 'https://www.cnbcindonesia.com/market/rss/' },
  { key: 'ekonomi', label: 'Ekonomi', tag: 'Ekonomi', rssUrl: 'https://www.cnbcindonesia.com/news/rss/' },
  { key: 'investasi', label: 'Investasi', tag: 'Investasi', rssUrl: 'https://www.cnbcindonesia.com/investment/rss/' },
  { key: 'tekno', label: 'Teknologi', tag: 'Tekno', rssUrl: 'https://www.cnbcindonesia.com/tech/rss/' },
];
const NEWS_CACHE_KEY_PREFIX = 'alirin_news_cache_v1_';
const NEWS_REFRESH_MS = 5 * 60 * 1000; // segarkan otomatis tiap 5 menit

let newsActiveCategory = NEWS_CATEGORIES[0].key;
// Cache hasil per kategori di memori supaya pindah tab tidak selalu re-fetch
const newsCategoryCache = {};

function getNewsCategory(key) {
  return NEWS_CATEGORIES.find(c => c.key === key) || NEWS_CATEGORIES[0];
}

function buildNewsSources(rssUrl) {
  return [
    {
      name: 'rss2json',
      url: 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl) + '&count=8',
      parse: async (res) => {
        const data = await res.json();
        if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('bad payload');
        return data.items.map(it => ({
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          author: it.author,
          thumbnail: it.thumbnail,
          description: it.description
        }));
      }
    },
    {
      name: 'allorigins',
      url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl),
      parse: async (res) => parseRssXml(await res.text())
    },
    {
      name: 'corsproxy',
      url: 'https://corsproxy.io/?url=' + encodeURIComponent(rssUrl),
      parse: async (res) => parseRssXml(await res.text())
    }
  ];
}

let newsLoading = false;

function parseRssXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('parse error');
  const nodes = Array.from(doc.querySelectorAll('item')).slice(0, 8);
  if (!nodes.length) throw new Error('no items');
  return nodes.map(node => {
    const get = (tag) => node.querySelector(tag)?.textContent?.trim() || '';
    let thumbnail = node.querySelector('enclosure')?.getAttribute('url')
      || node.getElementsByTagNameNS('*', 'thumbnail')[0]?.getAttribute('url')
      || null;
    const description = get('description');
    if (!thumbnail) {
      const match = description.match(/<img[^>]+src="([^">]+)"/i);
      if (match) thumbnail = match[1];
    }
    return {
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      author: get('author') || get('creator') || '',
      thumbnail,
      description
    };
  });
}

function timeAgoId(pubDateStr) {
  // Menangani dua format: "YYYY-MM-DD HH:MM:SS" (rss2json, UTC) dan
  // RFC 822 "Mon, 09 Aug 2026 10:00:00 +0700" (RSS mentah).
  let then = new Date(pubDateStr).getTime();
  if (isNaN(then)) then = new Date(pubDateStr.replace(' ', 'T') + 'Z').getTime();
  if (isNaN(then)) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} hari lalu`;
}

function extractThumbFromItem(item) {
  if (item.thumbnail) return item.thumbnail;
  const match = (item.description || item.content || '').match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : null;
}

function newsPlaceholderIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>`;
}

function newsThumbPlaceholderNode() {
  const span = document.createElement('span');
  span.className = 'news-item-thumb placeholder';
  span.innerHTML = newsPlaceholderIcon();
  return span;
}

// Menangani gambar berita yang gagal dimuat (link mati/diblokir) dengan
// mengganti <img> jadi placeholder ikon. Dipasang lewat event delegation
// (bukan atribut onerror inline) supaya markup SVG yang mengandung tanda
// kutip ganda tidak pernah bocor jadi teks/karakter aneh (mis. '"> ) di
// dalam kartu berita.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.classList && img.classList.contains('news-item-thumb') && img.tagName === 'IMG') {
    img.replaceWith(newsThumbPlaceholderNode());
  }
}, true);

function renderNewsList(items) {
  const list = document.getElementById('newsList');
  const viewport = document.getElementById('newsViewport');
  const tag = getNewsCategory(newsActiveCategory).tag;

  // Bersihkan sisa gaya inline dari render sebelumnya (mis. dari mode
  // kosong/statis) supaya tiap kondisi selalu mulai dari keadaan rapi.
  list.style.animation = 'none';
  list.style.width = '';
  list.style.flexDirection = '';
  viewport.classList.remove('static', 'empty');

  if (!items || !items.length) {
    viewport.classList.add('empty');
    list.style.flexDirection = 'row';
    list.innerHTML = `<div class="news-empty">Berita tidak tersedia saat ini. <span class="retry-link" id="newsRetryLink">Coba lagi</span></div>`;
    document.getElementById('newsRetryLink')?.addEventListener('click', () => loadNews(newsActiveCategory));
    return;
  }

  const cardHtml = (offset) => items.map((item, i) => {
    const thumb = extractThumbFromItem(item);
    const thumbHtml = thumb
      ? `<img class="news-item-thumb" src="${escapeAttr(thumb)}" alt="" loading="lazy">`
      : `<span class="news-item-thumb placeholder">${newsPlaceholderIcon()}</span>`;
    const source = (item.author || 'CNBC Indonesia').trim() || 'CNBC Indonesia';
    const ago = item.pubDate ? timeAgoId(item.pubDate) : '';

    return `
      <a class="news-item" href="${escapeAttr(item.link)}" target="_blank" rel="noopener noreferrer" style="animation-delay:${(offset + i) * 45}ms">
        <div class="news-item-media">
          ${thumbHtml}
          <span class="news-item-tag">${escapeHtml(tag)}</span>
          <span class="news-item-go" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </span>
        </div>
        <div class="news-item-body">
          <div class="news-item-title">${escapeHtml(item.title)}</div>
          <div class="news-item-meta">
            <span class="src">${escapeHtml(source)}</span>
            ${ago ? `<span class="dot"></span><span>${ago}</span>` : ''}
          </div>
        </div>
      </a>
    `;
  }).join('');

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Slider otomatis butuh isi yang cukup panjang supaya loop terlihat mulus;
  // kalau item terlalu sedikit atau motion dikurangi, tampilkan sebagai
  // strip yang bisa digeser manual saja (tanpa animasi otomatis).
  const enoughForLoop = items.length >= 3 && !prefersReducedMotion;

  if (!enoughForLoop) {
    viewport.classList.add('static');
    list.innerHTML = cardHtml(0);
    return;
  }

  list.innerHTML = cardHtml(0) + cardHtml(items.length); // digandakan untuk loop mulus

  requestAnimationFrame(() => {
    const halfWidth = list.scrollWidth / 2;
    const speedPxPerSec = 34; // kecepatan geser slider
    const duration = Math.max(16, Math.round(halfWidth / speedPxPerSec));
    list.style.animation = `newsSlide ${duration}s linear infinite`;
  });
}

function readNewsCache(categoryKey) {
  try {
    const raw = cloudStorage.getItem(NEWS_CACHE_KEY_PREFIX + categoryKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeNewsCache(categoryKey, items) {
  try {
    cloudStorage.setItem(NEWS_CACHE_KEY_PREFIX + categoryKey, JSON.stringify({ items, savedAt: Date.now() }));
  } catch (e) { /* localStorage penuh/diblokir — abaikan, cache bukan fitur wajib */ }
}

function setNewsUpdatedLabel(text) {
  const stamp = document.getElementById('newsSection');
  if (!stamp) return;
  let updatedEl = stamp.querySelector('.news-updated-at');
  if (!updatedEl) {
    updatedEl = document.createElement('div');
    updatedEl.className = 'news-updated-at';
    stamp.appendChild(updatedEl);
  }
  updatedEl.textContent = text;
}

async function fetchFromNewsSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(source.url, { signal: controller.signal });
    if (!res.ok) throw new Error('bad response: ' + res.status);
    const items = await source.parse(res);
    if (!items || !items.length) throw new Error('empty items');
    return items;
  } finally {
    clearTimeout(timeout);
  }
}

function renderNewsCatTabs() {
  const wrap = document.getElementById('newsCatTabs');
  if (!wrap) return;
  wrap.innerHTML = NEWS_CATEGORIES.map(c => `
    <button type="button" class="news-cat-tab${c.key === newsActiveCategory ? ' active' : ''}" data-newscat="${c.key}">${escapeHtml(c.label)}</button>
  `).join('');
}

async function loadNews(categoryKey) {
  categoryKey = categoryKey || newsActiveCategory;
  if (newsLoading) return;
  newsLoading = true;

  const btn = document.getElementById('newsRefreshBtn');
  const label = document.getElementById('newsRefreshLabel');
  btn?.classList.add('spinning');
  btn?.setAttribute('disabled', 'true');
  if (label) label.textContent = 'Memuat...';

  const category = getNewsCategory(categoryKey);
  let items = null;
  let lastError = null;

  for (const source of buildNewsSources(category.rssUrl)) {
    try {
      items = await fetchFromNewsSource(source);
      if (items && items.length) break;
    } catch (e) {
      lastError = e;
      items = null;
    }
  }

  // Kalau user sudah pindah tab sebelum fetch ini selesai, jangan timpa
  // tampilan kategori lain dengan hasil fetch kategori yang lama.
  const stillActive = categoryKey === newsActiveCategory;

  if (items && items.length) {
    newsCategoryCache[categoryKey] = items;
    writeNewsCache(categoryKey, items);
    if (stillActive) {
      renderNewsList(items);
      const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setNewsUpdatedLabel(`Terakhir diperbarui ${now}`);
    }
  } else if (stillActive) {
    // Semua sumber gagal (mis. kuota/limit habis atau offline) — tampilkan
    // cache terakhir yang berhasil dimuat kalau ada, daripada panel kosong.
    const cached = readNewsCache(categoryKey);
    if (cached) {
      renderNewsList(cached.items);
      const savedDate = new Date(cached.savedAt);
      const label2 = savedDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      setNewsUpdatedLabel(`Gagal menyegarkan, menampilkan cache ${label2}`);
    } else {
      renderNewsList([]);
      console.warn('Gagal memuat berita dari semua sumber:', lastError);
    }
  }

  newsLoading = false;
  btn?.classList.remove('spinning');
  btn?.removeAttribute('disabled');
  if (label) label.textContent = 'Segarkan';
}

function switchNewsCategory(categoryKey) {
  if (categoryKey === newsActiveCategory) return;
  newsActiveCategory = categoryKey;
  renderNewsCatTabs();

  // Tampilkan cache/memori kategori ini dulu (kalau ada) supaya terasa instan,
  // lalu tetap segarkan di latar belakang.
  const memCache = newsCategoryCache[categoryKey];
  const stored = readNewsCache(categoryKey);
  if (memCache) {
    renderNewsList(memCache);
  } else if (stored) {
    renderNewsList(stored.items);
    const savedDate = new Date(stored.savedAt);
    const label = savedDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    setNewsUpdatedLabel(`Menampilkan cache ${label}`);
  } else {
    document.getElementById('newsList').innerHTML = `
      <div class="news-skeleton"><div class="sk-thumb"></div><div class="sk-lines"><div class="sk-line w-90"></div><div class="sk-line w-70"></div><div class="sk-line w-40"></div></div></div>
      <div class="news-skeleton"><div class="sk-thumb"></div><div class="sk-lines"><div class="sk-line w-90"></div><div class="sk-line w-70"></div><div class="sk-line w-40"></div></div></div>
      <div class="news-skeleton"><div class="sk-thumb"></div><div class="sk-lines"><div class="sk-line w-90"></div><div class="sk-line w-70"></div><div class="sk-line w-40"></div></div></div>`;
  }
  loadNews(categoryKey);
}

function initNews() {
  if (!document.getElementById('newsSection') || !document.getElementById('newsList')) return;
  renderNewsCatTabs();
  loadNews(newsActiveCategory);
  document.getElementById('newsRefreshBtn')?.addEventListener('click', () => loadNews(newsActiveCategory));
  document.getElementById('newsCatTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-newscat]');
    if (btn) switchNewsCategory(btn.dataset.newscat);
  });
  setInterval(() => loadNews(newsActiveCategory), NEWS_REFRESH_MS); // segarkan otomatis tiap 5 menit

  // Jeda slider saat disentuh di HP (hover tidak berlaku di layar sentuh),
  // lalu lanjut geser lagi beberapa saat setelah jari dilepas.
  const viewport = document.getElementById('newsViewport');
  if (viewport) {
    let resumeTimer = null;
    viewport.addEventListener('touchstart', () => {
      clearTimeout(resumeTimer);
      viewport.classList.add('paused');
    }, { passive: true });
    viewport.addEventListener('touchend', () => {
      resumeTimer = setTimeout(() => viewport.classList.remove('paused'), 2500);
    }, { passive: true });

    // Jeda slider saat tab/jendela browser tidak aktif supaya tidak "mengejar" saat kembali.
    document.addEventListener('visibilitychange', () => {
      viewport.classList.toggle('paused', document.hidden);
    });
  }
}


let displayCurrency = 'IDR';

function refreshAllAmountsIfNeeded() {
  // dipanggil setelah kurs baru datang dari API, supaya nominal yang sedang
  // tampil dalam USD langsung ikut update ke kurs terbaru
  if (displayCurrency === 'USD') refreshAll();
}

function setDisplayCurrency(next) {
  if (next === displayCurrency) return;
  if (next === 'USD' && !fxBaseRate) {
    showToast('Kurs belum dimuat, coba lagi sebentar.', 'err');
    return;
  }
  displayCurrency = next;

  const btn = document.getElementById('currencyToggle');
  btn.classList.toggle('usd', next === 'USD');
  btn.setAttribute('aria-checked', next === 'USD' ? 'true' : 'false');
  btn.querySelector('.ct-idr').classList.toggle('active', next === 'IDR');
  btn.querySelector('.ct-usd').classList.toggle('active', next === 'USD');

  // FIX: refreshAll() di bawah ini SUDAH memanggil renderTransactionList(),
  // renderChart(), dan renderYearlyBarChart() di dalamnya — sebelumnya
  // ketiganya dipanggil LAGI secara manual persis setelah refreshAll(),
  // jadi tiap toggle IDR/USD, grafik & daftar transaksi digambar ulang
  // dua kali sia-sia (buang kerja render & berpotensi bikin chart
  // kelihatan kedip). Sekarang cukup panggil refreshAll() sekali,
  // ditambah renderDevices()/renderNotifPanel() yang memang tidak
  // termasuk di refreshAll().
  refreshAll();
  renderDevices();
  if (typeof renderNotifPanel === 'function') renderNotifPanel();
}

document.getElementById('currencyToggle').addEventListener('click', () => {
  setDisplayCurrency(displayCurrency === 'IDR' ? 'USD' : 'IDR');
});

function renderFlowParticles(monthIncomeCount, monthExpenseCount) {
  const field = document.getElementById('flowField');
  field.innerHTML = '';
  // Diselaraskan dengan simbol masuk/keluar: masuk = panah turun, keluar = panah naik.
  const upCount = Math.min(10, Math.max(4, monthExpenseCount));
  const downCount = Math.min(10, Math.max(4, monthIncomeCount));

  for (let i = 0; i < upCount; i++) {
    field.appendChild(makeParticle('up'));
  }
  for (let i = 0; i < downCount; i++) {
    field.appendChild(makeParticle('down'));
  }
}

function makeParticle(direction) {
  const span = document.createElement('span');
  span.className = 'particle ' + direction;
  const size = 3 + Math.random() * 5;
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.style.left = (Math.random() * 96 + 2) + '%';
  span.style.top = direction === 'up' ? (60 + Math.random() * 30) + '%' : (Math.random() * 20) + '%';
  const duration = 5 + Math.random() * 5;
  const delay = Math.random() * 6;
  span.style.animationDuration = duration + 's';
  span.style.animationDelay = delay + 's';
  span.style.animationIterationCount = 'infinite';
  span.style.animationTimingFunction = 'ease-in-out';
  return span;
}

/* ---------- Sembunyikan/tampilkan saldo (privasi) ---------- */
const SALDO_HIDE_KEY = 'alirin_saldo_hidden_v1';
const EYE_OPEN_SVG = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF_SVG = '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.6M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>';

function isSaldoHidden() {
  const stored = cloudStorage.getItem(SALDO_HIDE_KEY);
  // Default: tersembunyi otomatis demi privasi saat pertama kali dibuka.
  return stored === null ? true : stored === '1';
}

/* Gaya "sembunyikan saldo": prefix mata uangnya tetap dipertahankan
   (mis. "Rp"), tapi nominalnya diganti jadi "***" saja (bukan
   titik-titik sepanjang jumlah digit aslinya) -- lebih ringkas dan
   tidak membocorkan jumlah digit angka aslinya sama sekali. */
function maskCurrencyString(str) {
  const s = String(str);
  const m = s.match(/^(\D*)/); // tangkap prefix non-digit di depan (mis. "Rp ")
  const prefix = m ? m[1] : '';
  return prefix + '***';
}

/* Tampilan saldo dengan desimal ",00" di belakang, ukuran fontnya
   SEPARUH dari font angka utama (pakai unit "em" relatif ke
   .saldo-value supaya otomatis ikut menyusut/membesar mengikuti
   clamp() responsif si induk, lihat .saldo-decimal di CSS). Desimal
   ini HANYA ditambahkan untuk mode Rupiah -- kalau lagi mode USD,
   formatternya (usdFormatter) sudah otomatis menyertakan 2 angka
   desimal sendiri (mis. "$12.34"), jadi tidak perlu ditambah lagi. */
function fmtSaldoDisplayHTML(raw) {
  const text = fmtRupiah(raw);
  const isUSD = (typeof displayCurrency !== 'undefined' && displayCurrency === 'USD' && fxBaseRate);
  if (isUSD) return text;
  return text + '<span class="saldo-decimal">,00</span>';
}

function applySaldoVisibility() {
  const hidden = isSaldoHidden();
  const valueEl = document.getElementById('saldoValue');
  const iconEl = document.getElementById('saldoEyeIcon');
  const btn = document.getElementById('saldoToggle');
  if (!valueEl || !iconEl) return;
  valueEl.classList.toggle('is-hidden', hidden);
  const raw = parseFloat(valueEl.dataset.raw || '0');
  // Ganti tampilan langsung (tanpa animasi hitung-naik) begitu toggle
  // diklik -- baik saat disembunyikan (langsung jadi titik-titik) maupun
  // saat ditampilkan lagi (langsung jadi angka final), sama seperti pola
  // reveal instan di aplikasi bank/e-wallet.
  cancelAnimationFrame(saldoAnimFrame);
  valueEl.innerHTML = hidden ? maskCurrencyString(fmtRupiah(raw)) : fmtSaldoDisplayHTML(raw);
  iconEl.innerHTML = hidden ? EYE_OFF_SVG : EYE_OPEN_SVG;
  if (btn) btn.title = hidden ? 'Tampilkan saldo' : 'Sembunyikan saldo';
}

document.getElementById('saldoToggle').addEventListener('click', () => {
  const nextHidden = !isSaldoHidden();
  cloudStorage.setItem(SALDO_HIDE_KEY, nextHidden ? '1' : '0');
  applySaldoVisibility();
});

let saldoAnimFrame = null;
// PENTING (fix "saldo sempat kelihatan minus/salah" sesaat setelah
// refresh): render PERTAMA setelah halaman dimuat (refreshAll() awal
// dari init()) dulu langsung menampilkan angka final tanpa animasi
// hitung-naik. Animasi hitung-naik (0 -> target) cuma dipakai untuk
// update BERIKUTNYA (mis. setelah tambah transaksi) yang memang dari
// keadaan sudah stabil di layar, jadi tidak ada frame antara yang bisa
// kelihatan seperti angka salah/minus sesaat sebelum settle ke nilai
// akhir yang benar.
let saldoFirstRenderDone = false;
function animateSaldo(target) {
  const el = document.getElementById('saldoValue');
  // Kalau lagi disembunyikan, tidak perlu animasi hitung-naik sama
  // sekali -- toh yang tampil cuma titik-titik mask, bukan angkanya.
  // dataset.raw tetap disimpan sebagai nilai asli terkini supaya begitu
  // tombol mata diklik (lihat applySaldoVisibility), angka yang
  // langsung muncul sudah yang paling baru/akurat.
  if (isSaldoHidden()) {
    cancelAnimationFrame(saldoAnimFrame);
    el.textContent = maskCurrencyString(fmtRupiah(target));
    el.dataset.raw = target;
    saldoFirstRenderDone = true;
    return;
  }
  if (!saldoFirstRenderDone) {
    saldoFirstRenderDone = true;
    cancelAnimationFrame(saldoAnimFrame);
    el.innerHTML = fmtSaldoDisplayHTML(target);
    el.dataset.raw = target;
    return;
  }
  const start = parseFloat(el.dataset.raw || '0');
  const startTime = performance.now();
  const duration = 700;
  cancelAnimationFrame(saldoAnimFrame);
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = start + (target - start) * eased;
    el.innerHTML = fmtSaldoDisplayHTML(value);
    if (p < 1) {
      saldoAnimFrame = requestAnimationFrame(tick);
    } else {
      el.dataset.raw = target;
    }
  }
  saldoAnimFrame = requestAnimationFrame(tick);
}

function animateIntEl(el, target, formatFn, duration = 900) {
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = target * eased;
    el.textContent = formatFn(value);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(target);
  }
  requestAnimationFrame(tick);
}

function renderSaldoTargets(t) {
  const wrap = document.getElementById('saldoTargets');
  if (!wrap) return;

  const entries = Object.keys(SUMMARY_PAGES)
    .filter(key => Number(pageTargets[key]) > 0)
    .map(key => {
      const page = SUMMARY_PAGES[key];
      const current = Number(t[key]) || 0;
      const target = Number(pageTargets[key]);
      const pct = Math.min(100, Math.round((current / target) * 100));
      return { key, page, current, target, pct, isIn: page.type === 'masuk' };
    });

  if (entries.length === 0) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'grid';

  wrap.innerHTML = entries.map(e => `
    <div class="saldo-target-item">
      <div class="saldo-target-head">
        <span class="saldo-target-name">${escapeHtml(e.page.label)}</span>
        <span class="saldo-target-pct" data-pct-target="${e.pct}">0%</span>
      </div>
      <div class="saldo-target-track"><div class="saldo-target-fill ${e.isIn ? 'in' : 'out'}" data-fill-target="${e.pct}"></div></div>
      <div class="saldo-target-nums">
        <span class="cur" data-count-target="${e.current}">Rp 0</span>
        <span>dari ${fmtRupiah(e.target)}</span>
      </div>
    </div>
  `).join('');

  requestAnimationFrame(() => {
    wrap.querySelectorAll('[data-fill-target]').forEach(el => {
      el.style.width = el.dataset.fillTarget + '%';
    });
    wrap.querySelectorAll('[data-pct-target]').forEach(el => {
      animateIntEl(el, Number(el.dataset.pctTarget), v => Math.round(v) + '%');
    });
    wrap.querySelectorAll('[data-count-target]').forEach(el => {
      animateIntEl(el, Number(el.dataset.countTarget), v => fmtRupiah(v));
    });
  });
}

/* ==========================================================
   PERHITUNGAN RINGKASAN
========================================================== */
function calcTotals() {
  const today = todayStr();
  const month = thisMonthStr();
  let saldo = 0, todayIn = 0, todayOut = 0, monthIn = 0, monthOut = 0;
  let monthInCount = 0, monthOutCount = 0, todayInCount = 0, todayOutCount = 0;

  transactions.forEach(t => {
    const val = Number(t.amount) || 0;
    saldo += t.type === 'masuk' ? val : -val;
    if (t.date === today) {
      if (t.type === 'masuk') { todayIn += val; todayInCount++; } else { todayOut += val; todayOutCount++; }
    }
    if (t.date && t.date.slice(0, 7) === month) {
      if (t.type === 'masuk') { monthIn += val; monthInCount++; }
      else { monthOut += val; monthOutCount++; }
    }
  });

  return { saldo, todayIn, todayOut, monthIn, monthOut, monthInCount, monthOutCount, todayInCount, todayOutCount };
}

// Kartu "Uang Masuk & Keluar" bermula NYELIP DI BELAKANG banner —
// hampir seluruh badan kartu tersembunyi tertutup banner (banner
// z-index lebih tinggi), hanya ujung bawah kartu (handle
// "Lihat Ringkasan...") yang menyembul & bisa diklik. Tinggi kartu
// dan banner dihitung dinamis (bukan angka tetap) supaya pas di
// berbagai ukuran layar/konten. Klik handle -> kartu turun mulus ke
// posisi normal, satu arah saja (tidak bisa naik/tuck lagi).
let flowDealSettleBound = false;
let flowDealResizeBound = false;
let flowDealResizeObserver = null;
function applyFlowDealTuckPosition() {
  const wrap = document.getElementById('bannerFlowWrap');
  if (!wrap) return;
  const card = wrap.querySelector('.flow-deal-card');
  const handle = wrap.querySelector('.fc-peek-handle');
  if (!card || !handle) return;
  // Pendekatan lama menarik SELURUH wrap naik lewat margin-top negatif
  // sejumlah tinggi kartu, lalu dibatasi (capped) supaya tidak lebih
  // tinggi dari banner — supaya bagian atas kartu tidak menyembul di
  // ATAS banner. Masalahnya: kalau tinggi kartu (2 kartu tier grafik)
  // melebihi tinggi banner, cap itu bikin
  // tarikannya kurang, sehingga bagian TENGAH kartu (mis. tombol "Lihat
  // Semua") ikut menyembul di bawah banner alih-alih tersembunyi rapi.
  //
  // Sekarang wrap sendiri yang jadi jendela "overflow:hidden" setinggi
  // tab handle saja, lalu kartu di dalamnya digeser naik (transform)
  // sejumlah (tinggi kartu - tinggi handle) sehingga HANYA potongan
  // handle yang pernah terlihat — selalu rapi & pas mepet ke banner,
  // berapa pun tinggi kartu atau banner, dan otomatis responsive di
  // semua ukuran layar karena dihitung ulang dari ukuran asli elemen.
  // TUCK_OVERLAP harus sama dengan margin-top negatif pada
  // .banner-flow-wrap (CSS) — jumlah wrap yang sengaja disembunyikan
  // di BELAKANG banner (bukan cuma ditempel pas di bawahnya) supaya
  // tab handle terlihat benar-benar "nyelip" keluar dari balik banner,
  // bukan sekadar nempel dengan garis sambungan yang kelihatan.
  const TUCK_OVERLAP = 22;
  const cardHeight = card.offsetHeight;
  const handleHeight = handle.offsetHeight;
  const visibleHeight = wrap.classList.contains('fc-settled') ? cardHeight : handleHeight;
  const wrapHeight = Math.max(0, visibleHeight + TUCK_OVERLAP);
  const translateY = wrapHeight - cardHeight;
  // PENTING (fix flicker banner di HP): wrap & kartu punya CSS
  // `transition` pada height/transform. Sebelumnya baris di bawah
  // SELALU menulis ulang style walau nilainya sama persis dengan
  // sebelumnya — dan fungsi ini dipanggil sangat sering (tiap event
  // "resize", termasuk yang dipicu HANYA oleh address bar browser HP
  // muncul/hilang saat scroll, bukan oleh perubahan lebar layar
  // sungguhan). Tulis-ulang beruntun itu memicu transisi berulang di
  // area yang nyelip tepat di belakang banner, dan itu yang terlihat
  // sebagai banner "kedip-kedip" saat discroll di ponsel. Sekarang
  // kita cek dulu: kalau nilainya tidak berubah, jangan sentuh DOM
  // sama sekali supaya tidak ada transisi/repaint yang tidak perlu.
  const newHeightPx = wrapHeight + 'px';
  const newTransform = `translateY(${translateY}px)`;
  if (wrap.style.height !== newHeightPx) wrap.style.height = newHeightPx;
  if (card.style.transform !== newTransform) card.style.transform = newTransform;
}
// Gestur tarik (drag/swipe) dengan jari di tab peek — pengganti tombol
// "Lihat Ringkasan" yang disembunyikan khusus di layar HP (lihat CSS
// @media max-width:600px). Menarik jari ke bawah sejauh ambang batas
// tertentu pada tab akan membuka kartu, persis seperti mengklik tab
// itu sendiri. Tap/klik biasa tetap berfungsi seperti sebelumnya
// (listener klik terpisah di bawah) — ini murni tambahan gestur, bukan
// pengganti klik.
function bindFlowDealDragOpen(wrap, handle) {
  if (!handle || handle.dataset.dragBound === '1') return;
  handle.dataset.dragBound = '1';
  const DRAG_THRESHOLD = 22; // px, jarak tarik minimum sebelum kartu terbuka
  let startY = null;
  handle.addEventListener('touchstart', (e) => {
    if (wrap.classList.contains('fc-settled')) { startY = null; return; }
    startY = e.touches[0].clientY;
  }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (startY === null || wrap.classList.contains('fc-settled')) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY >= DRAG_THRESHOLD) {
      startY = null;
      wrap.classList.add('fc-settled');
      applyFlowDealTuckPosition();
    }
  }, { passive: true });
  handle.addEventListener('touchend', () => { startY = null; });
  handle.addEventListener('touchcancel', () => { startY = null; });
}
function initFlowDealSettle() {
  const wrap = document.getElementById('bannerFlowWrap');
  if (!wrap) return;
  applyFlowDealTuckPosition();
  bindFlowDealDragOpen(wrap, wrap.querySelector('.fc-peek-handle'));
  if (!flowDealSettleBound) {
    flowDealSettleBound = true;
    // Delegasi klik di wrap (bukan di elemen kartu langsung) supaya tetap
    // jalan walau kartu di-render ulang (innerHTML diganti tiap update
    // data) — id/tombol di dalamnya berubah instance tapi wrap-nya tetap.
    // Dua arah: klik tab peek -> buka penuh; klik tombol ciutkan (muncul
    // saat sudah terbuka) -> kembalikan ke posisi nyelip semula.
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.fc-collapse-btn')) {
        if (!wrap.classList.contains('fc-settled')) return;
        wrap.classList.remove('fc-settled');
        applyFlowDealTuckPosition();
        return;
      }
      if (wrap.classList.contains('fc-settled')) return;
      if (!e.target.closest('.fc-peek-handle')) return;
      wrap.classList.add('fc-settled');
      applyFlowDealTuckPosition();
    });
  }
  if (!flowDealResizeBound) {
    flowDealResizeBound = true;
    // PENTING (fix flicker banner di HP): jangan langsung recalc di
    // setiap event "resize" mentah-mentah. Browser mobile memicu event
    // "resize" berkali-kali saat address bar muncul/hilang ketika
    // pengguna scroll — padahal LEBAR layar sama sekali tidak berubah.
    // Kalau kita tetap recalc & tulis ulang height/transform tiap kali
    // itu terjadi, transisi CSS-nya kepicu berulang-ulang persis di
    // belakang banner dan kelihatan seperti kedip-kedip. Makanya di
    // sini kita cek dulu: apakah LEBAR window benar-benar berubah?
    // Kalau cuma tinggi yang berubah (efek address bar), abaikan.
    // Selain itu dibungkus requestAnimationFrame supaya tidak
    // recalc lebih dari sekali per frame saat resize beruntun (mis.
    // saat rotasi layar / resize jendela di desktop).
    let lastKnownWidth = window.innerWidth;
    let resizeRafId = null;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastKnownWidth) return; // cuma tinggi yg berubah, abaikan
      lastKnownWidth = window.innerWidth;
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        applyFlowDealTuckPosition();
      });
    });
    window.addEventListener('load', () => applyFlowDealTuckPosition());
  }
  // Amati perubahan tinggi kartu supaya tab tetap PAS nempel
  // di tepi bawah banner meski konten kartu berubah belakangan — tetap
  // diamati walau sudah "settled" supaya tinggi wrap ikut menyesuaikan.
  if (window.ResizeObserver) {
    if (flowDealResizeObserver) flowDealResizeObserver.disconnect();
    let roRafId = null;
    flowDealResizeObserver = new ResizeObserver(() => {
      // Throttle ke 1x per frame — ResizeObserver bisa memanggil callback
      // beberapa kali beruntun (mis. saat chart di dalam kartu digambar
      // ulang), dan applyFlowDealTuckPosition() sekarang sudah aman untuk
      // dipanggil berkali-kali (skip write kalau nilai sama), tapi tetap
      // ditahan ke 1x/frame supaya lebih hemat & tidak ada race dengan
      // resize handler di atas.
      if (roRafId) return;
      roRafId = requestAnimationFrame(() => {
        roRafId = null;
        applyFlowDealTuckPosition();
      });
    });
    const cardEl = wrap.querySelector('.flow-deal-card');
    if (cardEl) flowDealResizeObserver.observe(cardEl);
    const handleEl = wrap.querySelector('.fc-peek-handle');
    if (handleEl) flowDealResizeObserver.observe(handleEl);
  } else {
    setTimeout(applyFlowDealTuckPosition, 400);
    setTimeout(applyFlowDealTuckPosition, 1200);
  }
}

function renderSummary() {
  const t = calcTotals();

  animateSaldo(t.saldo);
  // FIX "angka tidak tampil utuh di HP": baris Pemasukan/Pengeluaran
  // bulan ini (baik di banner besar #bannerIncome/#bannerExpense
  // maupun mini topbar #miniBarIncome/#miniBarExpense) sebelumnya
  // memakai fmtRupiah() (format penuh, mis. "Rp1.229.970.500") di
  // dalam kotak sempit yang dibatasi white-space:nowrap +
  // text-overflow:ellipsis — untuk nominal besar, angkanya kepotong
  // "Rp 1.229.970...." sebelum sempat kelihatan utuh, apalagi di HP
  // yang lebarnya sudah dibagi dua dengan sisi Pengeluaran. Baris ini
  // TIDAK butuh presisi sampai rupiah terakhir (itu peran Saldo Total
  // di atasnya & kartu Riwayat Transaksi yang lebih detail) jadi aman
  // dipendekkan pakai fmtRupiahShort() (mis. "Rp1,2 Jt") supaya selalu
  // muat satu baris & tetap kebaca lengkap berapa pun besar nominalnya.
  // Nilai penuh tetap disimpan lewat atribut title supaya masih bisa
  // dicek presisinya (hover di desktop / tap-and-hold di sebagian HP).
  const bannerIncomeEl = document.getElementById('bannerIncome');
  const bannerExpenseEl = document.getElementById('bannerExpense');
  if (bannerIncomeEl) { bannerIncomeEl.textContent = fmtRupiahShort(t.monthIn); bannerIncomeEl.title = fmtRupiah(t.monthIn); }
  if (bannerExpenseEl) { bannerExpenseEl.textContent = fmtRupiahShort(t.monthOut); bannerExpenseEl.title = fmtRupiah(t.monthOut); }
  // Sinkronkan juga nilai di mini topbar (elemen fixed terpisah,
  // lihat #miniTopbar) supaya selalu sama dengan yang di banner besar.
  const miniIncomeEl = document.getElementById('miniBarIncome');
  const miniExpenseEl = document.getElementById('miniBarExpense');
  if (miniIncomeEl) { miniIncomeEl.textContent = fmtRupiahShort(t.monthIn); miniIncomeEl.title = fmtRupiah(t.monthIn); }
  if (miniExpenseEl) { miniExpenseEl.textContent = fmtRupiahShort(t.monthOut); miniExpenseEl.title = fmtRupiah(t.monthOut); }
  renderFlowParticles(t.monthInCount, t.monthOutCount);
  renderSaldoTargets(t);

  const iconFlame = `<svg class="wtl-flame" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-7L13 19l2.5-7H21"/></svg>`;

  // Kartu gabungan "Uang Masuk & Keluar" — meniru layout kartu promo
  // "Deposito Flash Deals": header berisi judul + kotak countdown timer
  // gelap (menghitung mundur ke pergantian hari, sehingga sungguhan
  // berarti "sisa waktu sebelum ringkasan Hari Ini reset"), lalu badan
  // kartu berisi sisi kiri bertema "Jangan Lewatkan 🔥" + saldo bersih
  // hari ini, dan sisi kanan dua kartu tier sejajar (Hari Ini & Bulan
  // Ini) — tiap kartu tier menampilkan pemasukan sebagai angka besar
  // dan pengeluaran sebagai baris tercoret di bawahnya, jumlah
  // transaksi, dan tombol "Lihat Semua" bergaya "Ingatkan Saya".
  const iconStopwatch = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/></svg>`;
  // Ikon dompet kecil dipakai pada handle "Lihat Ringkasan" (lihat
  // redesign di bawah, dekat cardsHtml) supaya tab peek tidak cuma
  // teks polos, ada penanda visual yang konsisten dengan tema kartu.
  //
  // FIX overflow di HP: baris preview Masuk/Keluar pada tab peek ini
  // sebelumnya pakai fmtRupiah() (format penuh, mis. "Rp1.125.120.000")
  // — untuk nominal besar, teks jadi kepanjangan dan section "Keluar"
  // ikut terpotong (ellipsis) sebelum angkanya sempat kelihatan di
  // layar sempit. Baris preview ini cuma ringkasan sebelum kartu detail
  // dibuka (angka lengkap tetap tampil di kartu tier "Hari Ini" & "Bulan
  // Ini" setelah tab diklik), jadi aman pakai fmtRupiahShort() (mis.
  // "Rp1,1 M") supaya selalu ringkas & muat satu baris berapa pun besar
  // nominalnya — bukan cuma diperkecil ukuran fontnya.
  const iconMiniWallet = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3 10h18"/><circle cx="16" cy="14.4" r="1.3" fill="currentColor" stroke="none"/></svg>`;
  const netToday = t.todayIn - t.todayOut;

  // Tiap kartu tier kini menampilkan grafik garis animasi DUA GARIS
  // (Masuk = hijau, Keluar = merah) alih-alih dua baris angka statis.
  // Saat kursor diarahkan ke grafik (atau disentuh di HP), muncul
  // crosshair + tooltip berisi Masuk/Keluar/Saldo pada titik tsb —
  // lihat setupFlowTierChart() & buildFlowTierSeries().
  function flowTierCard(tierKey, label, netVal, inVal, outVal, count, inKey, outKey) {
    return `
      <div class="flow-tier-card">
        <div class="ftc-head">
          <span class="ftc-period">${label}</span>
          <span class="ftc-count-pill">${count} transaksi</span>
        </div>
        <div class="ftc-chart-wrap">
          <canvas id="ftcChart_${tierKey}"></canvas>
          <div class="ftc-live-dot in"></div>
          <div class="ftc-live-dot out"></div>
          <div class="ftc-chart-tooltip"></div>
        </div>
        <div class="ftc-legend">
          <button type="button" class="ftc-chip in" data-page="${inKey}" aria-label="Lihat pemasukan ${label}"><span class="dot"></span>Masuk <b>${fmtRupiah(inVal)}</b></button>
          <button type="button" class="ftc-chip out" data-page="${outKey}" aria-label="Lihat pengeluaran ${label}"><span class="dot"></span>Keluar <b>${fmtRupiah(outVal)}</b></button>
        </div>
        <button type="button" class="ftc-btn fc-deal-add" data-page="${inKey}">Lihat Semua</button>
      </div>
    `;
  }

  const cardsHtml = `
    <div class="stat-card fc-card flow-deal-card fade-in-op">
      <div class="flow-deal-top">
        <div class="flow-deal-title">
          <span class="icon-badge">${iconStopwatch}</span>
          <div class="flow-deal-title-text">
            <h3>Uang Masuk &amp; Keluar</h3>
            <span class="flow-deal-sub">Ringkasan transaksi</span>
          </div>
        </div>
        <div class="flow-deal-timer">
          <span class="fdt-caption">Reset ringkasan<br>hari ini dalam</span>
          <div class="fdt-boxes">
            <div class="flow-timer-unit"><span class="wcc-box mono" id="flowTimerH">00</span><span class="wcc-label">JAM</span></div>
            <div class="flow-timer-unit"><span class="wcc-box mono" id="flowTimerM">00</span><span class="wcc-label">MNT</span></div>
            <div class="flow-timer-unit"><span class="wcc-box mono" id="flowTimerS">00</span><span class="wcc-label">DTK</span></div>
          </div>
        </div>
      </div>
      <div class="flow-deal-body">
        <div class="flow-deal-tiers">
          ${flowTierCard('today', 'Hari Ini', netToday, t.todayIn, t.todayOut, t.todayInCount + t.todayOutCount, 'todayIn', 'todayOut')}
          ${flowTierCard('month', 'Bulan Ini', t.monthIn - t.monthOut, t.monthIn, t.monthOut, t.monthInCount + t.monthOutCount, 'monthIn', 'monthOut')}
        </div>
      </div>
      <button type="button" class="fc-collapse-btn" id="fcCollapseBtn" title="Sembunyikan ringkasan" aria-label="Sembunyikan ringkasan">
        <span>Ciutkan</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <div class="fc-peek-handle" id="fcPeekHandle">
        <div class="fc-peek-row">
          <div class="fc-peek-info">
            <span class="fc-peek-icon">${iconMiniWallet}</span>
            <div class="fc-peek-text">
              <span class="fc-peek-handle-label">Ringkasan transaksi</span>
              <span class="fc-peek-mini">
                <span class="fc-peek-mini-in">Masuk <b>${fmtRupiahShort(t.todayIn)}</b></span>
                <span class="fc-peek-mini-dot">•</span>
                <span class="fc-peek-mini-out">Keluar <b>${fmtRupiahShort(t.todayOut)}</b></span>
              </span>
            </div>
          </div>
          <span class="fc-peek-handle-btn"><span class="fc-peek-btn-label">Lihat Ringkasan</span><span class="fc-peek-chev"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></span>
        </div>
      </div>
    </div>
  `;


  // Kartu "Sumber Pendapatan" — fitur khusus, berdiri sendiri,
  // TIDAK ikut dijumlahkan ke saldo/pemasukan bulan ini di atas.
  // Ditampilkan sebagai grup 3 kartu sejajar: (1) total + awan logo
  // sumber yang melayang otomatis, (2) aktivitas 7 hari terakhir
  // (animasi masuk bertahap), (3) tren transaksi harian (grafik batang
  // animasi).
  const iconSources = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 6.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5S9.24 10 12 10s5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5"/></svg>`;
  const iconClock = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
  const iconTrend = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><rect x="4.5" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7.5" width="3" height="12.5" rx="1"/><rect x="16.5" y="4" width="3" height="16" rx="1"/></svg>`;
  const iconWalletCard = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3 10h18"/><circle cx="16" cy="14.4" r="1.3" fill="currentColor" stroke="none"/></svg>`;

  // Sumber Pendapatan di kartu beranda kini menampilkan akumulasi
  // SELURUH catatan (semua bulan), bukan cuma bulan berjalan — sesuai
  // label "Total Saldo" di bawah. Tetap berdiri sendiri & tidak pernah
  // ikut dijumlahkan ke Saldo Total utama di banner.
  // Sumber Pendapatan di kartu beranda kini menampilkan akumulasi
  // SELURUH catatan (semua bulan), bukan cuma bulan berjalan — sesuai
  // label "Total Saldo" di bawah. Tetap berdiri sendiri & tidak pernah
  // ikut dijumlahkan ke Saldo Total utama di banner.
  const activeEntries = getIncomeSourceAllEntries();
  const activeTotal = calcIncomeSourceAllTotal();

  // Unit gelembung: bawaannya SATU gelembung per Sumber (gabungan
  // semua platform di dalamnya). Kalau sebuah platform diaktifkan
  // lewat toggle "Aktifkan/Jangan Tampilkan" di baris platform pada
  // modal Rincian Platform (lihat isPlatformBubbleEnabled), platform
  // itu "dipisah" jadi gelembungnya sendiri di beranda, terpisah dari
  // gabungan sumber induknya — nominalnya tetap tercatat & tetap ikut
  // dijumlahkan ke Total Saldo, cuma cara tampil gelembungnya saja
  // yang berbeda.
  const bubbleUnits = {};
  activeEntries.forEach(x => {
    const platform = x.platform || '';
    const splitOut = platform && isPlatformBubbleEnabled(x.source, platform);
    const key = splitOut ? `plat::${x.source}::${platform}` : `src::${x.source}`;
    if (!bubbleUnits[key]) {
      bubbleUnits[key] = { label: splitOut ? platform : x.source, amount: 0, source: x.source, platform: splitOut ? platform : '' };
    }
    bubbleUnits[key].amount += Number(x.amount) || 0;
  });

  // Peringkat gelembung (akumulasi semua waktu) dari yang terbesar,
  // dipakai untuk bubble-bubble "top sumber" pada kartu beranda
  // (lihat catatan redesign di CSS .isc-bubble-stage).
  const rankedSources = Object.values(bubbleUnits).sort((a, b) => b.amount - a.amount);

  // Lencana tren: bandingkan pemasukan bulan ini vs bulan lalu (bukan
  // total keseluruhan), supaya kartu tetap memberi konteks "naik/turun
  // berapa persen" musim ini — terpisah dari angka Total Saldo di atas.
  const currentMonthTotal = calcIncomeSourceMonthTotal();
  const lastMonthTotal = calcIncomeSourceLastMonthTotal();
  let trendBadgeHtml = '';
  if (lastMonthTotal > 0) {
    const pct = ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    const isUp = pct >= 0;
    trendBadgeHtml = `<span class="isc-trend-badge ${isUp ? 'up' : 'down'}">${iconArrow(isUp ? 'up' : 'down', 10)}${Math.abs(pct).toFixed(0)}%</span>`;
  } else if (currentMonthTotal > 0) {
    trendBadgeHtml = '';
  }

  // Semua sumber pendapatan bulan ini tampil sebagai gelembung ikon
  // bulat tanpa border, tersusun rapi berdampingan di panggung statis
  // — tidak lagi dibatasi/diringkas jadi "+N Lainnya"; kalau sumbernya
  // bertambah, semuanya otomatis muncul di sini. Ukuran gelembung tetap
  // proporsional dengan porsi % dari total, wajah gelembung ikon/foto
  // penuh tanpa label persen (nama+nominal baru muncul saat hover).
  const topSources = rankedSources;
  const sourceEmptyHtml = `<div class="isc-float-stage-empty">
        ${iconSources}
        <p>Belum ada pendapatan tercatat.</p>
        <div class="isc-empty-actions">
          <button type="button" class="isc-add-source-btn" id="incomeSourceCardAddIncomeBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Tambah Pendapatan
          </button>
        </div>
      </div>`;
  // Kartu punya lebar tetap (1/3 grup), jadi kalau sumber pendapatan
  // banyak, gelembung dikecilkan bertahap DAN panggungnya berubah jadi
  // "tabung gelembung" — tiap gelembung mengambang naik sendiri-sendiri
  // dari dasar ke puncak lalu "pecah" di atas & muncul lagi dari bawah
  // (loop), bukan lagi satu baris yang digeser rapi ke samping —
  // supaya kartu "Sumber Pendapatan" tetap terasa hidup tanpa terasa
  // seperti carousel/marquee.
  const srcCount = topSources.length;
  const bubbleSize = srcCount > 10 ? 34 : srcCount > 5 ? 40 : 46;
  const useFloat = srcCount > 5;
  // Kolom horizontal tempat gelembung "ditembakkan" naik — dibatasi
  // 3-6 kolom supaya tetap renggang di kartu yang sempit, lalu tiap
  // sumber diberi giliran kolom (round-robin) & "jalur" (lane) supaya
  // yang berbagi kolom yang sama tidak naik barengan.
  const FLOAT_COLS = Math.max(3, Math.min(6, srcCount));
  const RING_R = 46, RING_CIRC = 2 * Math.PI * RING_R;
  const sourceDealsHtml = srcCount
    ? topSources.map((unit, i) => {
        const { label, amount: amt, source, platform } = unit;
        const pct = activeTotal > 0 ? Math.round((amt / activeTotal) * 100) : 0;
        const color = sourceColor(label);
        const iconHtml = platform ? platformIcon(source, platform, getPlatformBuiltinIcon(source, platform)) : sourceIcon(source);
        const ringOffset = (RING_CIRC * (1 - Math.min(pct, 100) / 100)).toFixed(2);
        let extraVars = '';
        let wrapClass = 'isc-bubble-wrap isc-bubble-fade';
        if (useFloat) {
          const col = i % FLOAT_COLS;
          const lane = Math.floor(i / FLOAT_COLS);
          const floatX = FLOAT_COLS > 1 ? (8 + col * (84 / (FLOAT_COLS - 1))).toFixed(1) : '50';
          const duration = (7.5 + (col % 3) * 1.1 + (lane % 2) * 0.7).toFixed(2);
          const delay = (-(lane * duration + col * 0.85)).toFixed(2);
          extraVars = `;--float-x:${floatX}%;--float-duration:${duration}s;--float-delay:${delay}s`;
          wrapClass = 'isc-bubble-wrap isc-bubble-float-item';
        }
        return `
      <div class="${wrapClass}" style="--bubble-size:${bubbleSize}px;--src-color:${color};--fade-delay:${(i % 12) * 55}ms${extraVars}">
        <div class="isc-bubble">
          <svg class="isc-bubble-ring" viewBox="0 0 100 100" aria-hidden="true" style="--ring-circ:${RING_CIRC.toFixed(2)};--ring-offset:${ringOffset}">
            <circle class="isc-ring-track" cx="50" cy="50" r="${RING_R}"/>
            <circle class="isc-ring-fill" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_CIRC.toFixed(2)}"/>
          </svg>
          <button type="button" class="isc-bubble-edit-icon" data-source="${escapeAttr(source)}" data-platform="${escapeAttr(platform)}" title="Ganti ikon" aria-label="Ganti ikon ${escapeAttr(label)}">${pfdEditIconSvg}</button>
          <button type="button" class="isc-bubble-body" data-source="${escapeAttr(source)}" title="${escapeAttr(label)} — ${pct}%">
            <span class="isc-bubble-inner">
              <span class="isc-bubble-face">
                <span class="ibf-icon">${iconHtml}</span>
              </span>
              <span class="isc-bubble-info">
                <span class="ibi-name">${escapeHtml(label)}</span>
                <span class="ibi-amount mono">${fmtRupiah(amt)}</span>
              </span>
            </span>
          </button>
        </div>
      </div>`;
      }).join('')
    : sourceEmptyHtml;
  const stageInnerHtml = sourceDealsHtml;
  const stageClass = useFloat ? 'isc-bubble-stage isc-bubble-float' : 'isc-bubble-stage';
  const stageStyle = '';

  // Tampilan alternatif "Daftar" — fitur tambahan di samping gelembung:
  // tiap sumber jadi satu baris (logo bulat + nama + batang persentase
  // + nominal), diurutkan dari yang terbesar, supaya lebih mudah
  // dibaca & dibandingkan angka pastinya ketimbang cuma lewat ukuran
  // gelembung. Baris tetap bisa diklik (buka rincian platform, pakai
  // class .isc-bubble-body yang sama) & tetap punya tombol "ganti
  // ikon" sendiri (pakai class .isc-bubble-edit-icon yang sama), jadi
  // ditangani oleh listener yang sama persis dengan tampilan gelembung
  // (lihat bindIncomeSourceStripClicks di bawah).
  const sourceListHtml = topSources.length
    ? topSources.map((unit, i) => {
        const { label, amount: amt, source, platform } = unit;
        const pct = activeTotal > 0 ? Math.round((amt / activeTotal) * 100) : 0;
        const color = sourceColor(label);
        const iconHtml = platform ? platformIcon(source, platform, getPlatformBuiltinIcon(source, platform)) : sourceIcon(source);
        const rankHtml = i < 3 ? `<span class="isl-rank">${i + 1}</span>` : '';
        return `
      <div class="isl-row" style="--src-color:${color}">
        <button type="button" class="isl-row-body isc-bubble-body" data-source="${escapeAttr(source)}" title="${escapeAttr(label)} — ${pct}%">
          ${rankHtml}
          <span class="isl-icon">${iconHtml}</span>
          <span class="isl-info">
            <span class="isl-top">
              <span class="isl-name">${escapeHtml(label)}</span>
              <span class="isl-amount mono">${fmtRupiah(amt)}</span>
            </span>
            <span class="isl-bar-track"><span class="isl-bar-fill" style="width:${pct}%"></span></span>
          </span>
          <span class="isl-pct mono">${pct}%</span>
        </button>
        <button type="button" class="isl-edit-btn isc-bubble-edit-icon" data-source="${escapeAttr(source)}" data-platform="${escapeAttr(platform)}" title="Ganti ikon" aria-label="Ganti ikon ${escapeAttr(label)}">${pfdEditIconSvg}</button>
      </div>`;
      }).join('')
    : sourceEmptyHtml;

  const sourceCardHtml = `
    <div class="stat-card stat-special isc-source-card fc-card fade-up" style="animation-delay:60ms">
      <div class="top-row">
        <span class="label">Sumber Pendapatan</span>
        <div class="wallet-head-right">
          <span class="icon-badge special">${iconSources}</span>
        </div>
      </div>
      <div class="wallet-total-line fc-plain isc-total-line-compact">
        <div class="wallet-total-stat">
          <span class="wts-label">Saldo yang telah di cairkan</span>
          <span class="wallet-total-value mono" id="incomeSourceTotalAmount">${fmtRupiah(0)}</span>
        </div>
        ${rankedSources.length ? `<div class="wallet-account-pill" title="${rankedSources.length} sumber aktif"><span class="wap-num mono">${rankedSources.length}</span><span class="wap-label">Sumber</span></div>` : ''}
        ${trendBadgeHtml}
      </div>
      <div class="isc-stage-wrap">
        <div class="isc-stage-viewport" id="incomeSourceViewport">
          <div class="${stageClass}" id="incomeSourceStrip"${stageStyle}>${stageInnerHtml}</div>
        </div>
      </div>
      <div class="isc-card-actions">
        <button type="button" class="isc-view-all-btn" id="incomeSourceViewAllBtn">
          Lihat Semua
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <button type="button" class="isc-add-source-btn" id="incomeSourceCardAddBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Tambah Sumber
        </button>
      </div>
    </div>
  `;

  // Kartu "Aktivitas 7 Hari Terakhir" — kini tampil sebagai strip kartu
  // putih yang bisa digeser ke samping (gaya sama seperti kartu Sumber
  // Pendapatan / Saldo Bank & E-Wallet), bukan daftar memanjang ke bawah.
  const recentEntries = getIncomeSourceRecentEntries(7);
  const recentDealsHtml = recentEntries.length
    ? recentEntries.map((entry, i) => `
      <div class="wallet-deal-card fc-plain${i === 0 && entry.date === todayStr() ? ' is-new-deal' : ''}" style="--w-color:${sourceColor(entry.source)}">
        <div class="wdc-head">
          <div class="wdc-logo">${sourceIcon(entry.source)}</div>
          <span class="wdc-cat">${relativeIncomeDateLabel(entry.date)}</span>
        </div>
        <div class="wdc-name">${escapeHtml(entry.source)}</div>
        <div class="wdc-balance-wrap">
          <div class="wdc-balance mono">+${fmtRupiah(entry.amount)}</div>
          <div class="wdc-hint">Pendapatan</div>
        </div>
      </div>
    `).join('')
    : `<div class="wallet-empty-deals">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>Belum ada aktivitas dalam 7 hari terakhir.</p>
      </div>`;

  const recentCardHtml = `
    <div class="stat-card stat-special isc-recent-card fc-card fade-up" style="animation-delay:120ms">
      <div class="top-row">
        <span class="label">Aktivitas 7 Hari Terakhir</span>
        <div class="wallet-head-right">
          <span class="icon-badge special">${iconClock}</span>
          <div class="wallet-count-chip">
            <span class="wcc-box mono">${recentEntries.length}</span>
            <span class="wcc-label">Item</span>
          </div>
        </div>
      </div>
      <div class="wallet-deals-strip" id="incomeRecentList">${recentDealsHtml}</div>
    </div>
  `;

  const walletCardHtml = renderWalletCardHtml(iconWalletCard, 3);

  const incomeCardHtml = `<div class="income-cards-group">${sourceCardHtml}${recentCardHtml}${walletCardHtml}</div>`;

  const bannerFlowWrap = document.getElementById('bannerFlowWrap');
  if (bannerFlowWrap) bannerFlowWrap.innerHTML = cardsHtml;
  document.getElementById('summaryGrid').innerHTML = incomeCardHtml;
  initFlowDealSettle();
  startFlowResetTimer();
  bindIncomeSourceStripClicks();
  bindIncomeBubbleDrag();
  // bindIncomeSourceViewToggle(); // dinonaktifkan: tombol switch Gelembung/Daftar sudah dihapus dari kartu
  bindIncomeSourceCardAddBtn();
  animateIncomeSourceTotal(activeTotal);
  bindIncomeCardTilt();
  bindWalletCardEvents();
  initFlowTierCharts();
  applyIncomeCardsVisibility();
}

/* Klik salah satu gelembung/baris sumber pendapatan di kartu beranda
   -> buka modal rincian platform (mis. Adsense -> YouTube, Website).
   Listener yang sama dipasang di KEDUA tampilan (gelembung & daftar)
   karena keduanya berbagi class .isc-bubble-body / .isc-bubble-edit-icon
   yang sama persis. Elemennya <button> asli, jadi navigasi keyboard
   (Tab + Enter/Spasi) sudah bekerja otomatis tanpa listener tambahan. */
function bindIncomeSourceStripClicks() {
  const handler = (e) => {
    const editBtn = e.target.closest('.isc-bubble-edit-icon');
    if (editBtn) {
      const platform = editBtn.dataset.platform || '';
      if (platform) openPlatformIconModal(editBtn.dataset.source, platform, platform);
      else openSourceIconModal(editBtn.dataset.source);
      return;
    }
    const card = e.target.closest('.isc-bubble-body');
    if (card) openPlatformDetailModal(card.dataset.source);
  };
  const strip = document.getElementById('incomeSourceStrip');
  if (strip) strip.addEventListener('click', handler);
  const list = document.getElementById('incomeSourceList');
  if (list) list.addEventListener('click', handler);
}

/* Gelembung sumber pendapatan di beranda bisa DITARIK/DIGESER bebas
   pakai kursor (atau jari di layar sentuh) ke posisi mana pun di
   dalam panggungnya — baik saat masih statis berdampingan (≤5 sumber)
   maupun saat sedang mengambang naik (>5 sumber, lihat
   .isc-bubble-float-item). Dipasang lewat Pointer Events (bekerja
   sama untuk mouse & sentuhan) dengan event delegation di panggung
   #incomeSourceStrip, supaya tetap berfungsi walau isinya dirender
   ulang.

   Cara kerja:
   1. pointerdown pada gelembung -> catat posisi awalnya (dikonversi
      jadi koordinat left/top absolute relatif ke panggung).
   2. Gerakan baru dianggap "menarik" (bukan sekadar klik) kalau sudah
      lewat ambang batas beberapa piksel — supaya tap/klik biasa untuk
      buka rincian platform / ganti ikon tetap jalan seperti biasa.
   3. Begitu dianggap menarik: animasi mengambang & entrance-nya
      dihentikan langsung lewat inline style (element.style.animation
      = 'none') supaya tidak "berebut" posisi dengan CSS keyframes,
      lalu posisinya mengikuti kursor/jari penuh.
   4. Saat dilepas, gelembung TETAP diam di titik terakhir ia
      dilepaskan (class .isc-bubble-dropped) — tidak melompat balik ke
      posisi semula maupun lanjut mengambang lagi — dan klik yang
      "menempel" di akhir tarikan itu ditekan supaya tidak sengaja
      membuka modal rincian platform. */
function bindIncomeBubbleDrag() {
  if (bindIncomeBubbleDrag._bound) return;
  bindIncomeBubbleDrag._bound = true;

  const DRAG_THRESHOLD = 5;
  let dragEl = null, dragStage = null, pointerId = null, moved = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function suppressClickOnce(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const wrap = e.target.closest('.isc-bubble-wrap');
    if (!wrap) return;
    const stage = wrap.closest('.isc-bubble-stage');
    if (!stage) return;

    const stageRect = stage.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    dragEl = wrap;
    dragStage = stage;
    pointerId = e.pointerId;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = wrapRect.left - stageRect.left;
    startTop = wrapRect.top - stageRect.top;
    // Belum diaktifkan posisi absolute-nya di sini — baru dipindah
    // beneran begitu gerakannya melewati ambang batas (lihat
    // onPointerMove), supaya tap ringan tanpa gerak tidak mengubah
    // apa pun pada gelembung yang statis.
  }

  function activateDrag() {
    dragEl.style.position = 'absolute';
    dragEl.style.left = startLeft + 'px';
    dragEl.style.top = startTop + 'px';
    dragEl.style.bottom = 'auto';
    dragEl.style.right = 'auto';
    dragEl.style.margin = '0';
    dragEl.style.animation = 'none';
    dragEl.classList.add('isc-bubble-dragging');
    dragEl.classList.remove('isc-bubble-dropped');
    try { dragEl.setPointerCapture(pointerId); } catch (err) {}
  }

  function onPointerMove(e) {
    if (!dragEl || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      activateDrag();
    }
    const stageRect = dragStage.getBoundingClientRect();
    const w = dragEl.offsetWidth, h = dragEl.offsetHeight;
    // Biar gelembung tetap sebagian terlihat, dibatasi tidak sampai
    // lenyap total keluar panggung (masih menyisakan ~35% dirinya).
    const minLeft = -w * 0.35, maxLeft = stageRect.width - w * 0.65;
    const minTop = -h * 0.35, maxTop = stageRect.height - h * 0.65;
    let left = startLeft + dx, top = startTop + dy;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    top = Math.max(minTop, Math.min(maxTop, top));
    dragEl.style.left = left + 'px';
    dragEl.style.top = top + 'px';
  }

  function onPointerUp(e) {
    if (!dragEl || e.pointerId !== pointerId) return;
    const el = dragEl;
    if (moved) {
      el.classList.remove('isc-bubble-dragging');
      el.classList.add('isc-bubble-dropped');
      el.addEventListener('click', suppressClickOnce, { capture: true, once: true });
    }
    try { el.releasePointerCapture(pointerId); } catch (err) {}
    dragEl = null;
    dragStage = null;
    pointerId = null;
    moved = false;
  }

  // Delegasi di document supaya tetap berfungsi walau panggung
  // gelembung (#incomeSourceStrip) dirender ulang berkali-kali
  // (elemen lamanya diganti total tiap kali data pendapatan berubah).
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

/* Toggle tampilan Gelembung <-> Daftar pada kartu "Sumber Pendapatan"
   di beranda — sekarang berpindah lewat SLIDER OTOMATIS yang bergeser
   ke ATAS: panggung yang aktif digeser keluar ke atas sambil panggung
   berikutnya ditarik masuk dari bawah (lihat setIncomeSourceView &
   .isc-pane-sliding di CSS). Tampilan otomatis berganti sendiri tiap
   beberapa detik (lihat startIncomeSourceAutoSlide), berhenti sejenak
   saat kartu disentuh/di-hover, dan tetap bisa dipilih manual lewat
   tombol segmented control — keduanya memakai transisi yang sama.
   Tinggi panggung dikunci sesaat selama animasi (lewat inline style di
   #incomeSourceViewport) supaya kartu "Sumber Pendapatan" TIDAK pernah
   berubah ukuran walau tinggi gelembung & daftar berbeda. Pilihan
   terakhir tetap disimpan ke localStorage (STORAGE_KEY_INCOME_SOURCE_VIEW)
   seperti sebelumnya. */
const INCOME_SOURCE_SLIDE_MS = 520;
const INCOME_SOURCE_AUTO_SLIDE_MS = 5000;
const incomeSourceSlideState = { animating: false, timer: null, resumeTimer: null, paused: false };

function setIncomeSourceView(view, opts = {}) {
  view = view === 'list' ? 'list' : 'bubble';
  const { animate = true, auto = false } = opts;
  const viewport = document.getElementById('incomeSourceViewport');
  const stage = document.getElementById('incomeSourceStrip');
  const list = document.getElementById('incomeSourceList');
  const toggle = document.getElementById('incomeSourceViewToggle');

  if (view === incomeSourceViewMode) {
    if (auto) scheduleIncomeSourceAutoSlide();
    return;
  }
  if (incomeSourceSlideState.animating || !viewport || !stage || !list) return;

  const fromEl = incomeSourceViewMode === 'list' ? list : stage;
  const toEl = view === 'list' ? list : stage;
  incomeSourceViewMode = view;
  persistIncomeSourceView(view);
  if (toggle) {
    toggle.querySelectorAll('button[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
  }

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || prefersReduced) {
    stage.hidden = view === 'list';
    list.hidden = view !== 'list';
    if (auto) scheduleIncomeSourceAutoSlide();
    return;
  }

  incomeSourceSlideState.animating = true;
  const fromH = fromEl.getBoundingClientRect().height;

  toEl.hidden = false;
  toEl.classList.add('isc-pane-sliding', 'isc-pane-enter-from');
  const toH = toEl.getBoundingClientRect().height;
  viewport.style.height = Math.max(fromH, toH) + 'px';

  fromEl.classList.add('isc-pane-sliding');
  void toEl.offsetHeight; // paksa reflow supaya transisi mulai dari posisi awal ini

  requestAnimationFrame(() => {
    fromEl.classList.add('isc-pane-exit-to');
    toEl.classList.remove('isc-pane-enter-from');
    toEl.classList.add('isc-pane-enter-to');
  });

  setTimeout(() => {
    fromEl.hidden = true;
    fromEl.classList.remove('isc-pane-sliding', 'isc-pane-exit-to');
    toEl.classList.remove('isc-pane-sliding', 'isc-pane-enter-to');
    viewport.style.height = '';
    incomeSourceSlideState.animating = false;
    if (auto) scheduleIncomeSourceAutoSlide();
  }, INCOME_SOURCE_SLIDE_MS);
}

function stopIncomeSourceAutoSlide() {
  clearTimeout(incomeSourceSlideState.timer);
  incomeSourceSlideState.timer = null;
  clearTimeout(incomeSourceSlideState.resumeTimer);
}

function scheduleIncomeSourceAutoSlide() {
  clearTimeout(incomeSourceSlideState.timer);
  const viewport = document.getElementById('incomeSourceViewport');
  if (!viewport) return;
  incomeSourceSlideState.timer = setTimeout(() => {
    if (!viewport.isConnected) { stopIncomeSourceAutoSlide(); return; }
    if (incomeSourceSlideState.paused) { scheduleIncomeSourceAutoSlide(); return; }
    const next = incomeSourceViewMode === 'list' ? 'bubble' : 'list';
    setIncomeSourceView(next, { animate: true, auto: true });
  }, INCOME_SOURCE_AUTO_SLIDE_MS);
}

function startIncomeSourceAutoSlide() {
  const viewport = document.getElementById('incomeSourceViewport');
  if (!viewport) return;
  stopIncomeSourceAutoSlide();

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  incomeSourceSlideState.paused = false;
  if (!viewport._autoSlideBound) {
    viewport._autoSlideBound = true;
    const pause = () => { incomeSourceSlideState.paused = true; clearTimeout(incomeSourceSlideState.resumeTimer); };
    const resumeLater = () => {
      clearTimeout(incomeSourceSlideState.resumeTimer);
      incomeSourceSlideState.resumeTimer = setTimeout(() => { incomeSourceSlideState.paused = false; }, 2200);
    };
    viewport.addEventListener('mouseenter', pause);
    viewport.addEventListener('mouseleave', resumeLater);
    viewport.addEventListener('touchstart', pause, { passive: true });
    viewport.addEventListener('touchend', resumeLater, { passive: true });
  }
  scheduleIncomeSourceAutoSlide();
}

function bindIncomeSourceViewToggle() {
  const toggle = document.getElementById('incomeSourceViewToggle');
  if (!toggle) return;
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    const view = btn.dataset.view === 'list' ? 'list' : 'bubble';
    setIncomeSourceView(view, { animate: true, auto: false });
    scheduleIncomeSourceAutoSlide(); // reset jeda otomatis setelah user pilih manual
  });
  startIncomeSourceAutoSlide();
}


/* Tombol "+ Tambah Sumber" langsung di kartu beranda -> buka
   modal yang sama dengan yang dipakai di halaman rincian Sumber
   Pendapatan, supaya user tidak perlu masuk ke halaman detail dulu.
   "Lihat Semua" & chip "+N sumber lainnya" -> buka halaman detail
   penuh (grafik komposisi + tabel riwayat), yang sebelumnya tidak
   punya jalan masuk sama sekali dari UI. Tombol "Tambah Pendapatan"
   pada empty-state -> langsung buka form catat pendapatan. */
function bindIncomeSourceCardAddBtn() {
  const addSourceBtn = document.getElementById('incomeSourceCardAddBtn');
  if (addSourceBtn) addSourceBtn.addEventListener('click', openCustomSourceModal);

  const addIncomeBtn = document.getElementById('incomeSourceCardAddIncomeBtn');
  if (addIncomeBtn) addIncomeBtn.addEventListener('click', openIncomeModal);

  const viewAllBtn = document.getElementById('incomeSourceViewAllBtn');
  if (viewAllBtn) viewAllBtn.addEventListener('click', openIncomeSourcePage);
}

/* ==========================================================
   MODAL GANTI IKON SUMBER PENDAPATAN
   Dipicu tombol pensil kecil di pojok tiap bubble kartu "Sumber
   Pendapatan" (lihat .isc-bubble-edit-icon di CSS & klik yang
   ditangkap di bindIncomeSourceStripClicks). Menyimpan ikon kustom
   per sumber ke sourceIconOverrides (localStorage), dipakai otomatis
   di mana pun sourceIcon() dipanggil — bubble beranda, strip
   aktivitas 7 hari, & modal rincian platform — tanpa perlu diubah
   satu-satu di tempat lain. */
const sourceIconModal = document.getElementById('sourceIconModalOverlay');
let sourceIconModalSourceName = null;
let sourceIconModalData = null; // data-URL sementara di modal ini; null = pakai ikon bawaan

function renderSourceIconModalPreview() {
  const preview = document.getElementById('sourceIconPhotoPreview');
  const removeBtn = document.getElementById('btnRemoveSourceIcon');
  const headIcon = document.getElementById('sourceIconModalPreview');
  if (!preview) return;
  const fallbackIcon = sourceIconModalSourceName
    ? (INCOME_SOURCE_ICONS[sourceIconModalSourceName] || sourceInitialBadge(sourceIconModalSourceName))
    : INCOME_SOURCE_ICON_DEFAULT;
  const previewHtml = sourceIconModalData ? `<img src="${sourceIconModalData}" alt="Pratinjau ikon">` : fallbackIcon;
  preview.innerHTML = previewHtml;
  if (removeBtn) removeBtn.style.display = sourceIconModalData ? 'inline-flex' : 'none';
  if (headIcon) {
    headIcon.style.setProperty('--w-color', sourceIconModalSourceName ? sourceColor(sourceIconModalSourceName) : '');
    headIcon.innerHTML = previewHtml;
  }
}

function openSourceIconModal(sourceName) {
  if (!sourceName || !sourceIconModal) return;
  sourceIconModalSourceName = sourceName;
  sourceIconModalData = sourceIconOverrides[sourceName] || null;
  const subEl = document.getElementById('sourceIconModalSub');
  if (subEl) subEl.textContent = `Untuk sumber "${sourceName}"`;
  const fileInput = document.getElementById('sourceIconPhotoInput');
  if (fileInput) fileInput.value = '';
  renderSourceIconModalPreview();
  openModal(sourceIconModal);
}

function handleSourceIconFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran ikon maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => { sourceIconModalData = reader.result; renderSourceIconModalPreview(); };
  reader.onerror = () => showToast('Gagal membaca gambar.', 'err');
  reader.readAsDataURL(file);
}

if (sourceIconModal) {
  const sourceIconInput = document.getElementById('sourceIconPhotoInput');
  if (sourceIconInput) {
    sourceIconInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleSourceIconFile(file);
    });
  }
  const removeSourceIconBtn = document.getElementById('btnRemoveSourceIcon');
  if (removeSourceIconBtn) {
    removeSourceIconBtn.addEventListener('click', () => {
      sourceIconModalData = null;
      if (sourceIconInput) sourceIconInput.value = '';
      renderSourceIconModalPreview();
    });
  }
  // Tarik & lepas gambar langsung ke area pemilih, sama seperti pemilih
  // logo bank/e-wallet.
  const sourceIconDrop = document.getElementById('sourceIconPhotoDrop');
  if (sourceIconDrop) {
    ['dragenter', 'dragover'].forEach(evt => {
      sourceIconDrop.addEventListener(evt, (e) => {
        e.preventDefault(); e.stopPropagation();
        sourceIconDrop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'dragend'].forEach(evt => {
      sourceIconDrop.addEventListener(evt, (e) => {
        e.preventDefault(); e.stopPropagation();
        sourceIconDrop.classList.remove('is-dragover');
      });
    });
    sourceIconDrop.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      sourceIconDrop.classList.remove('is-dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleSourceIconFile(file);
    });
  }
  const saveSourceIconBtn = document.getElementById('btnSourceIconSave');
  if (saveSourceIconBtn) {
    saveSourceIconBtn.addEventListener('click', () => {
      if (!sourceIconModalSourceName) { closeModal(sourceIconModal); return; }
      if (sourceIconModalData) sourceIconOverrides[sourceIconModalSourceName] = sourceIconModalData;
      else delete sourceIconOverrides[sourceIconModalSourceName];
      persistSourceIconOverrides();
      closeModal(sourceIconModal);
      showToast('Ikon sumber disimpan.', 'ok');
      renderSummary();
    });
  }
  const cancelSourceIconBtn = document.getElementById('btnSourceIconCancel');
  if (cancelSourceIconBtn) cancelSourceIconBtn.addEventListener('click', () => closeModal(sourceIconModal));
  const closeSourceIconBtn = document.getElementById('sourceIconModalCloseBtn');
  if (closeSourceIconBtn) closeSourceIconBtn.addEventListener('click', () => closeModal(sourceIconModal));
}

/* ==========================================================
   MODAL GANTI IKON PLATFORM (per baris di modal Rincian Platform)
   Sama seperti Ganti Ikon Sumber di atas, tapi untuk satu platform
   spesifik (mis. "Facebook Ads") di dalam satu sumber (mis. "Meta").
   Dipicu pensil kecil di pojok ikon tiap baris platform (lihat
   .pfd-row-icon-edit di CSS & listener pfdPlatformList). Menyimpan
   ikon kustom ke platformIconOverrides (localStorage), dipakai
   otomatis lewat platformIcon() di mana pun baris platform tsb
   ditampilkan. Modal ini tertumpuk di atas modal Rincian Platform
   (tidak menutupnya), lalu me-render ulang daftar baris setelah
   disimpan supaya ikon barunya langsung terlihat. */
const platformIconModal = document.getElementById('platformIconModalOverlay');
let platformIconModalSource = null;
let platformIconModalPlatform = null;
let platformIconModalFallback = null; // ikon bawaan platform tsb, dipakai kalau tak ada unggahan
let platformIconModalData = null; // data-URL sementara di modal ini; null = pakai ikon bawaan

function renderPlatformIconModalPreview() {
  const preview = document.getElementById('platformIconPhotoPreview');
  const removeBtn = document.getElementById('btnRemovePlatformIcon');
  const headIcon = document.getElementById('platformIconModalPreview');
  if (!preview) return;
  const fallbackIcon = platformIconModalFallback || PLATFORM_ICON_LIB.sparkle;
  const previewHtml = platformIconModalData ? `<img src="${platformIconModalData}" alt="Pratinjau ikon">` : fallbackIcon;
  preview.innerHTML = previewHtml;
  if (removeBtn) removeBtn.style.display = platformIconModalData ? 'inline-flex' : 'none';
  if (headIcon) {
    headIcon.style.setProperty('--w-color', platformIconModalSource ? sourceColor(platformIconModalSource) : '');
    headIcon.innerHTML = previewHtml;
  }
}

function openPlatformIconModal(source, platform, label) {
  if (!source || !platform || !platformIconModal) return;
  platformIconModalSource = source;
  platformIconModalPlatform = platform;
  const info = getAllPlatformsForSource(source).find(p => p.name === platform);
  platformIconModalFallback = info ? info.icon : PLATFORM_ICON_LIB.sparkle;
  platformIconModalData = platformIconOverrides[platformIconKey(source, platform)] || null;
  const subEl = document.getElementById('platformIconModalSub');
  if (subEl) subEl.textContent = `Untuk platform "${label || platform}" (${source})`;
  const fileInput = document.getElementById('platformIconPhotoInput');
  if (fileInput) fileInput.value = '';
  renderPlatformIconModalPreview();
  openModal(platformIconModal);
}

function handlePlatformIconFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran ikon maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => { platformIconModalData = reader.result; renderPlatformIconModalPreview(); };
  reader.onerror = () => showToast('Gagal membaca gambar.', 'err');
  reader.readAsDataURL(file);
}

if (platformIconModal) {
  const platformIconInput = document.getElementById('platformIconPhotoInput');
  if (platformIconInput) {
    platformIconInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handlePlatformIconFile(file);
    });
  }
  const removePlatformIconBtn = document.getElementById('btnRemovePlatformIcon');
  if (removePlatformIconBtn) {
    removePlatformIconBtn.addEventListener('click', () => {
      platformIconModalData = null;
      if (platformIconInput) platformIconInput.value = '';
      renderPlatformIconModalPreview();
    });
  }
  const platformIconDrop = document.getElementById('platformIconPhotoDrop');
  if (platformIconDrop) {
    ['dragenter', 'dragover'].forEach(evt => {
      platformIconDrop.addEventListener(evt, (e) => {
        e.preventDefault(); e.stopPropagation();
        platformIconDrop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'dragend'].forEach(evt => {
      platformIconDrop.addEventListener(evt, (e) => {
        e.preventDefault(); e.stopPropagation();
        platformIconDrop.classList.remove('is-dragover');
      });
    });
    platformIconDrop.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      platformIconDrop.classList.remove('is-dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handlePlatformIconFile(file);
    });
  }
  const savePlatformIconBtn = document.getElementById('btnPlatformIconSave');
  if (savePlatformIconBtn) {
    savePlatformIconBtn.addEventListener('click', () => {
      if (!platformIconModalSource || !platformIconModalPlatform) { closeModal(platformIconModal); return; }
      const key = platformIconKey(platformIconModalSource, platformIconModalPlatform);
      if (platformIconModalData) platformIconOverrides[key] = platformIconModalData;
      else delete platformIconOverrides[key];
      persistPlatformIconOverrides();
      closeModal(platformIconModal);
      showToast('Ikon platform disimpan.', 'ok');
      if (currentAdSource && currentAdSource === platformIconModalSource && currentAdPlatform === platformIconModalPlatform) {
        document.getElementById('adIcon').innerHTML = platformIcon(currentAdSource, currentAdPlatform, platformIconModalFallback);
      }
      if (currentPfdSource) openPlatformDetailModal(currentPfdSource);
    });
  }
  const cancelPlatformIconBtn = document.getElementById('btnPlatformIconCancel');
  if (cancelPlatformIconBtn) cancelPlatformIconBtn.addEventListener('click', () => closeModal(platformIconModal));
  const closePlatformIconBtn = document.getElementById('platformIconModalCloseBtn');
  if (closePlatformIconBtn) closePlatformIconBtn.addEventListener('click', () => closeModal(platformIconModal));
}

/* ==========================================================
   GRAFIK GARIS ANIMASI — KARTU TIER "HARI INI" & "BULAN INI"
   Menggantikan baris angka Masuk/Keluar statis dengan grafik tren
   saldo bersih harian: kartu "Hari Ini" menampilkan 7 hari terakhir
   (hari ini jadi titik paling kanan), kartu "Bulan Ini" menampilkan
   tiap hari sepanjang bulan berjalan. Garis "tumbuh" dari kiri ke
   kanan saat pertama render, titik terbaru berdenyut halus (live),
   dan saat kursor/sentuhan diarahkan ke grafik muncul crosshair +
   tooltip berisi Masuk/Keluar/Saldo pada titik tsb.
========================================================== */
function buildFlowTierSeries(range) {
  if (range === 'today') {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(localDateStr(d));
    }
    const today = todayStr();
    return days.map(d => {
      const inV = transactions.filter(tr => tr.date === d && tr.type === 'masuk').reduce((s, tr) => s + (Number(tr.amount) || 0), 0);
      const outV = transactions.filter(tr => tr.date === d && tr.type === 'keluar').reduce((s, tr) => s + (Number(tr.amount) || 0), 0);
      return {
        label: new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }),
        in: inV, out: outV, net: inV - outV, isCurrent: d === today
      };
    });
  }
  const month = thisMonthStr();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const todayNum = Number(todayStr().slice(8, 10));
  return Array.from({ length: daysInMonth }, (_, i) => i + 1).map(n => {
    const dateStr = `${month}-${String(n).padStart(2, '0')}`;
    const inV = transactions.filter(tr => tr.date === dateStr && tr.type === 'masuk').reduce((s, tr) => s + (Number(tr.amount) || 0), 0);
    const outV = transactions.filter(tr => tr.date === dateStr && tr.type === 'keluar').reduce((s, tr) => s + (Number(tr.amount) || 0), 0);
    return {
      label: `${n} ${new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short' })}`,
      in: inV, out: outV, net: inV - outV, isCurrent: n === todayNum
    };
  });
}

function initFlowTierCharts() {
  setupFlowTierChart(document.getElementById('ftcChart_today'), buildFlowTierSeries('today'));
  setupFlowTierChart(document.getElementById('ftcChart_month'), buildFlowTierSeries('month'));
}

function setupFlowTierChart(canvas, series) {
  if (!canvas || !series.length) return;
  const wrap = canvas.parentElement;
  const tooltip = wrap.querySelector('.ftc-chart-tooltip');
  const liveDotIn = wrap.querySelector('.ftc-live-dot.in');
  const liveDotOut = wrap.querySelector('.ftc-live-dot.out');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLOR_IN = '#059669';
  const COLOR_OUT = '#E11D48';

  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth || 200;
  const h = wrap.clientHeight || 74;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padL = 4, padR = 4, padT = 10, padB = 6;
  const chartW = w - padL - padR, chartH = h - padT - padB;
  const n = series.length;
  const allVals = series.flatMap(s => [s.in, s.out]);
  let maxV = Math.max(1, ...allVals);
  const minV = 0;
  const range = maxV - minV;

  function toPts(key) {
    return series.map((s, i) => ({
      x: n > 1 ? padL + (chartW * i) / (n - 1) : padL + chartW / 2,
      y: padT + chartH - ((s[key] - minV) / range) * chartH,
      ...s
    }));
  }
  const ptsIn = toPts('in');
  const ptsOut = toPts('out');
  const lastIn = ptsIn[ptsIn.length - 1];
  const lastOut = ptsOut[ptsOut.length - 1];

  if (liveDotIn) { liveDotIn.style.left = lastIn.x + 'px'; liveDotIn.style.top = lastIn.y + 'px'; liveDotIn.style.setProperty('--dot-color', COLOR_IN); }
  if (liveDotOut) { liveDotOut.style.left = lastOut.x + 'px'; liveDotOut.style.top = lastOut.y + 'px'; liveDotOut.style.setProperty('--dot-color', COLOR_OUT); }

  function smoothPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(cx, p0.y, cx, p1.y, p1.x, p1.y);
    }
  }

  function drawLine(pts, color, hoverIdx) {
    // area gradien tipis di bawah garis
    smoothPath(pts);
    ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
    ctx.lineTo(pts[0].x, padT + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, color + '26');
    grad.addColorStop(1, color + '02');
    ctx.fillStyle = grad;
    ctx.fill();

    // garis utama
    smoothPath(pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // titik-titik data
    pts.forEach((p, i) => {
      const isLast = i === pts.length - 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isLast ? 3 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = isLast ? color : '#fff';
      ctx.fill();
      if (!isLast) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    });

    // titik highlight saat hover
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < pts.length) {
      const p = pts[hoverIdx];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }

  function paint(clipW, hoverIdx) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(0, clipW), h);
    ctx.clip();

    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < ptsIn.length) {
      const x = ptsIn[hoverIdx].x;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(19,26,42,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Keluar digambar dulu (di belakang), Masuk di atas supaya garis
    // hijau tetap terlihat jelas saat dua garis berpotongan.
    drawLine(ptsOut, COLOR_OUT, hoverIdx);
    drawLine(ptsIn, COLOR_IN, hoverIdx);

    ctx.restore();
  }

  function showTooltip(idx, x, y) {
    const s = series[idx];
    tooltip.innerHTML = `
      <div class="ftc-tt-date">${escapeHtml(s.label)}${s.isCurrent ? ' · hari ini' : ''}</div>
      <div class="ftc-tt-row"><span class="lbl">Masuk</span><span class="val in">+${fmtRupiah(s.in)}</span></div>
      <div class="ftc-tt-row"><span class="lbl">Keluar</span><span class="val out">-${fmtRupiah(s.out)}</span></div>
    `;
    tooltip.style.opacity = '1';
    // FIX popup terpotong: sebelumnya lebar tooltip ditebak tetap
    // (138px) untuk hitung posisi, padahal untuk nominal besar
    // (mis. "Rp 350.001.000") lebar ASLI tooltip bisa lebih dari
    // itu — sehingga ia nongol melewati tepi kartu tier yang sempit
    // dan bagian yang lewat batas ikut kepotong oleh overflow:hidden
    // kartu (lihat .flow-tier-card). Sekarang lebar & tinggi diukur
    // LANGSUNG dari elemen setelah kontennya dipasang (offsetWidth/
    // offsetHeight), dan CSS .ftc-chart-tooltip juga dibatasi
    // max-width:100% dari area grafik supaya baris Masuk/Keluar turun
    // ke bawah alih-alih meluber kalau memang tidak muat di kartu
    // yang sangat sempit — jadi penempatan & ukurannya selalu
    // menyesuaikan kartu di semua ukuran layar, tidak ada yang
    // tertutup/terpotong lagi.
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;
    let left = x + 12;
    if (left + ttWidth > w) left = x - ttWidth - 12;
    left = Math.min(Math.max(2, left), Math.max(2, w - ttWidth - 2));
    let top = y - 58;
    top = Math.min(Math.max(0, top), Math.max(0, h - ttHeight));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function pointerMove(clientX) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    let idx = 0, best = Infinity;
    ptsIn.forEach((p, i) => {
      const d = Math.abs(p.x - mx);
      if (d < best) { best = d; idx = i; }
    });
    paint(w, idx);
    const topY = Math.min(ptsIn[idx].y, ptsOut[idx].y);
    showTooltip(idx, ptsIn[idx].x, topY);
    wrap.classList.add('active');
  }
  function pointerLeave() {
    paint(w, null);
    tooltip.style.opacity = '0';
    wrap.classList.remove('active');
  }

  function bindInteraction() {
    canvas.onmousemove = (e) => pointerMove(e.clientX);
    canvas.onmouseleave = pointerLeave;
    canvas.ontouchstart = (e) => { if (e.touches[0]) pointerMove(e.touches[0].clientX); };
    canvas.ontouchmove = (e) => { if (e.touches[0]) { e.preventDefault(); pointerMove(e.touches[0].clientX); } };
    canvas.ontouchend = pointerLeave;
  }

  if (reduceMotion) {
    paint(w, null);
    bindInteraction();
    return;
  }

  const start = performance.now();
  const duration = 850;
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    paint(w * eased, null);
    if (p < 1) requestAnimationFrame(frame);
    else bindInteraction();
  }
  requestAnimationFrame(frame);
}



/* Rotasi/animasi otomatis kartu "Sumber Pendapatan": seluruh logo
   sumber ditampilkan sekaligus sebagai "awan" ikon yang melayang &
   berpendar terus-menerus lewat CSS (@keyframes iscOrbFloat /
   iscGlowPulse) — tidak perlu diatur lewat JS interval lagi karena
   tiap orb sudah punya animasi masing-masing dari style inline
   --od/--ov saat dirender (lihat renderSummary). */
function getActiveIncomeSourceNames(mode) {
  const entries = mode === 'day' ? getIncomeSourceDayEntries() : getIncomeSourceMonthEntries();
  const seen = new Set();
  entries.forEach(x => seen.add(x.source));
  return getAllIncomeSourceNames().filter(name => seen.has(name));
}

/* Angka total kartu "Sumber Pendapatan" tumbuh dari 0 (count-up) setiap
   kali dirender, biar terasa hidup. */
let incomeTotalAnimFrame = null;
function animateIncomeSourceTotal(target) {
  const el = document.getElementById('incomeSourceTotalAmount');
  if (!el) return;
  cancelAnimationFrame(incomeTotalAnimFrame);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !target) {
    el.textContent = fmtRupiah(target);
    return;
  }
  const duration = 850;
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtRupiah(target * eased);
    if (p < 1) incomeTotalAnimFrame = requestAnimationFrame(tick);
    else el.textContent = fmtRupiah(target);
  })(performance.now());
}

/* Efek miring 3D halus (perspective tilt) saat kursor bergerak di atas
   salah satu dari 3 kartu Sumber Pendapatan / Aktivitas / Tren, supaya
   kartunya terasa lebih hidup & premium. Dilewati kalau perangkat
   mengaktifkan preferensi "reduce motion". */
function bindIncomeCardTilt() {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.income-cards-group .stat-card').forEach(card => {
    if (reduceMotion) return;
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-py * 4.5).toFixed(2)}deg) rotateY(${(px * 4.5).toFixed(2)}deg) translateY(-5px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

function iconArrow(dir, size = 15) {
  if (dir === 'up') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="8 7 17 7 17 16"/></svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 8 17 17 8 17"/></svg>`;
}

/* ---- Ikon panah pada pil status "Masuk"/"Keluar" di tiap baris riwayat
   transaksi (.rw-status-pill) -- SEBELUMNYA cuma karakter unicode "↓"/"↑"
   polos lewat CSS ::before (lihat komentar di index.html dekat
   .rw-status-pill), yang tampilannya tipis & gepeng, kurang senada
   dengan bentuk pil bulat di sekelilingnya. Diganti jadi ikon panah
   BULAT DALAM LINGKARAN kecil (bulatan solid + panah putih di
   dalamnya) yang senada dgn gaya "badge" pil, bukan cuma tanda panah
   mengambang seperti sebelumnya. Warnanya otomatis ikut warna teks pil
   (currentColor) via fill="currentColor" pada lingkarannya, dan panah
   putih tetap kontras di dalamnya. ---- */
function statusPillIcon(isIn) {
  const arrow = isIn
    ? '<line x1="8.6" y1="8.6" x2="15.4" y2="15.4"/><polyline points="15.4 9.4 15.4 15.4 9.4 15.4"/>'
    : '<line x1="8.6" y1="15.4" x2="15.4" y2="8.6"/><polyline points="9.4 8.6 15.4 8.6 15.4 14.6"/>';
  return `<svg class="rw-status-pill-ic" width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="currentColor"/><g stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${arrow}</g></svg>`;
}

/* ==========================================================
   CHART — komposisi transaksi bulan ini (grafik donat)
   Digambar langsung dengan Canvas API bawaan browser (tanpa
   library eksternal), sehingga tidak pernah gagal dimuat
   walau koneksi ke CDN pihak ketiga terblokir.
========================================================== */
const CHART_PALETTE = ['#2563EB', '#0F9D6C', '#D97706', '#DC2626', '#0891B2', '#7C3AED', '#64748B', '#DB2777', '#65A30D', '#4F46E5', '#0D9488', '#B45309'];

function categoryColor(cat) {
  let hash = 0;
  const str = String(cat || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length];
}

/* ---- Ikon per kategori transaksi (dipakai di ikon kiri tiap baris
   riwayat/struk -- .rw-item-ic & .receipt-detail-ic -- yg SEBELUMNYA
   cuma panah naik/turun generik lewat iconArrow(), jadi semua kategori
   Makanan/Transportasi/Gaji/dst kelihatan sama persis, cuma beda warna.
   Sekarang tiap kategori bawaan (lihat daftar CATEGORIES di atas) dpt
   ikon line-svg sendiri yg mewakili maknanya (dompet gaji, keranjang
   belanja, dst), gaya (stroke bulat, tanpa isi) DISAMAKAN dgn iconArrow
   & ikon lain di app spy senada. Kategori custom/tak dikenal (di luar
   daftar) tetap jatuh ke panah naik/turun lama sbg fallback aman. ---- */
const CATEGORY_ICON_PATHS = {
  'gaji': '<rect x="3" y="7" width="18" height="13" rx="2.4"/><path d="M8 7V5.6A2.6 2.6 0 0 1 10.6 3h2.8A2.6 2.6 0 0 1 16 5.6V7"/><path d="M3 12h18"/>',
  'bonus': '<path d="M12 3v18M7.5 6.2c-1.7 0-3-1-3-2.4S6 1.4 8 2.4c1.8 1 3 3.4 4 4.4 1-1 2.2-3.4 4-4.4 2-1 3.5.4 3.5 1.4s-1.3 2.4-3 2.4"/><path d="M4 11h16v3.5a5.5 5.5 0 0 1-5.5 5.5h-5A5.5 5.5 0 0 1 4 14.5V11Z"/>',
  'penjualan': '<path d="M3 7h18l-1.6 11.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 7Z"/><path d="M8 7V6a4 4 0 0 1 8 0v1"/>',
  'investasi': '<path d="M4 19V9M10 19V5M16 19v-7M4 19h16"/><path d="M13 5.5 16 4l2 2.5"/>',
  'hadiah': '<rect x="3.5" y="9.5" width="17" height="11" rx="1.6"/><path d="M3.5 9.5h17M12 9.5V21M12 9.5c-1.3-3-3-4.6-4.7-4.6a2 2 0 1 0 0 4.6M12 9.5c1.3-3 3-4.6 4.7-4.6a2 2 0 1 1 0 4.6"/>',
  'makanan': '<path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v9M9 3v7M9 12v9"/><path d="M16 3c-1.4 0-2.5 2-2.5 5.4 0 2 .7 3.2 1.7 3.8V21"/>',
  'transportasi': '<path d="M5 16V9.4a2 2 0 0 1 1.3-1.9L8 6.8a2 2 0 0 1 .7-.13h6.6a2 2 0 0 1 .7.13l1.7.7A2 2 0 0 1 19 9.4V16"/><path d="M5 16h14v2.4a1.1 1.1 0 0 1-1.1 1.1H16a1.1 1.1 0 0 1-1.1-1.1V17H9.1v1.4A1.1 1.1 0 0 1 8 19.5H6.1A1.1 1.1 0 0 1 5 18.4V16Z"/><circle cx="8" cy="16" r="0.01"/><circle cx="16" cy="16" r="0.01"/>',
  'belanja': '<path d="M6.5 8h11l1 12.2a1.8 1.8 0 0 1-1.8 2H7.3a1.8 1.8 0 0 1-1.8-2L6.5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  'tagihan': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  'hiburan': '<rect x="3" y="5" width="18" height="13" rx="2.2"/><path d="M10.2 8.7v4.6l4-2.3-4-2.3Z"/>',
  'kesehatan': '<path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.4 4.4 0 0 1 8-2.6h1.6a4.4 4.4 0 0 1 8 2.6Z"/><path d="M9 11h2l1-2 2 4 1-2h2"/>',
  'pendidikan': '<path d="M12 4 2 8.4l10 4.4 10-4.4L12 4Z"/><path d="M6.4 10.6v4.7c0 1.4 2.5 3.1 5.6 3.1s5.6-1.7 5.6-3.1v-4.7"/><path d="M22 8.4v6"/>',
  'lainnya': '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
};
function categoryIcon(cat, isIn, size = 15) {
  const key = String(cat || '').trim().toLowerCase();
  const paths = CATEGORY_ICON_PATHS[key];
  if (!paths) return iconArrow(isIn ? 'down' : 'up', size);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
let chartResizeBound = false;
let lastChartDataset = null; // { labels, values, colors, total }
let chartAnimFrame = null;

function setChartTotalChip(total) {
  const el = document.getElementById('chartTotalValue');
  if (el) el.textContent = fmtRupiah(total || 0);
}

function ensureChartCenter(wrap) {
  let el = wrap.querySelector('.chart-center');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-center';
    el.innerHTML = '<span class="cc-label">Total</span><span class="cc-value"></span>';
    wrap.appendChild(el);
  }
  return el;
}

let chartHighlightIndex = -1;

function renderChart() {
  const chartWrap = document.querySelector('.chart-wrap');
  const legendWrap = document.getElementById('chartLegend');
  if (!chartWrap || !legendWrap) return;

  try {
    const month = thisMonthStr();
    const byCategory = {};
    transactions.forEach(t => {
      if (!t.date || t.date.slice(0, 7) !== month) return;
      const val = Number(t.amount) || 0;
      byCategory[t.category] = (byCategory[t.category] || 0) + val;
    });

    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      lastChartDataset = null;
      chartHighlightIndex = -1;
      chartWrap.innerHTML = '<canvas id="trendChart"></canvas>';
      setChartTotalChip(0);
      legendWrap.innerHTML = `<div class="chart-empty">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>Belum ada transaksi bulan ini untuk ditampilkan.</p>
      </div>`;
      return;
    }

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const colors = labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);
    const total = values.reduce((a, b) => a + b, 0);

    if (!document.getElementById('trendChart')) {
      chartWrap.innerHTML = '<canvas id="trendChart"></canvas>';
    }

    chartHighlightIndex = -1;
    lastChartDataset = { labels, values, colors, total };
    drawDonutChart(true);
    setupChartInteractions();

    setChartTotalChip(total);
    const centerEl = ensureChartCenter(chartWrap);
    centerEl.querySelector('.cc-value').textContent = fmtRupiah(total);

    legendWrap.innerHTML = labels.map((label, i) => {
      const pct = Math.round(values[i] / total * 100);
      return `
        <div class="legend-item" data-catidx="${i}">
          <div class="legend-item-top">
            <span class="legend-left">
              <span class="legend-rank" style="background:${colors[i]}">${i + 1}</span>
              <span class="legend-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            </span>
            <span class="legend-right">
              <span class="legend-pct">${pct}%</span>
            </span>
          </div>
          <div class="legend-bar-track"><div class="legend-bar-fill" data-barfill style="background:${colors[i]}"></div></div>
          <div class="legend-amount mono">${fmtRupiah(values[i])}</div>
        </div>`;
    }).join('');

    // Animasikan progress bar mini setelah elemen ter-render (mulai dari 0 lalu isi).
    requestAnimationFrame(() => {
      legendWrap.querySelectorAll('[data-barfill]').forEach((bar, i) => {
        const pct = Math.round(values[i] / total * 100);
        bar.style.width = Math.max(pct, 3) + '%';
      });
    });

    legendWrap.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        chartHighlightIndex = Number(item.dataset.catidx);
        item.classList.add('is-active');
        drawDonutChart(false);
      });
      item.addEventListener('mouseleave', () => {
        chartHighlightIndex = -1;
        item.classList.remove('is-active');
        drawDonutChart(false);
      });
    });

    setupChartLegendScrollHint();

  } catch (err) {
    console.error('Gagal merender grafik:', err);
    legendWrap.innerHTML = `<div class="chart-empty">
      <p>Grafik tidak dapat ditampilkan. Silakan muat ulang halaman.</p>
    </div>`;
  }
}

// Menampilkan gradasi fade di bawah daftar legend saat masih ada item yang
// belum terlihat (bisa di-scroll), supaya lebih jelas di layar kecil.
function updateChartLegendScrollHint() {
  const legendWrap = document.getElementById('chartLegend');
  const outerWrap = document.getElementById('chartLegendWrap');
  if (!legendWrap || !outerWrap) return;
  const hasMore = legendWrap.scrollHeight - legendWrap.scrollTop - legendWrap.clientHeight > 4;
  outerWrap.classList.toggle('has-more-scroll', hasMore);
}

let chartLegendScrollHintBound = false;
function setupChartLegendScrollHint() {
  const legendWrap = document.getElementById('chartLegend');
  if (!legendWrap) return;
  updateChartLegendScrollHint();
  if (!chartLegendScrollHintBound) {
    legendWrap.addEventListener('scroll', updateChartLegendScrollHint, { passive: true });
    window.addEventListener('resize', () => setTimeout(updateChartLegendScrollHint, 60));
    chartLegendScrollHintBound = true;
  }
}

function getChartCanvas() {
  return document.getElementById('trendChart');
}

function drawDonutChart(animate) {
  const canvas = getChartCanvas();
  const data = lastChartDataset;
  if (!canvas || !data) return;

  const wrap = canvas.parentElement;
  const rectSize = Math.min(wrap.clientWidth, wrap.clientHeight) || 200;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rectSize * dpr;
  canvas.height = rectSize * dpr;
  canvas.style.width = rectSize + 'px';
  canvas.style.height = rectSize + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = rectSize / 2, cy = rectSize / 2;
  const outerR = rectSize / 2 - 3;
  const innerR = outerR * 0.66;
  const gap = data.values.length > 1 ? 0.02 : 0;

  cancelAnimationFrame(chartAnimFrame);

  // Precompute stable cumulative fractions so partial-progress animation doesn't
  // shift segment start positions.
  const cumStarts = [];
  let running = 0;
  data.values.forEach(v => { cumStarts.push(running); running += v / data.total; });

  function paintFrame(progress) {
    ctx.clearRect(0, 0, rectSize, rectSize);
    const hasHighlight = chartHighlightIndex >= 0 && chartHighlightIndex < data.values.length;
    data.values.forEach((v, i) => {
      const frac = v / data.total;
      const start = cumStarts[i];
      const isHi = hasHighlight && i === chartHighlightIndex;
      const segOuterR = isHi ? outerR + Math.max(3, rectSize * 0.02) : outerR;
      const a0 = (-Math.PI / 2) + start * Math.PI * 2 + gap / 2;
      const a1 = (-Math.PI / 2) + (start + frac) * Math.PI * 2 * progress + gap / 2 - gap;
      const a1safe = Math.max(a0, a1);
      if (progress <= 0) return;
      ctx.beginPath();
      ctx.arc(cx, cy, segOuterR, a0, a1safe);
      ctx.arc(cx, cy, innerR, a1safe, a0, true);
      ctx.closePath();
      ctx.globalAlpha = hasHighlight && !isHi ? 0.35 : 1;
      ctx.fillStyle = data.colors[i];
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Label persentase pada tiap potongan (hanya jika cukup lebar & animasi selesai)
    if (progress > 0.92) {
      data.values.forEach((v, i) => {
        const frac = v / data.total;
        if (frac < 0.06) return; // terlalu sempit untuk teks
        const start = cumStarts[i];
        const midAngle = (-Math.PI / 2) + (start + frac / 2) * Math.PI * 2;
        const labelR = (outerR + innerR) / 2;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        const pct = Math.round(frac * 100);
        ctx.font = '600 ' + Math.max(10, Math.round(rectSize * 0.055)) + 'px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 3;
        ctx.fillText(pct + '%', lx, ly);
        ctx.shadowBlur = 0;
      });
    }
  }

  if (!animate) {
    paintFrame(1);
    return;
  }

  const duration = 600;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    paintFrame(eased);
    if (p < 1) chartAnimFrame = requestAnimationFrame(tick);
  }
  chartAnimFrame = requestAnimationFrame(tick);
}

function setupChartInteractions() {
  const canvas = getChartCanvas();
  if (!canvas) return;
  const wrap = canvas.parentElement;

  let tooltip = wrap.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    wrap.style.position = 'relative';
    wrap.appendChild(tooltip);
  }

  canvas.onmousemove = (e) => {
    const data = lastChartDataset;
    if (!data) return;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const cx = size / 2, cy = size / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const outerR = size / 2 - 3;
    const innerR = outerR * 0.66;

    if (r < innerR || r > outerR) { tooltip.style.opacity = '0'; canvas.style.cursor = 'default'; return; }

    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const frac = angle / (Math.PI * 2);

    let cum = 0, idx = -1;
    for (let i = 0; i < data.values.length; i++) {
      const f = data.values[i] / data.total;
      if (frac >= cum && frac < cum + f) { idx = i; break; }
      cum += f;
    }
    if (idx === -1) { tooltip.style.opacity = '0'; return; }

    canvas.style.cursor = 'pointer';
    const pct = Math.round(data.values[idx] / data.total * 100);
    tooltip.innerHTML = `<span class="tt-dot" style="background:${data.colors[idx]}"></span><span class="tt-label">${escapeHtml(data.labels[idx])}</span><span class="tt-val">${fmtRupiah(data.values[idx])} · ${pct}%</span>`;
    tooltip.style.opacity = '1';
    tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
  };
  canvas.onmouseleave = () => { tooltip.style.opacity = '0'; };

  if (!chartResizeBound) {
    chartResizeBound = true;
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        drawDonutChart(false);
        drawYearlyBarChart(false);
        if (detailPageContext && document.getElementById('detailPageOverlay').classList.contains('open')) {
          renderDetailMiniChart(detailPageContext);
        }
      }, 120);
    });
  }
}

/* ==========================================================
   GRAFIK BATANG — profil bulanan (masuk vs keluar) 1 tahun
   Juga digambar dengan Canvas API bawaan, tanpa library luar.
========================================================== */
const MONTH_LABELS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BAR_COLOR_IN = '#059669';
const BAR_COLOR_OUT = '#E11D48';
let lastYearlyDataset = null; // { year, months: [{in, out}] }
let barAnimFrame = null;
let yearlyHoverIdx = -1;

function renderYearlyBarChart() {
  const year = new Date().getFullYear();
  const eyebrow = document.getElementById('yearlyEyebrow');
  if (eyebrow) eyebrow.textContent = 'Masuk vs Keluar · ' + year;

  const months = Array.from({ length: 12 }, () => ({ in: 0, out: 0 }));
  transactions.forEach(t => {
    if (!t.date) return;
    const d = t.date.split('-');
    if (Number(d[0]) !== year) return;
    const mIdx = Number(d[1]) - 1;
    if (mIdx < 0 || mIdx > 11) return;
    const val = Number(t.amount) || 0;
    if (t.type === 'masuk') months[mIdx].in += val; else months[mIdx].out += val;
  });

  const totalIn = months.reduce((a, m) => a + m.in, 0);
  const totalOut = months.reduce((a, m) => a + m.out, 0);
  const net = totalIn - totalOut;

  const inEl = document.getElementById('yearlyInTotal');
  const outEl = document.getElementById('yearlyOutTotal');
  const netEl = document.getElementById('yearlyNetValue');
  const netChip = document.getElementById('yearlyNetChip');
  if (inEl) inEl.textContent = fmtRupiah(totalIn);
  if (outEl) outEl.textContent = fmtRupiah(totalOut);
  if (netEl) netEl.textContent = (net < 0 ? '-' : '') + fmtRupiah(Math.abs(net));
  if (netChip) netChip.classList.toggle('is-negative', net < 0);

  yearlyHoverIdx = -1;
  lastYearlyDataset = { year, months };
  drawYearlyBarChart(true);
  setupYearlyBarInteractions();
}

function getYearlyCanvas() {
  return document.getElementById('yearlyBarChart');
}

function drawYearlyBarChart(animate) {
  const canvas = getYearlyCanvas();
  const data = lastYearlyDataset;
  if (!canvas || !data) return;

  const wrap = canvas.parentElement;
  const w = wrap.clientWidth || 400;
  const h = wrap.clientHeight || 230;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padLeft = 8, padRight = 8, padTop = 10, padBottom = 22;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxVal = Math.max(1, ...data.months.map(m => Math.max(m.in, m.out)));
  const groupW = chartW / 12;
  const barW = Math.min(11, groupW * 0.32);
  const barGap = 3;

  cancelAnimationFrame(barAnimFrame);

  function paintFrame(progress) {
    ctx.clearRect(0, 0, w, h);

    // Highlight kolom bulan yang sedang di-hover
    if (yearlyHoverIdx >= 0 && yearlyHoverIdx < 12) {
      const hoverCx = padLeft + groupW * yearlyHoverIdx;
      ctx.fillStyle = 'rgba(37,99,235,0.06)';
      const rx = 6;
      const rw = groupW, rh = chartH + 6, ry = padTop - 2;
      ctx.beginPath();
      ctx.moveTo(hoverCx + rx, ry);
      ctx.arcTo(hoverCx + rw, ry, hoverCx + rw, ry + rh, rx);
      ctx.arcTo(hoverCx + rw, ry + rh, hoverCx, ry + rh, rx);
      ctx.arcTo(hoverCx, ry + rh, hoverCx, ry, rx);
      ctx.arcTo(hoverCx, ry, hoverCx + rw, ry, rx);
      ctx.closePath();
      ctx.fill();
    }

    // garis dasar
    ctx.strokeStyle = 'rgba(19,26,42,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, h - padBottom + 0.5);
    ctx.lineTo(w - padRight, h - padBottom + 0.5);
    ctx.stroke();

    data.months.forEach((m, i) => {
      const groupCx = padLeft + groupW * i + groupW / 2;
      const inH = (m.in / maxVal) * chartH * progress;
      const outH = (m.out / maxVal) * chartH * progress;

      const inX = groupCx - barW - barGap / 2;
      const outX = groupCx + barGap / 2;
      const dim = yearlyHoverIdx >= 0 && yearlyHoverIdx !== i;

      ctx.globalAlpha = dim ? 0.4 : 1;
      drawRoundedBar(ctx, inX, h - padBottom - inH, barW, inH, BAR_COLOR_IN);
      drawRoundedBar(ctx, outX, h - padBottom - outH, barW, outH, BAR_COLOR_OUT);
      ctx.globalAlpha = 1;

      ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = yearlyHoverIdx === i ? '#131A2A' : '#8A93A3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(MONTH_LABELS_SHORT[i], groupCx, h - padBottom + 5);
    });
  }

  if (!animate) { paintFrame(1); return; }

  const duration = 600;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    paintFrame(eased);
    if (p < 1) barAnimFrame = requestAnimationFrame(tick);
  }
  barAnimFrame = requestAnimationFrame(tick);
}

function drawRoundedBar(ctx, x, y, width, height, color) {
  if (height <= 0) return;
  const r = Math.min(3, width / 2, height);
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function setupYearlyBarInteractions() {
  const canvas = getYearlyCanvas();
  if (!canvas) return;
  const wrap = canvas.parentElement;
  wrap.style.position = 'relative';

  let tooltip = wrap.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    wrap.appendChild(tooltip);
  }

  canvas.onmousemove = (e) => {
    const data = lastYearlyDataset;
    if (!data) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const padLeft = 8, padRight = 8, padBottom = 22;
    const chartW = w - padLeft - padRight;
    const groupW = chartW / 12;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (my > h - padBottom || mx < padLeft || mx > w - padRight) {
      tooltip.style.opacity = '0';
      if (yearlyHoverIdx !== -1) { yearlyHoverIdx = -1; drawYearlyBarChart(false); }
      return;
    }

    const idx = Math.min(11, Math.max(0, Math.floor((mx - padLeft) / groupW)));
    if (idx !== yearlyHoverIdx) { yearlyHoverIdx = idx; drawYearlyBarChart(false); }

    const m = data.months[idx];
    if (m.in === 0 && m.out === 0) { tooltip.style.opacity = '0'; return; }

    tooltip.innerHTML = `<span class="tt-label">${MONTH_LABELS_SHORT[idx]} ${data.year}</span><span class="tt-val" style="color:#6EE7B7">Masuk ${fmtRupiah(m.in)}</span><span class="tt-val" style="color:#FDA4AF">Keluar ${fmtRupiah(m.out)}</span>`;
    tooltip.style.display = 'flex';
    tooltip.style.flexDirection = 'column';
    tooltip.style.gap = '2px';
    tooltip.style.opacity = '1';
    tooltip.style.left = Math.min(w - 140, Math.max(4, mx + 12)) + 'px';
    tooltip.style.top = '6px';
  };
  canvas.onmouseleave = () => {
    tooltip.style.opacity = '0';
    if (yearlyHoverIdx !== -1) { yearlyHoverIdx = -1; drawYearlyBarChart(false); }
  };
}

/* ==========================================================
   FILTER & TABEL TRANSAKSI
========================================================== */
function populateCategoryFilter() {
  const sel = document.getElementById('categoryFilter');
  if (!sel) return;
  const master = [...CATEGORIES.masuk, ...CATEGORIES.keluar];
  const fromData = transactions.map(t => t.category);
  const all = [...new Set([...master, ...fromData])].sort((a, b) => a.localeCompare(b, 'id'));
  const current = sel.value;
  sel.innerHTML = '<option value="semua">Semua Kategori</option>' + all.map(c => `<option value="${c}">${c}</option>`).join('');
  if (all.includes(current)) sel.value = current;
  renderLapCategorySheetList(all);
  updateLapCategoryFieldLabel();
}

/* ---- Gestur usap/tarik (drag) dengan jari utk SEMUA bottom sheet popup
   Filter Laporan (Pilih Bulan, Pilih Rentang Tanggal, Kategori Transaksi)
   -- pegangan (.lap-sheet-handle) & judul (.lap-sheet-head) jadi area yg
   bisa "diusap" turun pakai jari buat menutup sheet, persis gestur
   bottom-sheet asli di HP (mis. share sheet iOS/Android): begitu jari
   ditekan lalu ditarik, sheet-nya IKUT BERGERAK naik-turun mengikuti
   posisi jari secara langsung (bukan animasi tetap), TAPI cuma boleh
   ditarik ke BAWAH (translateY>=0) -- ditarik ke atas cuma balik ke 0.
   Dilepas SEBELUM jarak ambang batas (CLOSE_THRESHOLD) -> sheet
   "melenting" balik ke posisi semula (transition dihidupkan lagi).
   Dilepas SETELAH ambang batas -> sheet beneran ditutup (closeFn). */
function initLapSheetDrag(overlay, sheet, closeFn) {
  if (!overlay || !sheet || sheet.dataset.dragBound === '1') return;
  sheet.dataset.dragBound = '1';
  const grabZones = sheet.querySelectorAll('.lap-sheet-handle, .lap-sheet-head');
  if (!grabZones.length) return;
  const CLOSE_THRESHOLD = 90; // px -- jarak tarik ke bawah minimum sblm sheet ditutup
  let startY = null, currentY = 0, dragging = false, pointerId = null;

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const deltaY = e.clientY - startY;
    currentY = Math.max(0, deltaY); // cuma boleh ditarik turun, bukan naik lewat batas atas
    sheet.style.transform = `translateY(${currentY}px)`;
  }
  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    startY = null;
    pointerId = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (currentY >= CLOSE_THRESHOLD) closeFn();
    currentY = 0;
  }
  grabZones.forEach(zone => {
    zone.style.touchAction = 'none';
    zone.addEventListener('pointerdown', (e) => {
      if (!overlay.classList.contains('open')) return;
      startY = e.clientY;
      currentY = 0;
      dragging = true;
      pointerId = e.pointerId;
      sheet.style.transition = 'none'; // dinonaktifkan sementara supaya sheet nempel pas di jari, bukan telat kena easing
      try { zone.setPointerCapture(pointerId); } catch (err) {}
    });
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerup', onPointerUp);
    zone.addEventListener('pointercancel', onPointerUp);
  });
}

/* ---- Bottom sheet "Kategori Transaksi" (popup Filter Laporan) ----
   <select id="categoryFilter"> di atas TETAP jadi satu-satunya sumber
   nilai (dibaca getFilteredTransactions, tombol Reset, dst) -- sheet
   di bawah ini cuma tampilan radio-list utk mengisi select itu, isinya
   dibangun ulang tiap kali populateCategoryFilter() jalan. */
function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function renderLapCategorySheetList(all) {
  const wrap = document.getElementById('lapCategorySheetList');
  if (!wrap) return;
  const items = [{ value: 'semua', label: 'Semua' }, ...all.map(c => ({ value: c, label: c }))];
  wrap.innerHTML = items.map(it => `<button type="button" class="lap-cat-item" data-value="${escapeHtmlAttr(it.value)}">${escapeHtmlAttr(it.label)}</button>`).join('');
  const sel = document.getElementById('categoryFilter');
  markLapCategorySheetActive(sel ? (sel.value || 'semua') : 'semua');
}
function markLapCategorySheetActive(val) {
  document.querySelectorAll('#lapCategorySheetList .lap-cat-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === val);
  });
}
function updateLapCategoryFieldLabel() {
  const sel = document.getElementById('categoryFilter');
  const label = document.getElementById('lapCategoryFieldLabel');
  if (!sel || !label) return;
  const val = sel.value || 'semua';
  label.textContent = val === 'semua' ? 'Semua Kategori' : val;
  markLapCategorySheetActive(val);
}
let lapCategoryPendingValue = 'semua';
function openLapCategorySheet() {
  const sel = document.getElementById('categoryFilter');
  lapCategoryPendingValue = sel ? (sel.value || 'semua') : 'semua';
  markLapCategorySheetActive(lapCategoryPendingValue);
  document.getElementById('lapCategorySheetOverlay').classList.add('open');
}
function closeLapCategorySheet() {
  document.getElementById('lapCategorySheetOverlay').classList.remove('open');
}
document.getElementById('lapCategoryFieldBtn')?.addEventListener('click', openLapCategorySheet);
document.getElementById('lapCategorySheetCloseBtn')?.addEventListener('click', closeLapCategorySheet);
document.getElementById('lapCategorySheetOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'lapCategorySheetOverlay') closeLapCategorySheet();
});
initLapSheetDrag(document.getElementById('lapCategorySheetOverlay'), document.getElementById('lapCategorySheet'), closeLapCategorySheet);
document.getElementById('lapCategorySheetList')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.lap-cat-item');
  if (!btn) return;
  lapCategoryPendingValue = btn.dataset.value;
  markLapCategorySheetActive(lapCategoryPendingValue);
});
document.getElementById('lapCategorySheetDoneBtn')?.addEventListener('click', () => {
  const sel = document.getElementById('categoryFilter');
  if (sel) { sel.value = lapCategoryPendingValue; sel.dispatchEvent(new Event('change')); }
  updateLapCategoryFieldLabel();
  closeLapCategorySheet();
});

function getFilteredTransactions() {
  const searchEl = document.getElementById('searchInput');
  const catFilterEl = document.getElementById('categoryFilter');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const typeFilter = lapTypeFilter;
  const catFilter = catFilterEl ? catFilterEl.value : 'semua';

  let list = [...transactions];

  if (activeTab === 'hari-ini') {
    const todayS = todayStr();
    list = list.filter(t => t.date === todayS);
  } else if (activeTab === '7-hari') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffStr = localDateStr(cutoff);
    list = list.filter(t => t.date && t.date >= cutoffStr);
  } else if (activeTab === 'bulan') {
    const monthVal = lapFilterMonth || thisMonthStr();
    list = list.filter(t => t.date && t.date.slice(0, 7) === monthVal);
  } else if (activeTab === 'tanggal') {
    if (lapFilterDateFrom) list = list.filter(t => t.date && t.date >= lapFilterDateFrom);
    if (lapFilterDateTo) list = list.filter(t => t.date && t.date <= lapFilterDateTo);
  }

  if (typeFilter !== 'semua') list = list.filter(t => t.type === typeFilter);
  if (catFilter !== 'semua') list = list.filter(t => t.category === catFilter);
  if (search) {
    list = list.filter(t =>
      (t.desc || '').toLowerCase().includes(search) ||
      (t.category || '').toLowerCase().includes(search)
    );
  }

  return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
}

/* Tidak ada lagi picker tanggal manual — setiap tab (Semua/Mingguan/Bulanan/
   Tahunan) sekarang otomatis memakai rentang berjalan (rolling), jadi
   fungsi ini hanya membersihkan sisa elemen picker lama jika masih ada. */
function renderRangePicker() {
  const existing = document.getElementById('rangePickerWrap');
  if (existing) existing.remove();
}

/* ---------- Label grup tanggal: "Hari Ini" / tanggal lengkap ----------
   Permintaan: label "Kemarin" dihapus dari tab Aktifitas -- tanggal
   kemarin (dan seterusnya) sekarang langsung tampil sbg tanggal
   lengkap (mis. "Selasa, 25 Agustus 2026"), cuma "Hari Ini" yg masih
   dapat label khusus. */
function formatHistoryDateLabel(dateStr) {
  if (!dateStr) return 'Tanpa Tanggal';
  const today = todayStr();
  if (dateStr === today) return 'Hari Ini';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/* ---------- Kelompokkan daftar (sudah terurut) berdasarkan tanggal ---------- */
function groupTransactionsByDate(list) {
  const map = new Map();
  list.forEach(t => {
    const key = t.date || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });
  return [...map.entries()];
}

/* ---------- Label grup bulan: "Januari 2025" dst — dipakai tab Tahunan ---------- */
function formatHistoryMonthLabel(monthKey) {
  if (!monthKey) return 'Tanpa Tanggal';
  const [y, m] = monthKey.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/* ---------- Kelompokkan daftar (sudah terurut) berdasarkan bulan — tab Tahunan ---------- */
function groupTransactionsByMonth(list) {
  const map = new Map();
  list.forEach(t => {
    const key = t.date ? t.date.slice(0, 7) : '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });
  return [...map.entries()];
}

/* ==========================================================
   RINGKASAN TOTAL — total masuk/keluar keseluruhan (tidak
   terpengaruh pencarian/filter list), bisa dilihat per tanggal,
   per bulan, atau per tahun.
========================================================== */


/* ---------- Kartu "Ringkasan Total" (overview-card) SUDAH DIHAPUS
   permanen dari HTML (dulu di #historySection, sebelum tab filter
   Semua/Mingguan/Bulanan/Tahunan). Fungsi renderOverviewPicker(),
   renderOverviewStats(), renderOverview(), dan listener toggle
   mode-nya ikut dihapus di sini -- kalau dibiarkan, baris-baris itu
   akan crash saat load karena getElementById('overviewPickerWrap')
   dkk sekarang mengembalikan null. ---------- */


/* ---------- Satu kartu riwayat transaksi (gaya "Riwayat" mutasi bank,
   ikon di kiri + nama/keterangan/tanggal, nominal & pil status "Sukses"
   di kanan) -- warna & bentuk kartu disamakan dengan kartu tagihan/hutang
   (.bd-item) supaya satu tema dengan halaman Tagihan & Hutang. ---------- */
function renderHistoryRow(t, delay) {
  const isIn = t.type === 'masuk';
  const color = categoryColor(t.category);
  const dateLabel = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  return `
    <div class="rw-item fade-up" style="animation-delay:${delay}ms" data-tx-id="${t.id}">
      <span class="rw-item-ic" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color}">
        ${categoryIcon(t.category, isIn, 16)}
      </span>
      <div class="rw-item-body">
        <div class="rw-item-name">${escapeHtml(t.category)}</div>
        <div class="rw-item-sub" title="${escapeAttr(t.desc || '')}">${escapeHtml(t.desc || 'Tanpa keterangan')}</div>
        <div class="rw-item-date">${dateLabel}</div>
      </div>
      <div class="rw-item-right">
        <div class="rw-item-amount ${isIn ? 'in' : 'out'}">${isIn ? '+' : '-'} ${fmtRupiah(t.amount)}</div>
        <span class="rw-status-pill ${isIn ? '' : 'out'}">${statusPillIcon(isIn)}${isIn ? 'Masuk' : 'Keluar'}</span>
        <div class="rw-item-actions">
          <button class="icon-btn edit" data-edit="${t.id}" title="Edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn del" data-del="${t.id}" title="Hapus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

function renderTransactionList() {
  const tbody = document.getElementById('txBody');
  const empty = document.getElementById('emptyState');
  const loadMoreWrap = document.getElementById('historyLoadMoreWrap');
  const loadMoreBtn = document.getElementById('btnLoadMoreHistory');
  if (!tbody || !empty || !loadMoreWrap || !loadMoreBtn) return;
  const list = getFilteredTransactions(); // sudah terurut tanggal terbaru → terlama

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    loadMoreWrap.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  const isYearly = activeTab === 'tahunan';
  const groups = isYearly ? groupTransactionsByMonth(list) : groupTransactionsByDate(list);
  const visibleGroups = groups.slice(0, historyVisibleGroups);
  const remainingGroups = groups.length - visibleGroups.length;

  // PERMINTAAN: baris "kepala grup" per tanggal (mis. "SELASA, 25
  // AGUSTUS 2026" + total bersih hari itu) DIHILANGKAN dari daftar
  // "Semua Transaksi" -- yang dulu digambar lewat .rw-group-head di
  // atas kumpulan transaksi tiap tanggal/bulan. Sekarang cukup
  // baris-baris transaksinya saja (rowsHtml) yang digabung langsung
  // tanpa header pemisah tanggal. dayIn/dayOut/dayNet (dulu dipakai
  // buat angka di header itu) juga sudah tidak perlu dihitung lagi.
  let delay = 0;
  tbody.innerHTML = visibleGroups.map(([key, items]) => {
    return items.map(t => {
      const html = renderHistoryRow(t, Math.min(delay, 12) * 30);
      delay++;
      return html;
    }).join('');
  }).join('');

  if (remainingGroups > 0) {
    loadMoreWrap.style.display = 'flex';
    loadMoreBtn.textContent = `Muat Lebih Banyak (${remainingGroups} ${isYearly ? 'bulan' : 'hari'} lagi)`;
  } else {
    loadMoreWrap.style.display = 'none';
  }
}

/* Reset paginasi riwayat ke halaman pertama — dipanggil saat tab/pencarian/filter berubah */
function resetHistoryPagination() {
  historyVisibleGroups = HISTORY_GROUPS_PER_PAGE;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Sama seperti escapeHtml, tapi juga meng-escape tanda kutip supaya aman
// dipakai di dalam nilai atribut HTML (mis. src="...", href="...").
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ==========================================================
   HALAMAN DETAIL PER KARTU RINGKASAN
   (Pemasukan Hari Ini / Pengeluaran Hari Ini / Pemasukan Bulan Ini / Pengeluaran Bulan Ini)
   Setiap kartu, saat diklik, membuka halamannya sendiri:
   - hanya menampilkan data transaksi yang sesuai dengan kartu itu
   - bisa tambah/edit/hapus transaksi langsung dari halaman itu
   - grafik tren mini khusus halaman itu
   - target/goal yang bisa diatur per halaman
========================================================== */
function getSummaryPageTransactions(key) {
  const page = SUMMARY_PAGES[key];
  if (!page) return [];
  const today = todayStr();
  const month = thisMonthStr();

  return transactions
    .filter(t => t.type === page.type)
    .filter(t => page.range === 'today' ? t.date === today : (t.date && t.date.slice(0, 7) === month))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
}

function renderDetailTarget(key, total) {
  const page = SUMMARY_PAGES[key];
  const isIn = page.type === 'masuk';
  const target = Number(pageTargets[key]) || 0;
  const body = document.getElementById('detailTargetBody');
  const editLabel = document.getElementById('detailTargetEditLabel');
  document.getElementById('detailTargetPeriod').textContent = page.range === 'today' ? 'hari ini' : 'bulan ini';

  if (!target) {
    body.innerHTML = `<div class="detail-target-empty">Belum ada target ${page.range === 'today' ? 'harian' : 'bulanan'} untuk ${escapeHtml(page.label)}. Klik "Atur target" untuk mulai memantau progres.</div>`;
    editLabel.textContent = 'Atur target';
    return;
  }

  editLabel.textContent = 'Ubah target';
  const pct = Math.min(100, Math.round((total / target) * 100));
  body.innerHTML = `
    <div class="detail-target-row">
      <span class="cur">${fmtRupiah(total)}</span>
      <span class="goal">dari target ${fmtRupiah(target)}</span>
    </div>
    <div class="detail-target-track"><div class="detail-target-fill ${isIn ? 'in' : 'out'}" style="width:${pct}%"></div></div>
    <div class="detail-target-pct">${pct}% tercapai${pct >= 100 ? ' 🎉' : ''}</div>
  `;
}

function renderDetailMiniChart(key) {
  const page = SUMMARY_PAGES[key];
  const canvas = document.getElementById('detailMiniChart');
  const eyebrow = document.getElementById('detailChartEyebrow');
  if (!canvas) return;

  const color = page.type === 'masuk' ? BAR_COLOR_IN : BAR_COLOR_OUT;
  let labels, values;

  if (page.range === 'today') {
    // Tren 7 hari terakhir (termasuk hari ini) untuk tipe transaksi halaman ini
    eyebrow.textContent = '7 hari terakhir';
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(localDateStr(d));
    }
    labels = days.map(d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
    values = days.map(d => transactions
      .filter(t => t.type === page.type && t.date === d)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0));
  } else {
    // Tren harian sepanjang bulan berjalan untuk tipe transaksi halaman ini
    eyebrow.textContent = 'Harian · ' + thisMonthLabel();
    const month = thisMonthStr();
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    labels = dayNums.map(n => String(n));
    values = dayNums.map(n => {
      const dateStr = `${month}-${String(n).padStart(2, '0')}`;
      return transactions
        .filter(t => t.type === page.type && t.date === dateStr)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    });
  }

  drawDetailMiniChart(canvas, labels, values, color);
}

function thisMonthLabel() {
  return new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function drawDetailMiniChart(canvas, labels, values, color) {
  const wrap = canvas.parentElement;
  const w = wrap.clientWidth || 400;
  const h = wrap.clientHeight || 150;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padLeft = 6, padRight = 6, padTop = 8, padBottom = 20;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const maxVal = Math.max(1, ...values);
  const n = values.length;
  const groupW = chartW / n;
  const barW = Math.max(2, Math.min(22, groupW * 0.55));

  // garis dasar
  ctx.strokeStyle = 'rgba(19,26,42,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, h - padBottom + 0.5);
  ctx.lineTo(w - padRight, h - padBottom + 0.5);
  ctx.stroke();

  // hanya tampilkan sebagian label agar tidak bertabrakan saat n besar (mode bulanan)
  const labelStep = Math.ceil(n / 10);

  values.forEach((v, i) => {
    const cx = padLeft + groupW * i + groupW / 2;
    const barH = (v / maxVal) * chartH;
    drawRoundedBar(ctx, cx - barW / 2, h - padBottom - barH, barW, barH, color);

    if (i % labelStep === 0 || i === n - 1) {
      ctx.font = '600 9.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#8A93A3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(labels[i], cx, h - padBottom + 5);
    }
  });
}

function renderDetailList(key, list, isIn) {
  const tbody = document.getElementById('detailPageBody');
  const empty = document.getElementById('detailPageEmpty');

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = list.map((t, i) => {
    const dateLabel = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    return `
      <tr class="fade-up" style="animation-delay:${Math.min(i, 12) * 35}ms">
        <td class="date-cell">${dateLabel}</td>
        <td><span class="cat-pill"><span class="cat-dot" style="background:${categoryColor(t.category)}"></span>${escapeHtml(t.category)}</span></td>
        <td class="desc-cell" title="${escapeHtml(t.desc || '')}">${escapeHtml(t.desc || '—')}</td>
        <td style="text-align:right" class="amount-cell ${isIn ? 'in' : 'out'}">${isIn ? '+' : '-'} ${fmtRupiah(t.amount)}</td>
        <td>
          <div class="row-actions" style="justify-content:center">
            <button class="icon-btn edit" data-edit="${t.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="icon-btn del" data-del="${t.id}" title="Hapus">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function refreshDetailPage() {
  if (!detailPageContext) return;
  openDetailPage(detailPageContext, { keepScroll: true });
}

function openDetailPage(key, opts = {}) {
  const page = SUMMARY_PAGES[key];
  if (!page) return;

  if (document.getElementById('bdAllOverlay').classList.contains('open')) closeBdAllPage();
  detailPageContext = key;
  document.getElementById('detailTargetForm').style.display = 'none';

  const list = getSummaryPageTransactions(key);
  const total = list.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const isIn = page.type === 'masuk';

  document.getElementById('detailPageTitle').textContent = page.label;
  document.getElementById('detailPageSub').textContent = page.sub;
  document.getElementById('detailPageIcon').className = `icon-badge ${isIn ? 'in' : 'out'}`;
  document.getElementById('detailPageIcon').innerHTML = iconArrow(isIn ? 'down' : 'up', 18);
  document.getElementById('detailTotalLabel').textContent = page.totalLabel;
  document.getElementById('detailTotalAmount').className = `detail-total-amount ${isIn ? 'in' : 'out'}`;
  document.getElementById('detailTotalAmount').textContent = fmtRupiah(total);
  document.getElementById('detailTotalCount').textContent = `${list.length} transaksi`;

  renderDetailTarget(key, total);
  renderDetailMiniChart(key);
  renderDetailList(key, list, isIn);

  document.getElementById('detailPageOverlay').classList.add('open');
  // FIX konsistensi kunci scroll (lihat catatan lengkap di
  // lockBodyScroll/unlockBodyScroll): dulu overflow='hidden' manual,
  // tidak cukup kuat di Safari iOS & tidak menyimpan/mengembalikan
  // posisi scroll halaman asal dengan benar.
  lockBodyScroll();
  if (!opts.keepScroll) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
}

function closeDetailPage() {
  document.getElementById('detailPageOverlay').classList.remove('open');
  document.getElementById('detailTargetForm').style.display = 'none';
  unlockBodyScroll();
  detailPageContext = null;
}


/* ==========================================================
   HALAMAN LEADERBOARD
   Menampilkan peringkat kategori dengan jumlah uang masuk & keluar
   terbesar, untuk periode harian atau bulanan.
========================================================== */
let leaderboardPeriod = 'daily'; // 'daily' | 'monthly'

function getLeaderboardData(period) {
  const today = todayStr();
  const month = thisMonthStr();
  const inRange = period === 'daily'
    ? (t) => t.date === today
    : (t) => t.date && t.date.slice(0, 7) === month;

  const buildTop = (type) => {
    const totals = {};
    transactions.filter(t => t.type === type && inRange(t)).forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + (Number(t.amount) || 0);
    });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  };

  return { masuk: buildTop('masuk'), keluar: buildTop('keluar') };
}

function renderLeaderboardList(elId, rows, isIn) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = `<div class="lb-empty"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg><br>Belum ada data ${isIn ? 'pemasukan' : 'pengeluaran'} untuk periode ini.</div>`;
    return;
  }
  el.innerHTML = rows.map((r, i) => {
    const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
    const initial = escapeHtml(String(r.category || '?').trim().charAt(0).toUpperCase() || '?');
    const color = categoryColor(r.category);
    // Gaya "kartu VIP": medali berpita di kiri untuk 3 besar ("#N" polos untuk
    // sisanya), avatar bermahkota + lencana "Top N" di tengah, nama & nominal
    // di kanan. Semua baris memakai lencana yang sama supaya konsisten.
    const medalMarkup = rankClass ? `
        <span class="lb-medal ${rankClass}">
          <span class="lb-medal-ribbon l"></span><span class="lb-medal-ribbon r"></span>
          ${i + 1}
        </span>` : `<span class="lb-medal-rank-plain">#${i + 1}</span>`;
    return `
      <div class="lb-row ${rankClass}" style="--i:${i}">
        <div class="lb-medal-slot">${medalMarkup}</div>
        <div class="lb-avatar-col">
          <div class="lb-avatar-wrap ${rankClass} ${rankClass ? 'top' : ''}">
            ${rankClass ? '<span class="lb-avatar-crown">👑</span>' : ''}
            <span class="lb-avatar" style="--cat-color:${color}">${initial}</span>
          </div>
          <span class="lb-vip-badge">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16 3 6l5.5 4L12 4l3.5 6L21 6l-2 10z"/></svg>
            Top ${i + 1}
          </span>
        </div>
        <div class="lb-row-body">
          <span class="lb-row-name">${escapeHtml(r.category)}</span>
          <span class="lb-row-amt ${isIn ? 'in' : 'out'}" data-target="${r.amount}">Rp0</span>
        </div>
      </div>`;
  }).join('');

  // Beri jeda sebentar sebelum mengisi angka supaya transisi terlihat (animasi masuk).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.querySelectorAll('.lb-row-amt').forEach((amtEl, idx) => {
        const target = Number(amtEl.dataset.target) || 0;
        setTimeout(() => animateIntEl(amtEl, target, fmtRupiah, 650), idx * 90);
      });
    });
  });
}

function renderLeaderboardHero(data) {
  const totalIn = data.masuk.reduce((s, r) => s + r.amount, 0);
  const totalOut = data.keluar.reduce((s, r) => s + r.amount, 0);
  const inEl = document.getElementById('lbHeroInValue');
  const outEl = document.getElementById('lbHeroOutValue');
  animateIntEl(inEl, totalIn, fmtRupiah, 750);
  animateIntEl(outEl, totalOut, fmtRupiah, 750);

  // Persentase dinormalisasi terhadap gabungan total (bukan terhadap nilai maks masing-masing)
  // supaya kedua sisi selalu mengisi 100% bar dan "bertemu" di satu titik — persis
  // mekanisme bar pertarungan (battle bar) PK live TikTok, bukan dua bar terpisah.
  const total = totalIn + totalOut;
  const pctIn = total > 0 ? Math.round((totalIn / total) * 100) : 50;
  const pctOut = 100 - pctIn;

  const barIn = document.getElementById('lbHeroBarIn');
  const barOut = document.getElementById('lbHeroBarOut');
  const spark = document.getElementById('lbHeroSpark');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      barIn.style.width = pctIn + '%';
      barOut.style.width = pctOut + '%';
      if (spark) spark.style.left = pctIn + '%';
    });
  });

  // Sisi yang unggul dapat mahkota + glow berdenyut, seperti host yang sedang menang di PK live.
  const icIn = document.getElementById('lbHeroIcIn');
  const icOut = document.getElementById('lbHeroIcOut');
  const leadIn = total > 0 && totalIn >= totalOut;
  const leadOut = total > 0 && totalOut > totalIn;
  icIn?.classList.toggle('lead', leadIn);
  icOut?.classList.toggle('lead', leadOut);

  // Percikan di titik temu "meledak" sesaat setiap kali datanya diperbarui,
  // meniru efek kilat saat skor bertambah di battle bar PK live.
  if (spark) {
    spark.classList.remove('burst');
    void spark.offsetWidth; // paksa reflow supaya animasi bisa diulang
    spark.classList.add('burst');
  }

  const net = totalIn - totalOut;
  const netEl = document.getElementById('lbHeroNet');
  netEl.textContent = (net >= 0 ? 'Surplus ' : 'Defisit ') + fmtRupiah(Math.abs(net));
  netEl.classList.toggle('pos', net >= 0);
  netEl.classList.toggle('neg', net < 0);
}

function renderLeaderboard() {
  const periodLabel = leaderboardPeriod === 'daily' ? 'Hari ini' : thisMonthLabel();
  document.getElementById('lbInSub').textContent = periodLabel;
  document.getElementById('lbOutSub').textContent = periodLabel;
  document.querySelectorAll('#lbPeriodToggle button').forEach(b => b.classList.toggle('active', b.dataset.lbperiod === leaderboardPeriod));
  updateLbToggleIndicator();

  const data = getLeaderboardData(leaderboardPeriod);
  renderLeaderboardHero(data);
  renderLeaderboardList('lbListIn', data.masuk, true);
  renderLeaderboardList('lbListOut', data.keluar, false);
}

// Posisikan pil indikator toggle Harian/Bulanan agar meluncur mengikuti tombol aktif.
function updateLbToggleIndicator() {
  const toggle = document.getElementById('lbPeriodToggle');
  const indicator = document.getElementById('lbToggleIndicator');
  const activeBtn = toggle?.querySelector('button.active');
  if (!toggle || !indicator || !activeBtn) return;
  indicator.style.width = activeBtn.offsetWidth + 'px';
  indicator.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
}

// Ganti periode dengan transisi fade halus (list keluar sebentar lalu masuk lagi berisi data baru).
function switchLeaderboardPeriod(period) {
  if (period === leaderboardPeriod) return;
  leaderboardPeriod = period;
  const listIn = document.getElementById('lbListIn');
  const listOut = document.getElementById('lbListOut');
  listIn.classList.add('lb-fade-out');
  listOut.classList.add('lb-fade-out');
  setTimeout(() => {
    renderLeaderboard();
    listIn.classList.remove('lb-fade-out');
    listOut.classList.remove('lb-fade-out');
  }, 160);
}

function openLeaderboardPage() {
  if (document.getElementById('bdAllOverlay').classList.contains('open')) closeBdAllPage();
  document.getElementById('leaderboardOverlay').classList.add('open');
  lockBodyScroll();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  renderLeaderboard();
}

function closeLeaderboardPage() {
  document.getElementById('leaderboardOverlay').classList.remove('open');
  unlockBodyScroll();
}

document.getElementById('lbBackBtn').addEventListener('click', closeLeaderboardPage);
document.getElementById('lbPeriodToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-lbperiod]');
  if (!btn) return;
  switchLeaderboardPeriod(btn.dataset.lbperiod);
});
window.addEventListener('resize', () => {
  if (document.getElementById('leaderboardOverlay').classList.contains('open')) updateLbToggleIndicator();
});


/* ==========================================================
   PENGATURAN WIDGET
   Mengizinkan pengguna menon-aktifkan (menyembunyikan) elemen
   tertentu di halaman utama. Preferensi tersimpan di localStorage
   supaya bertahan setiap kali website dibuka lagi.
========================================================== */
const WIDGET_SETTINGS_KEY = 'alirin_widget_settings_v1';
const WIDGET_DEFAULTS = {
  incomeShortcutCard: true,
  historySection: true,
  incomeSourceStatCard: true,
  recentActivityStatCard: true,
  bankWalletStatCard: true,
  compositionCard: true,
  profileCard: true,
  newsSection: true,
  deviceWidgetBlock: true,
  socialWidgetBlock: true,
  notifBtn: true,
  backToTopBtn: true,
};

function loadWidgetSettings() {
  try {
    const raw = JSON.parse(cloudStorage.getItem(WIDGET_SETTINGS_KEY) || '{}');
    return { ...WIDGET_DEFAULTS, ...raw };
  } catch {
    return { ...WIDGET_DEFAULTS };
  }
}

function saveWidgetSettings(settings) {
  cloudStorage.setItem(WIDGET_SETTINGS_KEY, JSON.stringify(settings));
}

function applyWidgetSettings(settings) {
  Object.keys(WIDGET_DEFAULTS).forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    el.style.display = settings[key] ? '' : 'none';
  });

  // Charts grid: kalau kedua grafik dimatikan, sembunyikan seluruh baris grid-nya juga.
  // Kalau cuma salah satu yang aktif, kartu yang tersisa melebar penuh
  // menyesuaikan lebar layar (tidak menyisakan kolom kosong).
  const chartsGrid = document.querySelector('.charts-grid');
  if (chartsGrid) {
    const bothChartsOn = settings.compositionCard && settings.profileCard;
    const anyChartOn = settings.compositionCard || settings.profileCard;
    chartsGrid.style.display = anyChartOn ? '' : 'none';
    chartsGrid.classList.toggle('cg-single', anyChartOn && !bothChartsOn);
  }

  // Perangkat & Sosial Media berbagi satu section-card + garis pemisah.
  const deviceSocialSection = document.getElementById('deviceSocialSection');
  const divider = document.getElementById('deviceSocialDivider');
  const bothOff = !settings.deviceWidgetBlock && !settings.socialWidgetBlock;
  if (deviceSocialSection) deviceSocialSection.style.display = bothOff ? 'none' : '';
  if (divider) divider.style.display = (settings.deviceWidgetBlock && settings.socialWidgetBlock) ? '' : 'none';

  applyIncomeCardsVisibility(settings);
}

/* Trio kartu "Sumber Pendapatan / Aktivitas 7 Hari Terakhir / Saldo
   Bank & E-Wallet" di-render ulang lewat innerHTML setiap kali data
   berubah (lihat renderSummary()), jadi visibilitasnya tidak cukup
   diatur sekali saja di applyWidgetSettings -- fungsi ini juga
   dipanggil ulang di akhir renderSummary() supaya preferensi
   aktif/off-nya tetap konsisten setiap kali kartu digambar ulang.
   Kartu yang tersisa otomatis melebar mengisi layar lewat class
   icg-1/icg-2 (lihat CSS .income-cards-group). */
function applyIncomeCardsVisibility(settings) {
  const s = settings || loadWidgetSettings();
  const group = document.querySelector('.income-cards-group');
  if (!group) return;
  const rows = [
    ['.isc-source-card', s.incomeSourceStatCard],
    ['.isc-recent-card', s.recentActivityStatCard],
    ['.isc-wallet-card', s.bankWalletStatCard],
  ];
  let visibleCount = 0;
  rows.forEach(([selector, on]) => {
    const el = group.querySelector(selector);
    if (!el) return;
    el.style.display = on ? '' : 'none';
    if (on) visibleCount += 1;
  });
  group.classList.toggle('icg-1', visibleCount === 1);
  group.classList.toggle('icg-2', visibleCount === 2);
  group.style.display = visibleCount === 0 ? 'none' : '';
}

function syncWidgetSettingsUI(settings) {
  document.querySelectorAll('.ws-switch[data-ws-toggle]').forEach((btn) => {
    const key = btn.dataset.wsToggle;
    const on = !!settings[key];
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', String(on));
    const row = btn.closest('.ws-row');
    if (row) row.classList.toggle('is-off', !on);
  });
}

function openWidgetSettingsPage() {
  if (document.getElementById('bdAllOverlay').classList.contains('open')) closeBdAllPage();
  syncWidgetSettingsUI(loadWidgetSettings());
  document.getElementById('widgetSettingsOverlay').classList.add('open');
  lockBodyScroll();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
function closeWidgetSettingsPage() {
  document.getElementById('widgetSettingsOverlay').classList.remove('open');
  unlockBodyScroll();
}

document.getElementById('wsBackBtn').addEventListener('click', closeWidgetSettingsPage);
document.getElementById('widgetSettingsOverlay').addEventListener('click', (e) => {
  const btn = e.target.closest('.ws-switch[data-ws-toggle]');
  if (!btn) return;
  const key = btn.dataset.wsToggle;
  const settings = loadWidgetSettings();
  settings[key] = !settings[key];
  saveWidgetSettings(settings);
  syncWidgetSettingsUI(settings);
  applyWidgetSettings(settings);
  showToast(settings[key] ? 'Widget diaktifkan' : 'Widget dinonaktifkan');
});
document.getElementById('wsResetBtn').addEventListener('click', () => {
  const settings = { ...WIDGET_DEFAULTS };
  saveWidgetSettings(settings);
  syncWidgetSettingsUI(settings);
  applyWidgetSettings(settings);
  showToast('Semua widget diaktifkan kembali');
});

// Terapkan preferensi tersimpan begitu halaman dimuat.
applyWidgetSettings(loadWidgetSettings());


/* ==========================================================
   HALAMAN PENDAPATAN PER SUMBER (fitur khusus, berdiri sendiri)
   Melacak pendapatan berdasarkan sumber: Adsense, Meta, Affiliate,
   Makelar, Kelas, Store, Sosial Media, Jasa & Rekber (+ sumber manual). Data & totalnya SENGAJA dipisah dari
   transaksi/saldo utama — tidak pernah ikut dijumlahkan ke Saldo
   Total, Pemasukan Bulan Ini, grafik komposisi, maupun leaderboard.
========================================================== */
function getIncomeSourceMonthEntries() {
  const month = thisMonthStr();
  return incomeSources
    .filter(x => x.date && x.date.slice(0, 7) === month)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
}

function getIncomeSourceDayEntries() {
  const day = todayStr();
  return incomeSources
    .filter(x => x.date === day)
    .sort((a, b) => (b.id || '').localeCompare(a.id || ''));
}

function calcIncomeSourceMonthTotal() {
  return getIncomeSourceMonthEntries().reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
}

/* String bulan lalu ("YYYY-MM") — dipakai buat bandingkan Total Bulan
   Ini vs bulan lalu (lencana tren naik/turun pada kartu Sumber
   Pendapatan di beranda). */
function lastMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return localMonthStr(d);
}
function getIncomeSourceLastMonthEntries() {
  const month = lastMonthStr();
  return incomeSources.filter(x => x.date && x.date.slice(0, 7) === month);
}
function calcIncomeSourceLastMonthTotal() {
  return getIncomeSourceLastMonthEntries().reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
}

function calcIncomeSourceDayTotal() {
  return getIncomeSourceDayEntries().reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
}

/* Semua catatan pendapatan sepanjang waktu (semua sumber, semua
   bulan) — dipakai untuk "Total Saldo" pada kartu Sumber Pendapatan
   di beranda, supaya angkanya jadi akumulasi total, bukan cuma bulan
   berjalan. Tetap terpisah & tidak pernah dijumlahkan ke Saldo Total
   utama di banner. */
function getIncomeSourceAllEntries() {
  return incomeSources
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
}
function calcIncomeSourceAllTotal() {
  return incomeSources.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
}

/* Format ringkas (mis. "Rp145 Jt", "Rp1,2 M") — dipakai banner besar
   grafik pertumbuhan kartu Sumber Pendapatan (lihat gaya "DAPAT 145
   JUTA+" di kartu referensi). */
function fmtRupiahShort(n) {
  const amount = Number(n) || 0;
  // FIX: sebelumnya fungsi ini selalu hardcode prefix "Rp" & singkatan
  // Jt/M/Rb untuk nominal >= Rp1.000, tanpa pernah mengecek toggle
  // displayCurrency — akibatnya badge "Dapat Rp145 Jt+..." di kartu
  // Sumber Pendapatan TIDAK ikut berubah ke USD saat mata uang tampilan
  // di-switch, beda sendiri dari Saldo Total/Pemasukan/Pengeluaran yang
  // sudah benar. Singkatan Jt/M/Rb itu format khas Rupiah, jadi kalau
  // mode USD aktif, cukup pakai fmtRupiah() biasa (sudah otomatis
  // format ke USD lewat usdFormatter).
  if (typeof displayCurrency !== 'undefined' && displayCurrency === 'USD' && fxBaseRate) {
    return fmtRupiah(amount);
  }
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  // Disingkat ke "M" (miliar) kalau nilainya sudah >= Rp1 miliar, dan ke
  // "jt" (juta) kalau sudah >= Rp100 juta (mis. Rp100.278.500 -> "100jt")
  // supaya tetap muat 1 baris di ruang sempit (mini topbar/kartu saldo)
  // tanpa terpotong "...". Di bawah Rp100 juta angka penuh masih muat,
  // jadi tetap tampil apa adanya lewat fmtRupiah().
  if (abs >= 1e9) return `${sign}Rp${(abs / 1e9).toFixed(abs % 1e9 === 0 ? 0 : 1).replace('.', ',')} M`;
  if (abs >= 1e8) return `${sign}Rp${Math.round(abs / 1e6)}jt`;
  return fmtRupiah(amount);
}

/* Deret pertumbuhan kumulatif Sumber Pendapatan per bulan (semua
   riwayat, bukan cuma bulan ini) — dipakai grafik garis naik pada
   kartu beranda (gaya "growth chart" seperti referensi visual). Nilai
   tiap titik = total kumulatif s.d. bulan itu, supaya garisnya selalu
   naik (kecuali belum ada data). */
function calcIncomeGrowthSeries(maxPoints = 6) {
  const byMonth = {};
  incomeSources.forEach(x => {
    if (!x.date) return;
    const m = x.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (Number(x.amount) || 0);
  });
  let months = Object.keys(byMonth).sort();
  if (!months.length) months = [thisMonthStr()];
  const trimmed = months.slice(-maxPoints);
  let running = 0;
  months.slice(0, months.length - trimmed.length).forEach(m => { running += byMonth[m] || 0; });
  return trimmed.map(m => {
    running += (byMonth[m] || 0);
    const [y, mm] = m.split('-');
    return { month: m, label: `${MONTH_LABELS_SHORT[Number(mm) - 1]} ${y}`, cumulative: running, monthTotal: byMonth[m] || 0 };
  });
}

/* Grafik garis pertumbuhan + badge total mengambang + banner "Dapat
   Rp...+", dipasang di kartu "Sumber Pendapatan" beranda menggantikan
   baris total polos — gaya visual meniru kartu referensi (garis hijau
   naik, titik-titik bulan, lencana total mengambang di atas titik
   terakhir, banner pencapaian besar di bawah). */
/* Grafik garis pertumbuhan gaya "trading chart": panel gelap, garis
   grid horizontal, warna hijau/merah mengikuti arah tren bulan
   terakhir, badge ticker (nominal + % perubahan), dan label harga
   mengambang di ujung garis — dipasang di kartu "Sumber Pendapatan"
   beranda menggantikan baris total polos. */
function renderIncomeGrowthChartHtml() {
  const series = calcIncomeGrowthSeries(6);
  const values = series.map(s => s.cumulative);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(0, ...values);
  const W = 300, H = 112, padX = 12, padTop = 22, padBottom = 18;
  const stepX = series.length > 1 ? (W - padX * 2) / (series.length - 1) : 0;
  const range = (maxVal - minVal) || 1;
  const scaleY = v => (H - padBottom) - ((v - minVal) / range) * (H - padTop - padBottom);
  const points = series.map((s, i) => ({ x: padX + i * stepX, y: scaleY(s.cumulative), s }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L${last.x.toFixed(1)},${H - padBottom} L${first.x.toFixed(1)},${H - padBottom} Z`;
  const total = series.length ? series[series.length - 1].cumulative : 0;

  if (!total) {
    return `<div class="isc-growth-wrap isc-growth-empty">
      <p>Belum ada pendapatan tercatat — grafik pertumbuhan akan muncul begitu ada data.</p>
    </div>`;
  }

  // Arah tren dilihat dari perbandingan nominal bulan terakhir vs
  // bulan sebelumnya (bukan kumulatif), persis logika ticker saham.
  const prevMonthTotal = series.length > 1 ? series[series.length - 2].monthTotal : 0;
  const lastMonthTotal = series[series.length - 1].monthTotal;
  const diff = lastMonthTotal - prevMonthTotal;
  const pctChange = prevMonthTotal > 0 ? (diff / prevMonthTotal) * 100 : (lastMonthTotal > 0 ? 100 : 0);
  const trend = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
  const trendColor = trend === 'down' ? '#FB7185' : '#10B981';
  const changeLabel = series.length > 1
    ? `${trend === 'down' ? '' : '+'}${pctChange.toFixed(1)}%`
    : 'Baru';

  // Garis grid horizontal tipis ala chart trading (4 baris).
  const gridLines = [0.2, 0.4, 0.6, 0.8].map(f => {
    const gy = padTop + f * (H - padTop - padBottom);
    return `<line x1="${padX}" y1="${gy.toFixed(1)}" x2="${W - padX}" y2="${gy.toFixed(1)}" stroke="rgba(244,247,251,0.07)" stroke-width="1" stroke-dasharray="3 4"/>`;
  }).join('');

  const dotsHtml = points.slice(0, -1).map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${trendColor}" fill-opacity="0.55"/>`
  ).join('');
  const labelsHtml = points.map(p => `<text x="${p.x.toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="7.5" fill="rgba(244,247,251,0.4)">${escapeHtml(p.s.label.split(' ')[0])}</text>`).join('');

  // Label harga mengambang di ujung garis, meniru "current price tag"
  // pada chart trading — nempel di kanan, sejajar titik terakhir.
  const priceTagY = Math.min(Math.max(last.y, padTop + 8), H - padBottom - 8);
  const priceTagHtml = `
    <g transform="translate(${(last.x + 6).toFixed(1)},${priceTagY.toFixed(1)})">
      <circle r="4.5" fill="${trendColor}"/>
      <circle r="4.5" fill="${trendColor}" fill-opacity="0.35"><animate attributeName="r" values="4.5;9;4.5" dur="1.8s" repeatCount="indefinite"/><animate attributeName="fill-opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite"/></circle>
    </g>`;

  return `
    <div class="isc-growth-wrap">
      <div class="isc-growth-top">
        <span class="igt-label">Pertumbuhan Pendapatan</span>
        <div class="isc-ticker-badge ${trend}">
          <span class="igb-amount mono">${fmtRupiahShort(total)}</span>
          <span class="igb-change">${trend !== 'flat' ? iconArrow(trend === 'up' ? 'up' : 'down', 9) : ''}${changeLabel}</span>
        </div>
      </div>
      <svg class="isc-growth-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafik pertumbuhan total pendapatan per bulan, gaya chart trading">
        <defs>
          <linearGradient id="iscGrowthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${trendColor}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${trendColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${areaPath}" fill="url(#iscGrowthFill)" stroke="none"/>
        <path d="${linePath}" fill="none" stroke="${trendColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dotsHtml}
        ${priceTagHtml}
        ${labelsHtml}
      </svg>
      <div class="isc-growth-banner trend-${trend === 'flat' ? 'up' : trend}">
        <span class="igb-icon">${iconArrow(trend === 'down' ? 'down' : 'up', 13)}</span>
        <span class="igb-text">Dapat <strong class="mono">${fmtRupiahShort(total)}+</strong> dari semua sumber pendapatan</span>
      </div>
    </div>
  `;
}

function sourceColor(source) {
  if (INCOME_SOURCE_COLORS[source]) return INCOME_SOURCE_COLORS[source];
  const custom = customSourceByName(source);
  if (custom) return custom.color;
  return categoryColor(source);
}

/* Postingan pendapatan per sumber dalam N hari terakhir (termasuk hari ini),
   terbaru di atas — dipakai kartu "Aktivitas 7 Hari Terakhir". */
function getIncomeSourceRecentEntries(days = 7) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = localDateStr(cutoff);
  return incomeSources
    .filter(x => x.date && x.date >= cutoffStr)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || '')));
}

/* Label tanggal relatif ringkas ("Hari ini" / "Kemarin" / "3 hari lalu" / tgl) */
function relativeIncomeDateLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return 'Hari ini';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterdayStr = localDateStr(y);
  if (dateStr === yesterdayStr) return 'Kemarin';
  const diffDays = Math.round((new Date(today + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / 86400000);
  if (diffDays > 1 && diffDays < 7) return diffDays + ' hari lalu';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

/* ==========================================================
   KARTU "SALDO BANK & E-WALLET" — render grid akun + total,
   dengan saldo tersembunyi (blur) secara default dan tampil
   dengan animasi saat kartu di-hover (desktop) atau disentuh/
   diklik (mobile, karena hover tidak berlaku di layar sentuh).
========================================================== */
function walletTotalBalance() {
  return wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
}

function renderWalletCardHtml(iconWalletCard, animIndex) {
  const total = walletTotalBalance();

  const cardsHtml = wallets.length
    ? wallets.map(w => {
        const catLabel = WALLET_CATEGORY_LABELS[w.category] || WALLET_CATEGORY_LABELS.other;
        return `
        <div class="wallet-deal-card" data-wallet="${w.id}" style="--w-color:${w.color || '#EA580C'}" role="button" tabindex="0" aria-label="Lihat saldo ${escapeAttr(w.name)}">
          <div class="wdc-actions">
            <button class="edit-btn" data-walletedit="${w.id}" type="button" title="Edit akun">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="del-btn" data-walletdel="${w.id}" type="button" title="Hapus akun">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
            </button>
          </div>
          <div class="wdc-head">
            <div class="wdc-logo">${walletLogoHtml(w)}</div>
            <span class="wdc-cat">${escapeHtml(catLabel)}</span>
          </div>
          <div class="wdc-name" title="${escapeAttr(w.name)}">${escapeHtml(w.name)}</div>
          <div class="wdc-balance-wrap">
            <div class="wdc-balance mono">${fmtRupiah(w.balance)}</div>
            <div class="wdc-hint">Sentuh untuk lihat</div>
          </div>
          <button type="button" class="wdc-btn" data-walletedit="${w.id}">Edit Akun</button>
        </div>
      `;
      }).join('')
    : `<div class="wallet-empty-deals">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="13" rx="2.4"/><path d="M3 10h18"/></svg>
        <p>Belum ada akun ditambahkan.</p>
      </div>`;

  return `
    <div class="stat-card stat-special isc-wallet-card fade-up" style="animation-delay:${animIndex * 60}ms">
      <div class="top-row">
        <span class="label">Saldo Bank &amp; E-Wallet</span>
        <div class="wallet-head-right">
          <span class="icon-badge special">${iconWalletCard}</span>
        </div>
      </div>
      <div class="wallet-total-line">
        <svg class="wtl-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.2 9v.01M17.8 15v.01"/></svg>
        <div class="wallet-total-stat" id="walletTotalStat" role="button" tabindex="0" aria-label="Sentuh untuk lihat total saldo">
          <span class="wts-label">Total Saldo <span class="wts-hint">(sentuh untuk lihat)</span></span>
          <span class="wallet-total-value mono" id="walletTotalValue">${fmtRupiah(total)}</span>
        </div>
        <div class="wallet-account-pill" title="${wallets.length} akun tersimpan">
          <span class="wap-num mono">${wallets.length}</span>
          <span class="wap-label">Akun</span>
        </div>
      </div>
      <div class="wallet-deals-strip" id="walletDealsStrip">
        ${cardsHtml}
        <button type="button" class="wallet-deal-add" id="walletAddTileBtn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
          <span>Tambah Akun</span>
        </button>
      </div>
      <div class="wallet-manual-note">Total saldo di-update secara manual</div>
    </div>
  `;
}

/* Kartu "Saldo Bank & E-Wallet" menampilkan semua akun sebagai strip
   kartu putih yang bergeser SENDIRI secara halus (slider otomatis),
   dan tetap bisa digeser manual kapan saja. Lihat startWalletAutoScroll
   di bawah untuk detail animasinya. */
const walletAutoScrollState = { rafId: null, dir: 1, paused: false, resumeTimer: null };

function stopWalletAutoScroll() {
  if (walletAutoScrollState.rafId) cancelAnimationFrame(walletAutoScrollState.rafId);
  walletAutoScrollState.rafId = null;
  clearTimeout(walletAutoScrollState.resumeTimer);
}

function startWalletAutoScroll() {
  const strip = document.getElementById('walletDealsStrip');
  if (!strip) return;
  stopWalletAutoScroll();

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;
  // FIX "BERAT DI HP": loop di bawah ini (lewat requestAnimationFrame)
  // menggeser strip.scrollLeft SEDIKIT DEMI SEDIKIT 60x PER DETIK,
  // TANPA PERNAH BERHENTI, selama kartu Saldo Bank & E-Wallet ada di
  // halaman — bukan cuma sekali animasi lalu selesai. Di HP, tiap
  // penulisan scrollLeft memaksa browser menghitung ulang posisi
  // scroll & repaint strip-nya, dan karena ini jalan terus-menerus di
  // BELAKANG LAYAR juga (tidak berhenti walau kartu sedang discroll
  // keluar dari layar/tidak terlihat), efeknya numpuk jadi salah satu
  // penyumbang beban CPU/baterai terus-menerus paling besar di
  // halaman ini. Di layar HP, geser manual pakai jari (swipe) sudah
  // alami & mudah, jadi fitur auto-geser ini dimatikan saja di lebar
  // layar HP -- kartu tetap bisa digeser manual seperti biasa, cuma
  // tidak lagi bergeser sendiri tanpa disentuh.
  const isMobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
  if (isMobile) return;

  walletAutoScrollState.dir = 1;
  walletAutoScrollState.paused = false;

  const SPEED = 0.45; // px per frame (≈ 27px/detik pada 60fps) — pelan & santai
  const RESUME_DELAY = 2200; // jeda sebelum lanjut geser sendiri setelah disentuh

  function pause() {
    walletAutoScrollState.paused = true;
    strip.classList.add('is-auto-paused');
    clearTimeout(walletAutoScrollState.resumeTimer);
  }
  function resumeLater() {
    clearTimeout(walletAutoScrollState.resumeTimer);
    walletAutoScrollState.resumeTimer = setTimeout(() => {
      walletAutoScrollState.paused = false;
      strip.classList.remove('is-auto-paused');
    }, RESUME_DELAY);
  }

  function step() {
    if (!strip.isConnected) { stopWalletAutoScroll(); return; }
    const max = strip.scrollWidth - strip.clientWidth;
    if (max > 2 && !walletAutoScrollState.paused) {
      strip.scrollLeft += SPEED * walletAutoScrollState.dir;
      if (strip.scrollLeft >= max - 1) walletAutoScrollState.dir = -1;
      else if (strip.scrollLeft <= 1) walletAutoScrollState.dir = 1;
    }
    walletAutoScrollState.rafId = requestAnimationFrame(step);
  }
  walletAutoScrollState.rafId = requestAnimationFrame(step);

  if (!strip._autoScrollBound) {
    strip._autoScrollBound = true;
    strip.addEventListener('mouseenter', pause);
    strip.addEventListener('mouseleave', resumeLater);
    strip.addEventListener('touchstart', pause, { passive: true });
    strip.addEventListener('touchend', resumeLater, { passive: true });
    // Scroll wheel mouse (vertikal) diterjemahkan jadi geser horizontal
    // pada strip, supaya pengguna mouse (bukan trackpad) tetap bisa
    // menggeser daftar akun tanpa perlu klik-tarik manual.
    strip.addEventListener('wheel', (e) => {
      pause();
      resumeLater();
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return; // tidak ada yang perlu digeser
      e.preventDefault();
      strip.scrollLeft += delta;
    }, { passive: false });
    strip.addEventListener('pointerdown', pause);
    strip.addEventListener('pointerup', resumeLater);
  }
}

/* Model grafik "Komposisi Sumber Pendapatan" v2: sumber #1 tampil
   sebagai kartu "spotlight" (ring persentase + nominal besar) di
   atas, supaya penyumbang pendapatan terbesar langsung kelihatan.
   Sisanya (rank #2 dst) jadi ranking list ringkas dengan ring mini
   senada + bar tipis, tanpa perlu mencocokkan warna ke legend
   terpisah seperti model donut lama. */
function renderIncomeSourceChart(list) {
  const wrap = document.getElementById('incSourceBarChart');
  if (!wrap) return;

  if (!list) list = getIncomeSourceMonthEntries();
  const byatSource = {};
  list.forEach(x => {
    byatSource[x.source] = (byatSource[x.source] || 0) + (Number(x.amount) || 0);
  });
  const entries = Object.entries(byatSource).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    wrap.innerHTML = `<div class="chart-empty">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
      <p>Belum ada pendapatan pada periode/filter ini untuk ditampilkan.</p>
    </div>`;
    return;
  }

  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);
  const colors = labels.map(l => sourceColor(l));
  const total = values.reduce((a, b) => a + b, 0);

  const topLabel = labels[0], topValue = values[0], topColor = colors[0];
  const topPct = Math.round(topValue / total * 100);
  const rest = labels.slice(1);

  const spotHtml = `
    <div class="isc-spot" data-source="${escapeAttr(topLabel)}" style="--spot-color:${topColor};">
      <div class="isc-spot-ring" data-spotring>
        <span class="isc-spot-ring-val">${topPct}%</span>
        <span class="isc-spot-medal" title="Sumber #1 bulan ini">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7"/></svg>
        </span>
      </div>
      <div class="isc-spot-body">
        <span class="isc-spot-eyebrow">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 14.9 8.6 22 9.3 16.7 14 18.2 21 12 17.3 5.8 21 7.3 14 2 9.3 9.1 8.6z"/></svg>
          Sumber Teratas
        </span>
        <span class="isc-spot-name" title="${escapeHtml(topLabel)}">${escapeHtml(topLabel)}</span>
        <span class="isc-spot-amount mono">${fmtRupiah(topValue)}</span>
        <span class="isc-spot-sub">dari total ${fmtRupiah(total)}</span>
      </div>
    </div>`;

  const listHtml = rest.length === 0 ? '' : `<div class="isc-comp-list">${rest.map((label, idx) => {
    const i = idx + 1;
    const pct = Math.round(values[i] / total * 100);
    return `
      <div class="isc-comp-row" data-source="${escapeAttr(label)}" style="--row-color:${colors[i]};">
        <div class="isc-comp-ring" data-ring>
          <span>${i + 1}</span>
        </div>
        <div class="isc-comp-main">
          <div class="isc-comp-toprow">
            <span class="isc-comp-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            <span class="isc-comp-pct">${pct}%</span>
          </div>
          <div class="isc-comp-track"><div class="isc-comp-fill" data-barfill></div></div>
        </div>
        <span class="isc-comp-amount mono">${fmtRupiah(values[i])}</span>
      </div>`;
  }).join('')}</div>`;

  wrap.innerHTML = spotHtml + listHtml;

  requestAnimationFrame(() => {
    const spotRing = wrap.querySelector('[data-spotring]');
    if (spotRing) spotRing.style.setProperty('--spot-pct', topPct);
    wrap.querySelectorAll('[data-ring]').forEach((ring, idx) => {
      const i = idx + 1;
      const pct = Math.round(values[i] / total * 100);
      ring.style.setProperty('--row-pct', pct);
    });
    wrap.querySelectorAll('[data-barfill]').forEach((bar, idx) => {
      const i = idx + 1;
      const widthPct = Math.max(Math.round(values[i] / topValue * 100), 4);
      bar.style.width = widthPct + '%';
    });
  });
}

// Donut sederhana khusus grafik pendapatan per sumber — mandiri,
// tidak berbagi state dengan grafik komposisi transaksi utama.
function drawSimpleDonut(canvas, values, colors) {
  const wrap = canvas.parentElement;
  const rectSize = Math.min(wrap.clientWidth, wrap.clientHeight) || 200;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rectSize * dpr;
  canvas.height = rectSize * dpr;
  canvas.style.width = rectSize + 'px';
  canvas.style.height = rectSize + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectSize, rectSize);

  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return;

  const cx = rectSize / 2, cy = rectSize / 2;
  const outerR = rectSize / 2 - 3;
  const innerR = outerR * 0.66;
  const gap = values.length > 1 ? 0.02 : 0;

  let start = 0;
  values.forEach((v, i) => {
    const frac = v / total;
    const a0 = (-Math.PI / 2) + start * Math.PI * 2 + gap / 2;
    const a1 = (-Math.PI / 2) + (start + frac) * Math.PI * 2 - gap / 2;
    const a1safe = Math.max(a0, a1);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1safe);
    ctx.arc(cx, cy, innerR, a1safe, a0, true);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();

    if (frac >= 0.06) {
      const midAngle = (-Math.PI / 2) + (start + frac / 2) * Math.PI * 2;
      const labelR = (outerR + innerR) / 2;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      ctx.font = '600 ' + Math.max(10, Math.round(rectSize * 0.055)) + 'px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 3;
      ctx.fillText(Math.round(frac * 100) + '%', lx, ly);
      ctx.shadowBlur = 0;
    }
    start += frac;
  });
}

/* ==========================================================
   REDESAIN HALAMAN "SUMBER PENDAPATAN" — state filter/cari/urutkan
   & rendering baru (dikelompokkan per tanggal). Data mentahnya tetap
   dari `incomeSources` yang sama (localStorage alirin_income_sources_v1),
   hanya cara memfilter/menampilkannya yang baru. Preferensi filter TIDAK
   disimpan permanen — selalu reset ke default tiap halaman dibuka lagi,
   supaya perilakunya konsisten & tidak membingungkan.
========================================================== */
const incPageState = {
  search: '',
  period: 'month',      // 'month' | 'lastmonth' | '3months' | 'all'
  sort: 'date-desc',     // 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
  sources: null,         // null = semua sumber aktif; Set(nama) kalau difilter
};

function incResetPageState() {
  incPageState.search = '';
  incPageState.period = 'month';
  incPageState.sort = 'date-desc';
  incPageState.sources = null;
}

/* Entries sesuai periode terpilih saja (belum kena cari/sumber/urutan) */
function incEntriesForPeriod(period) {
  if (period === 'lastmonth') return getIncomeSourceLastMonthEntries();
  if (period === 'all') return getIncomeSourceAllEntries();
  if (period === '3months') {
    const cutoff = new Date();
    cutoff.setDate(1);
    cutoff.setMonth(cutoff.getMonth() - 2);
    const cutoffMonth = localMonthStr(cutoff);
    return incomeSources
      .filter(x => x.date && x.date.slice(0, 7) >= cutoffMonth)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || '')));
  }
  return getIncomeSourceMonthEntries();
}

const INC_PERIOD_LABELS = { month: 'Bulan Ini', lastmonth: 'Bulan Lalu', '3months': '3 Bulan Terakhir', all: 'Semua Waktu' };

/* Gabungan cari + filter sumber + urutkan, dipakai untuk daftar riwayat */
function incFilteredSortedEntries() {
  let list = incEntriesForPeriod(incPageState.period).slice();

  if (incPageState.sources) {
    list = list.filter(x => incPageState.sources.has(x.source));
  }

  const q = incPageState.search.trim().toLowerCase();
  if (q) {
    list = list.filter(x =>
      (x.source || '').toLowerCase().includes(q) ||
      (x.platform || '').toLowerCase().includes(q) ||
      (x.note || '').toLowerCase().includes(q)
    );
  }

  switch (incPageState.sort) {
    case 'date-asc':
      list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id || '').localeCompare(String(b.id || '')));
      break;
    case 'amount-desc':
      list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
      break;
    case 'amount-asc':
      list.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
      break;
    default: // date-desc
      list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || '')));
  }
  return list;
}

/* Chip filter per Sumber Pendapatan — hanya menampilkan sumber yang
   benar-benar punya catatan pada periode terpilih, plus chip "Semua". */
function renderIncomeSourceChips() {
  const wrap = document.getElementById('incSourceChips');
  if (!wrap) return;
  const periodEntries = incEntriesForPeriod(incPageState.period);
  const namesInPeriod = Array.from(new Set(periodEntries.map(x => x.source)));
  const allNames = getAllIncomeSourceNames().filter(n => namesInPeriod.includes(n));
  namesInPeriod.forEach(n => { if (!allNames.includes(n)) allNames.push(n); });

  if (allNames.length === 0) { wrap.innerHTML = ''; return; }

  const allActive = !incPageState.sources;
  let html = `<button type="button" class="isp-chip isp-chip-all ${allActive ? 'active' : ''}" data-incchip="__all__">Semua</button>`;
  html += allNames.map(name => {
    const active = allActive || incPageState.sources.has(name);
    const color = sourceColor(name);
    return `<button type="button" class="isp-chip ${active ? 'active' : ''}" style="--chip-color:${color}" data-incchip="${escapeAttr(name)}">
      <span class="isp-chip-dot"></span>${escapeHtml(name)}
    </button>`;
  }).join('');
  wrap.innerHTML = html;
}

function incToggleChip(name) {
  if (name === '__all__') { incPageState.sources = null; refreshIncomeSourcePage(); return; }
  const wrap = document.getElementById('incSourceChips');
  const periodEntries = incEntriesForPeriod(incPageState.period);
  const namesInPeriod = Array.from(new Set(periodEntries.map(x => x.source)));
  const allNames = getAllIncomeSourceNames().filter(n => namesInPeriod.includes(n));
  namesInPeriod.forEach(n => { if (!allNames.includes(n)) allNames.push(n); });

  let current = incPageState.sources ? new Set(incPageState.sources) : new Set(allNames);
  if (current.has(name)) current.delete(name); else current.add(name);
  // Kalau semua kepilih lagi, anggap sama dengan "Semua" (null)
  incPageState.sources = (current.size >= allNames.length) ? null : current;
  refreshIncomeSourcePage();
}

/* Grup label tanggal ringkas ("Hari ini" / "Kemarin" / tanggal lengkap) */
function incGroupDateLabel(dateStr) {
  const rel = relativeIncomeDateLabel(dateStr);
  if (rel === 'Hari ini' || rel === 'Kemarin') return rel;
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function renderIncomeSourceList() {
  const list = incFilteredSortedEntries();
  const body = document.getElementById('incListBody');
  const empty = document.getElementById('incListEmpty');
  const countLabel = document.getElementById('incListCount');
  if (!body) return;

  if (countLabel) countLabel.textContent = `${list.length} catatan`;

  if (list.length === 0) {
    body.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      const hasActiveFilter = incPageState.search.trim() || incPageState.sources;
      empty.innerHTML = hasActiveFilter
        ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
           <p>Tidak ada catatan yang cocok dengan pencarian/filter ini.</p>
           <button type="button" id="incClearFiltersBtn">Reset pencarian &amp; filter</button>`
        : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5"/><circle cx="16" cy="16" r="5"/><path d="M8 13v3M16 6v3"/></svg>
           <p>Belum ada pendapatan tercatat pada periode ini.</p>`;
      const clearBtn = document.getElementById('incClearFiltersBtn');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        incPageState.search = '';
        incPageState.sources = null;
        const input = document.getElementById('incSearchInput');
        if (input) input.value = '';
        const searchWrap = document.getElementById('incSearchWrap');
        if (searchWrap) searchWrap.classList.remove('has-value');
        refreshIncomeSourcePage();
      });
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  // Kelompokkan berturut-turut per tanggal (list sudah terurut sesuai incPageState.sort;
  // kalau urutan bukan berdasar tanggal, pengelompokan tetap jalan mengikuti urutan tampil).
  const groups = [];
  list.forEach(x => {
    const last = groups[groups.length - 1];
    if (last && last.date === x.date) last.items.push(x);
    else groups.push({ date: x.date, items: [x] });
  });

  let rowIdx = 0;
  body.innerHTML = groups.map(g => {
    const groupTotal = g.items.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    const rowsHtml = g.items.map(x => {
      const delay = Math.min(rowIdx++, 14) * 30;
      const color = sourceColor(x.source);
      return `
        <div class="isp-entry-row fade-up" style="animation-delay:${delay}ms">
          <span class="isp-entry-icon" style="--entry-color:${color}" data-source="${escapeAttr(x.source)}" role="button" tabindex="0" title="Klik untuk lihat rincian platform">
            ${incSourceIconHtmlSafe(x.source)}
          </span>
          <div class="isp-entry-main">
            <div class="isp-entry-source-row">
              <span class="isp-entry-source-name cat-pill" data-source="${escapeAttr(x.source)}" role="button" tabindex="0" title="Klik untuk lihat rincian platform" style="background:none;border:none;padding:0;color:var(--ink);">
                ${escapeHtml(x.source)}
              </span>
              ${x.platform ? `<span class="isp-entry-platform">${escapeHtml(x.platform)}</span>` : ''}
            </div>
            ${x.note ? `<div class="isp-entry-note" title="${escapeHtml(x.note)}">${escapeHtml(x.note)}</div>` : ''}
          </div>
          <div class="isp-entry-right">
            <div class="isp-entry-amount-wrap">
              <div class="isp-entry-amount">+ ${fmtRupiah(x.amount)}</div>
            </div>
            <div class="row-actions">
              <button class="icon-btn edit" data-incedit="${x.id}" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="icon-btn del" data-incdel="${x.id}" title="Hapus">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="isp-date-group">
        <div class="isp-date-group-head">
          <span>${incGroupDateLabel(g.date)}</span>
          <span class="isp-date-group-total">+ ${fmtRupiah(groupTotal)}</span>
        </div>
        ${rowsHtml}
      </div>`;
  }).join('');
}

/* Ikon kecil aman (fallback ke titik warna polos) dipakai pada bulatan
   ikon tiap baris riwayat — memakai fungsi ikon sumber yang sudah ada
   (logo bawaan / kustom / lencana inisial) kalau tersedia. */
function incSourceIconHtmlSafe(source) {
  try {
    if (typeof sourceIcon === 'function') return sourceIcon(source);
  } catch (e) { /* abaikan, pakai fallback */ }
  return `<span style="width:9px;height:9px;border-radius:50%;background:currentColor;display:block;"></span>`;
}

/* Unduh entri yang SEDANG TAMPIL (sesuai cari/filter/periode aktif)
   sebagai file Excel (.xlsx) bergaya lewat ExcelJS. */
async function exportIncomeSourceExcel() {
  const list = incFilteredSortedEntries();
  if (list.length === 0) { showToast('Tidak ada data untuk diekspor.', 'err'); return; }
  if (typeof ExcelJS === 'undefined') {
    try { await ensureExportLibsLoaded(); } catch (e) { showToast('Gagal memuat pustaka Excel. Cek koneksi internet.', 'err'); return; }
  }
  if (typeof ExcelJS === 'undefined') { showToast('Pustaka Excel belum siap, coba lagi.', 'err'); return; }

  const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZAYAIN';
  wb.created = new Date();
  const ws = wb.addWorksheet('Sumber Pendapatan', { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.columns = [
    { width: 13 }, { width: 20 }, { width: 20 }, { width: 34 }, { width: 20 }
  ];

  ws.mergeCells('A1:E1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ZAYAIN — Sumber Pendapatan';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:E2');
  const subCell = ws.getCell('A2');
  subCell.value = `Diunduh ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • ${list.length} catatan • Total ${fmtRupiahPlain(total)}`;
  subCell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FFD1FAE5' } };
  ws.getRow(2).height = 20;

  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 5; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1220' } };
    }
  }

  const header = ['Tanggal', 'Sumber', 'Platform', 'Catatan', 'Jumlah (Rp)'];
  const headerRow = ws.getRow(4);
  headerRow.values = header;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.alignment = { vertical: 'middle', horizontal: cell.value === 'Jumlah (Rp)' ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF047857' } } };
  });
  headerRow.height = 22;

  list.forEach((x, i) => {
    const row = ws.addRow([
      x.date ? new Date(x.date + 'T00:00:00') : '',
      x.source || '',
      x.platform || '',
      x.note || '',
      Number(x.amount) || 0
    ]);
    const zebra = i % 2 === 1;
    row.eachCell((cell, colNum) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E8EF' } } };
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
      if (colNum === 1) cell.numFmt = 'dd/mm/yyyy';
      if (colNum === 5) { cell.numFmt = '#,##0 "Rp"'; cell.alignment = { horizontal: 'right' }; cell.font = { color: { argb: 'FF059669' }, bold: true }; }
    });
  });

  const totalRow = ws.addRow(['', '', '', 'TOTAL', total]);
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 11.5 };
    cell.border = { top: { style: 'medium', color: { argb: 'FF0B1220' } } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E9F5' } };
    if (colNum === 5) { cell.numFmt = '#,##0 "Rp"'; cell.alignment = { horizontal: 'right' }; }
    if (colNum === 4) cell.alignment = { horizontal: 'right' };
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `sumber-pendapatan-${todayStr()}.xlsx`);
  showToast(`${list.length} catatan diekspor ke Excel.`);
}

/* Unduh entri yang SEDANG TAMPIL sebagai laporan PDF bergaya. */
async function exportIncomeSourcePdf() {
  const list = incFilteredSortedEntries();
  if (list.length === 0) { showToast('Tidak ada data untuk diekspor.', 'err'); return; }
  if (typeof window.jspdf === 'undefined') {
    try { await ensureExportLibsLoaded(); } catch (e) { showToast('Gagal memuat pustaka PDF. Cek koneksi internet.', 'err'); return; }
  }
  if (typeof window.jspdf === 'undefined') { showToast('Pustaka PDF belum siap, coba lagi.', 'err'); return; }

  const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 18, 32);
  doc.rect(0, 0, pageW, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ZAYAIN', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Laporan Sumber Pendapatan', 40, 52);
  doc.setFontSize(9.5);
  doc.setTextColor(209, 250, 229);
  const dateLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Diunduh ${dateLabel}  •  ${list.length} catatan`, 40, 66);

  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(fmtRupiahPlain(total), pageW - 40, 52, { align: 'right' });

  doc.autoTable({
    startY: 96,
    head: [['Tanggal', 'Sumber', 'Platform', 'Catatan', 'Jumlah']],
    body: list.map(x => [
      x.date ? new Date(x.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      x.source || '-', x.platform || '-', x.note || '-', fmtRupiahPlain(Number(x.amount) || 0)
    ]),
    foot: [['', '', '', 'TOTAL', fmtRupiahPlain(total)]],
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    footStyles: { fillColor: [230, 233, 245], textColor: [19, 26, 42], fontStyle: 'bold', fontSize: 9.5 },
    bodyStyles: { fontSize: 9, textColor: [19, 26, 42] },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    columnStyles: { 4: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold' } },
    margin: { left: 40, right: 40 },
    styles: { cellPadding: 6, lineColor: [228, 232, 239], lineWidth: 0.5 },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8.5);
      doc.setTextColor(138, 147, 163);
      doc.text(`Halaman ${data.pageNumber} / ${pageCount}`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      doc.text('ZAYAIN — Kelola Uang Masuk & Keluar', 40, doc.internal.pageSize.getHeight() - 20);
    }
  });

  doc.save(`sumber-pendapatan-${todayStr()}.pdf`);
  showToast(`${list.length} catatan diekspor ke PDF.`);
}

function refreshIncomeSourcePage() {
  if (!document.getElementById('incomeSourceOverlay').classList.contains('open')) return;

  const monthTotal = calcIncomeSourceMonthTotal();
  const lastMonthTotal = calcIncomeSourceLastMonthTotal();
  const allTimeTotal = calcIncomeSourceAllTotal();
  const allTimeCount = incomeSources.length;

  const now = new Date();
  const daysElapsed = now.getDate();
  const avgPerDay = daysElapsed > 0 ? monthTotal / daysElapsed : 0;

  document.getElementById('incTotalAmount').textContent = fmtRupiah(monthTotal);
  document.getElementById('incAvgDay').textContent = fmtRupiah(avgPerDay);
  document.getElementById('incAllTimeTotal').textContent = fmtRupiah(allTimeTotal);
  document.getElementById('incTotalCount').textContent = allTimeCount;

  const trendEl = document.getElementById('incMonthTrend');
  if (trendEl) {
    if (lastMonthTotal > 0) {
      const diffPct = Math.round(((monthTotal - lastMonthTotal) / lastMonthTotal) * 100);
      trendEl.classList.remove('trend-up', 'trend-down');
      if (diffPct > 0) {
        trendEl.classList.add('trend-up');
        trendEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 19 19 5M19 5H9M19 5v10"/></svg> ${diffPct}% dari bulan lalu`;
      } else if (diffPct < 0) {
        trendEl.classList.add('trend-down');
        trendEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 5 19 19M19 19H9M19 19V9"/></svg> ${Math.abs(diffPct)}% dari bulan lalu`;
      } else {
        trendEl.textContent = 'Sama seperti bulan lalu';
      }
    } else {
      trendEl.textContent = monthTotal > 0 ? 'Belum ada data bulan lalu' : '\u2014';
    }
  }

  const periodLabel = INC_PERIOD_LABELS[incPageState.period] || 'Bulan Ini';
  const periodLabelEl = document.getElementById('incChartPeriodLabel');
  if (periodLabelEl) periodLabelEl.textContent = periodLabel;
  const eyebrowEl = document.getElementById('incChartPeriodEyebrow');
  if (eyebrowEl) eyebrowEl.textContent = periodLabel;

  renderIncomeSourceChips();
  const filtered = incFilteredSortedEntries();
  renderIncomeSourceChart(filtered);
  renderIncomeSourceList();
}

function openIncomeSourcePage() {
  if (document.getElementById('detailPageOverlay').classList.contains('open')) closeDetailPage();
  if (document.getElementById('leaderboardOverlay').classList.contains('open')) closeLeaderboardPage();
  if (document.getElementById('widgetSettingsOverlay').classList.contains('open')) closeWidgetSettingsPage();
  if (document.getElementById('bdAllOverlay').classList.contains('open')) closeBdAllPage();

  incResetPageState();
  const searchInput = document.getElementById('incSearchInput');
  if (searchInput) searchInput.value = '';
  const searchWrap = document.getElementById('incSearchWrap');
  if (searchWrap) searchWrap.classList.remove('has-value');
  const periodSelect = document.getElementById('incPeriodSelect');
  if (periodSelect) periodSelect.value = incPageState.period;
  const sortSelect = document.getElementById('incSortSelect');
  if (sortSelect) sortSelect.value = incPageState.sort;

  // PENTING: tambahkan class 'open' DULU, baru refresh — refreshIncomeSourcePage()
  // sengaja tidak mengerjakan apa-apa kalau overlay belum berstatus 'open'
  // (dipakai juga sebagai guard supaya tidak render sia-sia saat overlay
  // tertutup, misal dipanggil dari flow lain). Urutan terbalik akan bikin
  // refresh selalu di-skip dan halaman detail muncul kosong (Rp 0 / 0 catatan)
  // padahal datanya ada.
  document.getElementById('incomeSourceOverlay').classList.add('open');
  refreshIncomeSourcePage();
  lockBodyScroll();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function closeIncomeSourcePage() {
  document.getElementById('incomeSourceOverlay').classList.remove('open');
  unlockBodyScroll();
}

document.getElementById('incBackBtn').addEventListener('click', closeIncomeSourcePage);

/* ---- Ikatan kontrol baru: cari, periode, urutkan, chip sumber, export ---- */
(function bindIncomeSourcePageControls() {
  const searchInput = document.getElementById('incSearchInput');
  const searchWrap = document.getElementById('incSearchWrap');
  const searchClearBtn = document.getElementById('incSearchClearBtn');
  const periodSelect = document.getElementById('incPeriodSelect');
  const sortSelect = document.getElementById('incSortSelect');
  const chipsWrap = document.getElementById('incSourceChips');
  const exportBtn = document.getElementById('incExportBtn');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      incPageState.search = searchInput.value;
      if (searchWrap) searchWrap.classList.toggle('has-value', !!searchInput.value);
      renderIncomeSourceList();
    });
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      incPageState.search = '';
      if (searchInput) searchInput.value = '';
      if (searchWrap) searchWrap.classList.remove('has-value');
      renderIncomeSourceList();
      if (searchInput) searchInput.focus();
    });
  }
  if (periodSelect) {
    periodSelect.addEventListener('change', () => {
      incPageState.period = periodSelect.value;
      incPageState.sources = null; // reset filter sumber saat periode berubah
      refreshIncomeSourcePage();
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      incPageState.sort = sortSelect.value;
      renderIncomeSourceList();
    });
  }
  if (chipsWrap) {
    chipsWrap.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-incchip]');
      if (!chip) return;
      incToggleChip(chip.dataset.incchip);
    });
  }
  setupExportMenu('incExportBtn', 'incExportMenu');
  const incExportXlsx = document.getElementById('incExportXlsx');
  const incExportPdf = document.getElementById('incExportPdf');
  if (incExportXlsx) incExportXlsx.addEventListener('click', () => { document.getElementById('incExportMenu')._close(); exportIncomeSourceExcel(); });
  if (incExportPdf) incExportPdf.addEventListener('click', () => { document.getElementById('incExportMenu')._close(); exportIncomeSourcePdf(); });
})();

/* ---------- Modal Tambah/Edit Pendapatan ---------- */
const incomeModal = document.getElementById('incomeModalOverlay');

function populateIncomeSourceSelect() {
  const sel = document.getElementById('incomeSource');
  sel.innerHTML = getAllIncomeSourceNames().map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
}

/* Kolom "Platform" pada form Tambah/Edit Pendapatan menyesuaikan
   otomatis sesuai Sumber yang dipilih (mis. pilih Adsense -> muncul
   pilihan YouTube / Website). Disembunyikan untuk sumber manual yang
   tidak punya daftar platform baku. */
function populateIncomePlatformSelect(source, selectedValue) {
  const row = document.getElementById('incomePlatformRow');
  const sel = document.getElementById('incomePlatform');
  if (!row || !sel) return;
  row.style.display = '';
  const platforms = getAllPlatformsForSource(source);
  sel.innerHTML = '<option value="">Umum / Tidak ditentukan</option>' +
    platforms.map(p => `<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  sel.value = selectedValue || '';
}

document.getElementById('incomeSource').addEventListener('change', (e) => {
  populateIncomePlatformSelect(e.target.value);
});

/* Tombol "Ganti Ikon" di sebelah label Sumber Pendapatan pada form
   Tambah/Edit Pendapatan — jalan pintas ke modal Ganti Ikon yang sama
   dengan yang dibuka lewat pensil kecil pada bubble kartu beranda,
   supaya pengguna bisa langsung mengganti logo sumber yang sedang
   dipilih tanpa perlu menutup form ini dulu (modal Ganti Ikon
   tertumpuk di atas, sama seperti modal Kelola Platform). */
document.getElementById('incomeSourceIconBtn').addEventListener('click', () => {
  const source = document.getElementById('incomeSource').value;
  if (!source) { showToast('Pilih sumber pendapatan dulu.', 'err'); return; }
  openSourceIconModal(source);
});

function openIncomeModal() {
  editingIncomeId = null;
  document.getElementById('incomeForm').reset();
  document.getElementById('incomeId').value = '';
  document.getElementById('incomeDate').value = todayStr();
  document.getElementById('incomeModalTitle').textContent = 'Tambah Pendapatan';
  document.getElementById('btnSubmitIncome').textContent = 'Simpan';
  populateIncomeSourceSelect();
  populateIncomePlatformSelect(document.getElementById('incomeSource').value);
  openModal(incomeModal);
}

function openEditIncomeModal(id) {
  const item = incomeSources.find(x => x.id === id);
  if (!item) return;
  editingIncomeId = id;
  populateIncomeSourceSelect();
  document.getElementById('incomeId').value = item.id;
  document.getElementById('incomeSource').value = item.source;
  document.getElementById('incomeAmount').value = item.amount;
  document.getElementById('incomeDate').value = item.date;
  document.getElementById('incomeNote').value = item.note || '';
  populateIncomePlatformSelect(item.source, item.platform);
  document.getElementById('incomeModalTitle').textContent = 'Edit Pendapatan';
  document.getElementById('btnSubmitIncome').textContent = 'Simpan Perubahan';
  openModal(incomeModal);
}

document.getElementById('incAddBtn').addEventListener('click', openIncomeModal);

document.getElementById('incomeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const source = document.getElementById('incomeSource').value;
  const platform = document.getElementById('incomePlatform') ? document.getElementById('incomePlatform').value : '';
  const amount = parseFloat(document.getElementById('incomeAmount').value);
  const date = document.getElementById('incomeDate').value;
  const note = document.getElementById('incomeNote').value.trim();

  if (!source) { showToast('Pilih sumber pendapatan.', 'err'); return; }
  if (!amount || amount <= 0) { showToast('Jumlah harus lebih dari 0.', 'err'); return; }
  if (!date) { showToast('Tanggal wajib diisi.', 'err'); return; }

  if (editingIncomeId) {
    const idx = incomeSources.findIndex(x => x.id === editingIncomeId);
    if (idx > -1) incomeSources[idx] = { ...incomeSources[idx], source, platform, amount, date, note };
    showToast('Pendapatan berhasil diperbarui.');
  } else {
    incomeSources.push({ id: cryptoId(), source, platform, amount, date, note });
    showToast('Pendapatan berhasil ditambahkan.');
  }

  persistIncomeSources();
  closeModal(incomeModal);
  editingIncomeId = null;
  renderSummary();
  refreshIncomeSourcePage();
});

document.getElementById('incomeModalCloseBtn').addEventListener('click', () => closeModal(incomeModal));
document.getElementById('btnIncomeCancel').addEventListener('click', () => closeModal(incomeModal));
incomeModal.addEventListener('click', (e) => { if (e.target === incomeModal) closeModal(incomeModal); });

/* ==========================================================
   MODAL KELOLA PLATFORM (tambah/hapus pilihan platform per Sumber)
   Dibuka lewat tombol "Kelola" di sebelah label Platform (opsional)
   pada form Tambah/Edit Pendapatan. Selalu mengacu ke Sumber yang
   sedang dipilih pada form saat itu (managePlatformSource). Platform
   bawaan (INCOME_SOURCE_PLATFORMS) ditandai "Bawaan" & tidak bisa
   dihapus dari sini; hanya platform kustom yang ditambahkan sendiri
   yang punya tombol hapus.
========================================================== */
const platformManageModal = document.getElementById('platformManageModalOverlay');
let managePlatformSource = '';
let deletingPlatformSource = '';

function renderPlatformManageList() {
  const wrap = document.getElementById('platformManageList');
  const platforms = getAllPlatformsForSource(managePlatformSource);
  if (!platforms.length) {
    wrap.innerHTML = `<p class="platform-manage-empty">Belum ada pilihan platform untuk sumber ini.</p>`;
    return;
  }
  wrap.innerHTML = platforms.map(p => `
    <div class="platform-manage-chip">
      <span class="pmc-name">${escapeHtml(p.name)}</span>
      ${p.custom
        ? `<button type="button" class="pmc-del" data-platformdel="${p.id}" title="Hapus platform ini" aria-label="Hapus ${escapeAttr(p.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>`
        : `<span class="pmc-badge">Bawaan</span>`}
    </div>
  `).join('');
  wrap.querySelectorAll('[data-platformdel]').forEach(btn => {
    btn.addEventListener('click', () => {
      deletingPlatformSource = managePlatformSource;
      // Tutup modal ini dulu supaya modal konfirmasi hapus (berbagi
      // dengan fitur lain) tidak tertutupi / bertumpuk di belakangnya.
      closeModal(platformManageModal);
      openDeleteConfirm(btn.dataset.platformdel, 'platform');
    });
  });
}

function openPlatformManageModal(source) {
  managePlatformSource = source || document.getElementById('incomeSource').value;
  document.getElementById('platformManageSub').textContent = `Sumber: ${managePlatformSource || '-'}`;
  document.getElementById('platformManageForm').reset();
  renderPlatformManageList();
  openModal(platformManageModal);
}

document.getElementById('incomePlatformManageBtn').addEventListener('click', () => openPlatformManageModal());
document.getElementById('platformManageCloseBtn').addEventListener('click', () => closeModal(platformManageModal));
document.getElementById('btnPlatformManageDone').addEventListener('click', () => closeModal(platformManageModal));
platformManageModal.addEventListener('click', (e) => { if (e.target === platformManageModal) closeModal(platformManageModal); });

document.getElementById('platformManageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('platformManageName');
  const name = input.value.trim();
  if (!name) { showToast('Nama platform wajib diisi.', 'err'); return; }
  const existing = getAllPlatformsForSource(managePlatformSource).map(p => p.name.toLowerCase());
  if (existing.includes(name.toLowerCase())) { showToast('Platform ini sudah ada di daftar.', 'err'); return; }

  if (!customIncomePlatforms[managePlatformSource]) customIncomePlatforms[managePlatformSource] = [];
  customIncomePlatforms[managePlatformSource].push({ id: cryptoId(), name });
  persistCustomIncomePlatforms();
  input.value = '';
  renderPlatformManageList();
  // Sinkronkan dropdown Platform pada form Tambah/Edit Pendapatan yang
  // masih terbuka di belakang modal ini, sekalian pilih platform baru.
  if (document.getElementById('incomeSource').value === managePlatformSource) {
    populateIncomePlatformSelect(managePlatformSource, name);
  }
  showToast(`Platform "${name}" ditambahkan.`);
});

document.getElementById('incListBody').addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-incedit]');
  const delBtn = e.target.closest('[data-incdel]');
  const sourcePill = e.target.closest('[data-source]');
  if (editBtn) { openEditIncomeModal(editBtn.dataset.incedit); return; }
  if (delBtn) { openDeleteConfirm(delBtn.dataset.incdel, 'income'); return; }
  if (sourcePill) openPlatformDetailModal(sourcePill.dataset.source);
});

populateIncomeSourceSelect();

/* ==========================================================
   MODAL RINCIAN PLATFORM PER SUMBER
   Muncul saat kartu/label sumber pendapatan diklik — menampilkan
   daftar platform khas sumber tsb (mis. Adsense -> YouTube, Website)
   beserta total pendapatan bulan ini per platform.
========================================================== */
const platformDetailModal = document.getElementById('platformDetailModalOverlay');
const pfdEditIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const pfdBubbleOnSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const pfdBubbleOffSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2A11.6 11.6 0 0 1 12 5c7 0 11 7 11 7a17.7 17.7 0 0 1-3.4 4.2M6.6 6.6C3.3 8.7 1 12 1 12s4 7 11 7a10.4 10.4 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const pfdDeleteSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.8 13.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
let currentPfdSource = null;
// Kombinasi sumber+platform yang sedang dikonfirmasi utk dihapus lewat
// tombol hapus baris di modal Rincian Platform (lihat openPfdRowDeleteConfirm
// & cabang 'pfdplatform' pada listener btnConfirmDelete).
let deletingPfdSource = '';
let deletingPfdPlatform = '';

function openPlatformDetailModal(sourceName) {
  currentPfdSource = sourceName;
  const platforms = getAllPlatformsForSource(sourceName);
  const entries = getIncomeSourceMonthEntries().filter(x => x.source === sourceName);
  const total = entries.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const byPlatform = {};
  entries.forEach(x => {
    const key = x.platform || '__none__';
    byPlatform[key] = (byPlatform[key] || 0) + (Number(x.amount) || 0);
  });

  const color = sourceColor(sourceName);
  const iconEl = document.getElementById('pfdIcon');
  iconEl.innerHTML = sourceIcon(sourceName);
  iconEl.style.setProperty('--w-color', color);
  document.getElementById('pfdTitle').textContent = sourceName;
  const customSrc = customSourceByName(sourceName);
  document.getElementById('pfdSub').textContent = customSrc && customSrc.note
    ? customSrc.note
    : (entries.length ? `${entries.length} catatan bulan ini` : 'Belum ada catatan bulan ini');
  document.getElementById('pfdTotal').textContent = fmtRupiah(total);

  const listWrap = document.getElementById('pfdPlatformList');
  // platformValue = nilai asli field `platform` pada data (dipakai utk
  // mencari/menambah catatan saat baris diklik). Baris agregat
  // ("Umum"/"Semua catatan") memetakan ke platform kosong ''.
  const rows = platforms.map(p => ({ name: p.name, icon: p.icon, amount: byPlatform[p.name] || 0, platformValue: p.name }));
  const untagged = byPlatform['__none__'] || 0;
  if (platforms.length) {
    if (untagged > 0) rows.push({ name: 'Umum / Tidak ditentukan', icon: PLATFORM_ICON_LIB.sparkle, amount: untagged, platformValue: '' });
  } else if (entries.length) {
    rows.push({ name: 'Semua catatan', icon: PLATFORM_ICON_LIB.sparkle, amount: total, platformValue: '' });
  }

  if (!rows.length) {
    listWrap.innerHTML = `<div class="pfd-empty">
      ${!platforms.length
        ? 'Sumber manual ini belum punya rincian platform — catat pendapatannya lewat tombol + di atas.'
        : 'Belum ada pendapatan tercatat untuk sumber ini bulan ini — klik tombol + di atas untuk menambahkan.'}
    </div>`;
  } else {
    listWrap.innerHTML = rows.map(r => `
      <div class="pfd-row" data-platform="${escapeAttr(r.platformValue)}" style="--pfd-color:${color}" role="button" tabindex="0" title="Klik untuk tambah/edit catatan platform ini">
        <span class="pfd-row-icon-wrap">
          <span class="pfd-row-icon">${platformIcon(sourceName, r.platformValue, r.icon)}</span>
        </span>
        <span class="pfd-row-name">${escapeHtml(r.name)}</span>
        <span class="pfd-row-amount mono">${fmtRupiah(r.amount)}</span>
        ${r.platformValue ? `<button type="button" class="pfd-row-detail-btn" data-detail-platform="${escapeAttr(r.platformValue)}" title="Lihat detail akun ${escapeAttr(r.name)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>` : ''}
        ${r.platformValue ? `<button type="button" class="pfd-row-bubble-toggle${isPlatformBubbleEnabled(sourceName, r.platformValue) ? ' is-active' : ''}" data-toggle-platform="${escapeAttr(r.platformValue)}" title="${isPlatformBubbleEnabled(sourceName, r.platformValue) ? 'Aktif — tampil sebagai gelembung sendiri di beranda (klik untuk sembunyikan)' : 'Jangan Tampilkan — klik untuk aktifkan sebagai gelembung sendiri di beranda'}">
          ${isPlatformBubbleEnabled(sourceName, r.platformValue) ? pfdBubbleOnSvg : pfdBubbleOffSvg}
        </button>` : ''}
        ${r.amount > 0 ? `<button type="button" class="pfd-row-delete-btn" data-delete-platform="${escapeAttr(r.platformValue)}" title="Hapus semua catatan ${escapeAttr(r.name)} bulan ini">
          ${pfdDeleteSvg}
        </button>` : ''}
        <span class="pfd-row-edit-hint" aria-hidden="true">${pfdEditIconSvg}</span>
      </div>`).join('');
  }

  openModal(platformDetailModal);
}

/* Klik (atau Enter/Spasi) pada salah satu baris platform -> jika sudah
   ada catatan bulan ini utk kombinasi sumber+platform tsb, langsung
   buka form Edit utk catatan itu (yang terbaru bila lebih dari satu);
   kalau belum ada, buka form Tambah dengan sumber & platform sudah
   terisi otomatis. Tombol "+" di header modal selalu membuka form
   Tambah baru utk sumber ini (platform dikosongkan/"Umum"). */
function handlePfdRowActivate(platform) {
  if (!currentPfdSource) return;
  const entries = getIncomeSourceMonthEntries().filter(x => x.source === currentPfdSource && (x.platform || '') === platform);
  closeModal(platformDetailModal);
  if (!entries.length) {
    openIncomeModal();
    document.getElementById('incomeSource').value = currentPfdSource;
    populateIncomePlatformSelect(currentPfdSource, platform);
    return;
  }
  if (entries.length === 1) { openEditIncomeModal(entries[0].id); return; }
  const latest = entries.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  openEditIncomeModal(latest.id);
  showToast(`Ada ${entries.length} catatan di platform ini — membuka yang terbaru.`);
}

/* Tombol hapus (ikon tong sampah) pada baris platform di modal Rincian
   Platform -> hapus SEMUA catatan pendapatan bulan ini utk kombinasi
   sumber+platform baris tsb (bukan cuma satu catatan). Konfirmasi
   dulu lewat modal konfirmasi umum (kind 'pfdplatform'), lalu modal
   Rincian Platform di-refresh agar barisnya hilang/terupdate. */
function openPfdRowDeleteConfirm(platform) {
  if (!currentPfdSource) return;
  deletingPfdSource = currentPfdSource;
  deletingPfdPlatform = platform;
  const entries = getIncomeSourceMonthEntries().filter(x => x.source === currentPfdSource && (x.platform || '') === platform);
  const label = platform || 'Umum / Tidak ditentukan';
  openDeleteConfirm('pfd', 'pfdplatform');
  const titleEl = document.querySelector('#confirmOverlay h3');
  const descEl = document.querySelector('#confirmOverlay p');
  titleEl.textContent = `Hapus catatan "${label}"?`;
  descEl.textContent = entries.length
    ? `${entries.length} catatan pendapatan ${currentPfdSource} — ${label} bulan ini akan dihapus. Tindakan ini tidak bisa dibatalkan.`
    : 'Tindakan ini tidak bisa dibatalkan.';
}

document.getElementById('pfdPlatformList').addEventListener('click', (e) => {
  const detailBtn = e.target.closest('.pfd-row-detail-btn');
  if (detailBtn) {
    e.stopPropagation();
    openAccountDetailModal(currentPfdSource, detailBtn.dataset.detailPlatform || '');
    return;
  }
  const bubbleToggleBtn = e.target.closest('.pfd-row-bubble-toggle');
  if (bubbleToggleBtn) {
    e.stopPropagation();
    if (!currentPfdSource) return;
    const platform = bubbleToggleBtn.dataset.togglePlatform || '';
    const willEnable = !isPlatformBubbleEnabled(currentPfdSource, platform);
    setPlatformBubbleEnabled(currentPfdSource, platform, willEnable);
    openPlatformDetailModal(currentPfdSource); // refresh baris (ikon toggle & judul tombol)
    renderSummary(); // gelembung di kartu beranda langsung ikut diperbarui
    showToast(willEnable ? `${platform} kini tampil sebagai gelembung sendiri di beranda.` : `${platform} disembunyikan dari gelembung beranda.`, 'ok');
    return;
  }
  const deleteBtn = e.target.closest('.pfd-row-delete-btn');
  if (deleteBtn) {
    e.stopPropagation();
    openPfdRowDeleteConfirm(deleteBtn.dataset.deletePlatform || '');
    return;
  }
  const row = e.target.closest('.pfd-row');
  if (row) handlePfdRowActivate(row.dataset.platform || '');
});
document.getElementById('pfdPlatformList').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('.pfd-row-detail-btn')) return;
  const row = e.target.closest('.pfd-row');
  if (row) { e.preventDefault(); handlePfdRowActivate(row.dataset.platform || ''); }
});

document.getElementById('pfdAddBtn').addEventListener('click', () => {
  if (!currentPfdSource) return;
  const source = currentPfdSource;
  closeModal(platformDetailModal);
  openIncomeModal();
  document.getElementById('incomeSource').value = source;
  populateIncomePlatformSelect(source);
});

document.getElementById('pfdCloseBtn').addEventListener('click', () => closeModal(platformDetailModal));
platformDetailModal.addEventListener('click', (e) => { if (e.target === platformDetailModal) closeModal(platformDetailModal); });

/* ==========================================================
   MODAL DETAIL AKUN PER PLATFORM
   Dibuka lewat ikon info pada tiap baris platform di modal Rincian
   Platform — menampilkan & mengedit data non-finansial akun: nama
   akun, jumlah follower, status monetisasi, status pelanggaran,
   jenis akun, dan saldo di platform tsb (terpisah dari catatan
   pendapatan bulanan).
========================================================== */
const accountDetailModal = document.getElementById('accountDetailModalOverlay');
let currentAdSource = null;
let currentAdPlatform = null;

const AD_MONETIZATION_LABELS = { aktif: 'Aktif', nonaktif: 'Tidak Aktif', review: 'Dalam Peninjauan' };
const AD_VIOLATION_LABELS = { aman: 'Aman', peringatan: 'Ada Peringatan', pelanggaran: 'Ada Pelanggaran' };

function adBadgeClass(kind, value) {
  if (kind === 'monetization') return value === 'aktif' ? 'ad-badge ad-badge-good' : value === 'review' ? 'ad-badge ad-badge-warn' : 'ad-badge ad-badge-bad';
  if (kind === 'violation') return value === 'aman' ? 'ad-badge ad-badge-good' : value === 'peringatan' ? 'ad-badge ad-badge-warn' : 'ad-badge ad-badge-bad';
  return 'ad-badge';
}

/* Menambahkan skema https:// otomatis kalau pengguna lupa mengetiknya,
   supaya link tetap bisa dibuka lewat tag <a>. */
function normalizeAdLink(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function populateAccountTypeDatalist() {
  const list = document.getElementById('adAccountTypeList');
  const options = AD_TYPE_DEFAULTS.concat(customAccountTypes);
  list.innerHTML = options.map(v => `<option value="${escapeAttr(v)}"></option>`).join('');
}

function renderAccountDetailView() {
  const detail = getPlatformAccountDetail(currentAdSource, currentAdPlatform);
  document.getElementById('adViewAccountName').textContent = detail && detail.accountName ? detail.accountName : '-';

  const linkEl = document.getElementById('adViewLink');
  if (detail && detail.link) {
    linkEl.innerHTML = `<a href="${escapeAttr(detail.link)}" target="_blank" rel="noopener noreferrer" class="ad-link">Buka Link ↗</a>`;
  } else {
    linkEl.textContent = '-';
  }

  document.getElementById('adViewFollowers').textContent = (detail && detail.followers != null && detail.followers !== '')
    ? Number(detail.followers).toLocaleString('id-ID') : '-';
  document.getElementById('adViewBalance').textContent = fmtRupiah(detail && detail.balance ? Number(detail.balance) : 0);
  document.getElementById('adViewAccountType').textContent = detail && detail.accountType ? detail.accountType : '-';

  const monBadge = document.getElementById('adViewMonetizationBadge');
  const monVal = detail && detail.monetization ? detail.monetization : null;
  monBadge.textContent = monVal ? (AD_MONETIZATION_LABELS[monVal] || monVal) : 'Belum diisi';
  monBadge.className = monVal ? adBadgeClass('monetization', monVal) : 'ad-badge';

  const violBadge = document.getElementById('adViewViolationBadge');
  const violVal = detail && detail.violation ? detail.violation : null;
  violBadge.textContent = violVal ? (AD_VIOLATION_LABELS[violVal] || violVal) : 'Belum diisi';
  violBadge.className = violVal ? adBadgeClass('violation', violVal) : 'ad-badge';

  const note = document.getElementById('adUpdatedNote');
  note.textContent = detail && detail.updatedAt
    ? `Terakhir diperbarui ${new Date(detail.updatedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    : 'Belum ada data tersimpan — klik ikon pensil untuk menambahkan.';
}

function setAccountDetailMode(editing) {
  document.getElementById('adViewMode').style.display = editing ? 'none' : '';
  document.getElementById('adEditForm').style.display = editing ? '' : 'none';
  document.getElementById('adEditBtn').style.display = editing ? 'none' : '';
  document.getElementById('adIconEditBtn').style.display = editing ? '' : 'none';
}

function openAccountDetailModal(source, platform) {
  currentAdSource = source;
  currentAdPlatform = platform;
  const platforms = getAllPlatformsForSource(source);
  const info = platforms.find(p => p.name === platform);
  const label = info ? info.name : platform;
  const icon = info ? info.icon : PLATFORM_ICON_LIB.sparkle;
  const color = sourceColor(source);

  const iconEl = document.getElementById('adIcon');
  iconEl.innerHTML = icon;
  iconEl.style.setProperty('--w-color', color);
  document.getElementById('adTitle').textContent = label;
  document.getElementById('adSub').textContent = source;

  renderAccountDetailView();
  setAccountDetailMode(false);
  openModal(accountDetailModal);
}

document.getElementById('adEditBtn').addEventListener('click', () => {
  const detail = getPlatformAccountDetail(currentAdSource, currentAdPlatform) || {};
  populateAccountTypeDatalist();
  document.getElementById('adAccountName').value = detail.accountName || '';
  document.getElementById('adLink').value = detail.link || '';
  document.getElementById('adFollowers').value = (detail.followers != null) ? detail.followers : '';
  document.getElementById('adBalance').value = (detail.balance != null) ? detail.balance : '';
  document.getElementById('adMonetization').value = detail.monetization || 'aktif';
  document.getElementById('adViolation').value = detail.violation || 'aman';
  document.getElementById('adAccountType').value = detail.accountType || '';
  setAccountDetailMode(true);
});

document.getElementById('btnAdCancel').addEventListener('click', () => setAccountDetailMode(false));

document.getElementById('adEditForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const followersVal = document.getElementById('adFollowers').value;
  const balanceVal = document.getElementById('adBalance').value;
  const accountType = document.getElementById('adAccountType').value.trim();
  const data = {
    accountName: document.getElementById('adAccountName').value.trim(),
    link: normalizeAdLink(document.getElementById('adLink').value),
    followers: followersVal === '' ? null : Number(followersVal),
    balance: balanceVal === '' ? 0 : Number(balanceVal),
    monetization: document.getElementById('adMonetization').value,
    violation: document.getElementById('adViolation').value,
    accountType,
  };
  registerCustomAccountType(accountType);
  savePlatformAccountDetail(currentAdSource, currentAdPlatform, data);
  renderAccountDetailView();
  setAccountDetailMode(false);
  showToast('Detail akun disimpan.');
});

document.getElementById('adIconEditBtn').addEventListener('click', () => {
  if (!currentAdSource || currentAdPlatform === null) return;
  openPlatformIconModal(currentAdSource, currentAdPlatform, document.getElementById('adTitle').textContent);
});

document.getElementById('adCloseBtn').addEventListener('click', () => closeModal(accountDetailModal));
accountDetailModal.addEventListener('click', (e) => { if (e.target === accountDetailModal) closeModal(accountDetailModal); });

/* ==========================================================
   MODAL TAMBAH SUMBER PENDAPATAN MANUAL (CUSTOM)
   Sumber tambahan yang didefinisikan sendiri oleh pengguna, di luar
   8 sumber bawaan (Adsense, Meta, Affiliate, Makelar, Kelas, Store,
   Sosial Media, Jasa & Rekber) — mis. "Endorsement", "Donasi", "Freelance", dst.
========================================================== */
const customSourceModal = document.getElementById('customSourceModalOverlay');
let selectedCustomSourceColor = CUSTOM_SOURCE_COLOR_PRESETS[0];
let editingCustomSourceId = null;

function setCustomSourceFormMode(isEdit) {
  const submitBtn = document.getElementById('customSourceSubmitBtn');
  const heading = document.getElementById('customSourceModalHeading');
  if (submitBtn) submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Sumber';
  if (heading) heading.textContent = isEdit ? 'Edit Sumber Manual' : 'Tambah Sumber Manual';
}

function renderCustomSourceColorPicker() {
  const wrap = document.getElementById('customSourceColorPicker');
  wrap.innerHTML = CUSTOM_SOURCE_COLOR_PRESETS.map(c => `
    <button type="button" class="color-swatch${c === selectedCustomSourceColor ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Pilih warna ${c}"></button>
  `).join('');
  wrap.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCustomSourceColor = btn.dataset.color;
      wrap.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
}

function renderCustomSourceManageList() {
  const wrap = document.getElementById('customSourceManageList');
  if (!customIncomeSources.length) {
    wrap.innerHTML = `<p class="custom-source-manage-empty">Belum ada sumber manual yang ditambahkan.</p>`;
    return;
  }
  wrap.innerHTML = `<div class="custom-source-manage-label">Sumber manual tersimpan <span class="csm-hint">(klik untuk edit)</span></div>` +
    customIncomeSources.map(c => `
      <div class="custom-source-chip" data-customedit="${c.id}" role="button" tabindex="0" style="--w-color:${c.color}">
        <span class="csc-dot"></span>
        <span class="csc-body">
          <span class="csc-name">${escapeHtml(c.name)}</span>
          ${c.note ? `<span class="csc-note">${escapeHtml(c.note)}</span>` : ''}
        </span>
        <span class="csc-edit-hint" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </span>
        <button type="button" class="csc-del" data-customdel="${c.id}" title="Hapus sumber ini" aria-label="Hapus ${escapeAttr(c.name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');
  function enterEditMode(id) {
    const src = customIncomeSources.find(c => c.id === id);
    if (!src) return;
    editingCustomSourceId = src.id;
    document.getElementById('customSourceName').value = src.name;
    document.getElementById('customSourceNote').value = src.note || '';
    selectedCustomSourceColor = src.color;
    renderCustomSourceColorPicker();
    setCustomSourceFormMode(true);
    document.getElementById('customSourceName').focus();
  }
  wrap.querySelectorAll('.custom-source-chip[data-customedit]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('[data-customdel]')) return;
      enterEditMode(chip.dataset.customedit);
    });
    chip.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('[data-customdel]')) return;
      e.preventDefault();
      enterEditMode(chip.dataset.customedit);
    });
  });
  wrap.querySelectorAll('[data-customdel]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Tutup modal ini dulu supaya modal konfirmasi hapus (berbagi
      // dengan fitur lain) tidak tertutupi / bertumpuk di belakangnya.
      closeModal(customSourceModal);
      openDeleteConfirm(btn.dataset.customdel, 'customsource');
    });
  });
}

function openCustomSourceModal() {
  document.getElementById('customSourceForm').reset();
  editingCustomSourceId = null;
  setCustomSourceFormMode(false);
  selectedCustomSourceColor = CUSTOM_SOURCE_COLOR_PRESETS[Math.floor(Math.random() * CUSTOM_SOURCE_COLOR_PRESETS.length)];
  renderCustomSourceColorPicker();
  renderCustomSourceManageList();
  openModal(customSourceModal);
}

document.getElementById('incAddSourceBtn').addEventListener('click', openCustomSourceModal);

/* ---- Kartu jalan pintas "Sumber Pendapatan" (di bawah kartu Uang
   Masuk & Keluar) ----
   Klik salah satu ikon (Google Adsense, Platform Meta, Affiliate, Toko
   Online, Kelas, dst) membuka popup "Rincian Platform" yang sama dengan
   yang dipakai di halaman Sumber Pendapatan — menampilkan daftar
   jenis/platform khas sumber tsb (mis. Adsense -> YouTube, Website/Blog,
   Apps (AdMob)). Klik salah satu baris platform di dalam popup itu baru
   membuka form Tambah/Edit Pendapatan dengan Sumber & Platform sudah
   terisi otomatis. Ikon "+" putus-putus membuka modal Tambah Sumber
   Manual yang sama dengan tombol "Sumber" di halaman Sumber Pendapatan,
   dan "Lihat" membuka halaman Sumber Pendapatan penuh. */
function openIncomeModalWithSource(source) {
  openIncomeModal();
  const sel = document.getElementById('incomeSource');
  if (sel && source) {
    sel.value = source;
    populateIncomePlatformSelect(source);
  }
}
document.querySelectorAll('#incomeShortcutRow [data-shortcut-source]').forEach(btn => {
  btn.addEventListener('click', () => openPlatformDetailModal(btn.dataset.shortcutSource));
});

/* Ikon satelit (sub-platform) yang muncul mengelilingi ikon utama saat
   kartu di-hover — mis. Adsense dikelilingi YouTube, Website/Blog, Apps
   (AdMob). Diambil dari data platform yang sama dengan yang dipakai
   modal "Rincian Platform" (INCOME_SOURCE_PLATFORMS), jadi tetap
   sinkron kalau daftar platform berubah. Maksimal 5 satelit ditampilkan
   per ikon supaya orbitnya tidak terlalu padat. */
function renderIncomeShortcutSatellites() {
  document.querySelectorAll('#incomeShortcutRow [data-shortcut-source]').forEach(btn => {
    const sats = btn.querySelector('.isc-shortcut-sats');
    if (!sats) return;
    const source = btn.dataset.shortcutSource;
    const platforms = (INCOME_SOURCE_PLATFORMS[source] || []).slice(0, 5);
    if (!platforms.length) return;
    const color = INCOME_SOURCE_COLORS[source] || 'var(--brass)';
    const n = platforms.length;
    // Sebarkan satelit dalam busur di atas ikon (-58° s/d 58°); kalau
    // cuma satu platform, taruh lurus di atas (0°).
    const spread = 116;
    sats.innerHTML = platforms.map((p, i) => {
      const angle = n === 1 ? 0 : -spread / 2 + (spread / (n - 1)) * i;
      return `<span class="isc-sat" style="--sat-angle:${angle.toFixed(1)}deg; --sat-color:${color};" title="${escapeAttr(p.name)}">${p.icon}</span>`;
    }).join('');
  });
}
renderIncomeShortcutSatellites();
const incomeShortcutManualBtn = document.getElementById('incomeShortcutManualBtn');
if (incomeShortcutManualBtn) incomeShortcutManualBtn.addEventListener('click', openCustomSourceModal);
const incomeShortcutViewAllBtn = document.getElementById('incomeShortcutViewAllBtn');
if (incomeShortcutViewAllBtn) incomeShortcutViewAllBtn.addEventListener('click', openIncomeSourcePage);

document.getElementById('customSourceCloseBtn').addEventListener('click', () => closeModal(customSourceModal));
document.getElementById('btnCustomSourceCancel').addEventListener('click', () => closeModal(customSourceModal));
customSourceModal.addEventListener('click', (e) => { if (e.target === customSourceModal) closeModal(customSourceModal); });

document.getElementById('customSourceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('customSourceName');
  const noteInput = document.getElementById('customSourceNote');
  const name = nameInput.value.trim();
  const note = noteInput.value.trim();
  if (!name) { showToast('Nama sumber wajib diisi.', 'err'); return; }

  if (editingCustomSourceId) {
    const target = customIncomeSources.find(c => c.id === editingCustomSourceId);
    if (!target) { editingCustomSourceId = null; setCustomSourceFormMode(false); return; }
    const dupe = getAllIncomeSourceNames().some(n => n.toLowerCase() === name.toLowerCase() && n.toLowerCase() !== target.name.toLowerCase());
    if (dupe) { showToast('Nama sumber sudah dipakai.', 'err'); return; }
    const oldName = target.name;
    target.name = name;
    target.color = selectedCustomSourceColor;
    target.note = note;
    if (oldName !== name) {
      incomeSources.forEach(x => { if (x.source === oldName) x.source = name; });
      persistIncomeSources();
    }
    persistCustomIncomeSources();
    showToast('Sumber manual berhasil diperbarui.');
    editingCustomSourceId = null;
    setCustomSourceFormMode(false);
    populateIncomeSourceSelect();
    renderCustomSourceManageList();
    nameInput.value = '';
    noteInput.value = '';
    renderSummary();
    refreshIncomeSourcePage();
    return;
  }

  // ---- Sumber manual baru ----
  const allNames = getAllIncomeSourceNames().map(n => n.toLowerCase());
  if (allNames.includes(name.toLowerCase())) { showToast('Nama sumber sudah dipakai.', 'err'); return; }
  customIncomeSources.push({ id: cryptoId(), name, color: selectedCustomSourceColor, note });
  persistCustomIncomeSources();
  populateIncomeSourceSelect();
  renderSummary();
  refreshIncomeSourcePage();
  nameInput.value = '';
  noteInput.value = '';

  // Sumber baru belum akan tampil sbg orb di kartu Sumber Pendapatan
  // sampai ada catatan pendapatan bulan ini -- jadi langsung "aktifkan"
  // dengan mengarahkan ke form Tambah Pendapatan, sumber sudah terisi.
  closeModal(customSourceModal);
  showToast(`Sumber "${name}" ditambahkan — catat pendapatan pertamanya.`);
  openIncomeModal();
  document.getElementById('incomeSource').value = name;
  populateIncomePlatformSelect(name);
});


/* ==========================================================
   TOMBOL BACK TO TOP
========================================================== */
(function initBackToTop() {
  const btn = document.getElementById('backToTopBtn');
  const ring = document.getElementById('bttRingFg');
  if (!btn || !ring) return;
  const circumference = 2 * Math.PI * 22; // r=22, sesuai markup SVG

  // Halaman penuh (detail kartu, leaderboard, pengaturan widget, sumber
  // pendapatan, dll) memakai kelas .detail-page-overlay dengan
  // overflow-y:auto sendiri, terpisah dari scroll <body>/window --
  // karena saat salah satu terbuka, body dikunci (overflow:hidden).
  // Jadi tombol back-to-top harus memantau & menggulung kontainer yang
  // SEDANG aktif discroll, bukan cuma window, atau tombol ini tidak
  // akan pernah muncul/berfungsi selama berada di halaman-halaman itu
  // -- di semua perangkat.
  const pageOverlays = Array.from(document.querySelectorAll('.detail-page-overlay'));

  function getActiveScroller() {
    const openPage = pageOverlays.find((el) => el.classList.contains('open'));
    return openPage || document.documentElement;
  }
  function getScrollTop(el) {
    return el === document.documentElement
      ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
      : el.scrollTop;
  }
  function getScrollableDistance(el) {
    return el === document.documentElement
      ? (document.documentElement.scrollHeight - window.innerHeight)
      : (el.scrollHeight - el.clientHeight);
  }

  let ticking = false;
  function updateBackToTop() {
    const active = getActiveScroller();
    const scrollTop = getScrollTop(active);
    const distance = getScrollableDistance(active);
    const pct = distance > 0 ? Math.min(1, scrollTop / distance) : 0;
    ring.style.strokeDashoffset = String(circumference * (1 - pct));
    btn.classList.toggle('show', scrollTop > 320);
    ticking = false;
  }
  function requestUpdate() {
    if (!ticking) {
      requestAnimationFrame(updateBackToTop);
      ticking = true;
    }
  }
  window.addEventListener('scroll', requestUpdate, { passive: true });
  pageOverlays.forEach((el) => el.addEventListener('scroll', requestUpdate, { passive: true }));

  // Saat halaman overlay dibuka/ditutup (kelas "open" berubah), status
  // tombol perlu dihitung ulang walau belum ada event scroll baru.
  const overlayObserver = new MutationObserver(requestUpdate);
  pageOverlays.forEach((el) => overlayObserver.observe(el, { attributes: true, attributeFilter: ['class'] }));

  window.addEventListener('resize', requestUpdate, { passive: true });
  updateBackToTop();

  btn.addEventListener('click', () => {
    const active = getActiveScroller();
    if (active === document.documentElement) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      active.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();


/* ==========================================================
   MODAL TAMBAH / EDIT TRANSAKSI (Masuk / Keluar saja)
========================================================== */
const txModal = document.getElementById('txModalOverlay');
let selectedType = 'masuk'; // 'masuk' | 'keluar'

function populateCategorySelect() {
  const sel = document.getElementById('txCategory');
  sel.innerHTML = CATEGORIES[selectedType].map(c => `<option value="${c}">${c}</option>`).join('');
}

function setSelectedType(type) {
  selectedType = type;
  document.querySelectorAll('#txForm .type-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  // Ikon di kepala popup (.tx-modal .modal-head-icon) ikut berubah warna
  // sesuai jenis yg aktif (hijau=masuk/merah=keluar) -- pola yg sama
  // persis dgn .bill-modal.kind-hutang di setBillKind() di bawah, supaya
  // kedua popup ini konsisten satu bahasa desain.
  txModal.querySelector('.tx-modal').classList.toggle('type-out', type === 'keluar');
  populateCategorySelect();
}

function openAddModal(presetType) {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Tambah Transaksi';
  document.getElementById('btnSubmitTx').textContent = 'Simpan';
  document.getElementById('txForm').reset();
  document.getElementById('txId').value = '';
  document.getElementById('txDate').value = todayStr();
  setSelectedType(presetType || 'masuk');
  openModal(txModal);
}

function openEditModal(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Transaksi';
  document.getElementById('btnSubmitTx').textContent = 'Simpan Perubahan';
  document.getElementById('txId').value = t.id;
  // ---- #txAmount sekarang kartu "slip sobekan" (.tx-amount-hero,
  // MENYESUAIKAN dgn #billAmount di popup Tagihan & Hutang) & sudah
  // diberi titik pemisah ribuan otomatis saat diketik (lihat
  // initTxAmountFormat() di bawah), jadi nilai yg ditampilkan saat
  // edit pun perlu diformat sama -- pola PERSIS sama dgn
  // openEditBillModal() yg mengisi #billAmount pakai toLocaleString.
  document.getElementById('txAmount').value = Number(t.amount).toLocaleString('id-ID');
  document.getElementById('txDate').value = t.date;
  document.getElementById('txDesc').value = t.desc || '';
  setSelectedType(t.type);
  document.getElementById('txCategory').value = t.category;
  openModal(txModal);
}

/* PENTING (fix modal/panel "goyang"/scroll bocor di iPhone Safari):
   sekadar body.style.overflow='hidden' TIDAK cukup di Safari iOS —
   halaman di belakang popup kadang masih bisa ke-scroll/rubber-band
   saat jari menyentuh area di sekitarnya, kelihatan tidak smooth.
   lockBodyScroll/unlockBodyScroll dipakai BERSAMA oleh semua jenis
   popup di app ini (modal .modal-overlay maupun panel Tagihan & Hutang
   yang punya sistem buka/tutup sendiri) supaya perilakunya konsisten.
   Body juga dikunci pakai position:fixed (trik yang benar-benar
   efektif di iOS), sambil menyimpan posisi scroll saat ini supaya
   begitu popup terakhir ditutup, halaman kembali persis ke posisi
   semula (bukan lompat ke atas). Pakai penghitung (openModalCount)
   supaya kalau ada popup bertumpuk, posisi scroll cuma disimpan sekali
   & dikembalikan sekali juga — tidak saling menimpa. */
let scrollLockY = 0;
let openModalCount = 0;
function lockBodyScroll() {
  if (openModalCount === 0) {
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollLockY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  openModalCount++;
}
function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, scrollLockY);
  }
}
/* ---- BATAS ATAS popup "Tambah Transaksi" (.tx-modal) & "Tambah
   Tagihan/Hutang" (.bill-modal) di HP: dihitung dari tepi BAWAH
   banner oren halaman yang SEDANG TERLIHAT di layar saat popup
   dibuka -- apa pun halamannya (Laporan/Dompet/Tagihan & Hutang/dll)
   & apa pun posisi scroll-nya (banner2 ini position:sticky, jadi
   getBoundingClientRect() di bawah selalu mengembalikan posisi
   TERKINI di layar, bukan posisi statis) -- lalu dituliskan sebagai
   CSS var --modal-safe-top di overlay-nya sendiri. Var ini yang
   dipakai #billModalOverlay/#txModalOverlay (lihat CSS terkait,
   dicari via komentar "BATAS ATAS ikut banner") utk padding-top &
   max-height, jadi sheet-nya TIDAK PERNAH naik sampai menutupi/
   menembus banner. Kalau tidak ada banner yg sedang terlihat (mis.
   dibuka dari halaman tanpa banner), var ini dilepas lagi supaya CSS
   otomatis balik ke nilai fallback lama (8px + safe-area-top). ---- */
function applyModalSafeTop(overlay) {
  if (!overlay) return;
  if (window.innerWidth > 640) { overlay.style.removeProperty('--modal-safe-top'); return; }
  var banners = document.querySelectorAll('.page-banner, .bd-page-banner');
  var safeTop = 0;
  banners.forEach(function (el) {
    if (!el || el.offsetParent === null) return;
    var cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
    if (rect.bottom > safeTop) safeTop = rect.bottom;
  });
  // Jaring pengaman: batas atas jangan sampai "memakan" lebih dari
  // separuh tinggi layar (mis. layar landscape sangat pendek) --
  // popup tetap harus kebagian ruang yang wajar utk isinya.
  var maxAllowed = window.innerHeight * 0.5;
  if (safeTop > maxAllowed) safeTop = maxAllowed;
  if (safeTop > 0) {
    overlay.style.setProperty('--modal-safe-top', Math.round(safeTop) + 'px');
  } else {
    overlay.style.removeProperty('--modal-safe-top');
  }
}
function openModal(overlay) {
  if (overlay.id === 'txModalOverlay' || overlay.id === 'billModalOverlay') {
    applyModalSafeTop(overlay);
  }
  overlay.classList.add('open');
  lockBodyScroll();
}
function closeModal(overlay) {
  overlay.classList.remove('open');
  unlockBodyScroll();
}
/* Layar bisa berputar (landscape/portrait) atau browser bar HP
   memendek/memanjang saat popup ini masih terbuka -- tinggi banner
   ikut berubah krn pakai satuan vw/vh (clamp), jadi --modal-safe-top
   perlu dihitung ulang supaya batas atasnya tetap akurat. */
window.addEventListener('resize', function () {
  var tx = document.getElementById('txModalOverlay');
  var bill = document.getElementById('billModalOverlay');
  if (tx && tx.classList.contains('open')) applyModalSafeTop(tx);
  if (bill && bill.classList.contains('open')) applyModalSafeTop(bill);
});

document.getElementById('txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  // ---- #txAmount sekarang bisa mengandung titik pemisah ribuan (lihat
  // initTxAmountFormat() & komentar di index.html), jadi titiknya
  // dibuang dulu sebelum di-parse -- pola PERSIS sama dgn submit
  // handler #billForm yg membaca #billAmount. ----
  const amount = parseFloat(document.getElementById('txAmount').value.replace(/\./g, ''));
  const date = document.getElementById('txDate').value;
  const category = document.getElementById('txCategory').value;
  const desc = document.getElementById('txDesc').value.trim();

  if (!amount || amount <= 0) { showToast('Jumlah harus lebih dari 0.', 'err'); return; }
  if (!date) { showToast('Tanggal wajib diisi.', 'err'); return; }

  if (editingId) {
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx > -1) {
      transactions[idx] = { ...transactions[idx], type: selectedType, amount, date, category, desc };
    }
    showToast('Transaksi berhasil diperbarui.');
  } else {
    transactions.push({ id: cryptoId(), type: selectedType, amount, date, category, desc });
    showToast('Transaksi berhasil ditambahkan.');
  }

  persist();
  closeModal(txModal);
  refreshAll();
  refreshDetailPage();
});

document.querySelectorAll('#txForm .type-toggle button').forEach(btn => {
  btn.addEventListener('click', () => setSelectedType(btn.dataset.type));
});
document.getElementById('modalCloseBtn').addEventListener('click', () => closeModal(txModal));
document.getElementById('btnCancel').addEventListener('click', () => closeModal(txModal));
txModal.addEventListener('click', (e) => { if (e.target === txModal) closeModal(txModal); });

/* ==========================================================
   POPUP "BUKTI TRANSAKSI" — versi struk untuk SATU transaksi,
   dibuka dgn tap kartu transaksi di tab Aktifitas (bukan tombol
   edit/hapus). Meniru pola struk pembayaran pada umumnya (lencana
   sukses, nominal besar, rincian, lalu Bagikan/Unduh/Selesai) tapi
   warna & identitasnya memakai tema ZAYAIN sendiri.
========================================================== */
const txReceiptOverlay = document.getElementById('txReceiptOverlay');
let receiptTxId = null;

// No. Referensi ditampilkan pendek (12 karakter terakhir dari id,
// huruf besar) supaya terlihat seperti nomor referensi bank sungguhan,
// tapi tetap bisa ditelusuri balik ke transaksi aslinya.
function formatReceiptRef(id) {
  return String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
}

function openTxReceipt(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  receiptTxId = id;
  const isIn = t.type === 'masuk';
  const color = categoryColor(t.category);
  const dateObj = new Date(t.date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const dayLabel = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });

  document.getElementById('receiptStatusIcon').classList.toggle('out', !isIn);

  const amountEl = document.getElementById('receiptAmount');
  amountEl.textContent = `${isIn ? '+' : '-'} ${fmtRupiah(t.amount)}`;
  amountEl.className = `receipt-amount ${isIn ? 'in' : 'out'}`;

  document.getElementById('receiptDate').textContent = `${dayLabel}, ${dateLabel}`;

  document.getElementById('receiptDetailList').innerHTML = `
    <div class="receipt-detail-row">
      <span class="receipt-detail-ic" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color}">
        ${categoryIcon(t.category, isIn, 16)}
      </span>
      <div class="receipt-detail-text">
        <div class="receipt-detail-label">${escapeHtml(t.category)}</div>
        <div class="receipt-detail-sub">${isIn ? 'Uang Masuk' : 'Uang Keluar'}</div>
      </div>
    </div>
    <div class="receipt-detail-row">
      <span class="receipt-detail-ic" style="background:var(--primary-soft);color:var(--primary-deep)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
      </span>
      <div class="receipt-detail-text">
        <div class="receipt-detail-label">Keterangan</div>
        <div class="receipt-detail-sub">${escapeHtml(t.desc || 'Tanpa keterangan')}</div>
      </div>
    </div>
  `;

  document.getElementById('receiptExpandBody').innerHTML = `
    <div class="receipt-expand-row"><span>Jenis Transaksi</span><span>${isIn ? 'Pemasukan' : 'Pengeluaran'}</span></div>
    <div class="receipt-expand-row"><span>Kategori</span><span>${escapeHtml(t.category)}</span></div>
    <div class="receipt-expand-row"><span>Tanggal</span><span>${dayLabel}, ${dateLabel}</span></div>
    <div class="receipt-expand-row"><span>Catatan</span><span>${escapeHtml(t.desc || '-')}</span></div>
    <div class="receipt-expand-row"><span>No. Referensi</span><span>${formatReceiptRef(t.id)}</span></div>
    <div class="receipt-expand-row"><span>ID Transaksi</span><span>${escapeHtml(t.id)}</span></div>
    <div class="receipt-expand-row"><span>Status</span><span>Tercatat</span></div>
  `;
  document.getElementById('receiptExpandBody').classList.remove('open');
  document.getElementById('receiptExpandBtn').classList.remove('open');

  openModal(txReceiptOverlay);
}

function closeTxReceipt() {
  closeModal(txReceiptOverlay);
  receiptTxId = null;
}

// Tombol X (receiptCloseBtn) sudah dihapus dari header popup struk --
// menyamai gambar referensi yg tidak punya tombol tutup di pojok atas,
// cukup tombol "Selesai" di footer & tap area luar kartu utk menutup.
document.getElementById('receiptDoneBtn').addEventListener('click', closeTxReceipt);
txReceiptOverlay.addEventListener('click', (e) => { if (e.target === txReceiptOverlay) closeTxReceipt(); });

// Dulu tinggi kotak "Lihat Detail" dipatok max-height:220px lewat CSS
// (overflow:hidden) -- kalau rinciannya panjang (spt referensi Qita:
// Jenis Transaksi, Nama Merchant, Lokasi, PAN, dll), isinya kepotong
// & butuh scroll internal sendiri, beda dgn gambar referensi yg
// scroll-nya nyatu ke SATU wadah (seluruh kartu struk ikut tergulung).
// Sekarang tingginya dihitung dari scrollHeight ASLI kontennya via JS,
// jadi kartu ini bisa memanjang sepenuhnya & yg discroll tetap cuma
// .receipt-card-wrap di luarnya -- persis gaya scroll popup referensi.
document.getElementById('receiptExpandBtn').addEventListener('click', () => {
  const body = document.getElementById('receiptExpandBody');
  const btn = document.getElementById('receiptExpandBtn');
  const isOpen = body.classList.contains('open');
  if (isOpen) {
    // Tutup: turunkan dari tinggi aslinya balik ke 0 supaya transisi
    // tetap mulus (bukan langsung "meng-clip" tanpa animasi).
    body.style.maxHeight = body.scrollHeight + 'px';
    requestAnimationFrame(() => { body.style.maxHeight = '0px'; });
    body.classList.remove('open');
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
  btn.classList.toggle('open');
});

// Setelah animasi buka selesai, lepas nilai px tetap jadi 'none' supaya
// kalau isinya berubah (mis. tambah baris rincian lain nanti) tetap ikut
// menyesuaikan tinggi otomatis, tidak kepaku ke scrollHeight lama.
document.getElementById('receiptExpandBody').addEventListener('transitionend', (e) => {
  if (e.propertyName !== 'max-height') return;
  const body = e.currentTarget;
  if (body.classList.contains('open')) body.style.maxHeight = 'none';
});

function currentAppName() {
  return (document.getElementById('brandNameText')?.textContent || '').trim() || 'ZAYAIN';
}

function receiptSummaryText(t) {
  const isIn = t.type === 'masuk';
  const dateLabel = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  return [
    `Bukti Transaksi — ${currentAppName()}`,
    `${isIn ? '+' : '-'} ${fmtRupiah(t.amount)}`,
    dateLabel,
    `Kategori: ${t.category}`,
    `Keterangan: ${t.desc || 'Tanpa keterangan'}`,
    `No. Ref: ${formatReceiptRef(t.id)}`
  ].join('\n');
}

document.getElementById('receiptShareBtn').addEventListener('click', async () => {
  const t = transactions.find(x => x.id === receiptTxId);
  if (!t) return;
  const text = receiptSummaryText(t);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bukti Transaksi', text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // dibatalkan user, jangan tampilkan error
      // lanjut ke fallback salin di bawah kalau share gagal karena sebab lain
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Detail transaksi disalin ke clipboard.');
  } catch (e2) {
    showToast('Gagal membagikan transaksi.', 'err');
  }
});

document.getElementById('receiptDownloadBtn').addEventListener('click', () => {
  const t = transactions.find(x => x.id === receiptTxId);
  if (!t) return;
  try {
    drawAndDownloadReceipt(t);
    showToast('Bukti transaksi tersimpan.');
  } catch (e) {
    showToast('Gagal mengunduh bukti transaksi.', 'err');
  }
});

/* Gambar struk transaksi langsung ke <canvas> lalu unduh sebagai PNG
   -- memakai Canvas API bawaan browser saja (tanpa library eksternal),
   senada dengan grafik donat/batang di halaman lain, supaya tetap
   bisa dipakai walau koneksi ke CDN pihak ketiga terblokir. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text).split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y + lines * lineHeight);
      line = words[i] + ' ';
      lines++;
      if (lines >= maxLines - 1) {
        // baris terakhir yang tersisa, potong dgn elipsis kalau kepanjangan
        let rest = words.slice(i + 1).join(' ');
        let finalLine = (line + rest).trim();
        while (ctx.measureText(finalLine + '…').width > maxWidth && finalLine.length > 1) {
          finalLine = finalLine.slice(0, -1);
        }
        ctx.fillText(finalLine.length < (line + rest).trim().length ? finalLine + '…' : finalLine, x, y + lines * lineHeight);
        return lines + 1;
      }
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y + lines * lineHeight);
  return lines + 1;
}

// Baris rincian struk (field list bawah, gaya "Jenis Transaksi /
// Nama Merchant / dst" pada referensi Qita by BRI) -- HANYA field yg
// benar2 tercatat di data transaksi aplikasi ini sendiri (tidak ada
// data bank/merchant/PAN sungguhan krn transaksi di sini input manual
// pengguna, jadi TIDAK dikarang seolah2 data dari bank sungguhan).
function receiptRows(t) {
  const isIn = t.type === 'masuk';
  const dateLabel = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  return [
    ['Jenis Transaksi', isIn ? 'Pemasukan' : 'Pengeluaran'],
    ['Kategori', t.category],
    ['Tanggal', dateLabel],
    ['Catatan', t.desc || '-'],
    ['ID Transaksi', t.id],
    ['Status', 'Tercatat']
  ];
}

// Ubah hex "#RRGGBB" jadi rgb(r,g,b) -- helper kecil krn Canvas 2D
// TIDAK mendukung fungsi CSS color-mix() dlm fillStyle (beda dgn CSS
// biasa yg dipakai popup HTML), jadi pencampuran warna hrs dihitung
// manual di sini.
function hexToRgbTuple(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
function mixWithWhiteRgb(hex, pct) {
  const [r, g, b] = hexToRgbTuple(hex);
  const p = pct / 100;
  const mr = Math.round(r * p + 255 * (1 - p));
  const mg = Math.round(g * p + 255 * (1 - p));
  const mb = Math.round(b * p + 255 * (1 - p));
  return `rgb(${mr},${mg},${mb})`;
}

// Bungkus teks jadi beberapa baris (word-wrap biasa, TAPI kalau ada
// satu "kata" yg sendirian sudah lebih lebar dari maxWidth -- kasus
// umum utk ID transaksi/angka panjang tanpa spasi -- jatuhkan ke
// pemotongan per-KARAKTER spy tetap tidak meluber, persis gaya
// bungkus nomor invoice/PAN panjang pada referensi struk). Baris
// terakhir diberi elipsis kalau teksnya masih terpotong.
function wrapTextLines(ctx, text, maxWidth, maxLines) {
  const full = String(text ?? '');
  const words = full.split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length && lines.length < maxLines; i++) {
    const word = words[i];
    if (ctx.measureText(word).width > maxWidth) {
      if (line) { lines.push(line.trim()); line = ''; }
      let chunk = '';
      for (const ch of word) {
        if (lines.length >= maxLines) break;
        const test = chunk + ch;
        if (ctx.measureText(test).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = test;
        }
      }
      line = chunk;
      continue;
    }
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line.trim());
  if (lines.length > maxLines) lines.length = maxLines;
  if (!lines.length) lines.push('');
  const consumedLen = lines.join(' ').length;
  const fullLen = full.replace(/\s+/g, ' ').trim().length;
  if (consumedLen < fullLen) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}

// Potong SATU baris teks dgn elipsis kalau melebihi maxWidth (dipakai
// utk subjudul baris ikon "Keterangan" yg dibatasi 1 baris saja).
function fitEllipsis(ctx, text, maxWidth) {
  const full = String(text ?? '');
  if (ctx.measureText(full).width <= maxWidth) return full;
  let t = full;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t.length < full.length ? t + '…' : t;
}

// Rencanakan SELURUH tata letak struk (posisi Y tiap elemen + baris
// teks yg sudah dibungkus) lebih dulu lewat kanvas sementara (mctx),
// sebelum kanvas asli dibuat. Dgn begini tinggi kanvas akhir & posisi
// tiap elemen SELALU konsisten satu sama lain (dihitung SEKALI saja,
// bukan didup dgn logika terpisah di fungsi lain spt sebelumnya --
// itu pola LAMA yg rawan "desync" kalau salah satu diubah tapi yg
// lain lupa disamakan) krn fase gambar nanti tinggal MEMBACA hasil
// rencana ini, tidak menghitung ulang.
function planReceipt(t) {
  const isIn = t.type === 'masuk';
  const appName = currentAppName();
  const dateLabel = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const amountText = `${isIn ? '+' : '-'} ${fmtRupiah(t.amount)}`;
  const refText = formatReceiptRef(t.id);
  const catColor = categoryColor(t.category);
  const fieldRows = receiptRows(t);

  const pageW = 640;
  const sidePad = 24;
  const cardX = sidePad, cardW = pageW - sidePad * 2;
  // Pita biru berlogo di paling atas (padanan header biru "Qita by
  // BRI" pada referensi) -- diberi warna biru krn ITU warna khas
  // gaya referensi yg diminta, bukan lagi oranye identitas lama.
  const bandH = 104;
  const topGap = 30;
  const badgeR = 42;
  // Lencana centang duduk PERSIS di garis batas pita biru & kartu
  // putih (setengah nongol ke atas kartu) -- persis gaya "mengambang"
  // pada referensi.
  const cardY = bandH + topGap + badgeR;

  const mctx = document.createElement('canvas').getContext('2d');

  let cy = cardY + badgeR + 28;

  const yStatusLabel = cy; cy += 30;
  const yAmount = cy; cy += 36;
  const yDate = cy; cy += 28;
  const yDivider1 = cy + 12; cy += 34;
  const yDetailHeading = cy; cy += 26;

  // Kotak 2 baris ikon (kategori + keterangan), padanan baris
  // "ARI WANSA PUTRA / DUNIA BAJU HITS.." pada referensi.
  const boxX = cardX + 24, boxW = cardW - 48;
  const boxPad = 16, rowH = 56;
  const boxY = cy;
  const boxH = boxPad * 2 + rowH * 2;
  cy += boxH + 22;

  const yDivider2 = cy + 12; cy += 34;

  mctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  const yNoRef = cy; cy += 34;

  const yDivider3 = cy + 12; cy += 34;

  // Daftar field datar (Jenis Transaksi/Kategori/dst), label kiri +
  // nilai kanan sebaris -- kalau nilainya kepanjangan (spt ID
  // transaksi), baru turun ke baris ke-2 (persis gaya nomor
  // invoice/PAN panjang pada referensi yg patah ke baris berikutnya).
  const valueMaxWidth = (cardW - 48) * 0.56;
  const fieldLineHeight = 19;
  const rowGap = 15;
  const plannedFieldRows = [];
  fieldRows.forEach(([label, value]) => {
    mctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    const lines = wrapTextLines(mctx, value, valueMaxWidth, 2);
    plannedFieldRows.push({ label, lines, y: cy });
    cy += Math.max(1, lines.length) * fieldLineHeight + rowGap;
  });

  const yDivider4 = cy + 6; cy += 28;

  // Rincian nominal (padanan "Nominal Pembayaran/Tip/Biaya Admin").
  // Aplikasi ini tidak memungut tip/biaya apa pun, jadi baris yg
  // ditampilkan hanya yg jujur mencerminkan itu (Rp0), bukan dikarang.
  const nominalRows = [
    ['Nominal Transaksi', fmtRupiah(t.amount)],
    ['Biaya Admin', 'Rp0']
  ];
  const plannedNominalRows = [];
  nominalRows.forEach(([label, value]) => {
    plannedNominalRows.push({ label, value, y: cy });
    cy += 26;
  });
  cy += 8;

  const yDivider5 = cy + 8; cy += 28;

  const footerLine1 = `Bukti transaksi dibuat otomatis oleh aplikasi ${appName}.`;
  const footerLine2 = 'Simpan sebagai catatan keuangan pribadi Anda.';
  const yFooter1 = cy; cy += 17;
  const yFooter2 = cy; cy += 17;
  cy += 22;

  const cardH = cy - cardY;
  const gapBelowCard = 26;
  const copyrightY1 = cardY + cardH + gapBelowCard + 12;
  const copyrightY2 = copyrightY1 + 16;
  const canvasH = copyrightY2 + 22;

  return {
    isIn, appName, dateLabel, amountText, refText, catColor,
    pageW, cardX, cardW, bandH, badgeR, cardY, cardH,
    yStatusLabel, yAmount, yDate, yDivider1, yDetailHeading,
    boxX, boxW, boxY, boxH, boxPad, rowH,
    yDivider2, yNoRef, yDivider3,
    plannedFieldRows,
    yDivider4, plannedNominalRows, yDivider5,
    footerLine1, footerLine2, yFooter1, yFooter2,
    copyrightY1, copyrightY2, canvasH
  };
}

// Ikon panah tren naik/turun (padanan iconArrow SVG dipakai popup
// HTML utk baris kategori) -- digambar manual krn di kanvas ikon
// tidak bisa langsung pakai markup SVG spt di DOM.
function drawTrendArrowIcon(ctx, dir) {
  const s = 1.5;
  ctx.beginPath();
  if (dir === 'up') {
    ctx.moveTo(-5 * s, 5 * s); ctx.lineTo(5 * s, -5 * s); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4 * s, -5 * s); ctx.lineTo(5 * s, -5 * s); ctx.lineTo(5 * s, 4 * s); ctx.stroke();
  } else {
    ctx.moveTo(-5 * s, -5 * s); ctx.lineTo(5 * s, 5 * s); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5 * s, -4 * s); ctx.lineTo(5 * s, 5 * s); ctx.lineTo(-4 * s, 5 * s); ctx.stroke();
  }
}
// Ikon catatan/keterangan (padanan svg 3-garis dipakai popup HTML
// utk baris "Keterangan").
function drawNoteIcon(ctx) {
  const s = 1.25;
  ctx.beginPath(); ctx.moveTo(-8 * s, -6 * s); ctx.lineTo(4 * s, -6 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8 * s, 0); ctx.lineTo(4 * s, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8 * s, 6 * s); ctx.lineTo(-2 * s, 6 * s); ctx.stroke();
}

/* Gambar struk transaksi langsung ke <canvas> lalu unduh sebagai PNG
   -- memakai Canvas API bawaan browser saja (tanpa library eksternal),
   senada dengan grafik donat/batang di halaman lain, supaya tetap
   bisa dipakai walau koneksi ke CDN pihak ketiga terblokir. Gaya
   visualnya MENIRU referensi struk "Qita by BRI" yg diberikan
   (pita header biru berlogo di atas, kartu putih melayang dgn lencana
   centang menonjol di batas atasnya, bagian "Detail Transaksi" berisi
   baris beridentitas ikon, No. Ref, daftar field datar, lalu rincian
   nominal & footer) -- HANYA gaya visualnya yg ditiru, bukan data
   bank/merchant sungguhan krn transaksi di aplikasi ini memang input
   manual pengguna sendiri. */
function drawAndDownloadReceipt(t) {
  const plan = planReceipt(t);
  const {
    pageW: w, canvasH: h, cardX, cardW, cardY, cardH, bandH, badgeR,
    isIn, appName, amountText, dateLabel, refText, catColor,
    plannedFieldRows, plannedNominalRows
  } = plan;

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Latar halaman -- biru-lavender lembut, padanan latar lembut di
  // belakang kartu pada referensi (bukan abu netral spt sebelumnya).
  ctx.fillStyle = '#EEF2FC';
  ctx.fillRect(0, 0, w, h);

  // Pita header biru berlogo nama aplikasi, padanan "Qita by BRI".
  const bandGrad = ctx.createLinearGradient(0, 0, 0, bandH);
  bandGrad.addColorStop(0, '#3B7BFF');
  bandGrad.addColorStop(1, '#2557E0');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, w, bandH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(appName.toUpperCase(), w / 2, bandH / 2 + 7);

  // Kartu putih melayang (bayangan lembut) -- TANPA header gradasi
  // internal lagi krn identitas warna sekarang dibawa oleh pita biru
  // di atas kartu, bukan lagi di dalam kartu itu sendiri.
  ctx.save();
  ctx.shadowColor = 'rgba(30,41,59,0.16)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 26);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Lencana sukses -- pusatnya PERSIS di cardY, jadi separuh
  // lingkaran nongol ke atas melewati tepi kartu (persis kesan
  // "mengambang" pada referensi), separuh lagi duduk di dlm kartu.
  const bcx = w / 2, bcy = cardY;
  ctx.beginPath();
  ctx.arc(bcx, bcy, badgeR + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bcx, bcy, badgeR, 0, Math.PI * 2);
  const circGrad = ctx.createLinearGradient(bcx - badgeR, bcy - badgeR, bcx + badgeR, bcy + badgeR);
  if (isIn) { circGrad.addColorStop(0, '#10B981'); circGrad.addColorStop(1, '#047857'); }
  else { circGrad.addColorStop(0, '#FB7185'); circGrad.addColorStop(1, '#BE123C'); }
  ctx.fillStyle = circGrad;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bcx - badgeR * 0.4, bcy + badgeR * 0.03);
  ctx.lineTo(bcx - badgeR * 0.1, bcy + badgeR * 0.32);
  ctx.lineTo(bcx + badgeR * 0.45, bcy - badgeR * 0.3);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5B6472';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Transaksi Berhasil', w / 2, plan.yStatusLabel);

  ctx.fillStyle = isIn ? '#047857' : '#E11D48';
  ctx.font = '800 32px "IBM Plex Mono", monospace';
  ctx.fillText(amountText, w / 2, plan.yAmount);

  ctx.fillStyle = '#8A93A3';
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(dateLabel, w / 2, plan.yDate);

  function dashedDivider(y) {
    ctx.strokeStyle = '#E4E8EF';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(cardX + 24, y);
    ctx.lineTo(cardX + cardW - 24, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  dashedDivider(plan.yDivider1);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#131A2A';
  ctx.font = '700 14.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Detail Transaksi', cardX + 24, plan.yDetailHeading);

  // Kotak abu lembut berisi 2 baris beridentitas ikon.
  roundRectPath(ctx, plan.boxX, plan.boxY, plan.boxW, plan.boxH, 14);
  ctx.fillStyle = '#F7F8FC';
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  function drawIconRow(rowIndex, iconBg, iconStroke, drawIconFn, title, subtitle) {
    const rowTop = plan.boxY + plan.boxPad + rowIndex * plan.rowH;
    const iconR = 17;
    const iconCx = plan.boxX + plan.boxPad + iconR;
    const iconCy = rowTop + plan.rowH / 2 - plan.boxPad / 2;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    ctx.fillStyle = iconBg;
    ctx.fill();
    ctx.save();
    ctx.translate(iconCx, iconCy);
    ctx.strokeStyle = iconStroke;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawIconFn(ctx);
    ctx.restore();

    const textX = iconCx + iconR + 12;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#131A2A';
    ctx.font = '700 13.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(fitEllipsis(ctx, title, plan.boxW - (textX - plan.boxX) - plan.boxPad), textX, iconCy - 3);
    ctx.fillStyle = '#8A93A3';
    ctx.font = '500 11.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(fitEllipsis(ctx, subtitle, plan.boxW - (textX - plan.boxX) - plan.boxPad), textX, iconCy + 13);
  }

  drawIconRow(0, mixWithWhiteRgb(catColor, 15), catColor, (c) => drawTrendArrowIcon(c, isIn ? 'down' : 'up'), t.category, isIn ? 'Uang Masuk' : 'Uang Keluar');
  ctx.strokeStyle = '#E4E8EF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plan.boxX + plan.boxPad, plan.boxY + plan.rowH);
  ctx.lineTo(plan.boxX + plan.boxW - plan.boxPad, plan.boxY + plan.rowH);
  ctx.stroke();
  drawIconRow(1, '#FFF1E7', '#C2410C', drawNoteIcon, 'Keterangan', t.desc || 'Tanpa keterangan');

  dashedDivider(plan.yDivider2);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#8A93A3';
  ctx.font = '600 12.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('No. Ref', cardX + 24, plan.yNoRef);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#131A2A';
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(refText, cardX + cardW - 24, plan.yNoRef);

  dashedDivider(plan.yDivider3);

  const fieldLineHeight = 19;
  plannedFieldRows.forEach((row) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8A93A3';
    ctx.font = '600 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(row.label, cardX + 24, row.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#131A2A';
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    row.lines.forEach((ln, i) => ctx.fillText(ln, cardX + cardW - 24, row.y + i * fieldLineHeight));
  });

  dashedDivider(plan.yDivider4);

  plannedNominalRows.forEach((row) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8A93A3';
    ctx.font = '600 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(row.label, cardX + 24, row.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#131A2A';
    ctx.font = '700 13.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(row.value, cardX + cardW - 24, row.y);
  });

  dashedDivider(plan.yDivider5);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8A93A3';
  ctx.font = '500 11.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(plan.footerLine1, w / 2, plan.yFooter1);
  ctx.fillText(plan.footerLine2, w / 2, plan.yFooter2);

  // Teks hak cipta kecil di LUAR kartu, di atas latar halaman --
  // padanan baris "© 2025 PT Bank..." pada referensi yg juga duduk
  // di luar kartu putihnya, tapi diisi jujur (bukan klaim regulasi
  // bank/OJK krn aplikasi ini bukan lembaga keuangan).
  ctx.fillStyle = '#9AA3B2';
  ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`© ${new Date().getFullYear()} ${appName}`, w / 2, plan.copyrightY1);
  ctx.fillText('Data transaksi tersimpan di perangkat Anda.', w / 2, plan.copyrightY2);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bukti-Transaksi-${formatReceiptRef(t.id)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}
document.getElementById('btnAddDesktop')?.addEventListener('click', () => openAddModal());
// Tombol "+" pada banner mobile SEBELUMNYA membuka modal Tambah
// Transaksi -- sekarang difungsikan ulang jadi tombol akun, supaya
// kontrol akun juga tersedia langsung dari banner utama, tidak cuma
// dari mini-topbar (#miniLogoutBtn). Karena app sekarang BISA dipakai
// tanpa login (lihat requireCloudLogin di atas & alur boot() baru di
// cloud-sync.js), tombol ini dicek dulu status loginnya tiap diklik:
// kalau sudah login -> Keluar akun (spt sebelumnya); kalau belum ->
// buka popup Masuk/Daftar (menggantikan aksi logout yang tidak relevan
// buat guest).
// ---- Redesign popup konfirmasi keluar akun ----
// SEBELUMNYA pakai confirm() bawaan browser (kotak abu-abu polos milik
// OS/browser, tidak senada sama sekali dgn tampilan ZAYAIN & tidak bisa
// diberi ikon/warna/animasi apa pun). Sekarang diganti modal custom
// (#logoutConfirmOverlay, lihat markup + catatan desainnya di index.html)
// yg dibungkus jadi fungsi berbasis Promise di sini supaya pemanggilnya
// (handleAccountToggleClick di bawah) tetap bisa dipakai dgn gaya
// `if (!await openLogoutConfirm()) return;` -- sama persis "rasanya"
// dgn confirm() lama, cuma tampilannya yg diganti total.
const logoutConfirmModal = document.getElementById('logoutConfirmOverlay');
function openLogoutConfirm() {
  return new Promise((resolve) => {
    // Jaga-jaga kalau markup modal ini entah kenapa tidak ada di
    // halaman (mis. versi index.html lama blm diperbarui) -- jangan
    // sampai fitur logout jadi mati total, cukup anggap "dikonfirmasi"
    // spt confirm() lama tanpa modal.
    if (!logoutConfirmModal) { resolve(true); return; }
    const btnYes = document.getElementById('btnConfirmLogout');
    const btnNo = document.getElementById('btnCancelLogout');
    function cleanup(result) {
      btnYes.removeEventListener('click', onYes);
      btnNo.removeEventListener('click', onNo);
      logoutConfirmModal.removeEventListener('click', onOverlay);
      closeModal(logoutConfirmModal);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    // Klik di luar kartu modal (di area overlay gelap) = sama dgn Batal,
    // konsisten dgn perilaku #confirmOverlay (modal hapus) yg sudah ada.
    function onOverlay(e) { if (e.target === logoutConfirmModal) cleanup(false); }
    btnYes.addEventListener('click', onYes);
    btnNo.addEventListener('click', onNo);
    logoutConfirmModal.addEventListener('click', onOverlay);
    openModal(logoutConfirmModal);
  });
}
let accountToggleBusy = false; // cegah klik ganda (mis. tap 2x cepat di HP) memicu 2 proses logout bersamaan
function setAccountButtonsDisabled(disabled) {
  ['btnAddMobile', 'miniLogoutBtn', 'settingsAccountBtn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}
async function handleAccountToggleClick() {
  if (accountToggleBusy) return;
  if (typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn()) {
    if (typeof window.cloudSignOut !== 'function') return;
    const confirmedLogout = await openLogoutConfirm();
    if (!confirmedLogout) return;
    accountToggleBusy = true;
    // Semua tombol yang bisa memicu logout (banner mobile, mini-topbar,
    // baris Pengaturan) sengaja dinonaktifkan bareng selama proses
    // berjalan, supaya tidak ada jalur lain yang ikut memicu logout
    // kedua sebelum yang pertama selesai.
    setAccountButtonsDisabled(true);
    // FIX BUG "tombol Masuk/Daftar nyangkut mati permanen di mode tamu":
    // SEBELUMNYA baris cloudSignOut() di bawah TIDAK dibungkus try/catch,
    // dan pemulihan tombol (accountToggleBusy=false, disabled=false)
    // HANYA dilakukan lewat 2 jalur: (a) di blok "result.ok===false" di
    // bawah, atau (b) menyerahkan sepenuhnya ke location.reload() yang
    // dipicu event SIGNED_OUT di cloud-sync.js begitu logout SUKSES.
    // Kalau cloudSignOut() melempar exception (bukan sekadar
    // mengembalikan {ok:false}, mis. galat jaringan yang tidak
    // tertangkap di dalamnya) ATAU event SIGNED_OUT/reload itu karena
    // sebab apa pun tidak pernah terjadi, TIDAK ADA jalur mana pun yang
    // mengaktifkan lagi tombol2 ini -- tersangkut disabled selamanya,
    // walau statusnya sebenarnya sudah balik ke tamu. Sekarang dibungkus
    // try/catch/finally supaya tombol PASTI dipulihkan lagi apa pun yang
    // terjadi (kalaupun reload tetap terjadi sesaat kemudian, pemulihan
    // di sini tidak masalah -- toh halaman akan dimuat ulang dari nol).
    try {
      const result = await window.cloudSignOut();
      if (result && result.ok === false) {
        // Logout gagal (mis. tidak ada koneksi) -- beri tahu user lewat
        // toast supaya bisa dicoba ulang.
        showToast('Gagal logout, coba lagi. Periksa koneksi internet kamu.', 'err');
      }
      // Kalau ok:true, cloud-sync.js akan me-reload halaman (lewat event
      // SIGNED_OUT) sesaat lagi -- blok finally di bawah tetap memulihkan
      // tombol sekarang juga sbg jaga-jaga kalau reload itu telat/gagal.
    } catch (err) {
      console.error('Logout gagal (exception):', err);
      showToast('Gagal logout, coba lagi. Periksa koneksi internet kamu.', 'err');
    } finally {
      accountToggleBusy = false;
      setAccountButtonsDisabled(false);
    }
  } else if (typeof window.cloudRequireLogin === 'function') {
    window.cloudRequireLogin('Masuk atau daftar untuk mengaktifkan sinkron cloud & fitur Tanya AI.');
  }
}
document.getElementById('btnAddMobile').addEventListener('click', handleAccountToggleClick);
// Label DAN ikon tombol akun (banner & mini-topbar) disesuaikan sekali
// di awal sesuai status login saat halaman dibuka -- cukup sekali karena
// begitu status login berubah (masuk/keluar), halaman selalu di-reload
// oleh cloud-sync.js sehingga ini ikut dihitung ulang dari nol.
// FIX "ikon tidak sesuai status": SEBELUMNYA cuma title/aria-label yang
// disesuaikan di sini -- ikon SVG di dalam tombol tetap ikon Logout
// (panah keluar) walau sedang mode tamu & tooltip-nya sudah benar
// "Masuk / Daftar akun". Sekarang ikonnya ikut ditukar juga, memakai
// pasangan ikon Login/Logout yang sama persis dengan yang sudah dipakai
// di baris akun halaman Pengaturan (lihat updateAccountSettingsRow()).
(function syncAccountToggleLabels() {
  const loggedIn = typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn();
  const label = loggedIn ? 'Keluar dari akun' : 'Masuk / Daftar akun';
  // Logout: panah keluar dari kotak (kotak di kiri). Login: panah masuk ke kotak (kotak di kanan).
  const iconSvg = loggedIn
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>';
  ['btnAddMobile', 'miniLogoutBtn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.title = label;
    el.setAttribute('aria-label', label);
    el.innerHTML = iconSvg;
  });
})();
// Tombol "+" di header "Semua Transaksi" halaman Laporan -- buka modal
// Tambah Transaksi yang sama (lihat komentar di markupnya, index.html).
document.getElementById('lapAddTxBtn')?.addEventListener('click', () => openAddModal());

/* ==========================================================
   MODAL TAMBAH / EDIT TAGIHAN & HUTANG (form terpisah,
   tidak digabung dengan form Tambah Transaksi)
========================================================== */
const billModal = document.getElementById('billModalOverlay');
let billSelectedKind = 'tagihan'; // 'tagihan' | 'hutang'
let editingBillId = null;

function setBillKind(kind) {
  billSelectedKind = kind;
  document.querySelectorAll('#billForm .type-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.billkind === kind);
  });
  document.getElementById('billKind').value = kind;
  // Warna dekorasi popup (sheen atas, radial pojok, judul, tombol Simpan)
  // OTOMATIS ikut jenis yg aktif -- lihat .bill-modal.kind-hutang di CSS.
  billModal.querySelector('.bill-modal').classList.toggle('kind-hutang', kind === 'hutang');
  document.getElementById('billNameLabel').textContent = kind === 'tagihan' ? 'Nama Tagihan' : 'Nama Hutang / Kepada Siapa';
  document.getElementById('billName').placeholder = kind === 'tagihan' ? 'Contoh: Tagihan Listrik PLN' : 'Contoh: Pinjaman ke Budi';
  document.getElementById('billModalTitle').textContent = editingBillId
    ? (kind === 'tagihan' ? 'Edit Tagihan' : 'Edit Hutang')
    : (kind === 'tagihan' ? 'Tambah Tagihan' : 'Tambah Hutang');
  document.getElementById('btnSubmitBill').textContent = editingBillId
    ? 'Simpan Perubahan'
    : (kind === 'tagihan' ? 'Simpan Tagihan' : 'Simpan Hutang');
  // Subtitle & ikon kepala popup ikut berubah sesuai jenis yg aktif,
  // senada dgn pola .modal-head-icon/.modal-head-sub yg sudah dipakai
  // di popup Bank & E-Wallet (.wallet-modal) supaya kedua popup ini
  // benar-benar konsisten satu bahasa desain.
  document.getElementById('billModalSub').textContent = kind === 'tagihan'
    ? 'Atur pengingat tagihan kamu'
    : 'Catat hutang yang perlu dibayar';
  const billHeadIcon = billModal.querySelector('.modal-head-icon');
  if (billHeadIcon) {
    billHeadIcon.innerHTML = kind === 'tagihan'
      ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
      : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 15.5c0 1.1 1 2 2.5 2s2.5-.9 2.5-2-1-1.7-2.5-2.1S9.5 12.6 9.5 11.5s1-2 2.5-2 2.5.9 2.5 2"/></svg>';
  }
}

function openBillModal(kind) {
  editingBillId = null;
  document.getElementById('billForm').reset();
  document.getElementById('billId').value = '';
  document.getElementById('billDueDate').value = todayStr();
  document.getElementById('billRecurring').checked = false;
  setBillKind(kind || 'tagihan');
  window.zayaSyncBillDueChips && window.zayaSyncBillDueChips();
  openModal(billModal);
}

function openEditBillModal(kind, id) {
  const store = kind === 'tagihan' ? bills : debts;
  const item = store.find(x => x.id === id);
  if (!item) return;
  editingBillId = id;
  document.getElementById('billId').value = item.id;
  document.getElementById('billName').value = item.name;
  document.getElementById('billAmount').value = Number(item.amount).toLocaleString('id-ID');
  document.getElementById('billDueDate').value = item.dueDate;
  document.getElementById('billNote').value = item.note || '';
  document.getElementById('billRecurring').checked = !!item.recurring;
  setBillKind(kind);
  window.zayaSyncBillDueChips && window.zayaSyncBillDueChips();
  openModal(billModal);
}

document.getElementById('billForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('billName').value.trim();
  // ---- Nilai #billAmount sekarang bisa mengandung titik pemisah ribuan
  // (lihat initBillAmountFormat() & komentar di index.html), jadi titiknya
  // dibuang dulu sebelum di-parse jadi angka -- kalau langsung parseFloat
  // nilai spt "150.000" bakal salah kebaca jadi 150 (titik dikira desimal).
  const amount = parseFloat(document.getElementById('billAmount').value.replace(/\./g, ''));
  const dueDate = document.getElementById('billDueDate').value;
  const note = document.getElementById('billNote').value.trim();
  const recurring = document.getElementById('billRecurring').checked;
  const kind = billSelectedKind;

  if (!name) { showToast('Nama wajib diisi.', 'err'); return; }
  if (!amount || amount <= 0) { showToast('Jumlah harus lebih dari 0.', 'err'); return; }
  if (!dueDate) { showToast('Tanggal jatuh tempo wajib diisi.', 'err'); return; }

  const store = kind === 'tagihan' ? bills : debts;
  const persistFn = kind === 'tagihan' ? persistBills : persistDebts;

  if (editingBillId) {
    const idx = store.findIndex(x => x.id === editingBillId);
    if (idx > -1) store[idx] = { ...store[idx], name, amount, dueDate, note, recurring };
    showToast((kind === 'tagihan' ? 'Tagihan' : 'Hutang') + ' berhasil diperbarui.');
  } else {
    store.push({ id: cryptoId(), name, amount, dueDate, note, recurring, status: 'belum', createdAt: Date.now() });
    showToast((kind === 'tagihan' ? 'Tagihan' : 'Hutang') + ' berhasil ditambahkan.');
  }

  persistFn(store);
  closeModal(billModal);
  editingBillId = null;
  renderNotifPanel();
  renderBdAllPage();
});

document.querySelectorAll('#billForm .type-toggle button').forEach(btn => {
  btn.addEventListener('click', () => setBillKind(btn.dataset.billkind));
});
document.getElementById('billModalCloseBtn').addEventListener('click', () => closeModal(billModal));
document.getElementById('btnBillCancel').addEventListener('click', () => closeModal(billModal));
billModal.addEventListener('click', (e) => { if (e.target === billModal) closeModal(billModal); });

/* ---- Chip preset cepat "Jatuh Tempo" (Besok/+7 hari/+30 hari/Akhir
   bulan) di popup Tambah/Edit Tagihan & Hutang -- biar user tidak
   selalu harus buka date picker cuma utk tanggal umum spt ini. Status
   "aktif" pada chip SELALU dihitung ulang dari nilai #billDueDate
   saat ini (bukan diingat dari klik terakhir), supaya tetap jujur
   kalau usernya lanjut mengetik/mengganti tanggal manual lewat date
   picker setelah menekan salah satu chip. ---- */
(function initBillDueChips() {
  const dateInput = document.getElementById('billDueDate');
  const chipsWrap = document.getElementById('billDueChips');
  if (!dateInput || !chipsWrap) return;
  const chips = Array.from(chipsWrap.querySelectorAll('.bill-due-chip'));

  function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function presetValue(preset) {
    const d = new Date();
    if (preset === 'eom') return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    d.setDate(d.getDate() + parseInt(preset, 10));
    return toDateStr(d);
  }
  function syncActiveChip() {
    chips.forEach((c) => c.classList.toggle('active', presetValue(c.dataset.duePreset) === dateInput.value));
  }
  chips.forEach((c) => {
    c.addEventListener('click', () => {
      dateInput.value = presetValue(c.dataset.duePreset);
      syncActiveChip();
    });
  });
  dateInput.addEventListener('input', syncActiveChip);
  window.zayaSyncBillDueChips = syncActiveChip;
})();

/* ---- Format titik pemisah ribuan OTOMATIS pada input nominal
   (#billAmount) saat user mengetik -- mis. ketik "150000" langsung
   tampil "150.000" di layar, supaya nominal besar tetap gampang
   dibaca sekilas di kartu hero-nya (lihat komentar di index.html
   utk alasan input diubah dari type="number" ke type="text").
   Posisi kursor DIJAGA relatif thd digit yg sudah diketik (bukan
   selalu lompat ke ujung kanan) dgn menghitung ulang berdasarkan
   SELISIH jumlah titik sebelum & sesudah diformat -- supaya user
   yang mengedit angka di tengah (bukan cuma menambah di akhir)
   tidak merasa kursornya "meloncat" aneh. Nilai yg dikirim ke
   server/disimpan TETAP angka murni (titiknya dibuang dulu, lihat
   submit handler #billForm & openEditBillModal di atas). ---- */
(function initBillAmountFormat() {
  const input = document.getElementById('billAmount');
  if (!input) return;
  input.addEventListener('input', () => {
    const caretFromEnd = input.value.length - input.selectionStart;
    const digitsOnly = input.value.replace(/\D/g, '');
    const formatted = digitsOnly ? Number(digitsOnly).toLocaleString('id-ID') : '';
    input.value = formatted;
    const newPos = Math.max(0, formatted.length - caretFromEnd);
    input.setSelectionRange(newPos, newPos);
  });
})();

/* ---- Format titik pemisah ribuan OTOMATIS pada input nominal
   (#txAmount) di popup "Tambah Transaksi" -- MENYESUAIKAN popup ini
   dgn #billAmount di popup Tagihan & Hutang (lihat initBillAmountFormat()
   tepat di atas), pola & logic-nya PERSIS sama persis: nilai yg
   ditampilkan diberi titik ribuan (mis. "150.000"), posisi kursor
   dijaga relatif thd digit yg sudah diketik, sedangkan nilai murni
   (tanpa titik) yg dikirim ke parseFloat() saat submit/ditampilkan
   ulang saat edit (lihat submit handler #txForm & openEditModal() di
   atas). ---- */
(function initTxAmountFormat() {
  const input = document.getElementById('txAmount');
  if (!input) return;
  input.addEventListener('input', () => {
    const caretFromEnd = input.value.length - input.selectionStart;
    const digitsOnly = input.value.replace(/\D/g, '');
    const formatted = digitsOnly ? Number(digitsOnly).toLocaleString('id-ID') : '';
    input.value = formatted;
    const newPos = Math.max(0, formatted.length - caretFromEnd);
    input.setSelectionRange(newPos, newPos);
  });
})();

/* ==========================================================
   PERANGKAT SAYA — render kartu + modal tambah/edit
========================================================== */
const DEVICE_PLACEHOLDER_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.4"/><path d="M8 6l1.2-2h5.6L16 6"/></svg>';

let deviceStatusFilter = 'semua'; // 'semua' | 'tersedia' | 'terjual'
let deviceSearchQuery = '';

function deviceStatusOf(d) { return d.status === 'terjual' ? 'terjual' : 'tersedia'; }

function renderDevices() {
  const grid = document.getElementById('deviceGrid');
  if (!grid) return;

  const total = devices.length;
  const availableCount = devices.filter(d => deviceStatusOf(d) === 'tersedia').length;
  const soldCount = total - availableCount;
  const elAll = document.getElementById('deviceCountSemua');
  const elAvail = document.getElementById('deviceCountTersedia');
  const elSold = document.getElementById('deviceCountTerjual');
  if (elAll) elAll.textContent = total;
  if (elAvail) elAvail.textContent = availableCount;
  if (elSold) elSold.textContent = soldCount;

  const q = deviceSearchQuery.trim().toLowerCase();
  const filtered = devices.filter(d => {
    if (deviceStatusFilter !== 'semua' && deviceStatusOf(d) !== deviceStatusFilter) return false;
    if (q && !(`${d.name} ${d.brand}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const emptyState = document.getElementById('deviceEmptyState');
  if (emptyState) emptyState.style.display = (total > 0 && filtered.length === 0) ? 'block' : 'none';

  const cards = filtered.map(d => {
    const status = deviceStatusOf(d);
    const isSold = status === 'terjual';
    const statusLabel = isSold ? 'Terjual' : 'Tersedia';
    const priceHtml = d.price ? `<span class="device-price">${fmtRupiah(d.price)}</span>` : '';
    return `
    <div class="device-card fade-up${isSold ? ' is-sold' : ''}" data-device="${d.id}" role="button" tabindex="0" aria-label="Edit perangkat ${escapeHtml(d.name)}, status ${statusLabel}">
      <div class="device-status-badge status-${status}"><span class="dot"></span>${statusLabel}</div>
      <div class="device-card-actions">
        <button class="toggle-btn" data-devicetoggle="${d.id}" type="button" title="${isSold ? 'Tandai tersedia lagi' : 'Tandai terjual'}">
          ${isSold
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 13 4 4L19 7"/></svg>'}
        </button>
        <button class="edit-btn" data-deviceedit="${d.id}" type="button" title="Edit perangkat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="del-btn" data-devicedel="${d.id}" type="button" title="Hapus perangkat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
        </button>
      </div>
      <div class="device-photo">
        ${d.photo ? `<img src="${d.photo}" alt="${escapeHtml(d.name)}">` : DEVICE_PLACEHOLDER_SVG}
        ${isSold ? '<div class="device-sold-ribbon"><span>Terjual</span></div>' : ''}
      </div>
      <div class="device-info">
        <div class="device-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
        <div class="device-meta-row">
          <span class="device-brand" title="${escapeHtml(d.brand)}">${escapeHtml(d.brand)}</span>
          ${priceHtml}
        </div>
      </div>
    </div>
  `;
  }).join('');

  grid.innerHTML = cards + `
    <button type="button" class="device-add-card" id="deviceAddCardBtn">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
      <span>Tambah Perangkat</span>
    </button>`;

  const addCardBtn = document.getElementById('deviceAddCardBtn');
  if (addCardBtn) addCardBtn.addEventListener('click', () => openDeviceModal());
}

document.getElementById('deviceTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-devicetab]');
  if (!btn) return;
  deviceStatusFilter = btn.dataset.devicetab;
  document.querySelectorAll('#deviceTabs .device-tab').forEach(b => b.classList.toggle('active', b === btn));
  renderDevices();
});

document.getElementById('deviceSearchInput')?.addEventListener('input', (e) => {
  deviceSearchQuery = e.target.value;
  renderDevices();
});

const deviceModal = document.getElementById('deviceModalOverlay');
let editingDeviceId = null;
let devicePhotoData = null; // base64 dataURL sementara di form, sebelum disimpan
let selectedDeviceStatus = 'tersedia'; // 'tersedia' | 'terjual'

function setDevicePhotoPreview(dataUrl) {
  devicePhotoData = dataUrl || null;
  const preview = document.getElementById('devicePhotoPreview');
  const removeBtn = document.getElementById('btnRemoveDevicePhoto');
  preview.innerHTML = devicePhotoData ? `<img src="${devicePhotoData}" alt="Pratinjau foto perangkat">` : DEVICE_PLACEHOLDER_SVG;
  removeBtn.style.display = devicePhotoData ? 'inline-flex' : 'none';
}

function setSelectedDeviceStatus(status) {
  selectedDeviceStatus = status;
  document.querySelectorAll('#deviceForm .device-status-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.devicestatus === status);
  });
}

function openDeviceModal() {
  editingDeviceId = null;
  document.getElementById('deviceModalTitle').textContent = 'Tambah Perangkat';
  document.getElementById('btnSubmitDevice').textContent = 'Simpan';
  document.getElementById('deviceForm').reset();
  document.getElementById('deviceId').value = '';
  document.getElementById('devicePhotoInput').value = '';
  setDevicePhotoPreview(null);
  setSelectedDeviceStatus('tersedia');
  openModal(deviceModal);
}

function openEditDeviceModal(id) {
  const d = devices.find(x => x.id === id);
  if (!d) return;
  editingDeviceId = id;
  document.getElementById('deviceModalTitle').textContent = 'Edit Perangkat';
  document.getElementById('btnSubmitDevice').textContent = 'Simpan Perubahan';
  document.getElementById('deviceId').value = d.id;
  document.getElementById('deviceName').value = d.name;
  document.getElementById('deviceBrand').value = d.brand;
  document.getElementById('devicePrice').value = d.price || '';
  document.getElementById('deviceNote').value = d.note || '';
  document.getElementById('devicePhotoInput').value = '';
  setDevicePhotoPreview(d.photo || null);
  setSelectedDeviceStatus(deviceStatusOf(d));
  openModal(deviceModal);
}

document.getElementById('devicePhotoInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran foto maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setDevicePhotoPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca foto.', 'err');
  reader.readAsDataURL(file);
});
document.getElementById('btnRemoveDevicePhoto').addEventListener('click', () => {
  setDevicePhotoPreview(null);
  document.getElementById('devicePhotoInput').value = '';
});

document.querySelectorAll('#deviceForm .device-status-toggle button').forEach(btn => {
  btn.addEventListener('click', () => setSelectedDeviceStatus(btn.dataset.devicestatus));
});

document.getElementById('deviceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('deviceName').value.trim();
  const brand = document.getElementById('deviceBrand').value.trim();
  const priceRaw = document.getElementById('devicePrice').value;
  const price = priceRaw ? parseFloat(priceRaw) : null;
  const status = selectedDeviceStatus;
  const note = document.getElementById('deviceNote').value.trim();

  if (!name) { showToast('Nama perangkat wajib diisi.', 'err'); return; }
  if (!brand) { showToast('Merek perangkat wajib diisi.', 'err'); return; }

  if (editingDeviceId) {
    const idx = devices.findIndex(x => x.id === editingDeviceId);
    if (idx > -1) devices[idx] = { ...devices[idx], name, brand, price, status, note, photo: devicePhotoData };
    showToast('Perangkat berhasil diperbarui.');
  } else {
    devices.push({ id: cryptoId(), name, brand, price, status, note, photo: devicePhotoData, createdAt: Date.now() });
    showToast('Perangkat berhasil ditambahkan.');
  }

  persistDevices();
  closeModal(deviceModal);
  editingDeviceId = null;
  renderDevices();
});

document.getElementById('deviceModalCloseBtn').addEventListener('click', () => closeModal(deviceModal));
document.getElementById('btnDeviceCancel').addEventListener('click', () => closeModal(deviceModal));
deviceModal.addEventListener('click', (e) => { if (e.target === deviceModal) closeModal(deviceModal); });
document.getElementById('btnAddDevice')?.addEventListener('click', () => openDeviceModal());

document.getElementById('deviceGrid')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-deviceedit]');
  const delBtn = e.target.closest('[data-devicedel]');
  const toggleBtn = e.target.closest('[data-devicetoggle]');
  if (toggleBtn) {
    const d = devices.find(x => x.id === toggleBtn.dataset.devicetoggle);
    if (d) {
      d.status = deviceStatusOf(d) === 'terjual' ? 'tersedia' : 'terjual';
      persistDevices();
      showToast(d.status === 'terjual' ? 'Perangkat ditandai terjual.' : 'Perangkat ditandai tersedia lagi.');
      renderDevices();
    }
    return;
  }
  if (editBtn) { openEditDeviceModal(editBtn.dataset.deviceedit); return; }
  if (delBtn) { openDeleteConfirm(delBtn.dataset.devicedel, 'device'); return; }
  const card = e.target.closest('.device-card');
  if (card) openEditDeviceModal(card.dataset.device);
});

/* ==========================================================
   SALDO BANK & E-WALLET — interaksi kartu (reveal saldo saat
   hover/sentuh), modal tambah/edit akun (dengan pilihan cepat
   preset + upload logo custom), dan hapus akun.
========================================================== */
function bindWalletCardEvents() {
  const totalStat = document.getElementById('walletTotalStat');
  if (totalStat && !totalStat._walletBound) {
    totalStat._walletBound = true;
    totalStat.addEventListener('click', () => totalStat.classList.toggle('is-revealed'));
    totalStat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); totalStat.classList.toggle('is-revealed'); }
    });
  }

  const addBtn = document.getElementById('walletAddTileBtn');
  if (addBtn && !addBtn._walletBound) {
    addBtn._walletBound = true;
    addBtn.addEventListener('click', () => openWalletModal());
  }

  const strip = document.getElementById('walletDealsStrip');
  if (strip && !strip._walletBound) {
    strip._walletBound = true;

    strip.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-walletedit]');
      if (editBtn) { e.stopPropagation(); openEditWalletModal(editBtn.dataset.walletedit); return; }

      const delBtn = e.target.closest('[data-walletdel]');
      if (delBtn) { e.stopPropagation(); openDeleteConfirm(delBtn.dataset.walletdel, 'wallet'); return; }

      const card = e.target.closest('.wallet-deal-card');
      if (card) card.classList.toggle('is-revealed');
    });
    strip.addEventListener('keydown', (e) => {
      const card = e.target.closest('.wallet-deal-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.classList.toggle('is-revealed'); }
    });
  }

  startWalletAutoScroll();
}

const walletModal = document.getElementById('walletModalOverlay');
const WALLET_PLACEHOLDER_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2.4"/><path d="M3 10h18"/><circle cx="16.2" cy="14.4" r="1.25" fill="currentColor" stroke="none"/></svg>';

function setWalletPhotoPreview(dataUrl) {
  walletPhotoData = dataUrl || null;
  const preview = document.getElementById('walletPhotoPreview');
  const removeBtn = document.getElementById('btnRemoveWalletPhoto');
  if (!preview) return;
  preview.innerHTML = walletPhotoData ? `<img src="${walletPhotoData}" alt="Pratinjau logo akun">` : WALLET_PLACEHOLDER_SVG;
  if (removeBtn) removeBtn.style.display = walletPhotoData ? 'inline-flex' : 'none';
  updateWalletPreview();
}

function handleWalletPhotoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran logo maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setWalletPhotoPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca logo.', 'err');
  reader.readAsDataURL(file);
}

function setSelectedWalletCategory(category) {
  selectedWalletCategory = category;
  document.querySelectorAll('#walletForm .wallet-category-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.walletcategory === category);
  });
  updateWalletPreview();
}

function renderWalletPresetChips() {
  const wrap = document.getElementById('walletPresetChips');
  if (!wrap) return;
  wrap.innerHTML = WALLET_PRESETS.map(p => `
    <button type="button" class="wallet-preset-chip" data-walletpreset="${p.key}" style="--chip-color:${p.color}">
      <span class="wpc-badge">${escapeHtml(p.initials.slice(0, 3))}</span>${escapeHtml(p.name)}
    </button>
  `).join('');
}

/* Pratinjau langsung: memperlihatkan bagaimana akun akan tampil (logo,
   nama, kategori, saldo) di dalam kartu ringkasan begitu form diisi —
   ikut berubah warna & isi tiap kali nama, kategori, saldo, atau logo
   diubah, supaya hasil akhirnya terasa jelas sebelum disimpan. */
function currentWalletPreviewInitials(name) {
  const preset = WALLET_PRESETS.find(p => p.name.toLowerCase() === (name || '').trim().toLowerCase());
  if (preset) return preset.initials;
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.slice(0, 3).toUpperCase() : '?';
}

function updateWalletPreview() {
  const previewCard = document.getElementById('walletPreviewCard');
  if (!previewCard) return;
  const nameEl = document.getElementById('walletName');
  const balanceEl = document.getElementById('walletBalance');
  const name = nameEl ? nameEl.value.trim() : '';
  const balanceRaw = balanceEl ? balanceEl.value : '';
  const balance = balanceRaw ? parseFloat(balanceRaw) : 0;
  const category = selectedWalletCategory;
  const color = selectedWalletColor || WALLET_PRESETS[0].color;

  previewCard.style.setProperty('--w-color', color);
  const modalIcon = document.getElementById('walletModalIcon');
  if (modalIcon) modalIcon.style.setProperty('--w-color', color);

  const previewLogo = document.getElementById('walletPreviewLogo');
  if (previewLogo) {
    previewLogo.innerHTML = walletPhotoData
      ? `<img src="${walletPhotoData}" alt="Pratinjau logo">`
      : escapeHtml(currentWalletPreviewInitials(name));
  }
  const previewName = document.getElementById('walletPreviewName');
  if (previewName) previewName.textContent = name || 'Nama akun';
  const previewCatIcon = document.getElementById('walletPreviewCatIcon');
  if (previewCatIcon) previewCatIcon.innerHTML = walletCategoryIcon(category);
  const previewCatLabel = document.getElementById('walletPreviewCatLabel');
  if (previewCatLabel) previewCatLabel.textContent = WALLET_CATEGORY_LABELS[category] || WALLET_CATEGORY_LABELS.other;
  const previewBalance = document.getElementById('walletPreviewBalance');
  if (previewBalance) previewBalance.textContent = fmtRupiah(balance);
}

function openWalletModal() {
  editingWalletId = null;
  document.getElementById('walletModalTitle').textContent = 'Tambah Bank / E-Wallet';
  document.getElementById('walletModalSub').textContent = 'Isi detail akun, lalu simpan';
  document.getElementById('btnSubmitWallet').textContent = 'Simpan';
  document.getElementById('walletForm').reset();
  document.getElementById('walletId').value = '';
  document.getElementById('walletPhotoInput').value = '';
  selectedWalletColor = WALLET_PRESETS[0].color;
  setWalletPhotoPreview(null);
  setSelectedWalletCategory('bank');
  renderWalletPresetChips();
  updateWalletPreview();
  openModal(walletModal);
}

function openEditWalletModal(id) {
  const w = wallets.find(x => x.id === id);
  if (!w) return;
  editingWalletId = id;
  document.getElementById('walletModalTitle').textContent = 'Edit Bank / E-Wallet';
  document.getElementById('walletModalSub').textContent = 'Perbarui detail akun ini';
  document.getElementById('btnSubmitWallet').textContent = 'Simpan Perubahan';
  document.getElementById('walletId').value = w.id;
  document.getElementById('walletName').value = w.name;
  document.getElementById('walletBalance').value = w.balance || 0;
  document.getElementById('walletNote').value = w.note || '';
  document.getElementById('walletPhotoInput').value = '';
  selectedWalletColor = w.color || WALLET_PRESETS[0].color;
  setWalletPhotoPreview(w.photo || null);
  setSelectedWalletCategory(w.category || 'bank');
  renderWalletPresetChips();
  updateWalletPreview();
  openModal(walletModal);
}

document.getElementById('walletName').addEventListener('input', updateWalletPreview);
document.getElementById('walletBalance').addEventListener('input', updateWalletPreview);

document.getElementById('walletPhotoInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleWalletPhotoFile(file);
});
document.getElementById('btnRemoveWalletPhoto').addEventListener('click', () => {
  setWalletPhotoPreview(null);
  document.getElementById('walletPhotoInput').value = '';
});

/* Tarik & lepas logo langsung ke area pemilih foto (selain lewat tombol
   "Pilih Logo"), dengan highlight border saat file diseret di atasnya. */
const walletPhotoDrop = document.getElementById('walletPhotoDrop');
if (walletPhotoDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    walletPhotoDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      walletPhotoDrop.classList.add('is-dragover');
    });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    walletPhotoDrop.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      walletPhotoDrop.classList.remove('is-dragover');
    });
  });
  walletPhotoDrop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    walletPhotoDrop.classList.remove('is-dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleWalletPhotoFile(file);
  });
}

document.querySelectorAll('#walletForm .wallet-category-toggle button').forEach(btn => {
  btn.addEventListener('click', () => setSelectedWalletCategory(btn.dataset.walletcategory));
});

document.getElementById('walletPresetChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-walletpreset]');
  if (!chip) return;
  const preset = WALLET_PRESETS.find(p => p.key === chip.dataset.walletpreset);
  if (!preset) return;
  document.getElementById('walletName').value = preset.name;
  selectedWalletColor = preset.color;
  setSelectedWalletCategory(preset.category);
  document.querySelectorAll('#walletPresetChips .wallet-preset-chip').forEach(c => c.classList.toggle('active', c === chip));
  updateWalletPreview();
});

document.getElementById('walletForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('walletName').value.trim();
  const balanceRaw = document.getElementById('walletBalance').value;
  const balance = balanceRaw ? parseFloat(balanceRaw) : 0;
  const note = document.getElementById('walletNote').value.trim();
  const category = selectedWalletCategory;

  if (!name) { showToast('Nama bank/e-wallet wajib diisi.', 'err'); return; }

  const preset = WALLET_PRESETS.find(p => p.name.toLowerCase() === name.toLowerCase());
  const color = preset ? preset.color : selectedWalletColor;
  const initials = preset ? preset.initials : name.trim().slice(0, 3).toUpperCase();

  if (editingWalletId) {
    const idx = wallets.findIndex(x => x.id === editingWalletId);
    if (idx > -1) wallets[idx] = { ...wallets[idx], name, category, color, initials, balance, note, photo: walletPhotoData };
    showToast('Akun berhasil diperbarui.');
  } else {
    wallets.push({ id: cryptoId(), name, category, color, initials, balance, note, photo: walletPhotoData, createdAt: Date.now() });
    showToast('Akun berhasil ditambahkan.');
  }

  persistWallets();
  closeModal(walletModal);
  editingWalletId = null;
  renderSummary();
});

document.getElementById('walletModalCloseBtn').addEventListener('click', () => closeModal(walletModal));
document.getElementById('btnWalletCancel').addEventListener('click', () => closeModal(walletModal));
walletModal.addEventListener('click', (e) => { if (e.target === walletModal) closeModal(walletModal); });

/* ==========================================================
   AKUN SOSIAL MEDIA — render tombol clickable + modal atur tautan
========================================================== */
function normalizeSocialUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function renderSocial() {
  const grid = document.getElementById('socialGrid');
  if (!grid) return;
  grid.innerHTML = SOCIAL_PLATFORMS.map(p => {
    const url = socialLinks[p.key];
    return `
    <button type="button" class="social-btn${url ? '' : ' not-set'}" data-social="${p.key}" title="${url ? 'Buka ' + p.label : 'Atur tautan ' + p.label}">
      <span class="social-ic" style="background:${p.color}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p.icon}</svg>
      </span>
      <span class="social-label">${p.label}${url ? '' : '<small>Belum diatur</small>'}</span>
    </button>`;
  }).join('');
}

document.getElementById('socialGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-social]');
  if (!btn) return;
  const key = btn.dataset.social;
  const url = socialLinks[key];
  if (url) window.open(url, '_blank', 'noopener');
  else openSocialModal();
});

const socialModal = document.getElementById('socialModalOverlay');

function openSocialModal() {
  document.getElementById('socialYoutube').value = socialLinks.youtube || '';
  document.getElementById('socialFacebook').value = socialLinks.facebook || '';
  document.getElementById('socialInstagram').value = socialLinks.instagram || '';
  document.getElementById('socialTiktok').value = socialLinks.tiktok || '';
  document.getElementById('socialWhatsapp').value = socialLinks.whatsapp || '';
  openModal(socialModal);
}

document.getElementById('socialForm').addEventListener('submit', (e) => {
  e.preventDefault();
  socialLinks = {
    youtube: normalizeSocialUrl(document.getElementById('socialYoutube').value),
    facebook: normalizeSocialUrl(document.getElementById('socialFacebook').value),
    instagram: normalizeSocialUrl(document.getElementById('socialInstagram').value),
    tiktok: normalizeSocialUrl(document.getElementById('socialTiktok').value),
    whatsapp: normalizeSocialUrl(document.getElementById('socialWhatsapp').value),
  };
  persistSocialLinks();
  renderSocial();
  closeModal(socialModal);
  showToast('Tautan sosial media disimpan.');
});

document.getElementById('socialModalCloseBtn').addEventListener('click', () => closeModal(socialModal));
document.getElementById('btnSocialCancel').addEventListener('click', () => closeModal(socialModal));
socialModal.addEventListener('click', (e) => { if (e.target === socialModal) closeModal(socialModal); });
document.getElementById('btnEditSocial')?.addEventListener('click', () => openSocialModal());

/* ==========================================================
   PENGATURAN APLIKASI (nama web, logo, warna aksen, bahasa,
   kepadatan tampilan) — dibuka lewat klik logo/nama di banner.
   Tersimpan di localStorage, diterapkan ke elemen brand di
   banner & footer, judul tab browser, variabel CSS --forest-glow
   (warna aksen utama), dan class kepadatan tampilan di <body>.
========================================================== */
const APP_SETTINGS_KEY = 'alirin_app_settings_v1';
const DEFAULT_BRAND_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>';
/* Disamakan dgn GLOBAL_THEME_PRESETS di atas (6 warna & urutan yang
   sama persis) supaya 2 pemilih warna di app ini (halaman "Tema" &
   aksen di modal Pengaturan) tidak lagi terasa jadi 2 palet yang
   berbeda arah -- sebelumnya set warna & defaultnya beda sendiri. */
const APP_THEME_PRESETS = [
  { key: 'orange', label: 'Oren', color: '#F2672B' },
  { key: 'emerald', label: 'Zamrud', color: '#10B981' },
  { key: 'sapphire', label: 'Safir', color: '#2563EB' },
  { key: 'teal', label: 'Toska', color: '#0D9488' },
  { key: 'amethyst', label: 'Ametis', color: '#7C3AED' },
  { key: 'gold', label: 'Emas', color: '#D97706' },
];
// Pustaka ikon SVG bawaan untuk brand mark — dipakai bila pengguna
// tidak mengunggah logo gambar sendiri.
const APP_ICON_PRESETS = [
  { key: 'pulse', label: 'Pulsa', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>' },
  { key: 'wallet', label: 'Dompet', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v2"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H8"/><circle cx="16.5" cy="14" r="1.4"/></svg>' },
  { key: 'trending', label: 'Tren', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>' },
  { key: 'chart', label: 'Grafik', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>' },
  { key: 'shield', label: 'Aman', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>' },
  { key: 'coin', label: 'Koin', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 12h6M12 8.5v7"/></svg>' },
];
// Pasangan font (teks isi / judul) yang bisa dipilih pengguna, semuanya
// sudah dimuat lewat tag <link> Google Fonts di <head>.
const APP_FONT_PRESETS = [
  { key: 'modern', label: 'Modern', body: "'Plus Jakarta Sans', sans-serif", display: "'Fraunces', serif" },
  { key: 'minimal', label: 'Minimalis', body: "'Inter', sans-serif", display: "'Inter', sans-serif" },
  { key: 'classic', label: 'Klasik', body: "'Source Sans 3', sans-serif", display: "'Libre Baskerville', serif" },
  { key: 'playful', label: 'Playful', body: "'Poppins', sans-serif", display: "'Poppins', sans-serif" },
];
// Model animasi banner: mengatur ulang animasi gradien, grid, dan garis
// alir yang sudah ada di CSS lewat atribut data-banner-anim di <body>.
const APP_BANNER_ANIM_PRESETS = [
  { key: 'wave', label: 'Gelombang', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/></svg>' },
  { key: 'lines', label: 'Garis Mengalir', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M13 6l6 6-6 6"/></svg>' },
  { key: 'shimmer', label: 'Kilau Lembut', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6-5.6-1.9 5.6-1.9L12 2.5Z"/></svg>' },
  { key: 'static', label: 'Statis', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>' },
];
const APP_SETTINGS_DEFAULTS = { appName: '', logo: null, icon: 'pulse', theme: 'orange', font: 'playful', bannerAnim: 'wave', density: 'comfortable', language: 'id', favicon: null, metaDescription: '', metaKeywords: '' };
const APP_META_DESC_MAXLEN = 160;
/* ---- "Nama Web" bawaan = nama akun saat mendaftar. Form daftar/masuk
   cuma minta email+password (tidak ada kolom "nama" terpisah -- lihat
   cloud-sync.js), jadi diambil dari bagian sebelum "@" pada email akun
   yang sedang login (window.zayaproAccountEmail, diekspos oleh
   cloud-sync.js SEBELUM script.js ini disisipkan/dijalankan). Titik &
   underscore diubah jadi spasi lalu tiap kata dikapitalisasi supaya
   terbaca rapi sbg nama, bukan mentah2 "budi.santoso99" -- dipakai di
   mana pun aplikasi butuh nama aplikasi tapi pengguna belum pernah
   mengganti "Nama Web" sendiri (appName kosong). APP_SETTINGS_DEFAULTS.appName
   SENGAJA dikosongkan ('') -- bukan lagi hardcode 'ZAYAIN' -- supaya
   status "belum pernah diisi pengguna" bisa dibedakan dari "sudah
   pernah diisi", dan getDefaultAppName() di bawah inilah yg
   menentukan tampilannya selama appName masih kosong. 'ZAYAIN' cuma
   dipakai sbg jaring pengaman paling akhir kalau emailnya sendiri
   entah kenapa tidak tersedia. ---- */
function deriveAccountNameFromEmail(email) {
  const local = (email || '').split('@')[0];
  if (!local) return '';
  return local
    .replace(/[._]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
function getDefaultAppName() {
  // Prioritas: nama asli yang diisi user di kolom "Nama" saat daftar
  // (window.zayaproAccountName, diekspos cloud-sync.js dari
  // user_metadata.full_name) -- baru kalau kosong (akun lama yang
  // daftar sebelum kolom Nama ada), fallback ke tebakan dari email
  // spt semula.
  const realName = (window.zayaproAccountName || '').trim();
  if (realName) return realName;
  return deriveAccountNameFromEmail(window.zayaproAccountEmail) || 'ZAYAIN';
}

/* ==========================================================
   HALAMAN "TEMA" (#temaOverlay) — ganti warna aksen GLOBAL aplikasi.
   Beda dengan "Warna aksen" di modal Pengaturan Aplikasi (yang cuma
   menimpa --forest-glow, dipakai di beberapa aksen sekunder saja),
   halaman ini menimpa --primary/--primary-deep/--primary-light/
   --primary-soft SEKALIGUS --banner-orange/--banner-orange-deep --
   yaitu SEMUA variabel warna yang dipakai banner Beranda, tombol,
   badge, & elemen brand lain di seluruh app. 6 pilihan siap pakai,
   dikurasi supaya senada dengan identitas ZAYAIN (aksen hangat di
   atas latar navy gelap + kartu putih): Oren (bawaan, warna brand
   asli), Zamrud & Toska (kesan uang/pertumbuhan finansial), Safir
   (kepercayaan), Ametis (premium), Emas (kesan kekayaan/tabungan).
   "Merah" versi lama sengaja dilepas dari daftar siap-pakai karena
   di UI finance warna merah sudah dipakai khusus utk saldo/nominal
   minus (rugi/pengeluaran), jadi kurang pas dipakai sebagai warna
   brand -- pengguna yang tetap mau merah masih bisa lewat pilihan
   "Sendiri" (color picker bebas). 1 pilihan warna bebas lewat color
   picker bawaan browser, yang shade turunannya (gelap/terang/lembut)
   dihitung otomatis lewat HSL supaya tetap enak dilihat utk warna
   apa pun yang dipilih pengguna. ---- */
const GLOBAL_THEME_KEY = 'alirin_global_theme_v1';
const GLOBAL_THEME_PRESETS = [
  { key: 'orange', label: 'Oren', primary: '#F2672B', deep: '#C2410C', light: '#FFB088', soft: '#FFF1E7', banner: '#FA8B1E', bannerDeep: '#D97706' },
  { key: 'emerald', label: 'Zamrud', primary: '#10B981', deep: '#047857', light: '#6EE7B7', soft: '#ECFDF5', banner: '#34D399', bannerDeep: '#059669' },
  { key: 'sapphire', label: 'Safir', primary: '#2563EB', deep: '#1D4ED8', light: '#93C5FD', soft: '#EFF6FF', banner: '#3B82F6', bannerDeep: '#1D4ED8' },
  { key: 'teal', label: 'Toska', primary: '#0D9488', deep: '#0F766E', light: '#5EEAD4', soft: '#F0FDFA', banner: '#14B8A6', bannerDeep: '#0F766E' },
  { key: 'amethyst', label: 'Ametis', primary: '#7C3AED', deep: '#5B21B6', light: '#C4B5FD', soft: '#F5F3FF', banner: '#8B5CF6', bannerDeep: '#6D28D9' },
  { key: 'gold', label: 'Emas', primary: '#D97706', deep: '#92400E', light: '#FCD34D', soft: '#FFFBEB', banner: '#F59E0B', bannerDeep: '#B45309' },
];
const GLOBAL_THEME_DEFAULTS = { mode: 'orange', custom: '#EC4899' };

function hexToHsl(hex) {
  const m = (hex || '').replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(full.substring(0, 2), 16) / 255;
  const g = parseInt(full.substring(2, 4), 16) / 255;
  const b = parseInt(full.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(100, Math.max(0, s)) / 100; l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
// Turunkan shade gelap/terang/lembut & warna banner dari 1 warna dasar
// bebas (dipakai utk pilihan "warna sendiri"), pakai manipulasi HSL
// supaya proporsinya konsisten dgn preset siap pakai di atas.
function deriveGlobalThemeShades(baseHex) {
  const { h, s, l } = hexToHsl(baseHex);
  return {
    primary: baseHex,
    deep: hslToHex(h, Math.min(100, s + 4), Math.max(18, l - 16)),
    light: hslToHex(h, Math.max(35, s - 15), Math.min(88, l + 24)),
    soft: hslToHex(h, Math.max(30, s - 25), Math.min(96, l + 40)),
    banner: hslToHex(h + 6, Math.min(100, s + 8), Math.min(70, l + 4)),
    bannerDeep: hslToHex(h + 3, Math.min(100, s + 6), Math.max(30, l - 12)),
  };
}
function resolveGlobalThemeShades(state) {
  if (state.mode === 'custom') return deriveGlobalThemeShades(state.custom || GLOBAL_THEME_DEFAULTS.custom);
  return GLOBAL_THEME_PRESETS.find(p => p.key === state.mode) || GLOBAL_THEME_PRESETS[0];
}
function loadGlobalTheme() {
  try {
    const raw = cloudStorage.getItem(GLOBAL_THEME_KEY);
    return raw ? { ...GLOBAL_THEME_DEFAULTS, ...JSON.parse(raw) } : { ...GLOBAL_THEME_DEFAULTS };
  } catch (e) { return { ...GLOBAL_THEME_DEFAULTS }; }
}
function saveGlobalTheme(state) {
  try { cloudStorage.setItem(GLOBAL_THEME_KEY, JSON.stringify(state)); }
  catch (e) { showToast('Gagal menyimpan warna tema.', 'err'); }
}
// Disimpan di variabel JS terpisah (bukan cuma dibaca ulang dari CSS var
// lewat getComputedStyle tiap kali dibutuhkan) supaya warna banner yang
// dipakai address bar/status bar SELALU pasti versi TERBARU persis saat
// applyGlobalTheme() dipanggil -- tanpa bergantung pada timing browser
// "mengembalikan" nilai --banner-orange lewat getComputedStyle (yang di
// sebagian kasus/browser bisa saja belum ke-refresh kalau dibaca dalam
// microtask/frame yang sama dengan setProperty()-nya). Nilai awal
// #FA8B1E SENGAJA sama dengan default --banner-orange di CSS/preset
// "orange" (lihat GLOBAL_THEME_PRESETS) supaya konsisten sebelum
// applyGlobalTheme(loadGlobalTheme()) pertama kali jalan di bawah nanti.
let currentBannerColorHex = '#FA8B1E';
// FIX BUG FATAL "script.js berhenti total di tengah jalan": variabel ini
// SEBELUMNYA dideklarasikan jauh di bawah (dekat syncMobileChromeColor()),
// padahal applyGlobalTheme(loadGlobalTheme()) sudah dipanggil di baris
// ~8355 -- lebih awal dari deklarasi aslinya. applyGlobalTheme() memanggil
// refreshMobileChromeColor() -> syncMobileChromeColor(), yang membaca
// variabel `let` ini SEBELUM baris deklarasi aslinya sempat dieksekusi.
// `let`/`const` (beda dari `function`) TIDAK bisa diakses sebelum baris
// deklarasinya benar-benar jalan (temporal dead zone) -- akibatnya
// muncul "Uncaught ReferenceError: Cannot access 'mobileChromeColorCache'
// before initialization" yang TIDAK dibungkus try/catch, sehingga
// menghentikan SISA SELURUH file script.js ini seketika (semua listener
// tombol & init() yang seharusnya jalan setelahnya jadi tidak pernah
// terpasang/terpanggil sama sekali -- itulah kenapa banyak tombol/
// halaman "seperti mati" setelah fitur warna address bar ditambahkan).
// Dipindah ke sini (sebelum applyGlobalTheme() pernah dipanggil) supaya
// nilainya sudah pasti siap sebelum dibaca dari mana pun.
let mobileChromeColorCache = null;
function applyGlobalTheme(state) {
  const shades = resolveGlobalThemeShades(state);
  currentBannerColorHex = shades.banner;
  const root = document.documentElement.style;
  root.setProperty('--primary', shades.primary);
  root.setProperty('--primary-deep', shades.deep);
  root.setProperty('--primary-light', shades.light);
  root.setProperty('--primary-soft', shades.soft);
  root.setProperty('--banner-orange', shades.banner);
  root.setProperty('--banner-orange-deep', shades.bannerDeep);
  /* ---- BARU: --forest-glow ikut disatukan ke sini ----
     SEBELUMNYA --forest-glow (dipakai di >100 tempat: cincin fokus,
     hover tombol edit, warna kartu dompet, badge, tombol tambah, dst
     -- lihat grep var(--forest-glow) di index.html) dikendalikan
     SENDIRI oleh "Warna Aksen" di modal Pengaturan Aplikasi
     (applyAppSettings, via APP_THEME_PRESETS/settings.theme), jadi
     TERPISAH dari 6 warna siap-pakai di halaman Tema ini. Akibatnya
     pilih warna di halaman Tema TIDAK benar2 "global" -- elemen2
     ber-forest-glow tetap warna lama. --forest-deep/--forest-mid
     SENGAJA TIDAK ikut disamakan -- itu bukan bagian dari sistem
     warna aksen, keduanya adalah warna navy gelap tetap yang dipakai
     utk tooltip/badge gelap/kode (lihat linear-gradient(...,
     var(--forest-deep), var(--forest-mid)) di banner & elemen gelap
     lain), tidak terkait sama sekali dengan warna aksen oranye/dsb. */
  root.setProperty('--forest-glow', shades.primary);
  // Address bar/status bar (theme-color meta, header Telegram, dst --
  // lihat getActiveMobileChromeColor()/syncMobileChromeColor() di bawah)
  // ikut disamakan SAAT ITU JUGA begitu warna banner berubah, entah krn
  // pilih preset warna di halaman Tema, pratinjau warna custom (color
  // picker), atau batal/konfirmasi modal Tema -- bukan cuma nyambung
  // belakangan pas discroll. typeof-check krn fungsi ini didefinisikan
  // lebih jauh di bawah file (aman, function declaration di-hoist), TAPI
  // applyGlobalTheme(loadGlobalTheme()) di baris paling bawah file ini
  // bisa saja jalan sebelum baris function refreshMobileChromeColor()
  // "tergambar" kalau suatu saat kode ini dipindah ke luar file/module
  // terpisah -- check ini jaga2 supaya tidak error di skenario itu.
  if (typeof refreshMobileChromeColor === 'function') refreshMobileChromeColor();
}
function renderTemaColorGrid(state) {
  const grid = document.getElementById('temaColorGrid');
  if (!grid) return;
  // Versi baru: lingkaran solid berjajar ala referensi foto -- tanpa
  // label teks & tanpa badge centang, status "terpilih" cukup lewat
  // class .active (cincin abu-abu, lihat CSS .tema-color-btn.active).
  const presetHtml = GLOBAL_THEME_PRESETS.map(p => `
    <button type="button" class="tema-color-btn${state.mode === p.key ? ' active' : ''}" data-temamode="${p.key}" style="--tc-color:${p.primary}" title="${p.label}" aria-label="Warna ${p.label}" aria-pressed="${state.mode === p.key ? 'true' : 'false'}"></button>
  `).join('');
  const customColor = state.custom || GLOBAL_THEME_DEFAULTS.custom;
  const customHtml = `
    <button type="button" class="tema-color-btn tema-color-custom${state.mode === 'custom' ? ' active' : ''}" data-temamode="custom" style="--tc-color:${customColor}" title="Sendiri" aria-label="Pilih warna sendiri" aria-pressed="${state.mode === 'custom' ? 'true' : 'false'}"></button>
  `;
  grid.innerHTML = presetHtml + customHtml;
}
/* ---- Grid pemilih "Gaya Font" di halaman Tema -- pakai APP_FONT_PRESETS
   & disimpan di key APP_SETTINGS_KEY yg SAMA dgn font di modal
   "Pengaturan Aplikasi" (1 sumber data, bukan sistem/penyimpanan baru
   yg terpisah), supaya pilihan di 2 tempat itu selalu sinkron. ---- */
function renderTemaFontGrid(selectedFont) {
  const grid = document.getElementById('temaFontGrid');
  if (!grid) return;
  const checkSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  grid.innerHTML = APP_FONT_PRESETS.map(f => `
    <button type="button" class="tema-font-btn${selectedFont === f.key ? ' active' : ''}" data-temafont="${f.key}" aria-label="Font ${f.label}">
      <span class="tfb-check">${checkSvg}</span>
      <span class="tfb-preview" style="font-family:${f.display}">Aa</span>
      <span class="tfb-label">${f.label}</span>
    </button>
  `).join('');
}
// Terapkan cuma 2 variabel font (body/display) -- dipakai utk pratinjau
// sementara di halaman Tema, beda dgn applyAppSettings() yg sekaligus
// menimpa banyak hal lain (nama brand, ikon, favicon, dst) yg tidak
// relevan sedang dipratinjau di sini.
function applyFontPreview(fontKey) {
  const fontPreset = APP_FONT_PRESETS.find(f => f.key === fontKey) || APP_FONT_PRESETS[0];
  document.documentElement.style.setProperty('--font-body', fontPreset.body);
  document.documentElement.style.setProperty('--font-display', fontPreset.display);
}
/* ==========================================================
   "Elemen Dekoratif Banner" di halaman Tema -- on/off + 4 pilihan
   bentuk (lingkaran, gelombang, titik-titik, blob) utk hiasan
   transparan di latar <header class="banner"> (lihat markup #bannerDeco
   & CSS .banner-deco/.bd-* di index.html). Disimpan terpisah dari
   GLOBAL_THEME_KEY (warna) & APP_SETTINGS_KEY (font/nama/logo) di key
   sendiri krn ini murni preferensi hiasan, bukan bagian dari sistem
   warna/font. ---- */
const BANNER_DECO_KEY = 'alirin_banner_deco_v1';
const BANNER_DECO_SHAPES = [
  { key: 'circles', label: 'Lingkaran', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="6.5" fill="currentColor" opacity="0.9"/><circle cx="17" cy="17" r="4" fill="currentColor" opacity="0.45"/></svg>' },
  { key: 'wave', label: 'Gelombang', svg: '<svg width="22" height="16" viewBox="0 0 28 18" fill="none"><path d="M1 10c3-6 6-6 9 0s6 6 9 0 6-6 8 0" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>' },
  { key: 'dots', label: 'Titik-titik', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2" opacity="0.5"/><circle cx="5" cy="19" r="2" opacity="0.5"/></svg>' },
  { key: 'blob', label: 'Blob', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c4 0 8 2.4 8 7 0 5-3.5 11-8 11S4 15 4 10c0-4.6 4-7 8-7Z"/></svg>' },
];
const BANNER_DECO_DEFAULTS = { enabled: true, shape: 'circles' };
function loadBannerDeco() {
  try {
    const raw = cloudStorage.getItem(BANNER_DECO_KEY);
    return raw ? { ...BANNER_DECO_DEFAULTS, ...JSON.parse(raw) } : { ...BANNER_DECO_DEFAULTS };
  } catch (e) { return { ...BANNER_DECO_DEFAULTS }; }
}
function saveBannerDeco(state) {
  try { cloudStorage.setItem(BANNER_DECO_KEY, JSON.stringify(state)); }
  catch (e) { showToast('Gagal menyimpan elemen dekoratif banner.', 'err'); }
}
// Terapkan on/off + bentuk ke elemen dekoratif -- dipakai baik utk
// pratinjau sementara di halaman Tema maupun utk render awal saat app
// dimuat. Menimpa DUA kontainer sekaligus dgn state yg sama: #bannerDeco
// (banner asli beranda) & #temaPreviewDeco (kartu "Pratinjau" di
// halaman Tema, lihat markup #temaPreviewCard) supaya keduanya selalu
// sinkron -- termasuk saat popup Tema terbuka & banner beranda sendiri
// sedang tidak terlihat.
function applyBannerDeco(state) {
  const shape = BANNER_DECO_SHAPES.some(s => s.key === state.shape) ? state.shape : BANNER_DECO_DEFAULTS.shape;
  ['bannerDeco', 'temaPreviewDeco'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.shape = shape;
    el.classList.toggle('bd-off', !state.enabled);
  });
}
function renderTemaDecoGrid(state) {
  const grid = document.getElementById('temaDecoGrid');
  if (!grid) return;
  grid.classList.toggle('is-off', !state.enabled);
  grid.innerHTML = BANNER_DECO_SHAPES.map(s => `
    <button type="button" class="tema-font-btn${state.shape === s.key ? ' active' : ''}" data-decoshape="${s.key}" aria-label="Bentuk ${s.label}">
      <span class="tdb-shape-preview">${s.svg}</span>
      <span class="tfb-label">${s.label}</span>
    </button>
  `).join('');
  const switchBtn = document.getElementById('temaDecoSwitch');
  if (switchBtn) {
    switchBtn.classList.toggle('active', state.enabled);
    switchBtn.setAttribute('aria-checked', state.enabled ? 'true' : 'false');
  }
}
/* ==========================================================
   FITUR BARU: "Tampilan Aplikasi" di halaman Tema -- pilih 1 dari 3
   mode (Default/Glass/Gelap), pola storage & render-nya numpang mirip
   GLOBAL_THEME_PRESETS/BANNER_DECO_SHAPES di atas (array preset +
   key tersimpan), TAPI cuma boleh 1 mode aktif dalam satu waktu
   (bukan on/off per-fitur spt BANNER_DECO). Disimpan di key sendiri
   (bukan bagian GLOBAL_THEME_KEY warna atau APP_SETTINGS_KEY font)
   krn ini murni preferensi gaya visual terpisah. Efek visual Glass &
   Gelap SEPENUHNYA diatur lewat CSS class .glass-mode/.dark-mode di
   <html> (lihat :root & aturan html.glass-mode.../html.dark-mode...
   di <style> index.html) -- applyDisplayMode() di sini cuma toggle
   class itu (SALING LEPAS, cuma 1 yg aktif), tidak menyentuh variabel
   CSS secara langsung dari JS supaya 1 sumber kebenaran tetap di
   CSS. ---- */
const DISPLAY_MODE_KEY = 'alirin_display_mode_v1';
const DISPLAY_MODE_PRESETS = [
  { key: 'default', label: 'Default' },
  { key: 'glass', label: 'Glass' },
  { key: 'dark', label: 'Dark' },
];
const DISPLAY_MODE_DEFAULTS = { mode: 'default' };
function loadDisplayMode() {
  try {
    const raw = cloudStorage.getItem(DISPLAY_MODE_KEY);
    return raw ? { ...DISPLAY_MODE_DEFAULTS, ...JSON.parse(raw) } : { ...DISPLAY_MODE_DEFAULTS };
  } catch (e) { return { ...DISPLAY_MODE_DEFAULTS }; }
}
function saveDisplayMode(state) {
  try { cloudStorage.setItem(DISPLAY_MODE_KEY, JSON.stringify(state)); }
  catch (e) { showToast('Gagal menyimpan Tampilan Aplikasi.', 'err'); }
}
function applyDisplayMode(state) {
  const mode = (state && state.mode) || 'default';
  const root = document.documentElement.classList;
  root.toggle('glass-mode', mode === 'glass');
  root.toggle('dark-mode', mode === 'dark');
}
function renderTemaDisplayGrid(state) {
  const grid = document.getElementById('temaDisplayGrid');
  if (!grid) return;
  const checkSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  grid.innerHTML = DISPLAY_MODE_PRESETS.map(d => `
    <button type="button" class="tema-font-btn${state.mode === d.key ? ' active' : ''}" data-displaymode="${d.key}" aria-label="Tampilan ${d.label}">
      <span class="tfb-check">${checkSvg}</span>
      <span class="tdmp tdmp-${d.key}" aria-hidden="true"></span>
      <span class="tfb-label">${d.label}</span>
    </button>
  `).join('');
}
let temaDisplayOriginalState = null;
let temaDisplayPendingState = null;
document.getElementById('temaDisplayGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tema-font-btn');
  if (!btn) return;
  const mode = btn.dataset.displaymode;
  if (!mode || mode === temaDisplayPendingState?.mode) return;
  const state = { mode };
  temaDisplayPendingState = state;
  applyDisplayMode(state);
  renderTemaDisplayGrid(state);
});
/* ==========================================================
   "Bingkai Avatar" di halaman Tema -- 6 pilihan gaya cincin/bingkai
   utk lingkaran avatar/logo premium di banner (elemen .brand-mark-wrap
   .brand-mark, lihat markup #brandMarkWrap & sistem CSS lengkap
   "data-avatar-frame" di index.html). Disimpan terpisah di key
   sendiri (persis pola BANNER_DECO_KEY di atas) krn ini murni
   preferensi hiasan avatar, bukan bagian dari sistem warna/font. ---- */
const AVATAR_FRAME_KEY = 'alirin_avatar_frame_v1';
const AVATAR_FRAME_STYLES = [
  { key: 'classic', label: 'Klasik' },
  { key: 'gold', label: 'Emas Mewah' },
  { key: 'neon', label: 'Neon Berpendar' },
  { key: 'hex', label: 'Segi Enam' },
  { key: 'dashed', label: 'Garis Putus' },
  { key: 'none', label: 'Tanpa Bingkai' },
];
const AVATAR_FRAME_DEFAULTS = { frame: 'classic' };
function loadAvatarFrame() {
  try {
    const raw = cloudStorage.getItem(AVATAR_FRAME_KEY);
    return raw ? { ...AVATAR_FRAME_DEFAULTS, ...JSON.parse(raw) } : { ...AVATAR_FRAME_DEFAULTS };
  } catch (e) { return { ...AVATAR_FRAME_DEFAULTS }; }
}
function saveAvatarFrame(state) {
  try { cloudStorage.setItem(AVATAR_FRAME_KEY, JSON.stringify(state)); }
  catch (e) { showToast('Gagal menyimpan bingkai avatar.', 'err'); }
}
// Terapkan gaya bingkai terpilih ke DUA wrap avatar sekaligus (persis
// pola applyBannerDeco() thd #bannerDeco/#temaPreviewDeco): avatar asli
// di banner beranda (#brandMarkWrap) & avatar pratinjau di kartu
// "Pratinjau" halaman Tema (#temaPreviewAvatarWrap), supaya keduanya
// selalu sinkron termasuk saat popup Tema terbuka & banner beranda
// sendiri sedang tidak terlihat.
function applyAvatarFrame(state) {
  const frame = AVATAR_FRAME_STYLES.some(f => f.key === state.frame) ? state.frame : AVATAR_FRAME_DEFAULTS.frame;
  ['brandMarkWrap', 'temaPreviewAvatarWrap'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.avatarFrame = frame;
  });
}
function renderTemaFrameGrid(state) {
  const grid = document.getElementById('temaFrameGrid');
  if (!grid) return;
  const checkSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  grid.innerHTML = AVATAR_FRAME_STYLES.map(f => `
    <button type="button" class="tema-font-btn${state.frame === f.key ? ' active' : ''}" data-avatarframe="${f.key}" aria-label="Bingkai ${f.label}">
      <span class="tfb-check">${checkSvg}</span>
      <span class="brand-mark-wrap tfb-avatar-mini" data-avatar-frame="${f.key}"><span class="brand-mark"></span></span>
      <span class="tfb-label">${f.label}</span>
    </button>
  `).join('');
}
/* ---- State sementara halaman Tema: dipakai supaya pilihan warna
   cuma PRATINJAU (live preview) dulu selagi popup terbuka -- baru
   benar-benar tersimpan ke storage kalau tombol "Selesai" ditekan.
   temaOriginalState = warna tersimpan sblm popup dibuka (dipakai utk
   kembali kalau tombol "Batal"/tombol kembali/Escape ditekan).
   temaPendingState = pilihan yg sedang dipratinjau saat ini.
   temaFontOriginalKey/temaFontPendingKey = pasangan yg sama tapi utk
   pilihan Gaya Font, temaDecoOriginalState/temaDecoPendingState
   pasangan yg sama lagi utk "Elemen Dekoratif Banner", &
   temaFrameOriginalState/temaFramePendingState pasangan yg sama lagi
   utk "Bingkai Avatar", mengikuti pola identik. ---- */
let temaOriginalState = null;
let temaPendingState = null;
let temaFontOriginalKey = null;
let temaFontPendingKey = null;
let temaDecoOriginalState = null;
let temaDecoPendingState = null;
let temaFrameOriginalState = null;
let temaFramePendingState = null;
function refreshTemaPage() {
  const state = loadGlobalTheme();
  temaOriginalState = state;
  temaPendingState = state;
  renderTemaColorGrid(state);
  const settings = loadAppSettings();
  const fontKey = APP_FONT_PRESETS.some(f => f.key === settings.font) ? settings.font : APP_FONT_PRESETS[0].key;
  temaFontOriginalKey = fontKey;
  temaFontPendingKey = fontKey;
  renderTemaFontGrid(fontKey);
  const decoState = loadBannerDeco();
  temaDecoOriginalState = decoState;
  temaDecoPendingState = decoState;
  renderTemaDecoGrid(decoState);
  applyBannerDeco(decoState);
  const frameState = loadAvatarFrame();
  temaFrameOriginalState = frameState;
  temaFramePendingState = frameState;
  renderTemaFrameGrid(frameState);
  applyAvatarFrame(frameState);
  const displayState = loadDisplayMode();
  temaDisplayOriginalState = displayState;
  temaDisplayPendingState = displayState;
  renderTemaDisplayGrid(displayState);
  const nameEl = document.getElementById('temaPreviewName');
  if (nameEl) {
    nameEl.textContent = (settings.appName || '').trim() || getDefaultAppName();
  }
}
document.getElementById('temaFrameGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tema-font-btn');
  if (!btn) return;
  const frame = btn.dataset.avatarframe;
  if (frame === temaFramePendingState.frame) return;
  const state = { ...temaFramePendingState, frame };
  temaFramePendingState = state;
  applyAvatarFrame(state);
  renderTemaFrameGrid(state);
});
document.getElementById('temaDecoSwitch')?.addEventListener('click', () => {
  const state = { ...temaDecoPendingState, enabled: !temaDecoPendingState.enabled };
  temaDecoPendingState = state;
  applyBannerDeco(state);
  renderTemaDecoGrid(state);
});
document.getElementById('temaDecoGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tema-font-btn');
  if (!btn || !temaDecoPendingState.enabled) return;
  const shape = btn.dataset.decoshape;
  if (shape === temaDecoPendingState.shape) return;
  const state = { ...temaDecoPendingState, shape };
  temaDecoPendingState = state;
  applyBannerDeco(state);
  renderTemaDecoGrid(state);
});
document.getElementById('temaFontGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tema-font-btn');
  if (!btn) return;
  const key = btn.dataset.temafont;
  if (key === temaFontPendingKey) return;
  temaFontPendingKey = key;
  applyFontPreview(key);
  renderTemaFontGrid(key);
});
document.getElementById('temaColorGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tema-color-btn');
  if (!btn || e.target.tagName === 'INPUT') return;
  const mode = btn.dataset.temamode;
  if (mode === 'custom') {
    // ---- Fitur "Warna Sendiri" DIPENDAM sementara (belum dirilis) ----
    // Swatch pelangi tetap tampil sbg preview fitur yg akan datang,
    // tapi belum bisa dipilih/diklik dulu -- cukup kasih tahu lewat
    // toast, TIDAK membuka popup #temaCustomColorModalOverlay ataupun
    // mengubah state warna yg sedang aktif.
    showToast('Fitur warna sendiri belum tersedia saat ini.', 'info');
    return;
  }
  const state = { ...temaPendingState, mode };
  temaPendingState = state;
  applyGlobalTheme(state);
  renderTemaColorGrid(state);
});

/* ==========================================================
   POPUP "WARNA SENDIRI" -- lihat markup #temaCustomColorModalOverlay
   di index.html. Gantikan alur lama (tap swatch pelangi -> langsung
   buka <input type="color"> bawaan browser) dgn popup bergaya sendiri
   yg PUSATNYA kolom ketik kode HEX -- tombol pipet kecil di ujung
   kolom tetap membuka color picker asli OS/browser sbg alternatif
   visual, tapi bukan lagi satu-satunya cara. Sama seperti dulu:
   berubah warna di sini LANGSUNG live-preview ke seluruh app selama
   popup terbuka, baru benar2 tersimpan ke temaPendingState (lalu ke
   storage saat "Selesai" halaman Tema ditekan) kalau tombol "Pakai
   Warna Ini" di popup ini ditekan -- kalau "Batal"/tutup popup,
   warna app dikembalikan lagi ke keadaan SEBELUM popup ini dibuka. */
const temaCustomColorModal = document.getElementById('temaCustomColorModalOverlay');
let temaCustomModalPrevState = null; // state tema (warna) sblm popup custom dibuka -- utk "Batal"

function isValidHex6(hex) {
  return /^[0-9A-Fa-f]{6}$/.test(hex || '');
}
function renderTemaCustomModalPreview(hex) {
  const safeHex = isValidHex6(hex) ? `#${hex.toUpperCase()}` : 'var(--primary)';
  const bigPreview = document.getElementById('temaCustomPreviewBig');
  const headIcon = document.getElementById('temaCustomModalIcon');
  if (bigPreview) bigPreview.style.setProperty('--tcm-color', safeHex);
  if (headIcon) headIcon.style.setProperty('--tcm-color', safeHex);
}
function openTemaCustomColorModal() {
  if (!temaCustomColorModal) return;
  temaCustomModalPrevState = temaPendingState;
  const startColor = (temaPendingState.mode === 'custom' && temaPendingState.custom)
    ? temaPendingState.custom
    : (temaPendingState.custom || GLOBAL_THEME_DEFAULTS.custom);
  const hex6 = startColor.replace('#', '').toUpperCase();
  const hexInput = document.getElementById('temaCustomHexInput');
  const colorInput = document.getElementById('temaCustomColorInput');
  if (hexInput) hexInput.value = hex6;
  if (colorInput) colorInput.value = `#${hex6}`;
  renderTemaCustomModalPreview(hex6);
  openModal(temaCustomColorModal);
  setTimeout(() => hexInput?.focus(), 200);
}
function closeTemaCustomColorModal(revert) {
  if (!temaCustomColorModal) return;
  if (revert && temaCustomModalPrevState) {
    temaPendingState = temaCustomModalPrevState;
    applyGlobalTheme(temaPendingState);
  }
  closeModal(temaCustomColorModal);
}
document.getElementById('temaCustomModalCloseBtn')?.addEventListener('click', () => closeTemaCustomColorModal(true));
document.getElementById('temaCustomModalCancelBtn')?.addEventListener('click', () => closeTemaCustomColorModal(true));
temaCustomColorModal?.addEventListener('click', (e) => { if (e.target === temaCustomColorModal) closeTemaCustomColorModal(true); });
document.getElementById('temaCustomModalApplyBtn')?.addEventListener('click', () => {
  const hexInput = document.getElementById('temaCustomHexInput');
  const hex6 = (hexInput?.value || '').toUpperCase();
  if (!isValidHex6(hex6)) { showToast('Kode HEX harus 6 digit (0-9, A-F).', 'err'); return; }
  const state = { mode: 'custom', custom: `#${hex6}` };
  temaPendingState = state;
  applyGlobalTheme(state);
  renderTemaColorGrid(state);
  closeModal(temaCustomColorModal);
});
// Ketik langsung di kolom HEX -- live-preview begitu sudah 6 digit valid,
// sambil bersihkan karakter di luar 0-9/A-F & batasi 6 digit supaya
// pengguna tetap bisa ngetik bebas (termasuk paste "#F2672B" dgn pagar)
// tanpa error, bukan langsung menolak tiap ketikan yg belum lengkap.
document.getElementById('temaCustomHexInput')?.addEventListener('input', (e) => {
  let v = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6);
  e.target.value = v;
  if (isValidHex6(v)) {
    const colorInput = document.getElementById('temaCustomColorInput');
    if (colorInput) colorInput.value = `#${v}`;
    renderTemaCustomModalPreview(v);
    applyGlobalTheme({ mode: 'custom', custom: `#${v}` });
  }
});
// Pipet (color picker asli OS/browser) -- begitu pengguna pilih warna
// dari situ, kolom HEX & pratinjau ikut disinkronkan otomatis.
document.getElementById('temaCustomColorInput')?.addEventListener('input', (e) => {
  const hex6 = e.target.value.replace('#', '').toUpperCase();
  const hexInput = document.getElementById('temaCustomHexInput');
  if (hexInput) hexInput.value = hex6;
  renderTemaCustomModalPreview(hex6);
  applyGlobalTheme({ mode: 'custom', custom: `#${hex6}` });
});
// Terapkan warna tema tersimpan sesegera mungkin supaya sudah benar
// sejak render pertama (senada dgn applyAppSettings(loadAppSettings())
// di bawah nanti).
applyGlobalTheme(loadGlobalTheme());
applyDisplayMode(loadDisplayMode());
// Sama halnya utk elemen dekoratif banner (on/off + bentuk) -- diterapkan
// sesegera mungkin juga supaya banner tidak sempat "berkedip" tampil lalu
// hilang/berubah bentuk sesaat setelah halaman dimuat.
applyBannerDeco(loadBannerDeco());
// Sama halnya lagi utk bingkai avatar -- diterapkan sesegera mungkin jg
// supaya avatar banner tidak sempat "berkedip" pakai bingkai bawaan lalu
// berubah sesaat setelah halaman dimuat.
applyAvatarFrame(loadAvatarFrame());

function loadAppSettings() {
  try {
    const raw = cloudStorage.getItem(APP_SETTINGS_KEY);
    return raw ? { ...APP_SETTINGS_DEFAULTS, ...JSON.parse(raw) } : { ...APP_SETTINGS_DEFAULTS };
  } catch (e) { return { ...APP_SETTINGS_DEFAULTS }; }
}
function saveAppSettings(settings) {
  try { cloudStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings)); }
  catch (e) { showToast('Gagal menyimpan pengaturan aplikasi.', 'err'); }
}

function applyAppSettings(settings) {
  const name = (settings.appName || '').trim() || getDefaultAppName();
  document.title = `${name} — Kelola Uang Masuk & Keluar`;
  const brandNameEl = document.getElementById('brandNameText');
  if (brandNameEl) brandNameEl.textContent = name;
  const footerNameEl = document.getElementById('footerBrandNameText');
  if (footerNameEl) footerNameEl.textContent = name;
  const footerCopyEl = document.getElementById('footerCopyName');
  if (footerCopyEl) footerCopyEl.textContent = name;
  const miniNameEl = document.getElementById('miniBrandNameText');
  if (miniNameEl) miniNameEl.textContent = name;
  // Popup "Bukti Transaksi" (tab Aktifitas) -- nama brand di kepalanya
  // ikut disinkronkan di sini juga, supaya SELALU sama dengan nama
  // aplikasi yang sedang aktif walau penggunanya menggantinya kapan saja.
  const receiptNameEl = document.getElementById('receiptBrandNameText');
  if (receiptNameEl) receiptNameEl.textContent = name;
  // Header popup PIN/Login Biometrik -- nama brand ikut nama aplikasi
  // yg sedang aktif juga (bukan lagi teks "ZAYAIN" hardcode).
  const pinLockNameEl = document.getElementById('pinLockBrandNameText');
  if (pinLockNameEl) pinLockNameEl.textContent = name;

  const iconPreset = APP_ICON_PRESETS.find(i => i.key === settings.icon) || APP_ICON_PRESETS[0];
  const logoHtml = settings.logo ? `<img src="${settings.logo}" alt="Logo ${escapeHtml(name)}">` : iconPreset.svg;
  const brandMarkEl = document.getElementById('brandMarkIcon');
  if (brandMarkEl) brandMarkEl.innerHTML = logoHtml;
  const footerMarkEl = document.getElementById('footerBrandMarkIcon');
  if (footerMarkEl) footerMarkEl.innerHTML = logoHtml;
  const miniMarkEl = document.getElementById('miniBrandMarkIcon');
  if (miniMarkEl) miniMarkEl.innerHTML = logoHtml;
  const receiptMarkEl = document.getElementById('receiptBrandMarkIcon');
  if (receiptMarkEl) receiptMarkEl.innerHTML = logoHtml;
  // ---- Ikon di header popup PIN/Login Biometrik ikut disamakan dgn
  // ikon/logo resmi aplikasi (bukan lagi ikon buku-kas hardcode) --
  // otomatis ikut berubah kalau user ganti Ikon Bawaan atau unggah
  // Logo Aplikasi sendiri lewat Pengaturan Aplikasi.
  const pinLockMarkEl = document.getElementById('pinLockBrandMarkIcon');
  if (pinLockMarkEl) pinLockMarkEl.innerHTML = logoHtml;

  // ---- Avatar kartu profil "Manajemen Device" (#deviceMgmtAvatar) ----
  // App ini belum punya field "foto profil" pribadi yg terpisah -- yg
  // paling dekat maknanya adalah Logo di halaman Data Diri (settings.logo,
  // field yg SAMA dgn dipakai brand mark banner/footer/PIN di atas). Jadi
  // begitu user mengganti Logo itu, avatar di kartu profil Manajemen
  // Device ikut berubah otomatis (SAMA persis logoHtml yg dipakai brand
  // mark lain, cuma alt text-nya dibedakan jadi "Foto profil").
  // Kalau user BELUM PERNAH mengganti Logo (settings.logo kosong), SENGAJA
  // tetap pakai ikon orang generik bawaan (markup asli #deviceMgmtAvatar
  // di index.html) -- BUKAN ikut fallback iconPreset.svg spt brand mark
  // lain di atas, krn ikon itu identitas APLIKASI, beda konteks dgn avatar
  // profil user di sini.
  const deviceMgmtAvatarEl = document.getElementById('deviceMgmtAvatar');
  if (deviceMgmtAvatarEl && settings.logo) {
    deviceMgmtAvatarEl.innerHTML = `<img src="${settings.logo}" alt="Foto profil">`;
  } else if (deviceMgmtAvatarEl && !settings.logo) {
    // Logo baru saja dihapus (mis. tombol "Hapus" di Data Diri) -- balikkan
    // avatar ke ikon orang generik bawaan, jangan biarkan gambar lama nyangkut.
    deviceMgmtAvatarEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.4"/><path d="M5 19.2c.9-3.4 3.6-5.1 7-5.1s6.1 1.7 7 5.1"/></svg>';
  }

  /* --forest-glow SENGAJA TIDAK lagi di-set di sini -- sumbernya kini
     TUNGGAL dari applyGlobalTheme() (halaman Tema), supaya "Warna
     Aksen" beneran berlaku ke SELURUH aplikasi (termasuk elemen2 yg
     pakai --forest-glow), bukan cuma --primary/--banner-orange. Lihat
     catatan lengkap di fungsi applyGlobalTheme(). */

  const fontPreset = APP_FONT_PRESETS.find(f => f.key === settings.font) || APP_FONT_PRESETS[0];
  document.documentElement.style.setProperty('--font-body', fontPreset.body);
  document.documentElement.style.setProperty('--font-display', fontPreset.display);

  document.body.dataset.bannerAnim = APP_BANNER_ANIM_PRESETS.some(a => a.key === settings.bannerAnim) ? settings.bannerAnim : 'wave';

  document.body.classList.toggle('density-compact', settings.density === 'compact');

  // ---- SEO: favicon, meta description, kata kunci, Open Graph & Twitter Card ----
  // Prioritas favicon: favicon kustom > logo aplikasi > ikon bawaan yang
  // digambar ulang sebagai gambar SVG (kotak membulat berwarna aksen +
  // ikon putih), supaya tab browser & hasil pencarian tetap tampil rapi
  // walau pengguna belum pernah mengunggah favicon sendiri.
  const faviconHref = settings.favicon || settings.logo || buildDefaultFaviconDataUrl(iconPreset.svg, preset.color);
  const faviconLink = document.getElementById('appFaviconLink');
  if (faviconLink) faviconLink.setAttribute('href', faviconHref);
  const touchIconLink = document.getElementById('appTouchIconLink');
  if (touchIconLink) touchIconLink.setAttribute('href', faviconHref);

  const defaultDesc = `Kelola uang masuk dan keluar, catat transaksi, tagihan, dan hutang dengan mudah bersama ${name}.`;
  const description = (settings.metaDescription || '').trim() || defaultDesc;
  const descTag = document.getElementById('appMetaDescription');
  if (descTag) descTag.setAttribute('content', description);
  const ogDescTag = document.getElementById('appOgDescription');
  if (ogDescTag) ogDescTag.setAttribute('content', description);
  const twDescTag = document.getElementById('appTwitterDescription');
  if (twDescTag) twDescTag.setAttribute('content', description);

  const keywordsTag = document.getElementById('appMetaKeywords');
  if (keywordsTag) keywordsTag.setAttribute('content', (settings.metaKeywords || '').trim());

  const ogTitleTag = document.getElementById('appOgTitle');
  if (ogTitleTag) ogTitleTag.setAttribute('content', `${name} — Kelola Uang Masuk & Keluar`);
  const twTitleTag = document.getElementById('appTwitterTitle');
  if (twTitleTag) twTitleTag.setAttribute('content', `${name} — Kelola Uang Masuk & Keluar`);
  const ogImageTag = document.getElementById('appOgImage');
  if (ogImageTag) ogImageTag.setAttribute('content', settings.logo || faviconHref);

  const canonicalLink = document.getElementById('appCanonicalLink');
  if (canonicalLink) {
    try { canonicalLink.setAttribute('href', window.location.href.split('#')[0]); } catch (e) {}
  }
}

// Membuat favicon default (data URI SVG) dari salah satu Ikon Bawaan +
// warna aksen yang sedang aktif, dipakai selama pengguna belum mengunggah
// favicon kustomnya sendiri. Hasilnya kotak membulat berwarna aksen dengan
// goresan ikon putih di atasnya, senada dengan tampilan brand-mark di banner.
function buildDefaultFaviconDataUrl(iconSvgString, accentColor) {
  try {
    const temp = document.createElement('div');
    temp.innerHTML = iconSvgString;
    const svgEl = temp.querySelector('svg');
    const inner = svgEl ? svgEl.innerHTML : '';
    const composite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64">` +
      `<rect width="24" height="24" rx="6.5" fill="${accentColor}"/>` +
      `<g stroke="#ffffff" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${inner}</g>` +
      `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(composite)}`;
  } catch (e) {
    return '';
  }
}

function renderAsThemeRow(selectedTheme) {
  const wrap = document.getElementById('asThemeRow');
  if (!wrap) return;
  wrap.innerHTML = APP_THEME_PRESETS.map(p => `
    <button type="button" class="as-theme-swatch${p.key === selectedTheme ? ' active' : ''}" data-astheme="${p.key}" style="background:${p.color}" title="${p.label}" aria-label="Warna aksen ${p.label}">
      ${p.key === selectedTheme ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
    </button>
  `).join('');
}

function renderAsIconRow(selectedIcon) {
  const wrap = document.getElementById('asIconRow');
  if (!wrap) return;
  wrap.innerHTML = APP_ICON_PRESETS.map(i => `
    <button type="button" class="as-icon-swatch${i.key === selectedIcon ? ' active' : ''}" data-asicon="${i.key}" title="${i.label}" aria-label="Ikon ${i.label}">
      ${i.svg}
    </button>
  `).join('');
}

function renderAsFontRow(selectedFont) {
  const wrap = document.getElementById('asFontRow');
  if (!wrap) return;
  wrap.innerHTML = APP_FONT_PRESETS.map(f => `
    <button type="button" class="as-font-swatch${f.key === selectedFont ? ' active' : ''}" data-asfont="${f.key}" title="${f.label}" aria-label="Font ${f.label}">
      <span class="afs-preview" style="font-family:${f.display}">Aa</span>
      <span class="afs-label">${f.label}</span>
    </button>
  `).join('');
}

function renderAsAnimRow(selectedAnim) {
  const wrap = document.getElementById('asAnimRow');
  if (!wrap) return;
  wrap.innerHTML = APP_BANNER_ANIM_PRESETS.map(a => `
    <button type="button" class="as-anim-swatch${a.key === selectedAnim ? ' active' : ''}" data-asanim="${a.key}" aria-label="Animasi banner ${a.label}">
      ${a.svg}<span>${a.label}</span>
    </button>
  `).join('');
}

let asLogoData = null;
let asFaviconData = null;
let asSelectedIcon = 'pulse';
let asSelectedTheme = 'blue';
let asSelectedFont = 'modern';
let asSelectedAnim = 'wave';
let asSelectedDensity = 'comfortable';

function setAsLogoPreview(dataUrl) {
  asLogoData = dataUrl || null;
  const preview = document.getElementById('asLogoPreview');
  const removeBtn = document.getElementById('btnRemoveAsLogo');
  if (!preview) return;
  const iconPreset = APP_ICON_PRESETS.find(i => i.key === asSelectedIcon) || APP_ICON_PRESETS[0];
  preview.innerHTML = asLogoData ? `<img src="${asLogoData}" alt="Pratinjau logo aplikasi">` : iconPreset.svg;
  if (removeBtn) removeBtn.style.display = asLogoData ? 'inline-flex' : 'none';
}

function handleAsLogoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran logo maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setAsLogoPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca logo.', 'err');
  reader.readAsDataURL(file);
}

// ---- Favicon (ikon tab browser & yang tampil di hasil pencarian Google) ----
function setAsFaviconPreview(dataUrl) {
  asFaviconData = dataUrl || null;
  const preview = document.getElementById('asFaviconPreview');
  const removeBtn = document.getElementById('btnRemoveAsFavicon');
  if (!preview) return;
  preview.innerHTML = asFaviconData
    ? `<img src="${asFaviconData}" alt="Pratinjau favicon aplikasi">`
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>';
  if (removeBtn) removeBtn.style.display = asFaviconData ? 'inline-flex' : 'none';
}

function handleAsFaviconFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 1 * 1024 * 1024) { showToast('Ukuran favicon maksimal 1MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setAsFaviconPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca favicon.', 'err');
  reader.readAsDataURL(file);
}

// Menampilkan sisa/jumlah karakter deskripsi meta secara langsung saat
// diketik, plus peringatan warna kalau makin mendekati/melewati batas
// ideal yang direkomendasikan Google (~160 karakter) agar tidak terpotong
// di hasil pencarian.
function updateAsMetaDescCount() {
  const textarea = document.getElementById('asMetaDescription');
  const counter = document.getElementById('asMetaDescCount');
  if (!textarea || !counter) return;
  const len = textarea.value.length;
  counter.textContent = `${len}/${APP_META_DESC_MAXLEN}`;
  counter.classList.toggle('warn', len >= APP_META_DESC_MAXLEN - 20 && len < APP_META_DESC_MAXLEN);
  counter.classList.toggle('over', len >= APP_META_DESC_MAXLEN);
}

function setAsSelectedTheme(theme) {
  asSelectedTheme = theme;
  renderAsThemeRow(theme);
}
function setAsSelectedIcon(icon) {
  asSelectedIcon = icon;
  renderAsIconRow(icon);
  // Perbarui pratinjau logo juga, kecuali sedang ada logo gambar aktif.
  if (!asLogoData) setAsLogoPreview(null);
}
function setAsSelectedFont(font) {
  asSelectedFont = font;
  renderAsFontRow(font);
}
function setAsSelectedAnim(anim) {
  asSelectedAnim = anim;
  renderAsAnimRow(anim);
}
function setAsSelectedDensity(density) {
  asSelectedDensity = density;
  document.querySelectorAll('#asDensityToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.density === density);
  });
}

const appSettingsModal = document.getElementById('appSettingsModalOverlay');

function openAppSettingsModal() {
  const settings = loadAppSettings();
  document.getElementById('asAppName').value = settings.appName || getDefaultAppName();
  document.getElementById('asLanguage').value = settings.language === 'en' ? 'en' : 'id';
  document.getElementById('asLogoInput').value = '';
  document.getElementById('asFaviconInput').value = '';
  document.getElementById('asMetaDescription').value = settings.metaDescription || '';
  document.getElementById('asMetaKeywords').value = settings.metaKeywords || '';
  setAsSelectedIcon(settings.icon);
  setAsLogoPreview(settings.logo);
  setAsFaviconPreview(settings.favicon);
  setAsSelectedTheme(settings.theme);
  setAsSelectedFont(settings.font);
  setAsSelectedAnim(settings.bannerAnim);
  setAsSelectedDensity(settings.density);
  updateAsMetaDescCount();
  openModal(appSettingsModal);
}

document.getElementById('brandBtn').addEventListener('click', openAppSettingsModal);
document.getElementById('brandBtn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAppSettingsModal(); }
});
// Versi mini topbar dari tombol brand di atas — aksinya sama persis
// (buka modal Pengaturan Aplikasi), cuma elemennya beda karena mini
// topbar posisinya fixed terpisah dari banner besar.
document.getElementById('miniBrandBtn').addEventListener('click', openAppSettingsModal);
document.getElementById('miniBrandBtn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAppSettingsModal(); }
});

document.getElementById('asLogoInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleAsLogoFile(file);
});
document.getElementById('btnRemoveAsLogo').addEventListener('click', () => {
  setAsLogoPreview(null);
  document.getElementById('asLogoInput').value = '';
});
const asLogoDrop = document.getElementById('asLogoDrop');
if (asLogoDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    asLogoDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); asLogoDrop.classList.add('is-dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    asLogoDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); asLogoDrop.classList.remove('is-dragover'); });
  });
  asLogoDrop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    asLogoDrop.classList.remove('is-dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleAsLogoFile(file);
  });
}

document.getElementById('asFaviconInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleAsFaviconFile(file);
});
document.getElementById('btnRemoveAsFavicon').addEventListener('click', () => {
  setAsFaviconPreview(null);
  document.getElementById('asFaviconInput').value = '';
});
const asFaviconDrop = document.getElementById('asFaviconDrop');
if (asFaviconDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    asFaviconDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); asFaviconDrop.classList.add('is-dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    asFaviconDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); asFaviconDrop.classList.remove('is-dragover'); });
  });
  asFaviconDrop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    asFaviconDrop.classList.remove('is-dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleAsFaviconFile(file);
  });
}
document.getElementById('asMetaDescription').addEventListener('input', updateAsMetaDescCount);

document.getElementById('asAccentLinkoutBtn')?.addEventListener('click', () => {
  // "Buka Tema": tutup modal Pengaturan Aplikasi ini, lalu buka
  // halaman Tema -- sekarang satu2nya tempat mengganti warna aksen,
  // menggantikan picker .as-theme-row lama yg efeknya dulu cuma
  // sebagian & bisa saling menimpa dgn halaman Tema (lihat catatan di
  // applyGlobalTheme() & HTML section "Warna Aksen").
  closeModal(appSettingsModal);
  openTemaOverlay();
});
document.getElementById('asIconRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-asicon]');
  if (btn) setAsSelectedIcon(btn.dataset.asicon);
});
document.getElementById('asFontRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-asfont]');
  if (btn) setAsSelectedFont(btn.dataset.asfont);
});
document.getElementById('asAnimRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-asanim]');
  if (btn) setAsSelectedAnim(btn.dataset.asanim);
});
document.getElementById('asDensityToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-density]');
  if (btn) setAsSelectedDensity(btn.dataset.density);
});
// Bahasa selain Indonesia belum tersedia — dipilih tetap tersimpan
// sebagai preferensi, tapi diinfokan jujur ke pengguna bahwa
// terjemahannya masih dalam pengembangan, bukan pura-pura berfungsi.
document.getElementById('asLanguage').addEventListener('change', (e) => {
  if (e.target.value !== 'id') {
    showToast('Bahasa Inggris masih dalam pengembangan. Untuk sekarang tetap pakai Bahasa Indonesia.', 'err');
    e.target.value = 'id';
  }
});

document.getElementById('appSettingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const settings = {
    appName: document.getElementById('asAppName').value.trim() || getDefaultAppName(),
    logo: asLogoData,
    icon: asSelectedIcon,
    theme: asSelectedTheme,
    font: asSelectedFont,
    bannerAnim: asSelectedAnim,
    density: asSelectedDensity,
    language: 'id',
    favicon: asFaviconData,
    metaDescription: document.getElementById('asMetaDescription').value.trim(),
    metaKeywords: document.getElementById('asMetaKeywords').value.trim(),
  };
  saveAppSettings(settings);
  applyAppSettings(settings);
  closeModal(appSettingsModal);
  showToast('Pengaturan aplikasi disimpan.');
});
document.getElementById('btnAsReset').addEventListener('click', () => {
  saveAppSettings({ ...APP_SETTINGS_DEFAULTS });
  applyAppSettings({ ...APP_SETTINGS_DEFAULTS });
  document.getElementById('asAppName').value = getDefaultAppName();
  document.getElementById('asLanguage').value = 'id';
  document.getElementById('asLogoInput').value = '';
  document.getElementById('asFaviconInput').value = '';
  document.getElementById('asMetaDescription').value = '';
  document.getElementById('asMetaKeywords').value = '';
  setAsSelectedIcon(APP_SETTINGS_DEFAULTS.icon);
  setAsLogoPreview(null);
  setAsFaviconPreview(null);
  setAsSelectedTheme(APP_SETTINGS_DEFAULTS.theme);
  setAsSelectedFont(APP_SETTINGS_DEFAULTS.font);
  setAsSelectedAnim(APP_SETTINGS_DEFAULTS.bannerAnim);
  setAsSelectedDensity(APP_SETTINGS_DEFAULTS.density);
  updateAsMetaDescCount();
  showToast('Pengaturan aplikasi dikembalikan ke default.');
});
document.getElementById('asModalCloseBtn').addEventListener('click', () => closeModal(appSettingsModal));
document.getElementById('btnAsCancel').addEventListener('click', () => closeModal(appSettingsModal));
appSettingsModal.addEventListener('click', (e) => { if (e.target === appSettingsModal) closeModal(appSettingsModal); });

/* ==========================================================
   ZONA BERBAHAYA — Reset Database Online (Pengaturan Aplikasi)
   Menghapus semua data user di tabel kv_store (Supabase) +
   localStorage perangkat ini lewat window.cloudResetDatabase()
   yang disediakan cloud-sync.js.

   Konfirmasi SENGAJA pakai confirm()/prompt() bawaan browser
   (bukan modal custom) supaya tetap bisa dipakai dengan benar di
   HP -- modal custom dengan input teks berisiko ketutup keyboard
   virtual di layar kecil sehingga tombol konfirmasinya tidak
   kelihatan/tidak bisa ditekan. Dialog bawaan browser selalu
   digambar di atas keyboard oleh OS, jadi jauh lebih aman lintas
   perangkat untuk aksi sepenting ini. */
/* Reset khusus data Tagihan & Hutang saja -- lebih ringan dari reset
   database penuh di bawah, karena hanya menghapus dua key ini
   (STORAGE_KEY_BILLS & STORAGE_KEY_DEBTS) via persistBills/persistDebts
   (yang otomatis ikut mendorong ke cloud lewat cloudStorage), lalu
   me-render ulang panel notifikasi & halaman "semua tagihan/hutang"
   -- data lain (transaksi, target, dompet, dsb) sama sekali tidak
   tersentuh. */
document.getElementById('btnResetBillsDebts').addEventListener('click', () => {
  const ok = confirm(
    'Ini akan menghapus SEMUA data Tagihan & Hutang (bukan data lain seperti transaksi/target/dompet) secara PERMANEN dari database cloud dan perangkat ini. Data yang sama akan ikut hilang di semua perangkat lain yang login dengan akun ini.\n\nLanjutkan?'
  );
  if (!ok) return;

  bills = [];
  debts = [];
  persistBills();
  persistDebts();
  renderNotifPanel();
  renderBdAllPage();

  showToast('Semua data tagihan & hutang berhasil dihapus.');
});

document.getElementById('btnResetCloudDb').addEventListener('click', async () => {
  if (typeof window.cloudResetDatabase !== 'function') {
    showToast('Fitur sinkron cloud tidak tersedia di halaman ini.', 'err');
    return;
  }
  if (!requireCloudLogin('Masuk untuk mereset database cloud.')) return;

  const step1 = confirm(
    'PERINGATAN\n\nIni akan menghapus SEMUA data (transaksi, target, dompet, tagihan, hutang, sumber pendapatan, dsb) secara PERMANEN dari database cloud dan perangkat ini. Data yang sama juga akan hilang di semua perangkat lain yang login dengan akun ini.\n\nLanjutkan?'
  );
  if (!step1) return;

  const typed = prompt('Ketik RESET lalu tekan OK untuk konfirmasi terakhir:');
  if (typed === null) { showToast('Reset dibatalkan.', 'err'); return; }
  if (typed.trim().toUpperCase() !== 'RESET') {
    showToast('Ketikan tidak cocok, reset dibatalkan.', 'err');
    return;
  }

  const btn = document.getElementById('btnResetCloudDb');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  showToast('Menghapus database, mohon tunggu...');

  const result = await window.cloudResetDatabase();
  if (result && result.ok) {
    showToast('Database berhasil direset. Memuat ulang halaman...');
    setTimeout(() => location.reload(), 900);
  } else {
    btn.disabled = false;
    btn.textContent = originalLabel;
    const msg = result && result.reason === 'not_logged_in'
      ? 'Kamu belum login ke akun cloud.'
      : 'Gagal reset database: ' + ((result && result.error && result.error.message) || 'Coba lagi atau cek koneksi internet.');
    showToast(msg, 'err');
  }
});

// Terapkan pengaturan tersimpan sesegera mungkin (sebelum init() lain
// jalan) supaya nama/logo/warna aksen sudah benar sejak render pertama.
applyAppSettings(loadAppSettings());

/* ==========================================================
   MODAL KONFIRMASI HAPUS
========================================================== */
const confirmModal = document.getElementById('confirmOverlay');
let deletingKind = 'tx'; // 'tx' | 'tagihan' | 'hutang'

/* Teks default per jenis data -- supaya modal konfirmasi hapus tidak
   selalu bilang "Hapus transaksi ini?" walau yang dihapus sebenarnya
   perangkat/akun/sumber pendapatan, dll. */
const DELETE_CONFIRM_TEXT = {
  tx: { title: 'Hapus transaksi ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  tagihan: { title: 'Hapus tagihan ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  hutang: { title: 'Hapus catatan hutang ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  device: { title: 'Hapus perangkat ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  wallet: { title: 'Hapus akun bank/e-wallet ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  income: { title: 'Hapus catatan pendapatan ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
  useraccount: { title: 'Hapus user ini?', desc: 'Tindakan ini tidak bisa dibatalkan.' },
};

function openDeleteConfirm(id, kind) {
  deletingId = id;
  deletingKind = kind || 'tx';
  const titleEl = document.querySelector('#confirmOverlay h3');
  const descEl = document.querySelector('#confirmOverlay p');
  if (deletingKind === 'customsource') {
    const src = customIncomeSources.find(c => c.id === id);
    const tiedCount = src ? incomeSources.filter(x => x.source === src.name).length : 0;
    titleEl.textContent = `Hapus sumber "${src ? src.name : ''}"?`;
    descEl.textContent = tiedCount > 0
      ? `${tiedCount} catatan pendapatan yang memakai sumber ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.`
      : 'Tindakan ini tidak bisa dibatalkan.';
  } else if (deletingKind === 'platform') {
    const plat = getCustomPlatformsForSource(deletingPlatformSource).find(p => p.id === id);
    const tiedCount = plat ? incomeSources.filter(x => x.source === deletingPlatformSource && x.platform === plat.name).length : 0;
    titleEl.textContent = `Hapus platform "${plat ? plat.name : ''}"?`;
    descEl.textContent = tiedCount > 0
      ? `${tiedCount} catatan pendapatan yang memakai platform ini akan ditandai "Umum" (catatannya tetap tersimpan). Tindakan ini tidak bisa dibatalkan.`
      : 'Tindakan ini tidak bisa dibatalkan.';
  } else {
    const t = DELETE_CONFIRM_TEXT[deletingKind] || DELETE_CONFIRM_TEXT.tx;
    titleEl.textContent = t.title;
    descEl.textContent = t.desc;
  }
  openModal(confirmModal);
}
document.getElementById('btnCancelDelete').addEventListener('click', () => { deletingId = null; closeModal(confirmModal); });
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeModal(confirmModal); });
document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (deletingId) {
    if (deletingKind === 'tagihan') {
      bills = bills.filter(b => b.id !== deletingId);
      persistBills();
      showToast('Tagihan dihapus.');
      renderNotifPanel();
      renderBdAllPage();
    } else if (deletingKind === 'hutang') {
      debts = debts.filter(d => d.id !== deletingId);
      persistDebts();
      showToast('Hutang dihapus.');
      renderNotifPanel();
      renderBdAllPage();
    } else if (deletingKind === 'device') {
      devices = devices.filter(d => d.id !== deletingId);
      persistDevices();
      showToast('Perangkat dihapus.');
      renderDevices();
    } else if (deletingKind === 'wallet') {
      wallets = wallets.filter(w => w.id !== deletingId);
      persistWallets();
      showToast('Akun bank/e-wallet dihapus.');
      renderSummary();
    } else if (deletingKind === 'income') {
      incomeSources = incomeSources.filter(x => x.id !== deletingId);
      persistIncomeSources();
      showToast('Pendapatan dihapus.');
      renderSummary();
      refreshIncomeSourcePage();
    } else if (deletingKind === 'pfdplatform') {
      const before = incomeSources.length;
      incomeSources = incomeSources.filter(x => !(
        x.source === deletingPfdSource &&
        (x.platform || '') === deletingPfdPlatform &&
        x.date && x.date.slice(0, 7) === thisMonthStr()
      ));
      const removed = before - incomeSources.length;
      if (removed > 0) persistIncomeSources();
      showToast(removed > 0 ? `${removed} catatan pendapatan dihapus.` : 'Tidak ada catatan untuk dihapus.');
      renderSummary();
      refreshIncomeSourcePage();
      if (currentPfdSource) openPlatformDetailModal(currentPfdSource); // refresh daftar baris di modal
      deletingPfdSource = '';
      deletingPfdPlatform = '';
    } else if (deletingKind === 'customsource') {
      const src = customIncomeSources.find(c => c.id === deletingId);
      customIncomeSources = customIncomeSources.filter(c => c.id !== deletingId);
      persistCustomIncomeSources();
      let tiedRemoved = 0;
      if (src) {
        const before = incomeSources.length;
        incomeSources = incomeSources.filter(x => x.source !== src.name);
        tiedRemoved = before - incomeSources.length;
        if (tiedRemoved > 0) persistIncomeSources();
      }
      showToast(tiedRemoved > 0
        ? `Sumber manual & ${tiedRemoved} catatan terkait dihapus.`
        : 'Sumber manual dihapus.');
      populateIncomeSourceSelect();
      if (document.getElementById('customSourceManageList')) renderCustomSourceManageList();
      renderSummary();
    } else if (deletingKind === 'useraccount') {
      const res = await window.cloudDeleteMember(deletingId);
      if (res && res.ok) {
        showToast('User dihapus. Akun login-nya sendiri tetap ada, tapi sudah tidak melihat data ini lagi.');
      } else {
        showToast('Gagal menghapus user.', 'err');
      }
      renderUserAccountList();
    } else if (deletingKind === 'platform') {
      const list = getCustomPlatformsForSource(deletingPlatformSource);
      const plat = list.find(p => p.id === deletingId);
      if (customIncomePlatforms[deletingPlatformSource]) {
        customIncomePlatforms[deletingPlatformSource] = customIncomePlatforms[deletingPlatformSource].filter(p => p.id !== deletingId);
        persistCustomIncomePlatforms();
      }
      let untagged = 0;
      if (plat) {
        incomeSources.forEach(x => {
          if (x.source === deletingPlatformSource && x.platform === plat.name) { x.platform = ''; untagged++; }
        });
        if (untagged > 0) persistIncomeSources();
      }
      showToast(untagged > 0
        ? `Platform dihapus, ${untagged} catatan ditandai "Umum".`
        : 'Platform dihapus.');
      if (document.getElementById('incomeSource').value === deletingPlatformSource) {
        populateIncomePlatformSelect(deletingPlatformSource);
      }
      renderSummary();
      refreshIncomeSourcePage();
    } else {
      transactions = transactions.filter(t => t.id !== deletingId);
      persist();
      showToast('Transaksi dihapus.');
      refreshAll();
      refreshDetailPage();
    }
  }
  deletingId = null;
  deletingKind = 'tx';
  closeModal(confirmModal);
});

/* ==========================================================
   DELEGASI EVENT UNTUK TOMBOL EDIT/HAPUS DI TABEL
========================================================== */
document.getElementById('txBody')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-edit]');
  const delBtn = e.target.closest('[data-del]');
  if (editBtn) { openEditModal(editBtn.dataset.edit); return; }
  if (delBtn) { openDeleteConfirm(delBtn.dataset.del); return; }
  // Tap di area kartu selain tombol edit/hapus -> buka popup "Bukti
  // Transaksi" (ala struk) untuk transaksi tsb.
  const row = e.target.closest('[data-tx-id]');
  if (row) openTxReceipt(row.dataset.txId);
});

/* ==========================================================
   KLIK KARTU RINGKASAN → BUKA HALAMAN MASING-MASING
========================================================== */
document.getElementById('summaryGrid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-page]');
  if (!card) return;
  if (card.dataset.page === 'incomeSources') { openIncomeSourcePage(); return; }
  openDetailPage(card.dataset.page);
});
document.getElementById('summaryGrid').addEventListener('keydown', (e) => {
  const card = e.target.closest('[data-page]');
  if (!card) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (card.dataset.page === 'incomeSources') { openIncomeSourcePage(); return; }
    openDetailPage(card.dataset.page);
  }
});
document.getElementById('detailBackBtn').addEventListener('click', closeDetailPage);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (txModal.classList.contains('open') || confirmModal.classList.contains('open') || billModal.classList.contains('open')) return;
  if (txReceiptOverlay.classList.contains('open')) {
    closeTxReceipt();
    return;
  }
  if (document.getElementById('lapFilterOverlay').classList.contains('open')) {
    closeLapFilterOverlay();
    return;
  }
  if (document.getElementById('temaOverlay').classList.contains('open')) {
    closeTemaOverlay();
    return;
  }
  if (document.getElementById('dataDiriOverlay').classList.contains('open')) {
    closeDataDiriOverlay();
    return;
  }
  if (document.getElementById('leaderboardOverlay').classList.contains('open')) {
    closeLeaderboardPage();
    return;
  }
  if (document.getElementById('widgetSettingsOverlay').classList.contains('open')) {
    closeWidgetSettingsPage();
    return;
  }
  if (document.getElementById('incomeSourceOverlay') && document.getElementById('incomeSourceOverlay').classList.contains('open')) {
    closeIncomeSourcePage();
    return;
  }
  if (document.getElementById('bdAllOverlay').classList.contains('open')) {
    closeBdAllPage();
    return;
  }
  if (document.getElementById('detailPageOverlay').classList.contains('open')) {
    closeDetailPage();
  }
});

/* Tambah/Edit/Hapus transaksi langsung dari halaman detail */
document.getElementById('detailAddBtn').addEventListener('click', () => {
  if (!detailPageContext) return;
  openAddModal(SUMMARY_PAGES[detailPageContext].type);
});
document.getElementById('detailPageBody').addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-edit]');
  const delBtn = e.target.closest('[data-del]');
  if (editBtn) openEditModal(editBtn.dataset.edit);
  if (delBtn) openDeleteConfirm(delBtn.dataset.del);
});

/* Target/goal per halaman detail */
document.getElementById('detailTargetEditBtn').addEventListener('click', () => {
  const form = document.getElementById('detailTargetForm');
  const input = document.getElementById('detailTargetInput');
  const isOpen = form.style.display !== 'none';
  if (isOpen) {
    form.style.display = 'none';
    return;
  }
  input.value = (detailPageContext && pageTargets[detailPageContext]) ? pageTargets[detailPageContext] : '';
  form.style.display = 'flex';
  input.focus();
});
document.getElementById('detailTargetCancelBtn').addEventListener('click', () => {
  document.getElementById('detailTargetForm').style.display = 'none';
});
document.getElementById('detailTargetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!detailPageContext) return;
  const val = parseFloat(document.getElementById('detailTargetInput').value);
  if (!val || val <= 0) { showToast('Masukkan jumlah target yang valid.', 'err'); return; }
  pageTargets[detailPageContext] = val;
  persistPageTargets();
  document.getElementById('detailTargetForm').style.display = 'none';
  showToast('Target berhasil disimpan.');
  refreshDetailPage();
  renderSaldoTargets(calcTotals());
});

/* ==========================================================
   TABS & FILTER LISTENERS
========================================================== */
/* ---- Animasi kotak putih yang "meluncur" (slide) ke pil tab yang
   sedang aktif setiap kali salah satu pil (Semua/Tagihan/Hutang/
   Catatan, atau Semua/Mingguan/Bulanan/Tahunan) diklik. Dipakai umum
   untuk SEMUA wadah ".tabs" di halaman ini (id="tabs" & id="bdAllTabs")
   -- cukup dikasih elemen container-nya, fungsi ini otomatis mencari
   ".tab-indicator" & ".tab-btn.active" di dalamnya lalu memposisikan
   ulang lewat transform/width (dianimasikan pakai transisi CSS di
   index.html, bukan lewat JS, supaya tetap mulus 60fps). ---- */
function updateTabIndicator(container) {
  if (!container) return;
  const indicator = container.querySelector('.tab-indicator');
  const active = container.querySelector('.tab-btn.active');
  if (!indicator || !active) return;
  // Elemen tersembunyi (mis. halaman Tagihan & Hutang belum dibuka)
  // punya offsetWidth 0 -- lewati dulu, nanti diukur ulang saat
  // halamannya benar-benar tampil (lihat pemanggilan di openBdAllPage).
  if (active.offsetWidth === 0) return;
  const cRect = container.getBoundingClientRect();
  const aRect = active.getBoundingClientRect();
  indicator.style.width = aRect.width + 'px';
  indicator.style.transform = `translateX(${aRect.left - cRect.left}px)`;
  container.classList.add('tab-indicator-ready');
}
function updateAllTabIndicators() {
  document.querySelectorAll('.tabs').forEach(updateTabIndicator);
}
// Reposisi ulang tiap window di-resize (mis. rotasi HP / lebar berubah)
// -- didebounce ringan lewat requestAnimationFrame supaya tidak
// dipanggil berlebihan saat resize sedang berlangsung.
let _tabIndicatorRaf = null;
window.addEventListener('resize', () => {
  if (_tabIndicatorRaf) cancelAnimationFrame(_tabIndicatorRaf);
  _tabIndicatorRaf = requestAnimationFrame(updateAllTabIndicators);
});

document.getElementById('tabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tabsContainer = document.getElementById('tabs');
  tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateTabIndicator(tabsContainer);
  activeTab = btn.dataset.tab;
  // Tampilkan kotak "Pilih Bulan"/"Pilih Tanggal" hanya saat radio yg
  // sesuai sedang aktif -- radio lain (Hari ini/7 Hari Terakhir) tidak
  // butuh input tambahan jadi kedua kotak ini disembunyikan lagi.
  const monthWrap = document.getElementById('lapMonthPickerWrap');
  const dateWrap = document.getElementById('lapDatePickerWrap');
  if (monthWrap) monthWrap.hidden = activeTab !== 'bulan';
  if (dateWrap) dateWrap.hidden = activeTab !== 'tanggal';
  if (activeTab === 'bulan' && !lapFilterMonth) {
    lapFilterMonth = thisMonthStr();
    updateLapMonthFieldLabel();
  }
  resetHistoryPagination();
  renderRangePicker();
  renderTransactionList();
});

/* ==========================================================
   BOTTOM SHEET "PILIH BULAN" -- wheel picker Bulan/Tahun
   Menggantikan <input type="month"> bawaan browser dgn kartu kustom
   gaya iOS-picker (2 kolom scroll-snap: nama bulan & tahun, baris
   tengah ditandai pita .lap-wheel-highlight) supaya tampilannya
   sama persis dgn gambar referensi yang diminta, sambil tetap
   menulis ke variabel state (lapFilterMonth) & alur render yang
   sudah ada persis seperti input bawaan sebelumnya.
========================================================== */
const LAP_MONTH_NAMES_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const LAP_WHEEL_ITEM_H = 42;
let lapWheelYears = [];

function buildLapMonthWheelYears() {
  const nowY = new Date().getFullYear();
  const dates = transactions.map(t => t.date).filter(Boolean);
  let minY = nowY - 3, maxY = nowY + 1;
  dates.forEach(d => {
    const y = Number(d.slice(0, 4));
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const years = [];
  for (let y = minY; y <= maxY; y++) years.push(y);
  return years;
}

function updateLapMonthFieldLabel() {
  const label = document.getElementById('lapMonthFieldLabel');
  const fieldBtn = document.getElementById('lapMonthFieldBtn');
  if (!label || !fieldBtn) return;
  if (lapFilterMonth) {
    const [y, m] = lapFilterMonth.split('-');
    label.textContent = `${LAP_MONTH_NAMES_FULL[Number(m) - 1]} ${y}`;
    fieldBtn.classList.add('has-value');
  } else {
    label.textContent = 'Pilih Bulan';
    fieldBtn.classList.remove('has-value');
  }
}

// Terapkan opacity pudar pada baris wheel sesuai jaraknya dari baris
// tengah (yg ditandai pita highlight) -- bikin efek "roda" khas iOS.
function lapWheelApplyFade(col) {
  const items = [...col.querySelectorAll('.lap-wheel-item')];
  const centerScroll = col.scrollTop + col.clientHeight / 2;
  items.forEach(it => {
    const itemCenter = it.offsetTop + LAP_WHEEL_ITEM_H / 2;
    const dist = Math.abs(itemCenter - centerScroll) / LAP_WHEEL_ITEM_H;
    it.style.opacity = String(Math.max(0.25, 1 - dist * 0.4));
  });
}
function lapWheelCenteredIndex(col) {
  return Math.round(col.scrollTop / LAP_WHEEL_ITEM_H);
}
function lapWheelScrollToIndex(col, idx, smooth) {
  col.scrollTo({ top: idx * LAP_WHEEL_ITEM_H, behavior: smooth ? 'smooth' : 'instant' });
}
function setupLapWheelCol(col, items, initialIdx) {
  col.innerHTML = '<div style="height:' + (LAP_WHEEL_ITEM_H * 2) + 'px;flex-shrink:0;"></div>' +
    items.map((label, i) => `<div class="lap-wheel-item" data-idx="${i}">${label}</div>`).join('') +
    '<div style="height:' + (LAP_WHEEL_ITEM_H * 2) + 'px;flex-shrink:0;"></div>';
  // offsetTop di atas dihitung relatif elemen scroll -- karena kita pakai
  // padding lewat div spacer (bukan CSS padding), offsetTop item ke-i
  // sudah otomatis termasuk tinggi spacer atas, jadi index = offsetTop/ITEM_H - 2.
  let scrollTimer = null;
  col.addEventListener('scroll', () => {
    lapWheelApplyFade(col);
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const idx = Math.max(0, Math.min(items.length - 1, lapWheelCenteredIndex(col)));
      lapWheelScrollToIndex(col, idx, true);
    }, 90);
  }, { passive: true });
  col.addEventListener('click', (e) => {
    const it = e.target.closest('.lap-wheel-item');
    if (!it) return;
    lapWheelScrollToIndex(col, Number(it.dataset.idx), true);
  });
  lapWheelScrollToIndex(col, initialIdx, false);
  requestAnimationFrame(() => lapWheelApplyFade(col));
}
function openLapMonthSheet() {
  const monthCol = document.getElementById('lapWheelMonthCol');
  const yearCol = document.getElementById('lapWheelYearCol');
  if (!monthCol || !yearCol) return;
  lapWheelYears = buildLapMonthWheelYears();
  const [selY, selM] = (lapFilterMonth || thisMonthStr()).split('-');
  const monthIdx = Number(selM) - 1;
  let yearIdx = lapWheelYears.indexOf(Number(selY));
  if (yearIdx === -1) yearIdx = 0;
  setupLapWheelCol(monthCol, LAP_MONTH_NAMES_FULL, monthIdx);
  setupLapWheelCol(yearCol, lapWheelYears.map(String), yearIdx);
  document.getElementById('lapMonthSheetOverlay').classList.add('open');
}
function closeLapMonthSheet() {
  document.getElementById('lapMonthSheetOverlay').classList.remove('open');
}
document.getElementById('lapMonthFieldBtn')?.addEventListener('click', openLapMonthSheet);
document.getElementById('lapMonthSheetCloseBtn')?.addEventListener('click', closeLapMonthSheet);
document.getElementById('lapMonthSheetOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'lapMonthSheetOverlay') closeLapMonthSheet();
});
initLapSheetDrag(document.getElementById('lapMonthSheetOverlay'), document.getElementById('lapMonthSheet'), closeLapMonthSheet);
document.getElementById('lapMonthSheetSaveBtn')?.addEventListener('click', () => {
  const monthCol = document.getElementById('lapWheelMonthCol');
  const yearCol = document.getElementById('lapWheelYearCol');
  const mIdx = lapWheelCenteredIndex(monthCol);
  const yIdx = lapWheelCenteredIndex(yearCol);
  const year = lapWheelYears[Math.max(0, Math.min(lapWheelYears.length - 1, yIdx))];
  const month = String(mIdx + 1).padStart(2, '0');
  lapFilterMonth = `${year}-${month}`;
  updateLapMonthFieldLabel();
  closeLapMonthSheet();
  resetHistoryPagination();
  renderTransactionList();
});

/* ==========================================================
   BOTTOM SHEET "PILIH RENTANG TANGGAL" -- kalender kustom
   Menggantikan 2 <input type="date"> (Dari/Sampai) bawaan browser
   dengan kalender satu-bulan yang bisa dinavigasi (chevron kiri/
   kanan) & mendukung pilih rentang (tap tanggal awal, lalu tanggal
   akhir) dgn pita highlight biru menyambung antar tanggal -- gaya
   & interaksi mengikuti gambar referensi yg diminta.
========================================================== */
const LAP_DOW_LABELS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
let lapCalViewYear = new Date().getFullYear();
let lapCalViewMonth = new Date().getMonth(); // 0-11
let lapCalRangeStart = '';
let lapCalRangeEnd = '';

function updateLapDateRangeFieldLabel() {
  const label = document.getElementById('lapDateRangeFieldLabel');
  const fieldBtn = document.getElementById('lapDateRangeFieldBtn');
  if (!label || !fieldBtn) return;
  if (lapFilterDateFrom && lapFilterDateTo) {
    const fmt = (s) => { const d = new Date(s + 'T00:00:00'); return `${String(d.getDate()).padStart(2,'0')} ${MONTH_LABELS_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
    label.textContent = lapFilterDateFrom === lapFilterDateTo ? fmt(lapFilterDateFrom) : `${fmt(lapFilterDateFrom)} - ${fmt(lapFilterDateTo)}`;
    fieldBtn.classList.add('has-value');
  } else {
    label.textContent = 'Pilih Rentang Tanggal';
    fieldBtn.classList.remove('has-value');
  }
}
function lapCalRenderGrid() {
  const grid = document.getElementById('lapCalGrid');
  const navLabel = document.getElementById('lapCalNavLabel');
  if (!grid || !navLabel) return;
  navLabel.textContent = `${LAP_MONTH_NAMES_FULL[lapCalViewMonth]} ${lapCalViewYear}`;
  const firstOfMonth = new Date(lapCalViewYear, lapCalViewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=Minggu
  const daysInMonth = new Date(lapCalViewYear, lapCalViewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(lapCalViewYear, lapCalViewMonth, 0).getDate();
  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, muted: true, y: lapCalViewMonth === 0 ? lapCalViewYear - 1 : lapCalViewYear, m: (lapCalViewMonth + 11) % 12 });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, muted: false, y: lapCalViewYear, m: lapCalViewMonth });
  const remain = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remain; d++) cells.push({ day: d, muted: true, y: lapCalViewMonth === 11 ? lapCalViewYear + 1 : lapCalViewYear, m: (lapCalViewMonth + 1) % 12 });

  grid.innerHTML = cells.map(c => {
    const ds = `${c.y}-${String(c.m + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
    let cls = 'lap-cal-cell' + (c.muted ? ' is-muted' : '');
    if (lapCalRangeStart && lapCalRangeEnd) {
      if (ds >= lapCalRangeStart && ds <= lapCalRangeEnd) cls += ' in-range';
      if (ds === lapCalRangeStart) cls += ' range-start';
      if (ds === lapCalRangeEnd) cls += ' range-end';
    } else if (lapCalRangeStart && ds === lapCalRangeStart) {
      cls += ' in-range range-start range-end';
    }
    return `<div class="${cls}" data-date="${ds}"><span class="lap-cal-num">${c.day}</span></div>`;
  }).join('');
}
function lapCalHandleDayClick(ds) {
  if (!lapCalRangeStart || (lapCalRangeStart && lapCalRangeEnd)) {
    lapCalRangeStart = ds;
    lapCalRangeEnd = '';
  } else if (ds < lapCalRangeStart) {
    lapCalRangeStart = ds;
    lapCalRangeEnd = '';
  } else {
    lapCalRangeEnd = ds;
  }
  lapCalRenderGrid();
}
document.getElementById('lapCalGrid')?.addEventListener('click', (e) => {
  const cell = e.target.closest('.lap-cal-cell');
  if (!cell) return;
  lapCalHandleDayClick(cell.dataset.date);
});
document.getElementById('lapCalPrevBtn')?.addEventListener('click', () => {
  lapCalViewMonth--; if (lapCalViewMonth < 0) { lapCalViewMonth = 11; lapCalViewYear--; }
  lapCalRenderGrid();
});
document.getElementById('lapCalNextBtn')?.addEventListener('click', () => {
  lapCalViewMonth++; if (lapCalViewMonth > 11) { lapCalViewMonth = 0; lapCalViewYear++; }
  lapCalRenderGrid();
});
function openLapDateRangeSheet() {
  const base = lapFilterDateFrom ? new Date(lapFilterDateFrom + 'T00:00:00') : new Date();
  lapCalViewYear = base.getFullYear();
  lapCalViewMonth = base.getMonth();
  lapCalRangeStart = lapFilterDateFrom || '';
  lapCalRangeEnd = lapFilterDateTo || '';
  lapCalRenderGrid();
  document.getElementById('lapDateRangeSheetOverlay').classList.add('open');
}
function closeLapDateRangeSheet() {
  document.getElementById('lapDateRangeSheetOverlay').classList.remove('open');
}
document.getElementById('lapDateRangeFieldBtn')?.addEventListener('click', openLapDateRangeSheet);
document.getElementById('lapDateRangeSheetCloseBtn')?.addEventListener('click', closeLapDateRangeSheet);
document.getElementById('lapDateRangeSheetOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'lapDateRangeSheetOverlay') closeLapDateRangeSheet();
});
initLapSheetDrag(document.getElementById('lapDateRangeSheetOverlay'), document.getElementById('lapDateRangeSheet'), closeLapDateRangeSheet);
document.getElementById('lapDateRangeSheetSaveBtn')?.addEventListener('click', () => {
  if (!lapCalRangeStart) { closeLapDateRangeSheet(); return; }
  lapFilterDateFrom = lapCalRangeStart;
  lapFilterDateTo = lapCalRangeEnd || lapCalRangeStart;
  updateLapDateRangeFieldLabel();
  closeLapDateRangeSheet();
  resetHistoryPagination();
  renderTransactionList();
});

/* ---- Tab utama halaman Laporan: Aktifitas / Tabungan / Aset ----
   Pola sama dgn tab #tabs (Semua/Mingguan/dst) di atas, tapi menimpa
   .lap-panel mana yang tampil (bukan re-render daftar transaksi).
   Logikanya ditaruh di satu fungsi (switchLapMainTab) supaya bisa
   dipicu dari 2 sumber: klik tombol tab ATAU usap (swipe) di atas
   area panelnya -- lihat setupLapSwipeTabs() di bawah. ---- */
const LAP_TAB_ORDER = ['aktifitas', 'tabungan', 'aset'];
function switchLapMainTab(target) {
  const container = document.getElementById('lapMainTabs');
  const btn = container?.querySelector(`.tab-btn[data-laptab="${target}"]`);
  if (!container || !btn) return;
  container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateTabIndicator(container);
  document.querySelectorAll('.lap-panel').forEach(p => p.classList.toggle('active', p.dataset.lapPanel === target));
  // ---- Ikut timpa data-active-laptab di wrapper sticky (#lapStickyTop) --
  // dipakai CSS (.lap-sticky-top:not([data-active-laptab="aktifitas"]) ...)
  // supaya header "Semua Transaksi" yg ikut nempel di sana otomatis
  // disembunyikan begitu pindah ke tab Tabungan/Aset. ----
  document.getElementById('lapStickyTop')?.setAttribute('data-active-laptab', target);
}
document.getElementById('lapMainTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchLapMainTab(btn.dataset.laptab);
});

/* ---- Usap kiri/kanan pada area panel Laporan (#lapPanelsSwipe) utk
   pindah tab Aktifitas <-> Tabungan <-> Aset, pengganti/pelengkap tap
   tab di atas -- lazim dipakai di app finansial supaya pindah tab bisa
   1 tangan tanpa harus menjangkau baris tab. Dipakai touchstart/
   touchend polos (bukan touchmove tiap frame) supaya scroll vertikal
   daftar transaksi TIDAK ikut ke-drag/patah -- gesture hanya dihitung
   valid kalau pergeseran mendatarnya jauh lebih besar drpd vertikalnya
   (rasio 1.3x) DAN melewati ambang batas jarak (SWIPE_THRESHOLD),
   supaya scroll biasa (bahkan yg agak miring) tidak salah kepencet
   sebagai usap ganti tab. ---- */
function setupLapSwipeTabs() {
  const wrap = document.getElementById('lapPanelsSwipe');
  if (!wrap) return;
  const SWIPE_THRESHOLD = 46;
  let startX = 0, startY = 0, tracking = false;

  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  wrap.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.3) return;

    const activeBtn = document.querySelector('#lapMainTabs .tab-btn.active');
    const current = activeBtn ? activeBtn.dataset.laptab : LAP_TAB_ORDER[0];
    const idx = LAP_TAB_ORDER.indexOf(current);
    if (idx === -1) return;
    if (dx < 0 && idx < LAP_TAB_ORDER.length - 1) {
      switchLapMainTab(LAP_TAB_ORDER[idx + 1]); // usap ke kiri -> tab berikutnya
    } else if (dx > 0 && idx > 0) {
      switchLapMainTab(LAP_TAB_ORDER[idx - 1]); // usap ke kanan -> tab sebelumnya
    }
  }, { passive: true });
}
setupLapSwipeTabs();

/* ==========================================================
   POPUP FILTER LAPORAN (halaman penuh)
   Ikon "Filter" di header "Semua Transaksi" (#lapFilterOpenBtn)
   membuka halaman penuh #lapFilterOverlay berisi field yang sama
   persis dgn yang dulu ada di baris cari & filter lama (#searchInput,
   #categoryFilter, dan #tabs Rentang Waktu) -- cuma dipindah lokasi &
   ditata ulang tampilannya (radio list + pil), jadi tiap field ini
   TETAP memicu render list transaksi langsung begitu diubah (live),
   sama seperti sebelumnya. Tombol Kembali & Simpan di popup jadi
   sama-sama menutup popup; tombol Reset mengembalikan semua field ke
   nilai default lalu ikut me-render ulang. ---- */
function openLapFilterOverlay() {
  document.getElementById('lapFilterOverlay').classList.add('open');
  lockBodyScroll();
  updateTabIndicator(document.getElementById('tabs'));
  updateLapMonthFieldLabel();
  updateLapDateRangeFieldLabel();
}
function closeLapFilterOverlay() {
  document.getElementById('lapFilterOverlay').classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('lapFilterOpenBtn')?.addEventListener('click', openLapFilterOverlay);
document.getElementById('lapFilterBackBtn')?.addEventListener('click', closeLapFilterOverlay);
document.getElementById('lapFilterSaveBtn')?.addEventListener('click', closeLapFilterOverlay);

/* ==========================================================
   POPUP TEMA (halaman penuh, placeholder KOSONG)
   Baris "Tema" di halaman Pengaturan (#temaOpenBtn) membuka popup
   #temaOverlay -- gaya & perilaku buka/tutupnya SENGAJA disamakan
   persis dgn popup Filter Laporan di atas (dipakai ulang class
   .lap-filter-overlay yg sama), cuma isinya masih kosong dulu. ---- */
function openTemaOverlay() {
  refreshTemaPage();
  document.getElementById('temaOverlay').classList.add('open');
  lockBodyScroll();
}
/* ---- Tutup TANPA menyimpan: dipakai oleh tombol kembali, tombol
   "Batal", & Escape -- warna kembali ke temaOriginalState (yg
   tersimpan sblm popup dibuka) supaya pratinjau yg belum "Selesai"
   tidak ikut menempel. ---- */
function closeTemaOverlay() {
  if (temaOriginalState) applyGlobalTheme(temaOriginalState);
  if (temaFontOriginalKey) applyFontPreview(temaFontOriginalKey);
  if (temaDecoOriginalState) applyBannerDeco(temaDecoOriginalState);
  if (temaFrameOriginalState) applyAvatarFrame(temaFrameOriginalState);
  if (temaDisplayOriginalState) applyDisplayMode(temaDisplayOriginalState);
  document.getElementById('temaOverlay').classList.remove('open');
  unlockBodyScroll();
}
/* ---- Tombol "Selesai": baru di titik inilah pilihan warna & font
   benar-benar disimpan ke storage (persis pola tombol "Selesai" pd
   sheet Kategori Transaksi -- pilih dulu = pratinjau, "Selesai" baru
   menerapkan). Font disimpan lewat saveAppSettings() -- key yg SAMA
   dgn font di modal "Pengaturan Aplikasi" -- supaya keduanya tetap 1
   sumber data yg sinkron, bukan disimpan terpisah sendiri. ---- */
function confirmTemaOverlay() {
  let changed = false;
  if (temaPendingState) {
    saveGlobalTheme(temaPendingState);
    applyGlobalTheme(temaPendingState);
    temaOriginalState = temaPendingState;
    changed = true;
  }
  if (temaFontPendingKey && temaFontPendingKey !== temaFontOriginalKey) {
    const settings = { ...loadAppSettings(), font: temaFontPendingKey };
    saveAppSettings(settings);
    applyFontPreview(temaFontPendingKey);
    temaFontOriginalKey = temaFontPendingKey;
    changed = true;
  }
  if (temaDecoPendingState && JSON.stringify(temaDecoPendingState) !== JSON.stringify(temaDecoOriginalState)) {
    saveBannerDeco(temaDecoPendingState);
    applyBannerDeco(temaDecoPendingState);
    temaDecoOriginalState = temaDecoPendingState;
    changed = true;
  }
  if (temaFramePendingState && JSON.stringify(temaFramePendingState) !== JSON.stringify(temaFrameOriginalState)) {
    saveAvatarFrame(temaFramePendingState);
    applyAvatarFrame(temaFramePendingState);
    temaFrameOriginalState = temaFramePendingState;
    changed = true;
  }
  if (temaDisplayPendingState && JSON.stringify(temaDisplayPendingState) !== JSON.stringify(temaDisplayOriginalState)) {
    saveDisplayMode(temaDisplayPendingState);
    applyDisplayMode(temaDisplayPendingState);
    temaDisplayOriginalState = temaDisplayPendingState;
    changed = true;
  }
  if (changed) showToast('Tema disimpan.');
  document.getElementById('temaOverlay').classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('temaOpenBtn')?.addEventListener('click', openTemaOverlay);
document.getElementById('temaBackBtn')?.addEventListener('click', closeTemaOverlay);
document.getElementById('temaCancelBtn')?.addEventListener('click', closeTemaOverlay);
document.getElementById('temaDoneBtn')?.addEventListener('click', confirmTemaOverlay);

/* ==========================================================
   HALAMAN "DATA DIRI" (#dataDiriOverlay) — Nama Web, Logo, Favicon.
   3 field ini nulis ke APP_SETTINGS_KEY yg SAMA dgn modal "Pengaturan
   Aplikasi" (asAppName/asLogoDrop/asFaviconDrop di atas), jadi
   fungsi baca-tulis file gambarnya (FileReader -> data URL) SENGAJA
   dibuat ulang dgn nama ddLogoData/ddFaviconData/dst yg terpisah dari
   asLogoData/asFaviconData -- supaya membuka halaman ini tidak
   menimpa draft yg sedang diedit di modal lama kalau kebetulan lagi
   sama2 terbuka -- tapi keduanya SELALU membaca & menyimpan ke
   settings.logo/settings.favicon yg sama, jadi otomatis sinkron.
   Beda dgn halaman Tema (yg live-preview + bisa "Batal" ke kondisi
   semula), halaman ini SENGAJA baru menerapkan perubahan saat
   "Selesai" ditekan (sama spt pola modal "Pengaturan Aplikasi" yg
   sudah ada -- appName/logo/favicon di sana juga baru berlaku pas
   form di-submit, bukan sambil diketik/dipilih) -- jadi "Batal" di
   sini cukup menutup halaman tanpa perlu mengembalikan apa pun. ---- */
let ddLogoData = null;
let ddFaviconData = null;

function setDdLogoPreview(dataUrl) {
  ddLogoData = dataUrl || null;
  const preview = document.getElementById('ddLogoPreview');
  const removeBtn = document.getElementById('btnRemoveDdLogo');
  if (!preview) return;
  const settings = loadAppSettings();
  const iconPreset = APP_ICON_PRESETS.find(i => i.key === settings.icon) || APP_ICON_PRESETS[0];
  preview.innerHTML = ddLogoData ? `<img src="${ddLogoData}" alt="Pratinjau logo aplikasi">` : iconPreset.svg;
  if (removeBtn) removeBtn.style.display = ddLogoData ? 'inline-flex' : 'none';
}
function handleDdLogoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran logo maksimal 2MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setDdLogoPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca logo.', 'err');
  reader.readAsDataURL(file);
}
function setDdFaviconPreview(dataUrl) {
  ddFaviconData = dataUrl || null;
  const preview = document.getElementById('ddFaviconPreview');
  const removeBtn = document.getElementById('btnRemoveDdFavicon');
  if (!preview) return;
  preview.innerHTML = ddFaviconData
    ? `<img src="${ddFaviconData}" alt="Pratinjau favicon aplikasi">`
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>';
  if (removeBtn) removeBtn.style.display = ddFaviconData ? 'inline-flex' : 'none';
}
function handleDdFaviconFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar.', 'err'); return; }
  if (file.size > 1 * 1024 * 1024) { showToast('Ukuran favicon maksimal 1MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => setDdFaviconPreview(reader.result);
  reader.onerror = () => showToast('Gagal membaca favicon.', 'err');
  reader.readAsDataURL(file);
}

function openDataDiriOverlay() {
  const settings = loadAppSettings();
  const nameInput = document.getElementById('ddAppNameInput');
  if (nameInput) {
    nameInput.value = settings.appName || '';
    nameInput.placeholder = getDefaultAppName();
  }
  document.getElementById('ddLogoInput').value = '';
  document.getElementById('ddFaviconInput').value = '';
  setDdLogoPreview(settings.logo);
  setDdFaviconPreview(settings.favicon);
  document.getElementById('dataDiriOverlay').classList.add('open');
  lockBodyScroll();
}
function closeDataDiriOverlay() {
  document.getElementById('dataDiriOverlay').classList.remove('open');
  unlockBodyScroll();
}
function confirmDataDiriOverlay() {
  const nameInput = document.getElementById('ddAppNameInput');
  const typedName = (nameInput ? nameInput.value : '').trim();
  const settings = {
    ...loadAppSettings(),
    appName: typedName || getDefaultAppName(),
    logo: ddLogoData,
    favicon: ddFaviconData,
  };
  saveAppSettings(settings);
  applyAppSettings(settings);
  showToast('Data diri disimpan.');
  closeDataDiriOverlay();
}
document.getElementById('dataDiriOpenBtn')?.addEventListener('click', openDataDiriOverlay);

/* ---- Baris "Masuk / Daftar Akun" <-> "Logout" di halaman Pengaturan
   (dinamis mengikuti status login, lihat requireCloudLogin di atas) ---- */
function updateAccountSettingsRow() {
  const btn = document.getElementById('settingsAccountBtn');
  const title = document.getElementById('settingsAccountBtnTitle');
  const icon = document.getElementById('settingsAccountBtnIcon');
  if (!btn || !title) return;
  const loggedIn = typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn();
  title.textContent = loggedIn ? 'Logout' : 'Masuk / Daftar Akun';
  btn.classList.toggle('settings-row-danger', loggedIn);
  if (icon) {
    // Logout: panah keluar dari kotak (kotak di kiri). Login: panah masuk ke kotak (kotak di kanan).
    icon.innerHTML = loggedIn
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>';
  }
}
updateAccountSettingsRow();
document.getElementById('settingsAccountBtn')?.addEventListener('click', handleAccountToggleClick);

/* ==========================================================
   BATASI FITUR SESUAI AKSES (window.zayaproRole/zayaproIsOwner,
   diisi oleh cloud-sync.js SEBELUM script.js ini dimuat -- lihat
   resolveWorkspace() di sana). Dipanggil sekali di awal:
   - Baris "User Account" (kelola user login lain) cuma boleh dibuka
     PEMILIK ASLI akun (window.zayaproIsOwner === true).
   - Tombol "Reset Database Online" cuma boleh dipakai pemilik asli
     ATAU user tambahan berrole 'admin' -- role 'user' tidak boleh
     menghapus seluruh data bersama.
   Kalau tidak sedang login akun cloud sama sekali (guest/lokal),
   window.zayaproIsOwner/zayaproRole belum terisi (undefined) --
   dalam kondisi itu baris/tombol ini dibiarkan seperti semula
   (nanti akan diminta login dulu lewat cloudRequireLogin() spt
   fitur cloud lain). ---- */
function applyRolePermissionsUI() {
  if (window.zayaproIsOwner === undefined) return; // guest/belum login -- tidak relevan dulu
  const userAccountRow = document.getElementById('userAccountOpenBtn');
  if (userAccountRow) userAccountRow.style.display = window.zayaproIsOwner ? '' : 'none';
  const resetBtn = document.getElementById('btnResetCloudDb');
  const canReset = window.zayaproIsOwner || window.zayaproRole === 'admin';
  if (resetBtn) resetBtn.style.display = canReset ? '' : 'none';
}
applyRolePermissionsUI();
document.getElementById('dataDiriBackBtn')?.addEventListener('click', closeDataDiriOverlay);
document.getElementById('dataDiriCancelBtn')?.addEventListener('click', closeDataDiriOverlay);
document.getElementById('dataDiriDoneBtn')?.addEventListener('click', confirmDataDiriOverlay);

/* ==========================================================
   PENGATURAN > INFORMASI PRIBADI — "User Account" (#userAccountOverlay).
   Pola buka/tutup SAMA PERSIS dgn openTentangOverlay/closeTentangOverlay
   di bawah (tanpa logic tambahan lain) -- halaman ini SENGAJA masih
   kosong (placeholder "empty-state"), tinggal diisi kontennya nanti. ---- */
function openUserAccountOverlay() {
  if (!window.zayaproIsOwner) {
    // Jaga-jaga (tombol pembukanya sendiri sudah disembunyikan lewat
    // applyRolePermissionsUI() kalau bukan pemilik asli akun) --
    // hanya pemilik asli yang boleh kelola User Account.
    showToast('Cuma pemilik akun yang bisa mengelola User Account.', 'err');
    return;
  }
  renderUserAccountList();
  document.getElementById('userAccountOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeUserAccountOverlay() {
  document.getElementById('userAccountOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('userAccountOpenBtn')?.addEventListener('click', openUserAccountOverlay);
document.getElementById('userAccountBackBtn')?.addEventListener('click', closeUserAccountOverlay);

/* ==========================================================
   HALAMAN "USER ACCOUNT" -- LOGIN SUNGGUHAN UNTUK USER TAMBAHAN
   Pemilik akun (yang pertama kali daftar akun cloud) bisa menambahkan
   user login LAIN secara manual: Nama, Email, Password, PIN, Jabatan
   & Akses. BEDA dari versi sebelumnya -- sekarang menambah user di
   sini BENAR-BENAR membuat akun login Supabase Auth baru (lihat
   window.cloudAddMember di cloud-sync.js), jadi orang itu BISA login
   sungguhan lewat popup Masuk/Daftar dengan email & password yang
   dibuatkan di sini, dan begitu dia login, dia melihat & mengelola
   DATA YANG SAMA dengan pemilik akun (bukan data kosong terpisah).
   "Akses" (uaAccessInput: admin/user) menentukan fitur apa saja yang
   boleh dia pakai -- lihat applyRolePermissionsUI() di bawah.
   Daftar user (manualLoginUsers, dipakai cuma sbg cache tampilan)
   selalu ditarik ULANG dari server tiap kali halaman dibuka lewat
   window.cloudListMembers(), BUKAN disimpan lokal, supaya selalu
   sinkron/akurat antar perangkat. ---- */
let manualLoginUsers = []; // cache hasil cloudListMembers() terakhir, dipakai render & edit modal
let editingUserAccountId = null; // member_id (id akun Supabase Auth-nya) saat mode edit

function userAccountInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function userAccountRoleLabel(role) {
  return role === 'admin' ? 'Admin' : 'User';
}

// Ikon kecil sesuai jabatan, ditempel di sudut avatar -- mahkota utk
// Admin (pemilik maupun user tambahan berrole admin), figur orang
// polos utk User biasa.
const UA_ICON_CROWN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 19h18v2H3v-2Zm.4-3L2 8l5 3 5-6 5 6 5-3-1.4 8H3.4Z"/></svg>';
const UA_ICON_USER = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
// Isi lencana avatar: pakai foto Logo dari halaman "Data Diri"
// (settings.logo) kalau sudah diisi -- logo itu tersimpan di
// cloudStorage (sinkron ke Supabase per workspace), jadi otomatis
// sama utk kartu pemilik akun MAUPUN kartu tiap user tambahan di
// halaman ini, dan ikut ter-update kalau ada yang menggantinya dari
// perangkat lain. Kalau belum ada logo yang diisi, tetap fallback ke
// lencana inisial huruf seperti semula.
function userAccountAvatarInnerHtml(name) {
  const settings = loadAppSettings();
  if (settings.logo) {
    return `<img src="${settings.logo}" alt="Foto profil ${escapeAttr(name)}">`;
  }
  return escapeHtml(userAccountInitials(name));
}
function userAccountAvatarHtml(name, isAdmin, orderNum) {
  return `
    <span class="ua-avatar-wrap${isAdmin ? ' is-admin-ring' : ''}">
      <span class="ua-avatar${isAdmin ? ' ua-avatar-owner' : ''}">${userAccountAvatarInnerHtml(name)}</span>
      ${orderNum ? `<span class="ua-order-badge">${orderNum}</span>` : ''}
      <span class="ua-role-icon ${isAdmin ? 'is-admin' : 'is-user'}">${isAdmin ? UA_ICON_CROWN : UA_ICON_USER}</span>
    </span>`;
}

function userAccountOwnerCardHtml() {
  const name = window.zayaproAccountName || 'Pemilik Akun';
  const email = window.zayaproAccountEmail || '';
  return `
    <div class="ua-card ua-card-owner" style="animation-delay:.02s;">
      ${userAccountAvatarHtml(name, true)}
      <span class="ua-body">
        <span class="ua-top-row">
          <span class="ua-name">${escapeHtml(name)}</span>
          <span class="ua-role-badge ua-role-badge-owner">Admin (Pemilik)</span>
        </span>
        ${email ? `<span class="ua-email">${escapeHtml(email)}</span>` : ''}
      </span>
    </div>`;
}

async function renderUserAccountList() {
  const wrap = document.getElementById('userAccountList');
  if (!wrap) return;
  wrap.innerHTML = `<div class="ua-empty"><p>Memuat daftar user...</p></div>`;
  if (typeof window.cloudListMembers !== 'function') {
    wrap.innerHTML = `<div class="ua-empty"><p>Fitur ini butuh koneksi cloud. Masuk/Daftar dulu ya.</p></div>`;
    return;
  }
  manualLoginUsers = await window.cloudListMembers();
  const ownerCardHtml = userAccountOwnerCardHtml();
  if (!manualLoginUsers.length) {
    wrap.innerHTML = ownerCardHtml + `
      <div class="ua-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        <p>Belum ada user login yang ditambahkan. Ketuk "Tambah User" untuk mulai.</p>
      </div>`;
    return;
  }
  wrap.innerHTML = ownerCardHtml + manualLoginUsers.map((u, i) => `
    <div class="ua-card" style="animation-delay:${(0.06 + i * 0.05).toFixed(2)}s;">
      ${userAccountAvatarHtml(u.name, u.role === 'admin', i + 1)}
      <span class="ua-body">
        <span class="ua-top-row">
          <span class="ua-name">${escapeHtml(u.name)}</span>
          <span class="ua-role-badge">${escapeHtml(userAccountRoleLabel(u.role))}</span>
        </span>
      </span>
      <span class="ua-actions">
        <button type="button" class="icon-btn notify" data-uanotify="${escapeAttr(u.member_id)}" data-uanotifyname="${escapeAttr(u.name)}" title="Kirim pesan ke ${escapeAttr(u.name)}" aria-label="Kirim pesan ke ${escapeAttr(u.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </button>
        <button type="button" class="icon-btn edit" data-uaedit="${escapeAttr(u.member_id)}" title="Edit user" aria-label="Edit ${escapeAttr(u.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="icon-btn del" data-uadel="${escapeAttr(u.member_id)}" title="Hapus user" aria-label="Hapus ${escapeAttr(u.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </span>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-uanotify]').forEach(btn => {
    btn.addEventListener('click', () => openUserNotifyModal(btn.dataset.uanotify, btn.dataset.uanotifyname));
  });
  wrap.querySelectorAll('[data-uaedit]').forEach(btn => {
    btn.addEventListener('click', () => openUserAccountFormModal(btn.dataset.uaedit));
  });
  wrap.querySelectorAll('[data-uadel]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.uadel, 'useraccount'));
  });
}





function setUserAccountFormMode(isEdit) {
  const submitBtn = document.getElementById('uaFormSubmitBtn');
  const heading = document.getElementById('userAccountFormHeading');
  const emailInput = document.getElementById('uaEmailInput');
  const passwordInput = document.getElementById('uaPasswordInput');
  const pinInput = document.getElementById('uaPinInput');
  const pwPinRow = document.getElementById('uaPwPinRow');
  const hint = document.getElementById('uaEditHint');
  if (submitBtn) submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan User';
  if (heading) heading.textContent = isEdit ? 'Edit User' : 'Tambah User';
  // Email cuma bisa diisi SEKALI saat user-nya dibuat -- lihat catatan
  // batasan di window.cloudAddMember (cloud-sync.js).
  if (emailInput) { emailInput.disabled = isEdit; emailInput.required = !isEdit; }
  // Password & PIN: khusus mode edit, field ini DISEMBUNYIKAN total
  // (bukan cuma di-nonaktifkan) -- cuma user yang bersangkutan yang
  // boleh menggantinya sendiri lewat menu Ubah Password/PIN setelah
  // login, jadi pemilik akun tidak perlu (& tidak bisa) mengaturnya
  // dari sini lagi saat edit.
  [passwordInput, pinInput].forEach(el => {
    if (!el) return;
    el.disabled = isEdit;
    el.required = !isEdit;
  });
  if (pwPinRow) pwPinRow.style.display = isEdit ? 'none' : '';
  if (hint) hint.style.display = isEdit ? '' : 'none';
}

// Nilai default fitur yang bisa dicentang saat menambah user baru --
// semua nyala kecuali Reset Database (sesuai batasan role 'user'
// bawaan sebelumnya di applyRolePermissionsUI()).
const UA_PERM_DEFAULT = { transaksi: true, tagihan: true, sumber_dana: true, tanya_ai: true, reset_db: false };
const UA_PERM_FIELDS = [
  ['transaksi', 'uaPermTransaksi'],
  ['tagihan', 'uaPermTagihan'],
  ['sumber_dana', 'uaPermSumberDana'],
  ['tanya_ai', 'uaPermTanyaAi'],
  ['reset_db', 'uaPermResetDb']
];
function setUserAccountPermChecks(perms) {
  const p = Object.assign({}, UA_PERM_DEFAULT, perms || {});
  UA_PERM_FIELDS.forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!p[key];
  });
}
function readUserAccountPermChecks() {
  const p = {};
  UA_PERM_FIELDS.forEach(([key, id]) => {
    const el = document.getElementById(id);
    p[key] = el ? el.checked : false;
  });
  return p;
}

// ---- Popup "Kirim Pesan" (#userNotifyModalOverlay) -- admin/pemilik
// mengirim notifikasi bertarget ke SATU user tambahan tertentu dari
// kartunya di halaman User Account. Beda dari notifikasi biasa (yang
// tampil ke semua yang berbagi data yang sama), notifikasi ini cuma
// muncul di panel Notifikasi milik user yang dituju -- lihat field
// `target` pada pushCustomNotification()/renderNotifPanel() di bawah. ----
const userNotifyModal = document.getElementById('userNotifyModalOverlay');
let userNotifyTargetId = null;
function openUserNotifyModal(memberId, name) {
  userNotifyTargetId = memberId;
  document.getElementById('userNotifyTargetName').textContent = name || 'user ini';
  document.getElementById('userNotifyForm').reset();
  openModal(userNotifyModal);
}
function closeUserNotifyModal() {
  closeModal(userNotifyModal);
  userNotifyTargetId = null;
}
document.getElementById('userNotifyCloseBtn')?.addEventListener('click', closeUserNotifyModal);
document.getElementById('btnUaNotifyCancel')?.addEventListener('click', closeUserNotifyModal);
userNotifyModal?.addEventListener('click', (e) => { if (e.target === userNotifyModal) closeUserNotifyModal(); });
document.getElementById('userNotifyForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!userNotifyTargetId) return;
  const title = document.getElementById('uaNotifyTitleInput').value.trim();
  const body = document.getElementById('uaNotifyBodyInput').value.trim();
  if (!title) { showToast('Judul pesan wajib diisi.', 'err'); return; }
  pushCustomNotification({
    source: (window.zayaproAccountName ? window.zayaproAccountName : 'Admin'),
    title, body,
    target: userNotifyTargetId
  });
  showToast('Pesan berhasil dikirim.');
  closeUserNotifyModal();
});

function openUserAccountFormModal(editId) {
  const form = document.getElementById('userAccountForm');
  form.reset();
  if (editId) {
    const u = manualLoginUsers.find(x => x.member_id === editId);
    if (u) {
      editingUserAccountId = u.member_id;
      document.getElementById('uaNameInput').value = u.name;
      document.getElementById('uaEmailInput').value = u.email || '(tidak bisa diubah)';
      document.getElementById('uaPasswordInput').value = '';
      document.getElementById('uaPinInput').value = '';
      document.getElementById('uaRoleInput').value = u.role === 'admin' ? 'admin' : 'user';
      setUserAccountPermChecks(u.permissions);
      setUserAccountFormMode(true);
    }
  } else {
    editingUserAccountId = null;
    document.getElementById('uaRoleInput').value = 'user';
    setUserAccountPermChecks(UA_PERM_DEFAULT);
    setUserAccountFormMode(false);
  }
  openModal(userAccountFormModal);
}
function closeUserAccountFormModal() {
  closeModal(userAccountFormModal);
  editingUserAccountId = null;
}

const userAccountFormModal = document.getElementById('userAccountFormModalOverlay');
document.getElementById('userAccountAddBtn')?.addEventListener('click', () => openUserAccountFormModal(null));
document.getElementById('userAccountFormCloseBtn')?.addEventListener('click', closeUserAccountFormModal);
document.getElementById('btnUaFormCancel')?.addEventListener('click', closeUserAccountFormModal);
userAccountFormModal?.addEventListener('click', (e) => { if (e.target === userAccountFormModal) closeUserAccountFormModal(); });

[['uaPasswordToggle', 'uaPasswordInput'], ['uaPinToggle', 'uaPinInput']].forEach(function ([btnId, inputId]) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', function () {
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(input.type === 'text'));
  });
});

document.getElementById('userAccountForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('uaNameInput').value.trim();
  const role = document.getElementById('uaRoleInput').value;
  if (!name) { showToast('Nama wajib diisi.', 'err'); return; }

  const submitBtn = document.getElementById('uaFormSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }

  const permissions = readUserAccountPermChecks();

  let result;
  if (editingUserAccountId) {
    result = await window.cloudUpdateMember(editingUserAccountId, { name, role, permissions });
  } else {
    const email = document.getElementById('uaEmailInput').value.trim();
    const password = document.getElementById('uaPasswordInput').value;
    const pin = document.getElementById('uaPinInput').value.trim();
    if (!email) { showToast('Email wajib diisi.', 'err'); resetUaSubmitBtn(); return; }
    if (password.length < 6) { showToast('Password minimal 6 karakter.', 'err'); resetUaSubmitBtn(); return; }
    if (!/^\d{6}$/.test(pin)) { showToast('PIN harus 6 digit angka.', 'err'); resetUaSubmitBtn(); return; }
    result = await window.cloudAddMember({ name, email, password, pin, role, permissions });
  }

  function resetUaSubmitBtn() {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = editingUserAccountId ? 'Simpan Perubahan' : 'Simpan User'; }
  }

  if (!result || !result.ok) {
    resetUaSubmitBtn();
    const msg = editingUserAccountId ? 'Gagal memperbarui user.' : 'Gagal menambah user.';
    if (result && result.reason === 'auth' && result.error && /already registered|already exists/i.test(result.error.message || '')) {
      showToast('Email ini sudah terdaftar. Pakai email lain.', 'err');
    } else if (result && result.reason === 'forbidden') {
      showToast('Cuma pemilik akun yang bisa mengelola User Account.', 'err');
    } else {
      showToast(msg, 'err');
    }
    return;
  }

  resetUaSubmitBtn();
  showToast(editingUserAccountId ? 'User berhasil diperbarui.' : 'User baru berhasil ditambahkan & bisa langsung login.');
  closeUserAccountFormModal();
  renderUserAccountList();
});

/* ==========================================================
   PENGATURAN > PENGATURAN — "Widget" (#widgetOverlay). Pola buka/
   tutup SAMA PERSIS dgn openUserAccountOverlay/closeUserAccountOverlay
   di atas -- halaman ini SENGAJA masih kosong (placeholder
   "empty-state"), tinggal diisi kontennya nanti. ---- */
function openWidgetOverlay() {
  document.getElementById('widgetOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeWidgetOverlay() {
  document.getElementById('widgetOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('widgetOpenBtn')?.addEventListener('click', openWidgetOverlay);
document.getElementById('widgetBackBtn')?.addEventListener('click', closeWidgetOverlay);

/* ==========================================================
   PENGATURAN > INFORMASI — "Update Version" (#updateVersionOverlay).
   Pola buka/tutup SAMA PERSIS dgn openWidgetOverlay/closeWidgetOverlay
   di atas -- halaman ini SENGAJA masih kosong (placeholder
   "empty-state"), tinggal diisi kontennya nanti. ---- */
function openUpdateVersionOverlay() {
  document.getElementById('updateVersionOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeUpdateVersionOverlay() {
  document.getElementById('updateVersionOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('updateVersionOpenBtn')?.addEventListener('click', openUpdateVersionOverlay);
document.getElementById('updateVersionBackBtn')?.addEventListener('click', closeUpdateVersionOverlay);

/* ==========================================================
   PENGATURAN > PENGATURAN — "Leaderboard" khusus menu Pengaturan
   (#settingsLeaderboardOverlay). Pola buka/tutup SAMA PERSIS dgn
   openUpdateVersionOverlay/closeUpdateVersionOverlay di atas --
   halaman ini SENGAJA masih kosong (placeholder "empty-state"),
   tinggal diisi kontennya nanti.

   CATATAN: sengaja diberi nama fungsi/id BERBEDA (prefix
   "SettingsLeaderboard...") dari openLeaderboardPage/closeLeaderboardPage
   & #leaderboardOverlay yg SUDAH ADA & berfungsi penuh (dibuka dari
   footer) di tempat lain di file ini -- supaya kedua halaman "Leaderboard"
   ini tetap berdiri sendiri-sendiri, tidak saling menimpa. ---- */
function openSettingsLeaderboardOverlay() {
  document.getElementById('settingsLeaderboardOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeSettingsLeaderboardOverlay() {
  document.getElementById('settingsLeaderboardOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('settingsLeaderboardOpenBtn')?.addEventListener('click', openSettingsLeaderboardOverlay);
document.getElementById('settingsLeaderboardBackBtn')?.addEventListener('click', closeSettingsLeaderboardOverlay);

/* ==========================================================
   PENGATURAN > PENGATURAN — "Fast Menu" (#fastMenuOverlay). Pola
   buka/tutup SAMA PERSIS dgn openWidgetOverlay/closeWidgetOverlay di
   atas -- halaman ini SENGAJA masih kosong (placeholder "empty-state"),
   tinggal diisi kontennya nanti. ---- */
function openFastMenuOverlay() {
  document.getElementById('fastMenuOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeFastMenuOverlay() {
  document.getElementById('fastMenuOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('fastMenuOpenBtn')?.addEventListener('click', openFastMenuOverlay);
document.getElementById('fastMenuBackBtn')?.addEventListener('click', closeFastMenuOverlay);

/* ---- Tombol "Lihat Semua" di kartu Fast Menu Beranda (#fastMenuHomeCard)
   -- membuka halaman Fast Menu (#fastMenuOverlay) di atas, pakai fungsi
   open yang sama dgn baris Pengaturan > Pengaturan > Fast Menu. ---- */
document.getElementById('fastMenuHomeViewAllBtn')?.addEventListener('click', openFastMenuOverlay);

/* ---- Grid "Menu Utama" di dalam halaman Fast Menu (#fastMenuGridRow) --
   tiap tombol adalah pintasan yang SAMA PERSIS dgn 6 tombol kartu Fast
   Menu Beranda (lihat listener #fmHomeAddTxBtn dst di dekat #miniAddBtn).
   Overlay ditutup dulu (closeFastMenuOverlay) baru aksinya dijalankan,
   supaya halaman/modal tujuan tidak tertutup/tertimpa oleh overlay Fast
   Menu yang masih terbuka di atasnya. ---- */
document.getElementById('fmGridAddTxBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  openAddModal();
});
document.getElementById('fmGridTagihanBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  if (window.zpShowPage) window.zpShowPage('tagihan');
});
document.getElementById('fmGridLaporanBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  if (window.zpShowPage) window.zpShowPage('laporan');
});
document.getElementById('fmGridDompetBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  if (window.zpShowPage) window.zpShowPage('dompet');
});
document.getElementById('fmGridSumberBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  openIncomeSourcePage();
});
document.getElementById('fmGridSayaBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  if (window.zpShowPage) window.zpShowPage('saya');
});

/* ---- Tombol pil "Atur Fast Menu" di footer halaman Fast Menu -- fitur
   susun-ulang pintasan belum ada, jadi sementara kasih toast info spt
   pola fitur lain yg belum jadi (mis. tiket pengaduan). ---- */
document.getElementById('fastMenuAturBtn')?.addEventListener('click', () => {
  showToast('Fitur atur Fast Menu segera hadir.');
});

/* ==========================================================
   KALKULATOR (#kalkulatorOverlay) -- pintasan baru di kartu Fast Menu
   Beranda (#fmHomeKalkulatorBtn) & grid "Menu Utama" halaman Fast Menu
   (#fmGridKalkulatorBtn). Buka/tutup pola SAMA PERSIS dgn
   openFastMenuOverlay/closeFastMenuOverlay di atas. Dibuka dari dalam
   halaman Fast Menu -> halaman Fast Menu ditutup dulu (closeFastMenuOverlay)
   supaya tombol Kembali di Kalkulator pulang ke Beranda, bukan menumpuk
   balik ke halaman Fast Menu. ---- */
function openKalkulatorOverlay() {
  document.getElementById('kalkulatorOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeKalkulatorOverlay() {
  document.getElementById('kalkulatorOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('kalkulatorBackBtn')?.addEventListener('click', closeKalkulatorOverlay);
document.getElementById('fmHomeKalkulatorBtn')?.addEventListener('click', openKalkulatorOverlay);
document.getElementById('fmGridKalkulatorBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  openKalkulatorOverlay();
});

/* ---- Mesin hitung Kalkulator -- state disimpan di objek `calcState`
   plain (bukan class), 1 listener delegasi di wrapper #calcKeypad (bukan
   per tombol) krn tombolnya banyak & seragam (lihat data-calc/data-digit/
   data-op tiap tombol di index.html). Nominal ditampilkan dgn format
   id-ID (titik ribuan, koma desimal) SAMA PERSIS dgn format nominal di
   form Tambah Transaksi/Tagihan (lihat initTxAmountFormat di atas) --
   tapi nilai mentah yg dipakai utk hitung tetap pakai '.' (standar JS),
   koma cuma dipakai di tampilan supaya konsisten dgn kebiasaan angka di
   Indonesia. */
let calcState = { current: '', previous: null, operator: null, resetNext: false, error: false };

function calcFormatDisplay(rawStr) {
  if (rawStr === '' || rawStr === undefined || rawStr === null) return '0';
  const neg = rawStr.startsWith('-');
  const body = neg ? rawStr.slice(1) : rawStr;
  const trailingDot = body.endsWith('.');
  const [intPartRaw, decPartRaw] = body.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  let out = Number(intPart).toLocaleString('id-ID');
  if (trailingDot) out += ',';
  else if (decPartRaw !== undefined) out += ',' + decPartRaw;
  return (neg ? '-' : '') + out;
}

function calcUpdateDisplay() {
  const mainEl = document.getElementById('calcDisplayMain');
  const subEl = document.getElementById('calcDisplaySub');
  if (!mainEl || !subEl) return;

  if (calcState.error) {
    mainEl.textContent = 'Tidak bisa dibagi 0';
    subEl.innerHTML = '&nbsp;';
  } else {
    const mainRaw = calcState.current !== '' ? calcState.current
      : (calcState.previous !== null ? String(calcState.previous) : '');
    mainEl.textContent = calcFormatDisplay(mainRaw);
    subEl.innerHTML = (calcState.previous !== null && calcState.operator)
      ? `${calcFormatDisplay(String(calcState.previous))} ${calcState.operator}`
      : '&nbsp;';
  }

  document.querySelectorAll('#calcKeypad .calc-btn--op').forEach(btn => {
    btn.classList.toggle('is-active', !calcState.error && calcState.resetNext && btn.dataset.op === calcState.operator);
  });
}

function calcCompute() {
  const a = calcState.previous;
  const b = parseFloat(calcState.current !== '' ? calcState.current : calcState.previous);
  if (a === null || Number.isNaN(b)) return;
  let result;
  switch (calcState.operator) {
    case '+': result = a + b; break;
    case '−': result = a - b; break;
    case '×': result = a * b; break;
    case '÷':
      if (b === 0) { calcState.error = true; calcState.current = ''; calcState.previous = null; calcState.operator = null; return; }
      result = a / b; break;
    default: return;
  }
  // Bulatkan sisa pembagian float (mis. 0.1+0.2) tanpa merusak angka besar.
  result = Math.round((result + Number.EPSILON) * 1e8) / 1e8;
  calcState.previous = result;
  calcState.current = '';
}

function calcAppendDigit(d) {
  if (calcState.error) calcClearAll();
  if (calcState.resetNext) { calcState.current = ''; calcState.resetNext = false; }
  if (calcState.current === '0') calcState.current = '';
  const digitCount = calcState.current.replace(/[-.]/g, '').length;
  if (digitCount >= 15) return;
  calcState.current += d;
  calcUpdateDisplay();
}

function calcAppendDecimal() {
  if (calcState.error) calcClearAll();
  if (calcState.resetNext) { calcState.current = ''; calcState.resetNext = false; }
  if (calcState.current === '') calcState.current = '0';
  if (!calcState.current.includes('.')) calcState.current += '.';
  calcUpdateDisplay();
}

function calcSetOperator(op) {
  if (calcState.error) calcClearAll();
  if (calcState.current === '' && calcState.previous === null) return;
  if (calcState.operator && !calcState.resetNext) {
    calcCompute();
  } else if (calcState.current !== '') {
    calcState.previous = parseFloat(calcState.current);
    calcState.current = '';
  }
  calcState.operator = op;
  calcState.resetNext = true;
  calcUpdateDisplay();
}

function calcEquals() {
  if (calcState.error) return;
  if (calcState.operator === null || calcState.previous === null) return;
  calcCompute();
  calcState.operator = null;
  calcState.resetNext = true;
  calcUpdateDisplay();
}

function calcPercent() {
  if (calcState.error) calcClearAll();
  if (calcState.current === '' && calcState.previous === null) return;
  const base = calcState.current !== '' ? parseFloat(calcState.current) : calcState.previous;
  const val = (calcState.previous !== null && calcState.operator)
    ? calcState.previous * (base / 100)
    : base / 100;
  calcState.current = String(val);
  calcUpdateDisplay();
}

function calcBackspace() {
  if (calcState.error) { calcClearAll(); return; }
  if (calcState.resetNext || calcState.current === '') return;
  calcState.current = calcState.current.slice(0, -1);
  calcUpdateDisplay();
}

function calcClearAll() {
  calcState = { current: '', previous: null, operator: null, resetNext: false, error: false };
  calcUpdateDisplay();
}

document.getElementById('calcKeypad')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-calc]');
  if (!btn) return;
  const action = btn.dataset.calc;
  if (action === 'digit') calcAppendDigit(btn.dataset.digit);
  else if (action === 'decimal') calcAppendDecimal();
  else if (action === 'op') calcSetOperator(btn.dataset.op);
  else if (action === 'equals') calcEquals();
  else if (action === 'percent') calcPercent();
  else if (action === 'back') calcBackspace();
  else if (action === 'clear') calcClearAll();
});
// Reset kalkulator tiap kali halamannya ditutup, supaya user berikutnya
// selalu mulai dari layar bersih ("0") -- bukan nyisa hitungan terakhir.
document.getElementById('kalkulatorBackBtn')?.addEventListener('click', calcClearAll);

/* ==========================================================
   KURS MATA UANG (#kursOverlay) -- pintasan baru di kartu Fast Menu
   Beranda (#fmHomeKursBtn) & grid "Menu Utama" halaman Fast Menu
   (#fmGridKursBtn). Buka/tutup pola SAMA PERSIS dgn
   openKalkulatorOverlay/closeKalkulatorOverlay di atas. Dibuka dari
   dalam halaman Fast Menu -> halaman Fast Menu ditutup dulu supaya
   tombol Kembali di sini pulang ke Beranda, bukan menumpuk balik ke
   halaman Fast Menu (pola sama persis dgn Kalkulator).

   Datanya REAL-TIME dari API yang SAMA dgn banner beranda
   (open.er-api.com, lihat fetchUsdIdrRate/fxBaseRate di atas) --
   bedanya di sini basisnya IDR (bukan USD) & diambil SEKALI per sesi
   (+ tombol Refresh manual, + auto-refresh 5 menit spt banner), krn
   satu response dgn basis IDR sudah memuat kurs SEMUA mata uang
   sekaligus (rates[X] = berapa X per 1 Rupiah) -- jadi kurs pasangan
   mana pun (mis. USD -> SGD) bisa dihitung dari 1 response itu saja
   tanpa fetch ulang tiap kali user ganti pilihan "Dari"/"Ke":
     amount(A->B) = amount * rates[B] / rates[A]
   (karena rates['IDR'] selalu 1, rumus ini otomatis benar juga utk
   pasangan yg melibatkan IDR langsung). ---- */
const KURS_CURRENCIES = [
  { code: 'IDR', name: 'Rupiah Indonesia' },
  { code: 'USD', name: 'Dolar Amerika Serikat' },
  { code: 'EUR', name: 'Euro' },
  { code: 'SGD', name: 'Dolar Singapura' },
  { code: 'MYR', name: 'Ringgit Malaysia' },
  { code: 'JPY', name: 'Yen Jepang' },
  { code: 'GBP', name: 'Poundsterling Inggris' },
  { code: 'AUD', name: 'Dolar Australia' },
  { code: 'CNY', name: 'Yuan Tiongkok' },
  { code: 'KRW', name: 'Won Korea Selatan' },
  { code: 'THB', name: 'Baht Thailand' },
  { code: 'HKD', name: 'Dolar Hong Kong' },
  { code: 'CHF', name: 'Franc Swiss' },
  { code: 'SAR', name: 'Riyal Arab Saudi' },
  { code: 'AED', name: 'Dirham Uni Emirat Arab' },
  { code: 'INR', name: 'Rupee India' },
];
// Daftar kartu "Kurs Populer" (terhadap Rupiah) -- subset dari
// KURS_CURRENCIES di atas, tanpa IDR sendiri.
const KURS_POPULER_CODES = ['USD', 'EUR', 'SGD', 'MYR', 'JPY', 'GBP', 'AUD', 'CNY'];

let kursRatesIDR = null;   // { USD: 0.0000564, EUR: ..., IDR: 1, ... } -- basis IDR
let kursLastUpdateLabel = '';
let kursFetching = false;
let kursFetchFailed = false;
let kursRefreshInterval = null;

function kursFormatRateNumber(n) {
  // Angka kurs bisa sangat kecil (mis. JPY per Rupiah) atau besar (Rupiah
  // per USD) -- pakai jumlah desimal yg menyesuaikan besar-kecilnya
  // angka supaya tidak membulat jadi 0 utk mata uang yg nilainya kecil.
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const decimals = abs === 0 ? 0 : abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function kursPopulateSelects() {
  const fromSel = document.getElementById('kursFromSelect');
  const toSel = document.getElementById('kursToSelect');
  if (!fromSel || !toSel || fromSel.options.length) return; // sudah diisi sebelumnya
  const optsHtml = KURS_CURRENCIES.map(c => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
  fromSel.innerHTML = optsHtml;
  toSel.innerHTML = optsHtml;
  fromSel.value = 'USD';
  toSel.value = 'IDR';
}

function kursRenderPopulerSkeleton() {
  const grid = document.getElementById('kursPopulerGrid');
  if (!grid) return;
  grid.innerHTML = KURS_POPULER_CODES.map(() => `
    <div class="kurs-populer-item is-skeleton">
      <span class="kurs-populer-flag">&nbsp;</span>
      <div class="kurs-populer-main">
        <div class="kurs-populer-code">&nbsp;</div>
        <div class="kurs-populer-rate">&nbsp;</div>
      </div>
    </div>`).join('');
}

function kursRenderPopuler() {
  const grid = document.getElementById('kursPopulerGrid');
  if (!grid) return;
  if (!kursRatesIDR) { kursRenderPopulerSkeleton(); return; }
  grid.innerHTML = KURS_POPULER_CODES.map(code => {
    const rate = kursRatesIDR[code];
    const idrPerUnit = rate ? 1 / rate : null;
    const rateLabel = idrPerUnit != null ? `Rp ${kursFormatRateNumber(idrPerUnit)}` : 'Tidak tersedia';
    return `
      <div class="kurs-populer-item">
        <span class="kurs-populer-flag">${code.slice(0, 2)}</span>
        <div class="kurs-populer-main">
          <div class="kurs-populer-code">1 ${code}</div>
          <div class="kurs-populer-rate">${rateLabel}</div>
        </div>
      </div>`;
  }).join('');
}

function kursUpdateResult() {
  const resultEl = document.getElementById('kursResultDisplay');
  const metaEl = document.getElementById('kursMetaUpdated');
  if (!resultEl) return;
  const fromCode = document.getElementById('kursFromSelect')?.value;
  const toCode = document.getElementById('kursToSelect')?.value;
  const amountRaw = document.getElementById('kursAmountInput')?.value ?? '';
  const amount = parseFloat(String(amountRaw).replace(/\./g, '').replace(',', '.'));

  if (!kursRatesIDR) {
    resultEl.textContent = kursFetchFailed ? 'Kurs tidak tersedia' : 'Memuat kurs…';
    if (metaEl) metaEl.textContent = kursFetchFailed
      ? 'Gagal mengambil kurs terbaru. Coba tekan Refresh.'
      : 'Mengambil kurs terbaru…';
    return;
  }
  if (!Number.isFinite(amount) || !fromCode || !toCode) {
    resultEl.textContent = '-';
    return;
  }
  const rFrom = kursRatesIDR[fromCode];
  const rTo = kursRatesIDR[toCode];
  if (!rFrom || !rTo) {
    resultEl.textContent = 'Mata uang tidak didukung';
    return;
  }
  const converted = amount * (rTo / rFrom);
  resultEl.textContent = `${kursFormatRateNumber(converted)} ${toCode}`;
  if (metaEl) metaEl.textContent = `Kurs terakhir diperbarui ${kursLastUpdateLabel} · sumber open.er-api.com`;
}

async function kursFetchRates(showToastOnError = false) {
  if (kursFetching) return;
  kursFetching = true;
  const refreshBtn = document.getElementById('kursRefreshBtn');
  refreshBtn?.classList.add('spinning');
  refreshBtn?.setAttribute('disabled', 'true');
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/IDR');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    if (!data || !data.rates || !data.rates.USD) throw new Error('no rates');
    kursRatesIDR = data.rates;
    kursFetchFailed = false;
    kursLastUpdateLabel = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    kursFetchFailed = true;
    if (showToastOnError) showToast('Gagal mengambil kurs terbaru. Periksa koneksi internet.', 'err');
  } finally {
    kursFetching = false;
    refreshBtn?.classList.remove('spinning');
    refreshBtn?.removeAttribute('disabled');
    kursRenderPopuler();
    kursUpdateResult();
  }
}

let kursInited = false;
function kursInitOnce() {
  if (kursInited) return;
  kursInited = true;
  kursPopulateSelects();
  kursRenderPopulerSkeleton();

  document.getElementById('kursFromSelect')?.addEventListener('change', kursUpdateResult);
  document.getElementById('kursToSelect')?.addEventListener('change', kursUpdateResult);
  document.getElementById('kursAmountInput')?.addEventListener('input', kursUpdateResult);
  document.getElementById('kursRefreshBtn')?.addEventListener('click', () => kursFetchRates(true));
  document.getElementById('kursSwapBtn')?.addEventListener('click', () => {
    const fromSel = document.getElementById('kursFromSelect');
    const toSel = document.getElementById('kursToSelect');
    if (!fromSel || !toSel) return;
    const tmp = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = tmp;
    kursUpdateResult();
  });

  kursFetchRates();
  // Auto-refresh berkala spt banner beranda (lihat initBannerFx), tapi
  // cuma jalan selagi halaman Kurs ini sedang terbuka -- dihentikan lagi
  // saat ditutup lewat closeKursOverlay, supaya tidak terus polling API
  // di belakang layar padahal user sudah pindah halaman.
}

function openKursOverlay() {
  document.getElementById('kursOverlay')?.classList.add('open');
  lockBodyScroll();
  kursInitOnce();
  kursUpdateResult();
  if (!kursRefreshInterval) {
    kursRefreshInterval = setInterval(() => kursFetchRates(), 5 * 60 * 1000);
  }
}
function closeKursOverlay() {
  document.getElementById('kursOverlay')?.classList.remove('open');
  unlockBodyScroll();
  if (kursRefreshInterval) {
    clearInterval(kursRefreshInterval);
    kursRefreshInterval = null;
  }
}
document.getElementById('kursBackBtn')?.addEventListener('click', closeKursOverlay);
document.getElementById('fmHomeKursBtn')?.addEventListener('click', openKursOverlay);
document.getElementById('fmGridKursBtn')?.addEventListener('click', () => {
  closeFastMenuOverlay();
  openKursOverlay();
});

/* ==========================================================
   PENGATURAN > PENGATURAN — "Sumber Dana Utama"
   (#sumberDanaUtamaOverlay). Pola buka/tutup SAMA PERSIS dgn
   openFastMenuOverlay/closeFastMenuOverlay di atas -- halaman ini
   SENGAJA masih kosong (placeholder "empty-state"), tinggal diisi
   kontennya nanti. ---- */
function openSumberDanaUtamaOverlay() {
  document.getElementById('sumberDanaUtamaOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeSumberDanaUtamaOverlay() {
  document.getElementById('sumberDanaUtamaOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('sumberDanaUtamaOpenBtn')?.addEventListener('click', openSumberDanaUtamaOverlay);
document.getElementById('sumberDanaUtamaBackBtn')?.addEventListener('click', closeSumberDanaUtamaOverlay);

/* ==========================================================
   PENGATURAN > NOTIFIKASI — "Pemberitahuan Promosi"
   (#pemberitahuanPromosiOverlay). Pola buka/tutup SAMA PERSIS dgn
   openSumberDanaUtamaOverlay/closeSumberDanaUtamaOverlay di atas --
   halaman ini SENGAJA masih kosong (placeholder "empty-state"),
   tinggal diisi kontennya nanti. ---- */
function openPemberitahuanPromosiOverlay() {
  document.getElementById('pemberitahuanPromosiOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closePemberitahuanPromosiOverlay() {
  document.getElementById('pemberitahuanPromosiOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('pemberitahuanPromosiOpenBtn')?.addEventListener('click', openPemberitahuanPromosiOverlay);
document.getElementById('pemberitahuanPromosiBackBtn')?.addEventListener('click', closePemberitahuanPromosiOverlay);

/* ==========================================================
   PENGATURAN > KONTAK — Pusat Bantuan (#bantuanOverlay).
   Pola buka/tutup SAMA PERSIS dgn openDataDiriOverlay/closeDataDiriOverlay
   di atas. Selain itu ada 2 fitur kecil yg beneran jalan (bukan cuma
   tampilan): accordion FAQ (buka/tutup per pertanyaan) & kolom
   pencarian di hero yg menyaring baris "Pengaduan & Pertanyaan Umum"
   + daftar FAQ sekaligus berdasarkan kata kunci yg diketik. ---- */
function openBantuanOverlay() {
  document.getElementById('bantuanOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeBantuanOverlay() {
  document.getElementById('bantuanOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('bantuanOpenBtn')?.addEventListener('click', openBantuanOverlay);
document.getElementById('bantuanBackBtn')?.addEventListener('click', closeBantuanOverlay);

function initBantuanPage() {
  const faqToggleBtn = document.getElementById('bantuanFaqToggleBtn');
  const faqList = document.getElementById('bantuanFaqList');
  const faqItems = Array.from(document.querySelectorAll('#bantuanFaqList .bantuan-faq-item'));
  const searchInput = document.getElementById('bantuanSearchInput');
  const umumRows = Array.from(document.querySelectorAll('#bantuanUmumSection .bantuan-row'));
  const emptyState = document.getElementById('bantuanEmptyState');

  // Baris "FAQ": buka/tutup seluruh daftar accordion di bawahnya.
  faqToggleBtn?.addEventListener('click', () => {
    const willOpen = faqList.hasAttribute('hidden');
    faqList.toggleAttribute('hidden', !willOpen);
    faqToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  // Tiap pertanyaan FAQ: buka/tutup jawabannya sendiri-sendiri, tidak
  // saling menutup satu sama lain (bisa beberapa terbuka sekaligus).
  faqItems.forEach((item) => {
    item.querySelector('.bantuan-faq-q')?.addEventListener('click', () => {
      item.classList.toggle('open');
    });
  });

  // Placeholder untuk "Ajukan Pengaduan" & "Pantau Pengaduan": belum
  // ada backend tiket sungguhan di app ini, jadi sementara cukup
  // diarahkan lewat toast + kanal kontak di bawah (WhatsApp/Email),
  // konsisten dgn pola baris "belum difungsikan" lain di app ini.
  document.getElementById('bantuanAjukanBtn')?.addEventListener('click', () => {
    showToast('Fitur tiket pengaduan segera hadir. Sementara, hubungi kami lewat WhatsApp atau Email di bawah ya.');
  });
  document.getElementById('bantuanPantauBtn')?.addEventListener('click', () => {
    showToast('Fitur pantau status tiket segera hadir.');
  });

  // Kolom pencarian di hero: menyaring baris "Pengaduan & Pertanyaan
  // Umum" (dari judul+deskripsinya) sekaligus daftar FAQ (dari
  // data-faq-q, ditambah pertanyaan & jawabannya) berdasarkan kata
  // kunci yg diketik. Kalau ada hasil dari FAQ, daftarnya otomatis
  // dibuka supaya tidak perlu tekan "FAQ" dulu.
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let anyVisible = false;

    umumRows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const match = !q || text.includes(q);
      row.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });

    let anyFaqMatch = false;
    faqItems.forEach((item) => {
      const haystack = (item.dataset.faqQ || '') + ' ' + item.textContent.toLowerCase();
      const match = !q || haystack.toLowerCase().includes(q);
      item.toggleAttribute('hidden', !match);
      if (match) { anyFaqMatch = true; anyVisible = true; }
    });

    if (q && anyFaqMatch) {
      faqList.removeAttribute('hidden');
      faqToggleBtn?.setAttribute('aria-expanded', 'true');
    } else if (!q) {
      faqList.setAttribute('hidden', '');
      faqToggleBtn?.setAttribute('aria-expanded', 'false');
      faqItems.forEach((item) => item.classList.remove('open'));
    }

    emptyState?.toggleAttribute('hidden', anyVisible || !q);
  });
}
initBantuanPage();

/* ==========================================================
   PENGATURAN > INFORMASI — "Tentang" (#tentangOverlay) & 2 halaman
   detailnya, "Kebijakan Privasi" (#tentangPrivasiOverlay) & "Syarat &
   Ketentuan" (#tentangSyaratOverlay). Pola buka/tutup SAMA PERSIS dgn
   openBantuanOverlay/closeBantuanOverlay di atas. Dari daftar
   #tentangOverlay, menekan salah satu baris membuka overlay detailnya
   MENUMPUK di atas #tentangOverlay (bukan menggantikannya) supaya
   saat ditutup, pengguna kembali ke daftar "Tentang", bukan langsung
   ke Pengaturan -- niru alur "halaman di dalam halaman" pada gambar
   referensi. ---- */
function openTentangOverlay() {
  document.getElementById('tentangOverlay')?.classList.add('open');
  lockBodyScroll();
}
function closeTentangOverlay() {
  document.getElementById('tentangOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('tentangOpenBtn')?.addEventListener('click', openTentangOverlay);
document.getElementById('tentangBackBtn')?.addEventListener('click', closeTentangOverlay);

function openTentangPrivasiOverlay() {
  document.getElementById('tentangPrivasiOverlay')?.classList.add('open');
}
function closeTentangPrivasiOverlay() {
  document.getElementById('tentangPrivasiOverlay')?.classList.remove('open');
}
document.getElementById('tentangPrivasiOpenBtn')?.addEventListener('click', openTentangPrivasiOverlay);
document.getElementById('tentangPrivasiBackBtn')?.addEventListener('click', closeTentangPrivasiOverlay);

function openTentangSyaratOverlay() {
  document.getElementById('tentangSyaratOverlay')?.classList.add('open');
}
function closeTentangSyaratOverlay() {
  document.getElementById('tentangSyaratOverlay')?.classList.remove('open');
}
document.getElementById('tentangSyaratOpenBtn')?.addEventListener('click', openTentangSyaratOverlay);
document.getElementById('tentangSyaratBackBtn')?.addEventListener('click', closeTentangSyaratOverlay);

/* ==========================================================
   PENGATURAN > PENGATURAN — "Manajemen Device" (#manajemenDeviceOverlay).
   Fitur ini menampilkan daftar perangkat/browser yang pernah dipakai
   membuka ZAYAIN dgn akun yang sedang login, mengikuti struktur
   referensi (kartu profil + kartu ringkasan & daftar perangkat + FAQ +
   Ketentuan) yang sudah disesuaikan ke konteks ZAYAIN (bukan app
   VIP/streaming). Alurnya:

   1. Tiap perangkat/browser punya ID acak sendiri yg dibuat SEKALI &
      disimpan murni lokal (localStorage biasa, BUKAN cloudStorage --
      lihat deviceMgmtGetLocalId()) supaya ID ini TIDAK ikut sinkron
      antar perangkat (kalau ikut sinkron, semua perangkat akan
      dianggap 1 perangkat yg sama, salah total).
   2. Daftar SELURUH perangkat (nama, waktu aktif terakhir, dst) itu
      sendiri DIsimpan lewat cloudStorage di bawah key
      STORAGE_KEY_DEVICE_SESSIONS -- kalau user sedang login akun
      cloud, daftar ini otomatis tersinkron & sama persis di semua
      perangkat yg login dgn akun yg sama (persis cara kerja
      "Manajemen Device" pada umumnya). Kalau belum login, daftar ini
      cuma tersimpan lokal & isinya cuma perangkat ini sendiri.
   3. Setiap overlay ini dibuka (atau tombol refresh ditekan),
      deviceMgmtTouchThisDevice() mendaftarkan/memperbarui entri
      perangkat ini (label browser+OS, waktu aktif) di daftar, baru
      renderDeviceMgmtPage() menggambar ulang seluruh kartu.
========================================================== */
const DEVICE_MGMT_LOCAL_ID_KEY = 'zayapro_this_device_id';
const STORAGE_KEY_DEVICE_SESSIONS = 'zayapro_device_sessions_v1';
const DEVICE_MGMT_MAX_SLOTS = 5;
const DEVICE_MGMT_ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 menit -> dianggap "Online"

// ID perangkat ini sendiri -- SENGAJA baca/tulis langsung ke
// `localStorage` (bukan `cloudStorage`) supaya murni lokal per
// browser, tidak pernah ikut terdorong ke kv_store/perangkat lain.
function deviceMgmtGetLocalId() {
  let id = localStorage.getItem(DEVICE_MGMT_LOCAL_ID_KEY);
  if (!id) {
    id = 'dev_' + cryptoId();
    localStorage.setItem(DEVICE_MGMT_LOCAL_ID_KEY, id);
  }
  return id;
}

// Peta kode model Android -> nama merek, dipakai deviceMgmtGuessAndroidBrand()
// di bawah -- daftar heuristik "cukup umum" (bukan library khusus spt
// device-detector.js), cukup utk kasus mayoritas HP yang beredar di
// Indonesia. Urutan pengecekan penting: prefix yang lebih SPESIFIK
// (mis. "POCO"/"Redmi", sub-brand Xiaomi) ditaruh SEBELUM prefix umum
// (mis. "Mi ") supaya tidak salah ke-generalisir ke induknya duluan.
const ANDROID_BRAND_RULES = [
  { re: /^SM-|^GT-/i, brand: 'Samsung' },
  { re: /^Pixel/i, brand: 'Google' },
  { re: /^POCO/i, brand: 'POCO' },
  { re: /^Redmi/i, brand: 'Redmi' },
  { re: /^Mi\s|^MI\s|^M20\d{2}/i, brand: 'Xiaomi' },
  { re: /^RMX/i, brand: 'Realme' },
  { re: /^CPH/i, brand: 'Oppo' },
  { re: /^V\d{4}/i, brand: 'vivo' },
  { re: /^ONEPLUS|^GM1|^KB20|^LE22|^CPH1|^CPH2/i, brand: 'OnePlus' },
  { re: /^ASUS/i, brand: 'Asus' },
  { re: /^Infinix/i, brand: 'Infinix' },
  { re: /^TECNO/i, brand: 'Tecno' },
  { re: /^itel/i, brand: 'Itel' },
  { re: /^moto\s|^Moto\s|^XT\d{4}/i, brand: 'Motorola' },
  { re: /^HUAWEI|^ANE-|^VOG-|^ELE-|^HMA-/i, brand: 'Huawei' },
  { re: /^LM-|^LG-/i, brand: 'LG' },
  { re: /^SH-|^SO-/i, brand: 'Sony' },
  { re: /^Nokia/i, brand: 'Nokia' },
];

// Coba tebak kode model Android dari User-Agent, mis. UA mengandung
// "...; Android 13; SM-A536E Build/TP1A...)" -> model = "SM-A536E".
// SENGAJA "best-effort", bukan jaminan akurat: sejak beberapa versi
// Chrome terbaru menerapkan "User-Agent Reduction" (kebijakan privasi
// Google sendiri), sebagian UA Android modern SUDAH TIDAK menyertakan
// kode model lagi -- kalau itu terjadi, fungsi ini mengembalikan null
// & pemanggilnya otomatis jatuh balik ke label umum "Android" saja
// (persis perilaku SEBELUM fitur ini ada, tidak ada yang rusak).
// Dipisah dari deviceMgmtGuessAndroidBrand() di bawah (SEBELUMNYA logic ini
// nempel jadi satu dgn parsing regex User-Agent) supaya bisa dipakai ULANG
// oleh deviceMgmtEnrichThisDeviceModel() (Client Hints) juga -- kode model
// mentah bisa datang dari DUA sumber berbeda (tebakan regex UA string, atau
// nilai "model" dari navigator.userAgentData yg lebih akurat), tapi
// pencocokan ke ANDROID_BRAND_RULES-nya sama persis utk keduanya.
function deviceMgmtMatchBrandRule(rawModel) {
  // Sebagian UA menaruh "wv" (WebView) atau kode bahasa (mis. "K")
  // menggantikan model kalau device policy-nya menyembunyikan model --
  // buang hasil yang jelas bukan kode model asli.
  if (!rawModel || /^wv$/i.test(rawModel) || rawModel.length < 3) return null;
  const rule = ANDROID_BRAND_RULES.find((r) => r.re.test(rawModel));
  if (!rule) return { model: rawModel, brand: null };
  // Sebagian kode model SUDAH menyertakan nama mereknya sendiri (mis.
  // "Redmi Note 11", "POCO X5 5G") -- kalau digabung mentah2 dgn
  // rule.brand di pemanggilnya, hasilnya dobel ("Redmi Redmi Note 11").
  // Guard ini mengecek apakah rawModel SUDAH diawali nama merek; kalau
  // sudah, "brand" dikosongkan supaya pemanggil cukup pakai rawModel
  // apa adanya (lihat deviceMgmtDetectDetails()).
  const alreadyHasBrand = new RegExp('^' + rule.brand, 'i').test(rawModel);
  return { model: rawModel, brand: alreadyHasBrand ? null : rule.brand };
}

function deviceMgmtGuessAndroidBrand(ua) {
  const match = ua.match(/Android\s+[\d.]+\s*;\s*([^;)]+?)\s*(?:Build\/|\))/i);
  const rawModel = match ? match[1].trim() : '';
  return deviceMgmtMatchBrandRule(rawModel);
}

// Parser User-Agent SEDERHANA (cukup utk label "Browser on OS", tidak
// perlu akurat 100% seperti library khusus) -- dipakai jg utk memilih
// ikon (desktop/mobile) & badge tipe perangkat. Utk Android, dicoba jg
// baca merek/kode model (lihat deviceMgmtGuessAndroidBrand() di atas)
// supaya labelnya lebih spesifik drpd cuma "Android" polos -- iOS/iPadOS
// & desktop SENGAJA tetap generik (browser+OS saja), krn Apple tidak
// menyertakan model di UA sama sekali (dibatasi demi privasi, bukan
// keterbatasan parser ini) & "merek" tidak relevan utk desktop.
// Ganti nama dari deviceMgmtDetectLabel() -> deviceMgmtDetectDetails():
// SEKARANG mengembalikan rincian browser+versi & OS+versi+model
// terpisah (bukan cuma satu string "Browser on OS" polos), supaya
// popup detail perangkat (lihat openDeviceDetailSheet()) bisa
// menampilkan baris "Browser" & "Sistem" masing2 dgn versi yg jelas,
// bukan cuma gabungan singkat. `label` ringkas ("Browser on OS") tetap
// disertakan krn masih dipakai sbg judul baris di daftar perangkat.
function deviceMgmtDetectDetails() {
  const ua = navigator.userAgent || '';
  let m;

  // ---- Browser + nomor versi ----
  let browser = 'Browser', browserVersion = '';
  if ((m = ua.match(/Edg\/([\d.]+)/))) { browser = 'Edge'; browserVersion = m[1]; }
  else if ((m = ua.match(/OPR\/([\d.]+)/))) { browser = 'Opera'; browserVersion = m[1]; }
  else if ((m = ua.match(/FxiOS\/([\d.]+)/))) { browser = 'Firefox'; browserVersion = m[1]; }
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) { browser = 'Firefox'; browserVersion = m[1]; }
  else if ((m = ua.match(/CriOS\/([\d.]+)/))) { browser = 'Chrome'; browserVersion = m[1]; }
  else if (!/Edg\//.test(ua) && (m = ua.match(/Chrome\/([\d.]+)/))) { browser = 'Chrome'; browserVersion = m[1]; }
  else if (/Safari\//.test(ua) && (m = ua.match(/Version\/([\d.]+)/))) { browser = 'Safari'; browserVersion = m[1]; }

  // ---- OS + nomor versi + model perangkat (kalau ada) ----
  let os = 'Perangkat', osVersion = '', deviceModel = '';
  let isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua);
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    osVersion = m[1];
    // Windows 11 SENGAJA masih melapor "NT 10.0" di User-Agent (Microsoft
    // tidak menaikkan angka NT-nya) -- browser TIDAK menyediakan cara
    // pasti membedakan 10 vs 11 murni dari UA, jadi label ini SENGAJA
    // ditulis "10/11" apa adanya drpd menebak salah satu.
    os = (m[1] === '10.0') ? 'Windows 10/11' : 'Windows';
  } else if (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) {
    os = 'macOS';
    if ((m = ua.match(/Mac OS X ([\d_]+)/))) osVersion = m[1].replace(/_/g, '.');
  } else if (/Android/.test(ua)) {
    os = 'Android';
    if ((m = ua.match(/Android\s+([\d.]+)/))) osVersion = m[1];
    const guess = deviceMgmtGuessAndroidBrand(ua);
    if (guess) deviceModel = guess.brand ? `${guess.brand} ${guess.model}` : guess.model;
  } else if (/iPhone/.test(ua)) {
    os = 'iOS';
    if ((m = ua.match(/OS ([\d_]+) like Mac OS X/))) osVersion = m[1].replace(/_/g, '.');
    deviceModel = 'iPhone';
  } else if (/iPad/.test(ua)) {
    os = 'iPadOS';
    if ((m = ua.match(/OS ([\d_]+) like Mac OS X/))) osVersion = m[1].replace(/_/g, '.');
    deviceModel = 'iPad';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  const browserLabel = browserVersion ? `${browser} ${browserVersion}` : browser;
  const osLabel = osVersion ? `${os} ${osVersion}` : os;
  // Judul baris di daftar SEKARANG pakai nama merek+model perangkat (mis.
  // "Samsung SM-A536E") kalau berhasil terbaca -- jauh lebih gampang
  // dikenali user drpd cuma "Chrome on Android" generik. Info browser tetap
  // ditampilkan, cuma dipindah jadi info sekunder di baris meta (lihat
  // renderDeviceMgmtPage()) & baris "Browser" tersendiri di popup detail.
  // Kalau model tidak berhasil terbaca sama sekali (mis. iOS/desktop, atau
  // Android yg UA-nya sudah "dibekukan" & Client Hints juga tidak tersedia),
  // fallback ke label lama apa adanya.
  const label = deviceModel || `${browser} on ${os}`;

  return {
    label,
    isMobile, browser, browserVersion, browserLabel, os, osVersion, osLabel, deviceModel,
  };
}

// ---- Lookup IP publik + perkiraan lokasi (kota/wilayah/negara) ----
// SENGAJA pakai lookup berbasis-IP (bukan navigator.geolocation/GPS):
// (1) tidak perlu izin lokasi yang mengganggu cuma utk melihat daftar
// perangkat sendiri, (2) tetap bisa dipakai utk device desktop yang
// biasanya tidak punya GPS sama sekali. KONSEKUENSINYA: hasil ini
// PERKIRAAN, bukan titik GPS presisi -- bisa meleset (kadang sampai
// beda kota) terutama di jaringan seluler/VPN/proxy krn ISP sering
// me-routing IP publik lewat gateway yg jauh dari lokasi fisik asli.
// Ini SENGAJA dijelaskan apa adanya ke user lewat catatan di popup
// detail perangkat (lihat #deviceDetailNote di index.html), bukan
// diklaim "akurat" begitu saja.
// Cache jadi 1x per pemuatan halaman (bukan tiap heartbeat 60 detik)
// supaya tidak membombardir API pihak ketiga gratis yang dipakai &
// berisiko kena rate-limit.
let deviceMgmtIpInfoPromise = null;
function deviceMgmtFetchIpInfo() {
  if (deviceMgmtIpInfoPromise) return deviceMgmtIpInfoPromise;
  deviceMgmtIpInfoPromise = fetch('https://ipapi.co/json/')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Lookup IP gagal: HTTP ' + r.status))))
    .then((data) => {
      if (data && data.error) throw new Error(data.reason || 'Lookup IP menolak permintaan');
      return {
        ip: data.ip || null,
        city: data.city || null,
        region: data.region || null,
        country: data.country_name || null,
      };
    })
    .catch((e) => {
      console.error('Gagal mengambil alamat IP/lokasi:', e);
      return null; // gagal -> field ip/lokasi TETAP kosong, jangan diisi tebakan
    });
  return deviceMgmtIpInfoPromise;
}

// Perbarui entri perangkat INI di daftar dgn hasil lookup IP/lokasi
// di atas. Dijalankan cuma SEKALI per pemuatan halaman (lihat
// deviceMgmtStartHeartbeat()), terpisah dari heartbeat "lastActive"
// yg jalan tiap menit, supaya tidak spam request ke API lookup.
let deviceMgmtIpEnrichStarted = false;
async function deviceMgmtEnrichThisDeviceIpLocation() {
  if (deviceMgmtIpEnrichStarted) return;
  deviceMgmtIpEnrichStarted = true;
  const info = await deviceMgmtFetchIpInfo();
  if (!info) return;
  const id = deviceMgmtGetLocalId();
  const list = deviceMgmtLoadSessions();
  const entry = list.find((d) => d.id === id);
  if (!entry) return; // belum pernah "touch" sekalipun -- lewati, biar heartbeat berikutnya yg bikin entrinya dulu
  entry.ip = info.ip;
  entry.city = info.city;
  entry.region = info.region;
  entry.country = info.country;
  deviceMgmtPersistSessions(list);
  if (document.getElementById('manajemenDeviceOverlay')?.classList.contains('open')) {
    renderDeviceMgmtPage();
  }
}

// ---- Client Hints (navigator.userAgentData) utk model perangkat Android
// yg LEBIH AKURAT drpd cuma tebak dari string User-Agent ----
// Chrome versi baru menerapkan "User-Agent Reduction": string UA biasa (yg
// dipakai deviceMgmtGuessAndroidBrand() di atas) di BANYAK perangkat SUDAH
// TIDAK menyertakan kode model asli lagi (cuma "Android 10; K" generik),
// sehingga kolom "Model perangkat"/judul kartu sering muncul kosong/generik
// padahal browsernya sendiri (Chrome/Edge/Opera & browser berbasis Chromium
// lain) SEBENARNYA masih tahu model aslinya lewat API terpisah ini -- API
// Client Hints SENGAJA tidak ikut "dibekukan" seperti UA string biasa,
// justru dibuat khusus utk kasus spt ini. Safari & Firefox TIDAK mendukung
// API ini sama sekali -- di situ fallback ke tebakan dari UA string
// (deviceMgmtGuessAndroidBrand, sudah ada sebelumnya) TETAP jadi satu2nya
// cara, jadi ini murni "peningkatan kalau tersedia", bukan pengganti total.
// Dicache 1x per pemuatan halaman, sama spt lookup IP di atas -- nilainya
// tidak berubah selama sesi ini jadi tidak perlu dipanggil berulang.
let deviceMgmtClientHintsPromise = null;
function deviceMgmtFetchClientHintsModel() {
  if (deviceMgmtClientHintsPromise) return deviceMgmtClientHintsPromise;
  if (!navigator.userAgentData || typeof navigator.userAgentData.getHighEntropyValues !== 'function') {
    deviceMgmtClientHintsPromise = Promise.resolve(null);
    return deviceMgmtClientHintsPromise;
  }
  deviceMgmtClientHintsPromise = navigator.userAgentData.getHighEntropyValues(['model'])
    .then((ch) => (ch && ch.model) ? ch.model.trim() : null)
    .catch((e) => {
      // Browser menolak permintaan (jarang terjadi) -- anggap saja tidak
      // tersedia, biarkan fallback tebakan dari UA string yg sudah ada
      // dipakai apa adanya, jangan sampai fitur lain ikut gagal gara2 ini.
      console.error('Gagal membaca Client Hints model perangkat:', e);
      return null;
    });
  return deviceMgmtClientHintsPromise;
}

// Perbarui entri perangkat INI dgn model dari Client Hints di atas, kalau
// tersedia -- dijalankan sekali per pemuatan halaman (dipanggil dari
// deviceMgmtStartHeartbeat(), sama spt lookup IP), plus diulang manual tiap
// tombol refresh ditekan (lihat listener #deviceMgmtRefreshBtn) supaya klik
// refresh tidak sia-sia kalau lookup pertama tadi ternyata gagal/belum
// sempat kepakai (mis. `entry` belum ada saat app baru dibuka).
let deviceMgmtModelEnrichStarted = false;
async function deviceMgmtEnrichThisDeviceModel() {
  if (deviceMgmtModelEnrichStarted) return;
  deviceMgmtModelEnrichStarted = true;
  const rawModel = await deviceMgmtFetchClientHintsModel();
  if (!rawModel) return; // tidak didukung/gagal -- biarkan hasil tebakan UA string yg lama apa adanya
  const guess = deviceMgmtMatchBrandRule(rawModel);
  if (!guess) return;
  const betterModel = guess.brand ? `${guess.brand} ${guess.model}` : guess.model;
  const id = deviceMgmtGetLocalId();
  const list = deviceMgmtLoadSessions();
  const entry = list.find((d) => d.id === id);
  if (!entry) return; // belum pernah "touch" sekalipun -- lewati, biar heartbeat berikutnya yg bikin entrinya dulu
  entry.deviceModel = betterModel;
  entry.label = betterModel; // biar judul kartu di daftar ikut ter-update juga, bukan cuma field "Model perangkat" di popup detail
  deviceMgmtPersistSessions(list);
  if (document.getElementById('manajemenDeviceOverlay')?.classList.contains('open')) {
    renderDeviceMgmtPage();
  }
}

function deviceMgmtLoadSessions() {
  try {
    const raw = cloudStorage.getItem(STORAGE_KEY_DEVICE_SESSIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Gagal memuat daftar perangkat', e); }
  return [];
}
function deviceMgmtPersistSessions(list) {
  try { cloudStorage.setItem(STORAGE_KEY_DEVICE_SESSIONS, JSON.stringify(list)); }
  catch (e) { console.error('Gagal menyimpan daftar perangkat', e); }
}

// Daftarkan/perbarui entri perangkat INI di daftar (dipanggil tiap
// halaman dibuka & tiap tombol refresh ditekan), lalu buang entri
// yang sudah melewati batas slot (paling lama tidak aktif dibuang
// duluan) supaya daftar tidak membengkak tanpa batas.
function deviceMgmtTouchThisDevice() {
  const id = deviceMgmtGetLocalId();
  // `details` sengaja TIDAK menyertakan ip/city/region/country --
  // field itu murni tanggung jawab deviceMgmtEnrichThisDeviceIpLocation()
  // (lookup terpisah, async, 1x per pemuatan halaman), supaya
  // Object.assign di bawah tidak menimpa/menghapus nilai ip/lokasi yg
  // sudah berhasil didapat sebelumnya tiap kali heartbeat "lastActive"
  // biasa (tiap menit) jalan.
  const details = deviceMgmtDetectDetails();
  const now = new Date().toISOString();
  let list = deviceMgmtLoadSessions();
  const existing = list.find((d) => d.id === id);
  if (existing) {
    Object.assign(existing, details);
    existing.lastActive = now;
  } else {
    list.push(Object.assign({ id, firstSeen: now, lastActive: now }, details));
  }
  // Urutkan terbaru aktif dulu, lalu potong sesuai batas slot --
  // perangkat INI selalu dipertahankan walau daftar penuh.
  list.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
  if (list.length > DEVICE_MGMT_MAX_SLOTS) {
    const kept = list.filter((d) => d.id === id);
    const rest = list.filter((d) => d.id !== id).slice(0, DEVICE_MGMT_MAX_SLOTS - 1);
    list = kept.concat(rest).sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
  }
  deviceMgmtPersistSessions(list);
  return list;
}

function deviceMgmtIconSvg(isMobile) {
  return isMobile
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.2h2"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="12.5" rx="1.8"/><path d="M8.5 21h7M12 17v4"/></svg>';
}

// Menggambar ulang SELURUH isi #manajemenDeviceOverlay (profil, kartu
// ringkasan, daftar perangkat) berdasarkan status login saat ini +
// daftar perangkat yg tersimpan. Dipanggil tiap overlay dibuka & tiap
// refresh/hapus perangkat.
async function renderDeviceMgmtPage() {
  const nameEl = document.getElementById('deviceMgmtName');
  const statusEl = document.getElementById('deviceMgmtStatus');
  const subtitleEl = document.getElementById('deviceMgmtSubtitle');
  const listEl = document.getElementById('deviceMgmtList');
  const countEl = document.getElementById('deviceMgmtStatCount');
  const limitEl = document.getElementById('deviceMgmtStatLimit');
  const todayEl = document.getElementById('deviceMgmtStatToday');
  if (!nameEl || !listEl) return;

  const loggedIn = typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn();
  const thisId = deviceMgmtGetLocalId();
  const list = deviceMgmtTouchThisDevice();

  // ---- Kartu profil ----
  if (loggedIn && window._sb && window._sb.auth) {
    try {
      const { data } = await window._sb.auth.getSession();
      const email = data && data.session && data.session.user ? data.session.user.email : null;
      nameEl.textContent = email || 'Akun ZAYAIN';
    } catch (e) { nameEl.textContent = 'Akun ZAYAIN'; }
    statusEl.innerHTML = '<span class="dot"></span>Tersinkron ke akun cloud';
    statusEl.classList.add('is-online');
    subtitleEl.textContent = 'Kelola perangkat yang tersinkron ke akun kamu';
  } else {
    nameEl.textContent = 'Mode Lokal (Tanpa Akun)';
    statusEl.innerHTML = '<span class="dot"></span>Belum masuk / daftar akun';
    statusEl.classList.remove('is-online');
    subtitleEl.textContent = 'Masuk akun supaya daftar ini tersinkron ke semua perangkatmu';
  }

  // ---- Kartu ringkasan ----
  const todayStr = new Date().toDateString();
  const activeToday = list.filter((d) => new Date(d.lastActive).toDateString() === todayStr).length;
  countEl.textContent = String(list.length);
  limitEl.textContent = String(DEVICE_MGMT_MAX_SLOTS);
  todayEl.textContent = String(activeToday);

  // ---- Daftar perangkat ----
  if (!list.length) {
    listEl.innerHTML = '<p class="device-mgmt-empty">Belum ada perangkat untuk ditampilkan.</p>';
    return;
  }
  listEl.innerHTML = list.map((d) => {
    const isThis = d.id === thisId;
    const online = (Date.now() - new Date(d.lastActive).getTime()) < DEVICE_MGMT_ONLINE_WINDOW_MS;
    const statusHtml = isThis
      ? '<span class="is-online">Online</span>'
      : (online ? '<span class="is-online">Online</span>' : `<span class="is-offline">Terakhir aktif ${timeAgoId(d.lastActive)}</span>`);
    // Judul baris (d.label) sekarang bisa berisi merek+model perangkat (mis.
    // "Samsung SM-A536E"), lihat deviceMgmtDetectDetails() -- supaya info
    // browser yg sebelumnya ada di judul tidak hilang begitu saja, ditaruh
    // di baris meta sbg info sekunder, disandingkan dgn status online/offline.
    const browserMeta = d.browserLabel || d.browser || '';
    return `
      <div class="device-mgmt-row" data-deviceid="${escapeHtmlAttr(d.id)}">
        <span class="device-mgmt-row-ic">${deviceMgmtIconSvg(d.isMobile)}</span>
        <div class="device-mgmt-row-body">
          <div class="device-mgmt-row-title">
            <strong>${escapeHtml(d.label)}</strong>
            ${isThis ? '<span class="device-mgmt-badge">Device ini</span>' : ''}
          </div>
          <div class="device-mgmt-row-meta">${statusHtml}${browserMeta ? `<span>· ${escapeHtml(browserMeta)}</span>` : ''}</div>
        </div>
        ${isThis ? '' : `<button type="button" class="device-mgmt-row-forget" data-forgetdevice="${escapeHtmlAttr(d.id)}">Hapus</button>`}
      </div>`;
  }).join('');
}

/* ==========================================================
   POPUP "DETAIL PERANGKAT" (#deviceDetailSheetOverlay) -- dibuka
   dgn KLIK salah satu baris di daftar Manajemen Device (bukan tombol
   "Hapus"-nya, lihat listener #deviceMgmtList di atas). Menampilkan
   rincian LENGKAP perangkat yg diklik: browser+versi, sistem+versi,
   model perangkat, status online/offline, waktu aktif (relatif +
   tanggal-jam persis), pertama terdaftar, alamat IP & perkiraan
   lokasi. Field IP/lokasi SENGAJA ditampilkan "Tidak tersedia" apa
   adanya kalau memang belum/tidak berhasil didapat (lihat
   deviceMgmtEnrichThisDeviceIpLocation() di atas) -- TIDAK PERNAH
   diisi tebakan supaya datanya selalu jujur & akurat drpd terlihat
   lengkap tapi palsu.
========================================================== */
function deviceMgmtBuildDetailRows(d, isThis) {
  const online = isThis || (Date.now() - new Date(d.lastActive).getTime()) < DEVICE_MGMT_ONLINE_WINDOW_MS;
  const fmtExact = (iso) => {
    try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }); }
    catch (e) { return '-'; }
  };
  const locationText = (d.city || d.region || d.country)
    ? [d.city, d.region, d.country].filter(Boolean).join(', ')
    : 'Tidak tersedia';
  return [
    ['Status', online ? 'Online' : 'Offline'],
    ['Terakhir aktif', online ? 'Sekarang' : `${timeAgoId(d.lastActive)} (${fmtExact(d.lastActive)})`],
    ['Pertama terdaftar', d.firstSeen ? fmtExact(d.firstSeen) : 'Tidak diketahui'],
    ['Browser', d.browserLabel || d.browser || 'Tidak diketahui'],
    ['Sistem', d.osLabel || d.os || 'Tidak diketahui'],
    ['Model perangkat', d.deviceModel || (d.isMobile ? 'Tidak diketahui' : 'Komputer/Laptop')],
    ['Alamat IP', d.ip || 'Tidak tersedia'],
    ['Perkiraan lokasi', locationText],
  ];
}

function openDeviceDetailSheet(id) {
  const list = deviceMgmtLoadSessions();
  const d = list.find((x) => x.id === id);
  if (!d) return;
  const isThis = id === deviceMgmtGetLocalId();

  document.getElementById('deviceDetailTitle').textContent = d.label || `${d.browser || ''} ${d.os || ''}`.trim() || 'Perangkat';
  document.getElementById('deviceDetailIcon').innerHTML = deviceMgmtIconSvg(d.isMobile);
  document.getElementById('deviceDetailBadge').style.display = isThis ? '' : 'none';

  document.getElementById('deviceDetailRows').innerHTML = deviceMgmtBuildDetailRows(d, isThis)
    .map(([k, v]) => `<div class="receipt-expand-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`)
    .join('');

  const forgetBtn = document.getElementById('deviceDetailForgetBtn');
  if (isThis) {
    forgetBtn.style.display = 'none';
  } else {
    forgetBtn.style.display = '';
    // FIX "popup konfirmasi hapus muncul ketumpuk/tersembunyi": sheet
    // Detail Perangkat ini (.lap-sheet-overlay, z-index 800) SEBELUMNYA
    // dibiarkan tetap terbuka saat popup konfirmasi (.modal-overlay,
    // z-index cuma 200) dibuka -- akibatnya konfirmasi render DI BAWAH
    // sheet Detail yg masih terbuka, kelihatan spt "muncul di tempat
    // lain"/ketutup. Sheet Detail ditutup DULU di sini (label perangkat
    // sudah dibawa ke judul popup konfirmasi, jadi konteksnya tidak
    // hilang) sebelum konfirmasi dibuka.
    forgetBtn.onclick = () => { closeDeviceDetailSheet(); deviceMgmtForgetDevice(d.id, d.label || 'perangkat ini', null); };
  }

  document.getElementById('deviceDetailSheetOverlay')?.classList.add('open');
}
function closeDeviceDetailSheet() {
  document.getElementById('deviceDetailSheetOverlay')?.classList.remove('open');
}
document.getElementById('deviceDetailCloseBtn')?.addEventListener('click', closeDeviceDetailSheet);
document.getElementById('deviceDetailCloseBtn2')?.addEventListener('click', closeDeviceDetailSheet);
document.getElementById('deviceDetailSheetOverlay')?.addEventListener('click', function (e) {
  if (e.target === this) closeDeviceDetailSheet(); // klik area gelap di luar sheet -> tutup
});

// ---- Heartbeat "online" perangkat ini (Bug fix akurasi) ----
// SEBELUM ini, deviceMgmtTouchThisDevice() CUMA terpanggil saat
// halaman Manajemen Device dibuka / tombol refresh ditekan -- artinya
// status "Online" & "Terakhir aktif" HANYA benar kalau user memang
// sedang melihat halaman itu. Begitu user pindah ke tab/menu lain di
// app ini (tetap aktif memakai ZAYAIN), timestamp lastActive berhenti
// diperbarui -- lewat DEVICE_MGMT_ONLINE_WINDOW_MS (5 menit) tanpa
// membuka halaman itu lagi, perangkat yg SEBENARNYA sedang aktif akan
// keliru ditampilkan "Offline" (di perangkat lain yg melihat daftar
// ini), begitu juga hitungan "Aktif Hari Ini" jadi tidak akurat.
// Heartbeat di bawah ini menjaga entri perangkat ini tetap
// "ter-touch" secara berkala SELAMA app dibuka/terlihat -- tidak
// bergantung sama sekali pada overlay Manajemen Device sedang dibuka
// atau tidak -- supaya status online/waktu aktif merefleksikan
// pemakaian app yang sesungguhnya.
let deviceMgmtHeartbeatTimer = null;
function deviceMgmtHeartbeat() {
  // Sengaja tanpa sentuh DOM sama sekali (beda dari renderDeviceMgmtPage())
  // -- heartbeat ini harus ringan & aman dipanggil kapan saja, termasuk
  // saat overlay Manajemen Device sendiri sedang tertutup.
  try { deviceMgmtTouchThisDevice(); } catch (e) { console.error('Heartbeat perangkat gagal', e); }
  // Kalau overlay-nya KEBETULAN sedang terbuka saat heartbeat ini
  // jalan, gambar ulang juga supaya angka/daftar yg terlihat user
  // ikut ter-update live, bukan cuma tersimpan diam2 di storage.
  if (document.getElementById('manajemenDeviceOverlay')?.classList.contains('open')) {
    renderDeviceMgmtPage();
  }
}
function deviceMgmtStartHeartbeat() {
  deviceMgmtHeartbeat(); // touch pertama begitu app dibuka
  deviceMgmtEnrichThisDeviceIpLocation(); // lookup IP/lokasi, 1x per pemuatan halaman
  deviceMgmtEnrichThisDeviceModel(); // lookup Client Hints model perangkat, 1x per pemuatan halaman
  if (deviceMgmtHeartbeatTimer) clearInterval(deviceMgmtHeartbeatTimer);
  // Interval jauh lebih pendek drpd DEVICE_MGMT_ONLINE_WINDOW_MS (5
  // menit) supaya status "Online" tidak sempat kedaluwarsa selama tab
  // ini masih aktif dipakai.
  deviceMgmtHeartbeatTimer = setInterval(function () {
    if (document.visibilityState === 'visible') deviceMgmtHeartbeat();
  }, 60 * 1000);
}
// Begitu tab disembunyikan lalu dibuka lagi (mis. user balik dari app
// lain / kunci layar), langsung touch ulang -- jangan tunggu interval
// 60 detik berikutnya supaya status online terasa instan saat kembali.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') deviceMgmtHeartbeat();
});

function openManajemenDeviceOverlay() {
  document.getElementById('manajemenDeviceOverlay')?.classList.add('open');
  lockBodyScroll();
  renderDeviceMgmtPage();
}
function closeManajemenDeviceOverlay() {
  document.getElementById('manajemenDeviceOverlay')?.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('manajemenDeviceOpenBtn')?.addEventListener('click', openManajemenDeviceOverlay);
document.getElementById('manajemenDeviceBackBtn')?.addEventListener('click', closeManajemenDeviceOverlay);

// Tombol refresh -- SEBELUMNYA cuma menggambar ulang daftar dari cache
// localStorage yg ada (klaim "berguna kalau perangkat lain baru saja
// login/aktif" di komentar lama TIDAK benar2 terjadi, krn kv_store cuma
// ditarik saat login/reload halaman, bukan tiap tombol ini diklik).
// SEKARANG tombol ini benar2 menarik data terbaru sebelum menggambar ulang:
// 1) tarik ulang daftar perangkat dari cloud (kalau login akun) supaya
//    perangkat lain yg baru saja aktif ikut muncul tanpa perlu reload,
// 2) ulangi lookup IP/lokasi & Client Hints model perangkat INI (keduanya
//    SENGAJA cuma jalan sekali otomatis saat halaman pertama dibuka --
//    reset flag-nya di sini supaya klik manual tidak sia-sia kalau lookup
//    pertama tadi kebetulan gagal/network sempat putus).
// Efek loading: overlay + spinner di KARTU "Device Aktif" (lihat
// #deviceMgmtActiveLoading & CSS "is-refreshing" di index.html), bukan di
// ikon tombolnya. Toast hasil SENGAJA dimatikan (permintaan user) -- kartu
// yg meredup+spinner lalu kembali normal sudah cukup jadi penanda proses
// selesai, tanpa perlu notifikasi tambahan yg menumpuk. Kegagalan tetap
// dicatat ke console.error utk keperluan debug, cuma tidak lagi
// ditampilkan ke user lewat toast.
document.getElementById('deviceMgmtRefreshBtn')?.addEventListener('click', async function () {
  const btn = this;
  if (btn.disabled) return;
  const card = document.getElementById('deviceMgmtActiveCard');
  const subtitleEl = document.getElementById('deviceMgmtSubtitle');
  const prevSubtitle = subtitleEl ? subtitleEl.textContent : '';
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  card?.classList.add('is-refreshing');
  if (subtitleEl) subtitleEl.textContent = 'Menyegarkan daftar perangkat...';
  try {
    const loggedIn = typeof window.cloudIsLoggedIn === 'function' && window.cloudIsLoggedIn();
    if (loggedIn && typeof window.cloudPullKeys === 'function') {
      await window.cloudPullKeys([STORAGE_KEY_DEVICE_SESSIONS]);
    }
    // Paksa lookup IP & Client Hints diulang (bukan cuma pakai cache lama).
    deviceMgmtIpEnrichStarted = false;
    deviceMgmtIpInfoPromise = null;
    deviceMgmtModelEnrichStarted = false;
    deviceMgmtClientHintsPromise = null;
    await Promise.all([deviceMgmtEnrichThisDeviceIpLocation(), deviceMgmtEnrichThisDeviceModel()]);
    // renderDeviceMgmtPage() di bawah menulis ulang subtitleEl sesuai status
    // login terkini apa adanya -- teks loading di atas otomatis tertimpa,
    // tidak perlu dikembalikan manual ke prevSubtitle di sini.
    await renderDeviceMgmtPage();
  } catch (e) {
    console.error('Gagal menyegarkan daftar perangkat:', e);
    if (subtitleEl) subtitleEl.textContent = prevSubtitle; // gagal SEBELUM sempat render ulang -- kembalikan teks lama drpd nyangkut di "Menyegarkan..."
    renderDeviceMgmtPage(); // tetap gambar ulang dari data yg ada supaya UI tidak macet
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    card?.classList.remove('is-refreshing');
  }
});

// ---- Redesign popup konfirmasi HAPUS PERANGKAT (Manajemen Device) ----
// SEBELUMNYA pakai confirm() bawaan browser -- kotak abu-abu polos milik
// OS/browser, tidak senada sama sekali dgn tampilan ZAYAIN & nama
// perangkatnya tidak bisa ditonjolkan apa pun di dalamnya. Sekarang diganti
// modal custom (#deviceForgetConfirmOverlay, lihat markup + catatan
// desainnya di index.html), dibungkus jadi fungsi berbasis Promise persis
// pola openLogoutConfirm() di atas, supaya pemanggilnya (deviceMgmtForgetDevice
// di bawah) tetap bisa dipakai dgn gaya `if (!await openDeviceForgetConfirm(label)) return;`
// -- sama persis "rasanya" dgn confirm() lama, cuma tampilannya diganti total.
const deviceForgetConfirmModal = document.getElementById('deviceForgetConfirmOverlay');
function openDeviceForgetConfirm(label) {
  return new Promise((resolve) => {
    // Jaga-jaga kalau markup modal ini entah kenapa tidak ada di halaman
    // (mis. versi index.html lama blm diperbarui) -- jangan sampai fitur
    // hapus perangkat jadi mati total, cukup anggap "dikonfirmasi" spt
    // confirm() lama tanpa modal.
    if (!deviceForgetConfirmModal) { resolve(true); return; }
    const titleEl = document.getElementById('deviceForgetConfirmTitle');
    if (titleEl) titleEl.textContent = `Hapus "${label}" dari daftar perangkat?`;
    const btnYes = document.getElementById('btnConfirmDeviceForget');
    const btnNo = document.getElementById('btnCancelDeviceForget');
    function cleanup(result) {
      btnYes.removeEventListener('click', onYes);
      btnNo.removeEventListener('click', onNo);
      deviceForgetConfirmModal.removeEventListener('click', onOverlay);
      closeModal(deviceForgetConfirmModal);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    // Klik di luar kartu modal (di area overlay gelap) = sama dgn Batal,
    // konsisten dgn perilaku #confirmOverlay/#logoutConfirmOverlay yg sudah ada.
    function onOverlay(e) { if (e.target === deviceForgetConfirmModal) cleanup(false); }
    btnYes.addEventListener('click', onYes);
    btnNo.addEventListener('click', onNo);
    deviceForgetConfirmModal.addEventListener('click', onOverlay);
    openModal(deviceForgetConfirmModal);
  });
}

// Tombol "Hapus" per baris perangkat (event delegation, krn baris
// dibuat ulang tiap render) -- membuang perangkat itu dari daftar
// bersama (lihat catatan FAQ "Apa yang terjadi kalau saya hapus...").
// Sebelum baris benar2 hilang dari DOM, dikasih class "is-removing" dulu
// supaya CSS transition (lihat .device-mgmt-row.is-removing di index.html)
// mainkan animasi fade+collapse singkat -- baris tidak lagi "meloncat
// hilang" begitu saja.
// Dipisah jadi fungsi sendiri (SEBELUMNYA inline di dalam listener
// klik daftar) supaya bisa dipanggil dari DUA tempat: tombol "Hapus"
// inline di tiap baris daftar, MAUPUN tombol "Hapus Perangkat" di
// popup detail perangkat (#deviceDetailSheetOverlay) -- lihat
// openDeviceDetailSheet() di bawah. `row` boleh null (dipanggil dari
// popup, bukan dari baris daftar itu sendiri) -- kalau null, animasi
// fade+collapse dilewati & penghapusan terjadi langsung.
// SEKARANG async (sebelumnya sync, krn confirm() bawaan browser blocking) --
// konfirmasinya sudah diganti modal custom di atas yg berbasis Promise.
async function deviceMgmtForgetDevice(id, label, row) {
  const ok = await openDeviceForgetConfirm(label);
  if (!ok) {
    // User membatalkan -- balikkan tombol "Hapus" baris ini spt semula
    // (listener klik daftar di bawah men-disable tombolnya duluan SEBELUM
    // modal ini terbuka, guna cegah klik ganda selagi modal masih terbuka).
    row?.querySelector('[data-forgetdevice]')?.removeAttribute('disabled');
    return;
  }

  let done = false;
  const finishRemoval = () => {
    if (done) return; // jaring pengaman: transitionend & setTimeout bisa
    done = true;       // sama2 tertembak, cukup eksekusi sekali saja.
    const list = deviceMgmtLoadSessions().filter((d) => d.id !== id);
    deviceMgmtPersistSessions(list);
    showToast('Perangkat dihapus dari daftar.');
    closeDeviceDetailSheet();
    renderDeviceMgmtPage();
  };
  if (row) {
    row.classList.add('is-removing');
    row.addEventListener('transitionend', finishRemoval, { once: true });
    // Jaring pengaman kalau transitionend tidak pernah tertembak (mis.
    // prefers-reduced-motion menonaktifkan transition durasinya jadi 0).
    setTimeout(finishRemoval, 260);
  } else {
    finishRemoval();
  }
}


// Klik baris daftar perangkat: tombol "Hapus" inline tetap menghapus
// LANGSUNG dari daftar (perilaku lama dipertahankan supaya tidak perlu
// buka popup dulu cuma utk hapus cepat); klik di bagian LAIN baris
// (nama/ikon/status) membuka popup detail lengkap perangkat itu.
document.getElementById('deviceMgmtList')?.addEventListener('click', function (e) {
  const forgetBtn = e.target.closest('[data-forgetdevice]');
  if (forgetBtn) {
    const id = forgetBtn.dataset.forgetdevice;
    const row = forgetBtn.closest('.device-mgmt-row');
    const label = row?.querySelector('.device-mgmt-row-title strong')?.textContent || 'perangkat ini';
    forgetBtn.disabled = true;
    deviceMgmtForgetDevice(id, label, row);
    return;
  }
  const row = e.target.closest('.device-mgmt-row');
  if (row && row.dataset.deviceid) openDeviceDetailSheet(row.dataset.deviceid);
});

// Accordion FAQ (pola SAMA PERSIS dgn initBantuanPage() di atas).
document.getElementById('deviceMgmtFaqToggleBtn')?.addEventListener('click', function () {
  const list = document.getElementById('deviceMgmtFaqList');
  const willOpen = list.hasAttribute('hidden');
  list.toggleAttribute('hidden', !willOpen);
  this.setAttribute('aria-expanded', String(willOpen));
});
document.querySelectorAll('#deviceMgmtFaqList .bantuan-faq-item .bantuan-faq-q').forEach((q) => {
  q.addEventListener('click', () => q.closest('.bantuan-faq-item').classList.toggle('open'));
});

// Reveal polos kartu Ketentuan (tanpa animasi max-height).
document.getElementById('deviceMgmtTermsToggleBtn')?.addEventListener('click', function () {
  const body = document.getElementById('deviceMgmtTermsBody');
  const willOpen = body.hasAttribute('hidden');
  body.toggleAttribute('hidden', !willOpen);
  this.setAttribute('aria-expanded', String(willOpen));
});

/* ==========================================================
   PENGATURAN > KEAMANAN — Ubah PIN, Ubah Password, Login Biometrik.
   Semua operasi otentikasi sesungguhnya (verifikasi/ubah PIN & password,
   kirim email reset, WebAuthn) dilempar ke window.zayaproAuth yang
   diekspos cloud-sync.js -- di sini murni logika UI (buka/tutup
   overlay & sheet, pindah langkah, tampilkan pesan error/sukses).
========================================================== */

/* ---- Sheet konfirmasi "Ubah PIN" ---- */
// Label di baris Pengaturan, sheet konfirmasi, & judul halaman
// disesuaikan tergantung akun ini SUDAH punya PIN atau BELUM --
// "Buat PIN" kalau belum pernah diset sama sekali (tidak ada PIN
// lama utk diverifikasi/diganti), "Ubah PIN" kalau sudah ada.
function updatePinChangeLabels() {
  const hasExistingPin = !!(window.zayaproAuth && window.zayaproAuth.hasPin());
  const verb = hasExistingPin ? 'Ubah' : 'Buat';
  const rowTitle = document.querySelector('#btnOpenPinChange .settings-row-title');
  if (rowTitle) rowTitle.textContent = verb + ' PIN';
  const sheetTitle = document.querySelector('#pinChangeConfirmSheet .sec-sheet-title');
  if (sheetTitle) sheetTitle.textContent = 'Yakin kamu ingin ' + (hasExistingPin ? 'mengubah' : 'membuat') + ' PIN?';
  const sheetDesc = document.querySelector('#pinChangeConfirmSheet .sec-sheet-desc');
  if (sheetDesc) {
    sheetDesc.textContent = hasExistingPin
      ? 'PIN ini dipakai sebagai kunci cepat masuk ke ZAYAIN di perangkat ini, menggantikan PIN lama begitu berhasil diganti.'
      : 'PIN ini dipakai sebagai kunci cepat masuk ke ZAYAIN di perangkat ini, & jadi syarat sebelum Login Biometrik bisa diaktifkan.';
  }
  const proceedBtn = document.getElementById('pinChangeConfirmProceedBtn');
  if (proceedBtn) proceedBtn.textContent = verb + ' PIN';
  const overlayTitle = document.querySelector('#pinChangeOverlay .lap-filter-head h2');
  if (overlayTitle) overlayTitle.textContent = verb + ' PIN';
}
updatePinChangeLabels();
function openPinChangeConfirmSheet() {
  updatePinChangeLabels();
  document.getElementById('pinChangeConfirmSheetOverlay').classList.add('open');
  lockBodyScroll();
}
function closePinChangeConfirmSheet() {
  document.getElementById('pinChangeConfirmSheetOverlay').classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('btnOpenPinChange')?.addEventListener('click', () => {
  if (!requireCloudLogin('Masuk untuk mengubah PIN.')) return;
  openPinChangeConfirmSheet();
});
document.getElementById('pinChangeConfirmCloseBtn')?.addEventListener('click', closePinChangeConfirmSheet);
document.getElementById('pinChangeConfirmCancelBtn')?.addEventListener('click', closePinChangeConfirmSheet);
document.getElementById('pinChangeConfirmProceedBtn')?.addEventListener('click', function () {
  closePinChangeConfirmSheet();
  openPinChangeOverlay();
});

/* ---- Halaman "Ubah PIN" (3 langkah, 1 set dot+keypad dipakai ulang) ---- */
let pcStep = 'old';   // 'old' -> 'new' -> 'confirm'
let pcEntered = '';
let pcOldOk = false;  // sudah lolos verifikasi PIN lama
let pcNewPin = '';    // PIN baru yg diketik di langkah 'new', dicocokkan di 'confirm'
let pcChecking = false;
let pcHadPinAtStart = false; // dipakai HANYA utk pilih teks toast sukses di akhir (dibuat vs diganti)

function pcRenderDots() {
  const dots = document.querySelectorAll('#pinChangeDots .pin-dot');
  dots.forEach((d, i) => d.classList.toggle('filled', i < pcEntered.length));
}
function pcShowErr(text) {
  const msg = document.getElementById('pinChangeMsg');
  msg.textContent = text;
  msg.className = 'cloud-auth-msg show err';
  const dotsWrap = document.getElementById('pinChangeDots');
  dotsWrap.classList.remove('shake');
  void dotsWrap.offsetWidth;
  dotsWrap.classList.add('shake');
}
function pcClearMsg() {
  document.getElementById('pinChangeMsg').className = 'cloud-auth-msg';
}
function pcGoToStep(step) {
  pcStep = step;
  pcEntered = '';
  pcChecking = false;
  pcClearMsg();
  pcRenderDots();
  const title = document.getElementById('pinChangeStepTitle');
  const sub = document.getElementById('pinChangeStepSub');
  if (step === 'old') {
    title.textContent = 'Masukkan PIN Lama';
    sub.textContent = 'Masukkan PIN kamu saat ini untuk melanjutkan.';
  } else if (step === 'new') {
    title.textContent = 'Buat PIN Baru';
    sub.textContent = 'Buat 6 digit PIN baru yang mudah kamu ingat.';
  } else {
    title.textContent = 'Konfirmasi PIN Baru';
    sub.textContent = 'Ketik ulang PIN baru kamu untuk konfirmasi.';
  }
}
function openPinChangeOverlay() {
  pcOldOk = false;
  pcNewPin = '';
  updatePinChangeLabels();
  // Kalau akun ini BELUM PERNAH punya PIN sama sekali (mis. dibuat
  // sebelum fitur PIN ada, atau lewat jalur yang tidak mewajibkan
  // PIN saat daftar), tidak ada "PIN lama" yang bisa diverifikasi --
  // langsung lompat ke step buat PIN baru, drpd memaksa user
  // memasukkan PIN yang memang tidak pernah ada (dead end).
  const hasExistingPin = window.zayaproAuth && window.zayaproAuth.hasPin();
  pcHadPinAtStart = !!hasExistingPin;
  if (hasExistingPin) {
    pcGoToStep('old');
  } else {
    pcOldOk = true;
    pcGoToStep('new');
  }
  document.getElementById('pinChangeOverlay').classList.add('open');
  lockBodyScroll();
}
function closePinChangeOverlay() {
  document.getElementById('pinChangeOverlay').classList.remove('open');
  unlockBodyScroll();
}
async function pcHandleComplete() {
  pcChecking = true;
  if (pcStep === 'old') {
    const ok = await window.zayaproAuth.verifyPin(pcEntered);
    if (ok) {
      pcOldOk = true;
      pcGoToStep('new');
    } else {
      pcShowErr('PIN salah, coba lagi.');
      pcEntered = '';
      pcRenderDots();
      pcChecking = false;
    }
  } else if (pcStep === 'new') {
    pcNewPin = pcEntered;
    pcGoToStep('confirm');
  } else {
    if (pcEntered === pcNewPin) {
      const wasFirstTime = !pcHadPinAtStart;
      try {
        await window.zayaproAuth.setPin(pcNewPin);
        closePinChangeOverlay();
        updatePinChangeLabels();
        showToast(wasFirstTime ? 'PIN berhasil dibuat.' : 'PIN berhasil diganti.');
      } catch (err) {
        pcShowErr('Gagal menyimpan PIN baru, coba lagi.');
        pcEntered = '';
        pcRenderDots();
        pcChecking = false;
      }
    } else {
      pcShowErr('Konfirmasi PIN tidak cocok, ulangi dari PIN baru.');
      pcNewPin = '';
      setTimeout(() => pcGoToStep('new'), 700);
    }
  }
}
document.getElementById('pinChangeKeypad')?.addEventListener('click', function (e) {
  const btn = e.target.closest('.pin-key[data-num]');
  if (!btn || pcChecking) return;
  if (pcEntered.length >= 6) return;
  pcClearMsg();
  pcEntered += btn.getAttribute('data-num');
  pcRenderDots();
  if (pcEntered.length === 6) pcHandleComplete();
});
document.getElementById('pinChangeBackspace')?.addEventListener('click', function () {
  if (pcChecking) return;
  pcClearMsg();
  pcEntered = pcEntered.slice(0, -1);
  pcRenderDots();
});
document.getElementById('pinChangeBackBtn')?.addEventListener('click', closePinChangeOverlay);

/* ---- Halaman "Ubah Password" (langkah 1: verifikasi password lama,
   langkah 2: password baru + konfirmasi) ---- */
// Sama spt updatePinChangeLabels() -- label baris Pengaturan & judul
// halaman disesuaikan tergantung akun sudah punya password atau
// belum (lihat hasPassword() di cloud-sync.js). Untuk saat ini akan
// selalu "Ubah Password" krn password wajib diisi sejak signup, tapi
// disiapkan supaya siap kalau nanti ada metode daftar tanpa password.
let pwHadPasswordAtStart = true;
function updatePasswordChangeLabels() {
  const hasExisting = !!(window.zayaproAuth && window.zayaproAuth.hasPassword());
  const verb = hasExisting ? 'Ubah' : 'Buat';
  const rowTitle = document.querySelector('#btnOpenPasswordChange .settings-row-title');
  if (rowTitle) rowTitle.textContent = verb + ' Password';
  const overlayTitle = document.querySelector('#pwChangeOverlay .lap-filter-head h2');
  if (overlayTitle) overlayTitle.textContent = verb + ' Password';
  const backBtn = document.getElementById('pwChangeBackBtn');
  if (backBtn) backBtn.setAttribute('aria-label', 'Tutup ' + verb + ' Password');
}
updatePasswordChangeLabels();
function pwGoToStepOld() {
  document.getElementById('pwStepOld').hidden = false;
  document.getElementById('pwStepNew').hidden = true;
  document.getElementById('pwChangeContinueBtn').textContent = 'Lanjutkan';
  document.getElementById('pwOldMsg').className = 'cloud-auth-msg';
}
function pwGoToStepNew() {
  document.getElementById('pwStepOld').hidden = true;
  document.getElementById('pwStepNew').hidden = false;
  document.getElementById('pwChangeContinueBtn').textContent = pwHadPasswordAtStart ? 'Ganti Password' : 'Buat Password';
  document.getElementById('pwNewMsg').className = 'cloud-auth-msg';
}
function openPwChangeOverlay() {
  document.getElementById('pwOldInput').value = '';
  document.getElementById('pwNewInput').value = '';
  document.getElementById('pwNewConfirmInput').value = '';
  updatePasswordChangeLabels();
  // Sama spt PIN: kalau akun ini belum punya password (lihat catatan
  // di hasPassword()), tidak ada "password lama" utk diverifikasi --
  // langsung lompat ke step buat password baru.
  pwHadPasswordAtStart = !!(window.zayaproAuth && window.zayaproAuth.hasPassword());
  if (pwHadPasswordAtStart) {
    pwGoToStepOld();
  } else {
    pwGoToStepNew();
  }
  pwUpdateContinueState();
  document.getElementById('pwChangeOverlay').classList.add('open');
  lockBodyScroll();
}
function closePwChangeOverlay() {
  document.getElementById('pwChangeOverlay').classList.remove('open');
  unlockBodyScroll();
}
function pwUpdateContinueState() {
  const btn = document.getElementById('pwChangeContinueBtn');
  const oldHidden = document.getElementById('pwStepOld').hidden;
  if (!oldHidden) {
    btn.disabled = document.getElementById('pwOldInput').value.length < 6;
  } else {
    const nv = document.getElementById('pwNewInput').value;
    const cv = document.getElementById('pwNewConfirmInput').value;
    btn.disabled = !(nv.length >= 6 && cv.length >= 6);
  }
}
document.getElementById('pwOldInput')?.addEventListener('input', pwUpdateContinueState);
document.getElementById('pwNewInput')?.addEventListener('input', pwUpdateContinueState);
document.getElementById('pwNewConfirmInput')?.addEventListener('input', pwUpdateContinueState);
[['pwOldToggle', 'pwOldInput'], ['pwNewToggle', 'pwNewInput'], ['pwNewConfirmToggle', 'pwNewConfirmInput']].forEach(function ([btnId, inputId]) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', function () {
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(input.type === 'text'));
  });
});
document.getElementById('pwChangeContinueBtn')?.addEventListener('click', async function () {
  const btn = this;
  const oldHidden = document.getElementById('pwStepOld').hidden;
  if (!oldHidden) {
    const oldPassword = document.getElementById('pwOldInput').value;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Memeriksa...';
    try {
      const ok = await window.zayaproAuth.verifyPassword(oldPassword);
      if (ok) {
        pwGoToStepNew();
      } else {
        const msg = document.getElementById('pwOldMsg');
        msg.textContent = 'Password lama salah.';
        msg.className = 'cloud-auth-msg show err';
      }
    } catch (err) {
      const msg = document.getElementById('pwOldMsg');
      msg.textContent = 'Terjadi kesalahan, coba lagi.';
      msg.className = 'cloud-auth-msg show err';
    } finally {
      btn.textContent = prevText;
      pwUpdateContinueState();
    }
  } else {
    const nv = document.getElementById('pwNewInput').value;
    const cv = document.getElementById('pwNewConfirmInput').value;
    const msg = document.getElementById('pwNewMsg');
    if (nv.length < 6) {
      msg.textContent = 'Password baru minimal 6 karakter.';
      msg.className = 'cloud-auth-msg show err';
      return;
    }
    if (nv !== cv) {
      msg.textContent = 'Konfirmasi password tidak cocok.';
      msg.className = 'cloud-auth-msg show err';
      return;
    }
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Menyimpan...';
    try {
      await window.zayaproAuth.changePassword(nv);
      closePwChangeOverlay();
      updatePasswordChangeLabels();
      showToast(pwHadPasswordAtStart ? 'Password berhasil diganti.' : 'Password berhasil dibuat.');
    } catch (err) {
      msg.textContent = 'Gagal mengganti password, coba lagi.';
      msg.className = 'cloud-auth-msg show err';
    } finally {
      btn.textContent = prevText;
      pwUpdateContinueState();
    }
  }
});
document.getElementById('btnOpenPasswordChange')?.addEventListener('click', () => {
  if (!requireCloudLogin('Masuk untuk mengubah password.')) return;
  openPwChangeOverlay();
});
document.getElementById('pwChangeBackBtn')?.addEventListener('click', closePwChangeOverlay);

/* ---- Sheet "Lupa Password" (dibuka dari dalam halaman Ubah Password) ---- */
function openPwForgotSheet() {
  document.getElementById('pwForgotMsg').className = 'cloud-auth-msg';
  document.getElementById('pwForgotSheetOverlay').classList.add('open');
  lockBodyScroll();
}
function closePwForgotSheet() {
  document.getElementById('pwForgotSheetOverlay').classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('pwForgotLink')?.addEventListener('click', openPwForgotSheet);
document.getElementById('pwForgotCloseBtn')?.addEventListener('click', closePwForgotSheet);
document.getElementById('pwForgotCancelBtn')?.addEventListener('click', closePwForgotSheet);
document.getElementById('pwForgotSendBtn')?.addEventListener('click', async function () {
  const btn = this;
  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = 'Mengirim...';
  try {
    await window.zayaproAuth.requestPasswordReset();
    closePwForgotSheet();
    closePwChangeOverlay();
    showToast('Link atur ulang password sudah dikirim ke email kamu.');
  } catch (err) {
    const msg = document.getElementById('pwForgotMsg');
    msg.textContent = 'Gagal mengirim email, coba lagi.';
    msg.className = 'cloud-auth-msg show err';
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
});

/* ---- Toggle "Kunci PIN" -- menyalakan/mematikan layar kunci PIN yg
   tampil saat app dibuka (lihat requirePinUnlock()/boot() di
   cloud-sync.js). Preferensi per-perangkat, disambungkan lewat
   window.zayaproAuth.isPinLockEnabled()/setPinLockEnabled(). Kalau
   dimatikan sementara Login Biometrik masih aktif, biometriknya ikut
   dimatikan otomatis di sini juga -- toggle itu murni jalur MASUK ke
   layar kunci PIN, jadi tidak ada gunanya tetap ON kalau layar
   kuncinya sendiri sudah di-skip total. ---- */
(function initPinLockToggle() {
  const toggle = document.getElementById('pinLockToggleInput');
  if (!toggle || !window.zayaproAuth) return;

  toggle.checked = window.zayaproAuth.isPinLockEnabled();
  toggle.addEventListener('change', function () {
    if (!requireCloudLogin('Masuk untuk mengatur Kunci PIN.')) {
      toggle.checked = window.zayaproAuth.isPinLockEnabled();
      return;
    }
    if (!toggle.checked && !window.zayaproAuth.hasPin()) {
      // Jaga-jaga: kalau suatu saat ada akun tanpa PIN sama sekali,
      // togglenya tidak relevan utk dimatikan (memang sudah tidak
      // pernah mengunci).
      toggle.checked = true;
      showToast('Belum ada PIN yang diset di akun ini.', 'err');
      return;
    }
    window.zayaproAuth.setPinLockEnabled(toggle.checked);
    if (toggle.checked) {
      showToast('Kunci PIN diaktifkan -- PIN akan diminta setiap app dibuka.');
    } else {
      // Login Biometrik cuma jalan sbg jalan pintas DI DALAM layar
      // kunci PIN -- kalau layar kuncinya di-skip, matikan juga
      // biometriknya (& ikut update tampilan togglenya) supaya
      // Pengaturan tidak menampilkan "Login Biometrik: ON" yg
      // sebenarnya sudah tidak pernah kepakai.
      if (window.zayaproAuth.isBiometricEnabled()) {
        window.zayaproAuth.disableBiometric();
        const bioToggle = document.getElementById('biometricToggleInput');
        if (bioToggle) bioToggle.checked = false;
      }
      showToast('Kunci PIN dimatikan di perangkat ini -- app langsung terbuka tanpa diminta PIN.');
    }
  });
})();

/* ---- Toggle "Login Biometrik" ---- */
(async function initBiometricToggle() {
  const toggle = document.getElementById('biometricToggleInput');
  const row = document.getElementById('biometricToggleRow');
  if (!toggle || !window.zayaproAuth) return;

  // Kalau HP/browser ini memang tidak punya sensor sidik jari/Face ID
  // (atau diakses lewat HTTP, bukan HTTPS), baris "Login Biometrik"
  // TETAP ditampilkan (supaya user tetap tahu fiturnya ada) tapi
  // diburamkan & toggle-nya dikunci total (tidak bisa disentuh),
  // dilengkapi keterangan kecil "Tidak didukung di perangkat ini".
  // User yang HP-nya tidak punya sensor tetap terkunci pakai PIN spt
  // biasa (lihat requirePinUnlock di cloud-sync.js).
  const supported = await window.zayaproAuth.biometricSupported();
  if (!supported) {
    if (row) row.classList.add('is-unsupported');
    toggle.disabled = true;
    toggle.checked = false;
    const note = document.getElementById('biometricUnsupportedNote');
    if (note) note.style.display = '';
    // Baris tetap bisa disentuh (bukan pointer-events:none) supaya
    // user yang menyentuhnya tetap dapat penjelasan lewat toast,
    // bukan cuma diam tidak ada respons sama sekali.
    if (row) {
      row.addEventListener('click', function (e) {
        e.preventDefault();
        showToast('HP ini tidak memiliki sensor sidik jari/Face ID, jadi Login Biometrik tidak bisa dipakai. Kamu tetap bisa masuk pakai PIN.', 'err');
      });
    }
    return;
  }

  toggle.checked = window.zayaproAuth.isBiometricEnabled();
  toggle.addEventListener('change', async function () {
    if (!requireCloudLogin('Masuk untuk mengaktifkan Login Biometrik.')) {
      toggle.checked = false;
      return;
    }
    if (toggle.checked) {
      // PENTING: layar kunci saat app dibuka (lihat boot() di
      // cloud-sync.js) HANYA jalan kalau akun sudah punya PIN
      // (user_metadata.pin_hash) -- baik jalur PIN maupun jalur
      // sidik jari sama-sama digantung di balik syarat itu. Kalau
      // biometrik diaktifkan padahal PIN belum pernah diset, layar
      // kunci itu di-skip TOTAL setiap app dibuka (bukan cuma
      // sidik jarinya yang tidak jalan, tapi seluruh kuncinya tidak
      // pernah muncul) -- itulah sebabnya wajib dicek dulu di sini.
      if (!window.zayaproAuth.hasPin()) {
        toggle.checked = false;
        showToast('Atur PIN dulu lewat menu "Buat PIN" sebelum mengaktifkan Login Biometrik.', 'err');
        return;
      }
      // Biometrik cuma jalan sbg jalan pintas DI DALAM layar kunci
      // PIN (lihat #pinLockBioView) -- percuma diaktifkan kalau
      // toggle "Kunci PIN" di atas sedang OFF, krn layar kuncinya
      // sendiri tidak akan pernah tampil.
      if (!window.zayaproAuth.isPinLockEnabled()) {
        toggle.checked = false;
        showToast('Nyalakan dulu toggle "Kunci PIN" sebelum mengaktifkan Login Biometrik.', 'err');
        return;
      }
      try {
        await window.zayaproAuth.enableBiometric();
        showToast('Login Biometrik diaktifkan di perangkat ini.');
      } catch (err) {
        toggle.checked = false;
        showToast('Gagal mengaktifkan Login Biometrik, coba lagi.', 'err');
      }
    } else {
      window.zayaproAuth.disableBiometric();
      showToast('Login Biometrik dimatikan di perangkat ini.');
    }
  });
})();

document.getElementById('ddLogoInput')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleDdLogoFile(file);
});
document.getElementById('btnRemoveDdLogo')?.addEventListener('click', () => {
  setDdLogoPreview(null);
  document.getElementById('ddLogoInput').value = '';
});
const ddLogoDrop = document.getElementById('ddLogoDrop');
if (ddLogoDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    ddLogoDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); ddLogoDrop.classList.add('is-dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    ddLogoDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); ddLogoDrop.classList.remove('is-dragover'); });
  });
  ddLogoDrop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    ddLogoDrop.classList.remove('is-dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleDdLogoFile(file);
  });
}
document.getElementById('ddFaviconInput')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleDdFaviconFile(file);
});
document.getElementById('btnRemoveDdFavicon')?.addEventListener('click', () => {
  setDdFaviconPreview(null);
  document.getElementById('ddFaviconInput').value = '';
});
const ddFaviconDrop = document.getElementById('ddFaviconDrop');
if (ddFaviconDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    ddFaviconDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); ddFaviconDrop.classList.add('is-dragover'); });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    ddFaviconDrop.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); ddFaviconDrop.classList.remove('is-dragover'); });
  });
  ddFaviconDrop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    ddFaviconDrop.classList.remove('is-dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleDdFaviconFile(file);
  });
}

document.getElementById('lapFilterTypeRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.lap-pill-btn');
  if (!btn) return;
  document.querySelectorAll('#lapFilterTypeRow .lap-pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  lapTypeFilter = btn.dataset.filtertype;
  resetHistoryPagination();
  renderTransactionList();
});

document.getElementById('lapFilterResetBtn')?.addEventListener('click', () => {
  // Rentang Waktu -> "Pilih Bulan" (bulan berjalan), sesuai default awal
  lapFilterDateFrom = ''; lapFilterDateTo = '';
  lapFilterMonth = thisMonthStr();
  updateLapMonthFieldLabel();
  updateLapDateRangeFieldLabel();
  document.getElementById('tabs')?.querySelector('[data-tab="bulan"]')?.click();
  // Transaksi -> "Semua"
  document.getElementById('lapFilterTypeRow')?.querySelector('[data-filtertype="semua"]')?.click();
  // Kategori -> "Semua Kategori"
  const catEl = document.getElementById('categoryFilter');
  if (catEl) { catEl.value = 'semua'; catEl.dispatchEvent(new Event('change')); }
  updateLapCategoryFieldLabel();
});

document.getElementById('categoryFilter')?.addEventListener('change', () => { resetHistoryPagination(); renderTransactionList(); });

/* ==========================================================
   PENCARIAN "SEMUA TRANSAKSI" (toggle kaca pembesar di header)
   Pola sama dgn toggle cari milik halaman Tagihan/Hutang
   (bdSearchToggleBtn dkk) -- input id="searchInput" dipakai ulang
   PERSIS sama dgn yg sudah dibaca getFilteredTransactions(), jadi
   tidak perlu logic filter baru sama sekali.
========================================================== */
(function setupLapHeaderSearch() {
  const toggleBtn = document.getElementById('lapSearchToggleBtn');
  const row = document.getElementById('lapSearchRow');
  const input = document.getElementById('searchInput');
  const closeBtn = document.getElementById('lapSearchCloseBtn');
  if (!toggleBtn || !row || !input || !closeBtn) return;
  function closeRow() {
    row.hidden = true;
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
    if (input.value) { input.value = ''; resetHistoryPagination(); renderTransactionList(); }
  }
  toggleBtn.addEventListener('click', () => {
    const willOpen = row.hidden;
    if (willOpen) {
      row.hidden = false;
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-expanded', 'true');
      input.focus();
    } else {
      closeRow();
    }
  });
  input.addEventListener('input', () => { resetHistoryPagination(); renderTransactionList(); });
  closeBtn.addEventListener('click', closeRow);
})();
document.getElementById('btnLoadMoreHistory')?.addEventListener('click', () => {
  historyVisibleGroups += HISTORY_GROUPS_PER_PAGE;
  renderTransactionList();
});

/* ==========================================================
   EKSPOR TRANSAKSI — Excel (.xlsx) & PDF bergaya
========================================================== */
setupExportMenu('btnExport', 'btnExportMenu');

async function exportTransactionsExcel() {
  const list = getFilteredTransactions();
  if (list.length === 0) { showToast('Tidak ada data untuk diekspor.', 'err'); return; }
  if (typeof ExcelJS === 'undefined') {
    try { await ensureExportLibsLoaded(); } catch (e) { showToast('Gagal memuat pustaka Excel. Cek koneksi internet.', 'err'); return; }
  }
  if (typeof ExcelJS === 'undefined') { showToast('Pustaka Excel belum siap, coba lagi.', 'err'); return; }

  const masuk = list.filter(t => t.type === 'masuk').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const keluar = list.filter(t => t.type === 'keluar').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const net = masuk - keluar;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZAYAIN';
  wb.created = new Date();
  const ws = wb.addWorksheet('Transaksi', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = [{ width: 13 }, { width: 12 }, { width: 20 }, { width: 34 }, { width: 20 }];

  ws.mergeCells('A1:E1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ZAYAIN — Riwayat Transaksi';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:E2');
  const subCell = ws.getCell('A2');
  subCell.value = `Diunduh ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • ${list.length} transaksi • Masuk ${fmtRupiahPlain(masuk)} • Keluar ${fmtRupiahPlain(keluar)} • Bersih ${fmtRupiahPlain(net)}`;
  subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FFD1FAE5' } };
  ws.getRow(2).height = 20;
  for (let r = 1; r <= 2; r++) for (let c = 1; c <= 5; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1220' } };

  const header = ['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Jumlah (Rp)'];
  const headerRow = ws.getRow(4);
  headerRow.values = header;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', horizontal: cell.value === 'Jumlah (Rp)' ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
  });
  headerRow.height = 22;

  list.forEach((t, i) => {
    const isMasuk = t.type === 'masuk';
    const row = ws.addRow([
      t.date ? new Date(t.date + 'T00:00:00') : '',
      isMasuk ? 'Masuk' : 'Keluar',
      t.category || '',
      t.desc || '',
      Number(t.amount) || 0
    ]);
    const zebra = i % 2 === 1;
    row.eachCell((cell, colNum) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E8EF' } } };
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
      if (colNum === 1) cell.numFmt = 'dd/mm/yyyy';
      if (colNum === 2) cell.font = { color: { argb: isMasuk ? 'FF059669' : 'FFE11D48' }, bold: true };
      if (colNum === 5) {
        cell.numFmt = '#,##0 "Rp"';
        cell.alignment = { horizontal: 'right' };
        cell.font = { color: { argb: isMasuk ? 'FF059669' : 'FFE11D48' }, bold: true };
      }
    });
  });

  const totalRow = ws.addRow(['', '', '', 'TOTAL BERSIH', net]);
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 11.5 };
    cell.border = { top: { style: 'medium', color: { argb: 'FF0B1220' } } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E9F5' } };
    if (colNum === 5) { cell.numFmt = '#,##0 "Rp"'; cell.alignment = { horizontal: 'right' }; }
    if (colNum === 4) cell.alignment = { horizontal: 'right' };
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `zayapro_transaksi_${todayStr()}.xlsx`);
  showToast(`${list.length} transaksi diekspor ke Excel.`);
}

async function exportTransactionsPdf() {
  const list = getFilteredTransactions();
  if (list.length === 0) { showToast('Tidak ada data untuk diekspor.', 'err'); return; }
  if (typeof window.jspdf === 'undefined') {
    try { await ensureExportLibsLoaded(); } catch (e) { showToast('Gagal memuat pustaka PDF. Cek koneksi internet.', 'err'); return; }
  }
  if (typeof window.jspdf === 'undefined') { showToast('Pustaka PDF belum siap, coba lagi.', 'err'); return; }

  const masuk = list.filter(t => t.type === 'masuk').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const keluar = list.filter(t => t.type === 'keluar').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const net = masuk - keluar;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 18, 32);
  doc.rect(0, 0, pageW, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ZAYAIN', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Laporan Riwayat Transaksi', 40, 52);
  doc.setFontSize(9.5);
  doc.setTextColor(200, 210, 235);
  const dateLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Diunduh ${dateLabel}  •  ${list.length} transaksi`, 40, 66);

  doc.setFontSize(9);
  doc.setTextColor(110, 231, 183);
  doc.text(`Masuk ${fmtRupiahPlain(masuk)}`, 40, 82);
  doc.setTextColor(253, 164, 175);
  doc.text(`Keluar ${fmtRupiahPlain(keluar)}`, 190, 82);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(net >= 0 ? 110 : 253, net >= 0 ? 231 : 164, net >= 0 ? 183 : 175);
  doc.text(`Bersih ${fmtRupiahPlain(net)}`, pageW - 40, 52, { align: 'right' });

  doc.autoTable({
    startY: 108,
    head: [['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Jumlah']],
    body: list.map(t => [
      t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      t.type === 'masuk' ? 'Masuk' : 'Keluar',
      t.category || '-', t.desc || '-',
      (t.type === 'masuk' ? '+ ' : '- ') + fmtRupiahPlain(Number(t.amount) || 0)
    ]),
    foot: [['', '', '', 'TOTAL BERSIH', fmtRupiahPlain(net)]],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    footStyles: { fillColor: [230, 233, 245], textColor: [19, 26, 42], fontStyle: 'bold', fontSize: 9.5 },
    bodyStyles: { fontSize: 8.7, textColor: [19, 26, 42] },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 40, right: 40 },
    styles: { cellPadding: 6, lineColor: [228, 232, 239], lineWidth: 0.5 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const isMasuk = data.cell.raw.toString().startsWith('+');
        data.cell.styles.textColor = isMasuk ? [5, 150, 105] : [225, 29, 72];
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8.5);
      doc.setTextColor(138, 147, 163);
      doc.text(`Halaman ${data.pageNumber} / ${pageCount}`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      doc.text('ZAYAIN — Kelola Uang Masuk & Keluar', 40, doc.internal.pageSize.getHeight() - 20);
    }
  });

  doc.save(`zayapro_transaksi_${todayStr()}.pdf`);
  showToast('PDF berhasil diunduh.');
}

document.getElementById('btnExportXlsx')?.addEventListener('click', () => { document.getElementById('btnExportMenu')._close(); exportTransactionsExcel(); });
document.getElementById('btnExportPdf')?.addEventListener('click', () => { document.getElementById('btnExportMenu')._close(); exportTransactionsPdf(); });

/* ==========================================================
   TOAST
========================================================== */
function showToast(message, type = 'ok') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  const iconSvg = type === 'err'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';
  el.innerHTML = `<span class="toast-ic">${iconSvg}</span><span class="toast-msg">${message}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    // Animasi keluar disamakan gayanya dengan animasi masuk (toastPop di
    // CSS): mengecil + geser turun sedikit, bukan cuma memudar datar --
    // terasa sebagai satu bahasa gerak yang sama (masuk "pop" naik,
    // keluar "surut" turun), bukan dua animasi yang tidak nyambung.
    el.style.transition = 'opacity .22s ease-in, transform .22s ease-in';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px) scale(.94)';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

/* ==========================================================
   NOTIFIKASI — TAGIHAN & HUTANG
========================================================== */
const notifPanel = document.getElementById('notifPanel');
const notifPanelOverlay = document.getElementById('notifPanelOverlay');
const notifBtn = document.getElementById('notifBtn');

function daysUntil(dateStr) {
  const today = new Date(todayStr() + 'T00:00:00');
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

function dueLabel(dateStr) {
  const diff = daysUntil(dateStr);
  // Tanggal & frasa hari sengaja disambung pakai spasi non-breaking
  // (\u00A0) -- mis. "2\u00A0hari" & "29\u00A0Agu\u00A02026" -- supaya "2 hari" atau
  // "29 Agu 2026" tidak pernah kepisah jadi dua baris kalau suatu saat
  // pil ini dipakai di tempat lain yang masih boleh membungkus baris.
  // Pil "Jatuh tempo ..." sendiri di kartu Tagihan/Hutang SELALU 1
  // baris di semua ukuran perangkat (lihat CSS .due-pill/.due-text) --
  // kalau teksnya sungguh tidak muat di layar sangat sempit, dipotong
  // rapi pakai "..." (ellipsis), bukan dilipat ke baris ke-2.
  const formatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '\u00A0');
  if (diff < 0) return { text: `Terlambat\u00A0${Math.abs(diff)}\u00A0hari · ${formatted}`, overdue: true, soon: false };
  if (diff === 0) return { text: `Hari\u00A0ini · ${formatted}`, overdue: true, soon: false };
  if (diff <= 3) return { text: `${diff}\u00A0hari\u00A0lagi · ${formatted}`, overdue: false, soon: true };
  return { text: formatted, overdue: false, soon: false };
}

function updateNotifBadge() {
  const unpaidBills = bills.filter(b => b.status === 'belum').length;
  const unpaidDebts = debts.filter(d => d.status === 'belum').length;
  const total = unpaidBills + unpaidDebts;
  const overdueCount = [...bills, ...debts].filter(x => x.status === 'belum' && daysUntil(x.dueDate) < 0).length;
  const badge = document.getElementById('notifBadge');
  if (total > 0) {
    badge.textContent = total > 9 ? '9+' : total;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
  notifBtn.classList.toggle('has-alert', overdueCount > 0);
  // Sinkronkan juga ke badge & status "has-alert" di tombol notif versi
  // mini topbar (elemen fixed terpisah, lihat #miniNotifBtn).
  const miniBadge = document.getElementById('miniNotifBadge');
  const miniNotifBtnEl = document.getElementById('miniNotifBtn');
  if (miniBadge) {
    if (total > 0) {
      miniBadge.textContent = total > 9 ? '9+' : total;
      miniBadge.style.display = 'flex';
    } else {
      miniBadge.style.display = 'none';
    }
  }
  if (miniNotifBtnEl) miniNotifBtnEl.classList.toggle('has-alert', overdueCount > 0);
}

// Ingatkan pengguna sekali per hari (per sesi browser) kalau ada
// tagihan/hutang yang jatuh tempo hari ini atau sudah terlambat.
const NOTIF_REMINDER_FLAG_KEY = 'alirin_notif_reminder_date_v1';
function maybeShowDueReminder() {
  try {
    if (cloudStorage.getItem(NOTIF_REMINDER_FLAG_KEY) === todayStr()) return;
  } catch (e) { /* localStorage diblokir — lewati saja pengingatnya */ }

  const urgent = [...bills, ...debts].filter(x => x.status === 'belum' && daysUntil(x.dueDate) <= 0);
  if (!urgent.length) return;

  const overdue = urgent.filter(x => daysUntil(x.dueDate) < 0).length;
  const dueToday = urgent.length - overdue;
  let msg;
  if (overdue && dueToday) msg = `Ada ${overdue} tagihan/hutang terlambat & ${dueToday} jatuh tempo hari ini.`;
  else if (overdue) msg = `Ada ${overdue} tagihan/hutang yang sudah terlambat dibayar.`;
  else msg = `Ada ${dueToday} tagihan/hutang yang jatuh tempo hari ini.`;

  showToast(msg, 'err');
  try { cloudStorage.setItem(NOTIF_REMINDER_FLAG_KEY, todayStr()); } catch (e) { /* abaikan */ }
}

// Ikon notifikasi diseragamkan jadi lencana "i" polos (persis gaya
// ikon notifikasi pada referensi) alih-alih ikon per-kategori yang
// berbeda-beda — sekarang halaman ini murni daftar notifikasi
// (tanpa tab pemilih kategori), jadi ikonnya cukup satu bentuk yang
// sama utk semua baris; makna kategori tetap tersampaikan lewat
// warna lencana (amber=tagihan, ungu=hutang, merah=terlambat).
const NOTIF_ITEM_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 11v6"/><circle cx="12" cy="7.2" r="0.6" fill="currentColor" stroke="none"/></svg>';

/* ============ STATUS BACA/BELUM DIBACA NOTIFIKASI ============
   Meniru pola aplikasi referensi (mis. app BRI): baris notifikasi
   yang BELUM dibuka/dibaca dikasih rona latar biru muda + judul
   lebih tegas, sedangkan yang SUDAH dibaca kembali polos/putih +
   judul sedikit lebih ringan. Daftar id yang sudah dibaca disimpan
   sebagai array JSON di cloudStorage (ikut tersinkron ke akun yang
   sama di perangkat lain, sama seperti data lain di file ini) --
   setiap entri disimpan sebagai "kind:id" supaya id tagihan & id
   hutang yang kebetulan sama tidak saling tertukar. */
const NOTIF_READ_KEY = 'alirin_notif_read_ids_v1';
function getNotifReadSet() {
  try {
    const raw = cloudStorage.getItem(NOTIF_READ_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) { /* data korup/localStorage diblokir — anggap kosong */ }
  return new Set();
}
function isNotifRead(kind, id) {
  return getNotifReadSet().has(`${kind}:${id}`);
}
function markNotifRead(kind, id) {
  const set = getNotifReadSet();
  const key = `${kind}:${id}`;
  if (set.has(key)) return; // sudah tercatat dibaca, tak perlu tulis ulang
  set.add(key);
  try { cloudStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set])); }
  catch (e) { /* localStorage diblokir — abaikan, statusnya cuma tak tersimpan */ }
}

/* ============ WAKTU MASUK (JAM+TANGGAL) NOTIFIKASI ============
   Notifikasi tagihan/hutang otomatis tidak punya "jam dikirim" bawaan
   (cuma py tanggal jatuh tempo), jadi begitu sebuah tagihan/hutang
   PERTAMA KALI muncul sbg notifikasi belum-lunas, momen itu dicatat
   sbg "waktu masuk"-nya (jam+tanggal sebenarnya, bukan tanggal jatuh
   tempo) dan disimpan permanen di cloudStorage supaya jamnya tidak
   berubah-ubah tiap kali halaman dibuka ulang -- persis kayak
   notifikasi asli yang begitu masuk, jamnya sudah terkunci. */
const NOTIF_ARRIVED_KEY = 'alirin_notif_arrived_v1';
function getNotifArrivedMap() {
  try {
    const raw = cloudStorage.getItem(NOTIF_ARRIVED_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* data korup/localStorage diblokir — anggap kosong */ }
  return {};
}
function getOrSetNotifArrival(kind, id) {
  const map = getNotifArrivedMap();
  const key = `${kind}:${id}`;
  if (!map[key]) {
    map[key] = new Date().toISOString();
    try { cloudStorage.setItem(NOTIF_ARRIVED_KEY, JSON.stringify(map)); }
    catch (e) { /* localStorage diblokir — abaikan, jam cuma tak tersimpan */ }
  }
  return map[key];
}
// Format "11.00 WIB" dari datetime ISO -- dipisah titik (bukan titik
// dua) supaya konsisten dgn gaya jam yg lazim dipakai di notifikasi
// aplikasi keuangan Indonesia, dan ditambah label "WIB" persis pola
// pada gambar referensi.
function notifTimeLabel(isoStr) {
  try {
    const d = new Date(isoStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}.${mm}\u00A0WIB`;
  } catch (e) { return ''; }
}

/* ============ NOTIFIKASI KUSTOM (generik) ============
   Selain notifikasi otomatis dari tagihan/hutang, daftar Notifikasi
   sekarang juga bisa menampilkan notifikasi bebas/kustom -- disimpan
   sbg array JSON di cloudStorage (ikut tersinkron ke akun yang sama
   di perangkat lain). Tiap entri py bentuk:
     { id, source, title, body, icon (markup svg custom, opsional --
       kalau kosong pakai NOTIF_ITEM_ICON standar), image (URL atau
       data-URI, OPSIONAL -- kalau diisi dipakai sbg thumbnail kanan
       menggantikan ikon, sesuai gambar yg dikirim), sentAt (datetime
       ISO LENGKAP dgn jam, bukan cuma tanggal) }
   Panggil pushCustomNotification({...}) dari mana saja -- termasuk
   nanti dari fitur pengiriman notifikasi terpisah yang disebut di
   permintaan -- utk menambah entri baru; otomatis tampil di daftar
   begitu renderNotifPanel() dipanggil ulang (fungsi ini SUDAH
   memanggilnya sendiri di akhir). */
const NOTIF_CUSTOM_KEY = 'alirin_notif_custom_v1';
function getCustomNotifs() {
  try {
    const raw = cloudStorage.getItem(NOTIF_CUSTOM_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* data korup/localStorage diblokir — anggap kosong */ }
  return [];
}
function saveCustomNotifs(list) {
  try { cloudStorage.setItem(NOTIF_CUSTOM_KEY, JSON.stringify(list)); }
  catch (e) { /* localStorage diblokir — abaikan, tak tersimpan */ }
}
function pushCustomNotification({ source, title, body = '', icon = null, image = null, sentAt = null, target = 'all' } = {}) {
  if (!title) return null; // judul wajib, selain itu semua opsional
  const list = getCustomNotifs();
  const entry = {
    id: 'ntf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    source: source || 'Sistem',
    title, body, icon, image,
    // target: 'all' (tampil ke semua yg berbagi data yang sama, spt
    // sebelumnya) ATAU member_id spesifik (cuma tampil ke user itu --
    // lihat penyaringan di renderNotifPanel() & isNotifVisibleToMe()).
    target: target || 'all',
    sentAt: sentAt || new Date().toISOString()
  };
  list.push(entry);
  saveCustomNotifs(list);
  if (document.getElementById('notifList')) renderNotifPanel();
  return entry.id;
}
function deleteCustomNotification(id) {
  saveCustomNotifs(getCustomNotifs().filter(n => n.id !== id));
  renderNotifPanel();
}
// Diekspos ke window supaya bisa dipanggil dari luar file ini (mis.
// oleh fitur pengiriman notifikasi terpisah yang akan dibangun nanti).
window.pushCustomNotification = pushCustomNotification;

// ---- Cek apakah SATU notifikasi kustom boleh tampil di perangkat
// yang sedang dipakai -- notifikasi bertarget 'all' selalu tampil ke
// semua (spt sebelumnya). Notifikasi bertarget member_id tertentu
// cuma tampil ke: (a) user yang dituju (window.zayaproMemberId cocok),
// atau (b) pemilik asli akun (window.zayaproIsOwner) supaya dia bisa
// meninjau ulang pesan yang sudah dia kirim. User tambahan LAIN yang
// bukan tujuan & bukan pemilik TIDAK melihatnya sama sekali. ----
function isNotifVisibleToMe(target) {
  if (!target || target === 'all') return true;
  if (window.zayaproIsOwner) return true;
  return window.zayaproMemberId != null && target === window.zayaproMemberId;
}

function renderNotifPanel() {
  updateNotifBadge();

  // Halaman ini murni satu feed notifikasi gabungan: tagihan & hutang
  // yang belum lunas (otomatis, kind 'tagihan'/'hutang') DIGABUNG
  // dengan notifikasi bebas/kustom (kind 'custom', lihat
  // pushCustomNotification() di atas -- ini titik sambungnya utk
  // fitur pengiriman notifikasi terpisah yang akan dibangun nanti).
  // Tiap entri dinormalisasi py bentuk yg sama supaya bisa dirender
  // dari satu template: source, title, body, image/ikon, arrivedAt
  // (jam+tanggal SEBENARNYA notifikasi itu masuk -- BUKAN tanggal
  // jatuh tempo -- persis pola notifikasi pada referensi), dan
  // diurutkan dari yang PALING BARU MASUK di paling atas (lazimnya
  // kotak masuk notifikasi), bukan lagi dari yg jatuh temponya
  // paling dekat.
  const unpaidBills = bills.filter(b => b.status === 'belum').map(b => ({
    feedKind: 'tagihan', id: b.id, source: 'Tagihan',
    title: b.name, body: fmtRupiah(b.amount), recurring: !!b.recurring,
    dueDate: b.dueDate, image: null,
    arrivedAt: getOrSetNotifArrival('tagihan', b.id)
  }));
  const unpaidDebts = debts.filter(d => d.status === 'belum').map(d => ({
    feedKind: 'hutang', id: d.id, source: 'Hutang',
    title: d.name, body: fmtRupiah(d.amount), recurring: !!d.recurring,
    dueDate: d.dueDate, image: null,
    arrivedAt: getOrSetNotifArrival('hutang', d.id)
  }));
  const customs = getCustomNotifs()
    .filter(c => isNotifVisibleToMe(c.target))
    .map(c => ({
      feedKind: 'custom', id: c.id, source: c.source || 'Sistem',
      title: c.title, body: c.body || '', recurring: false,
      dueDate: null, image: c.image || null, customIcon: c.icon || null,
      arrivedAt: c.sentAt
    }));

  const fullList = [...unpaidBills, ...unpaidDebts, ...customs]
    .sort((a, b) => new Date(b.arrivedAt) - new Date(a.arrivedAt));

  const listEl = document.getElementById('notifList');

  if (fullList.length === 0) {
    listEl.innerHTML = `<div class="notif-empty">
      <div class="notif-empty-ic">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <p>Tidak ada notifikasi saat ini.</p>
    </div>`;
    return;
  }

  // ---- Kelompokkan daftar per tanggal MASUKNYA notifikasi (mis. "29
  // Agustus 2026"), meniru pola notifikasi ala aplikasi mobile yang
  // mengelompokkan entri per hari alih-alih daftar polos tanpa
  // pemisah. Judul kelompok hanya dicetak sekali per tanggal yang
  // sama (daftar sudah terurut dari yg paling baru masuk). ----
  let lastGroupDate = null;
  listEl.innerHTML = fullList.map(item => {
    const hasDue = !!item.dueDate;
    const due = hasDue ? dueLabel(item.dueDate) : null;
    const urgencyClass = due && due.overdue ? ' overdue' : (due && due.soon ? ' soon' : '');
    // dueClass (due-pill/due-soon) tidak dipakai lagi di sini sejak teks
    // jatuh tempo di baris daftar dihilangkan -- lihat catatan di bawah.
    const readClass = isNotifRead(item.feedKind, item.id) ? ' is-read' : ' unread';
    const arrivedDateOnly = item.arrivedAt.slice(0, 10);
    const groupLabel = notifGroupDateLabel(arrivedDateOnly);
    const groupHeading = groupLabel !== lastGroupDate
      ? `<div class="notif-date-heading">${escapeHtml(groupLabel)}</div>` : '';
    lastGroupDate = groupLabel;
    // PERMINTAAN BARU: ikon kiri & thumbnail kanan tidak lagi seragam
    // (dulu semua baris pakai NOTIF_ITEM_ICON polos, cuma warnanya yg
    // beda lewat CSS .type-hutang) -- SEKARANG tagihan & hutang pakai
    // bentuk ikon yg beda juga (pakai set ikon yg sama dgn banner popup
    // detail, NOTIF_DETAIL_ICONS di bawah), supaya beda kategori
    // langsung kelihatan dari bentuknya, bukan cuma warnanya. Notifikasi
    // kustom tetap pakai customIcon-nya sendiri (atau NOTIF_ITEM_ICON
    // polos sbg fallback kalau tidak bawa ikon).
    const iconMarkup = item.feedKind === 'custom'
      ? (item.customIcon || NOTIF_ITEM_ICON)
      : (NOTIF_DETAIL_ICONS[item.feedKind] || NOTIF_ITEM_ICON);
    const thumbMarkup = item.image
      ? `<img src="${escapeHtmlAttr(item.image)}" alt="" loading="lazy">`
      : iconMarkup;
    return `${groupHeading}
      <div class="notif-item type-${item.feedKind}${urgencyClass}${readClass}" data-notifopen="${item.id}" data-notifkind="${item.feedKind}" role="button" tabindex="0">
        <div class="notif-item-ic">${iconMarkup}</div>
        <div class="notif-item-body">
          <div class="notif-item-source">${escapeHtml(item.source)}</div>
          <div class="nm">
            <span class="nm-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            ${item.recurring ? '<span class="notif-recur-badge" title="Berulang tiap bulan">↻ Bulanan</span>' : ''}
          </div>
          <div class="meta">
            ${item.body ? `<span class="amt">${escapeHtml(item.body)}</span>` : ''}
          </div>
          <!-- PERMINTAAN: baris tanggal jatuh tempo ("X hari lagi"/
               "Jatuh tempo hari ini"/dst) sengaja TIDAK ditampilkan lagi
               di pesan daftar notifikasi ini -- variabel due di atas
               tetap dihitung & dipertahankan krn masih dipakai utk
               urgencyClass (rona latar soon/overdue), cuma teksnya saja
               yg tidak dicetak di sini. -->
          <div class="notif-item-time">${notifTimeLabel(item.arrivedAt)}</div>
        </div>
        <div class="notif-item-thumb${item.image ? ' has-img' : ''}">${thumbMarkup}</div>
      </div>`;
  }).join('');
}

// Label judul pengelompokan tanggal di daftar notifikasi, mis.
// "29 Agustus 2026" (format panjang ala aplikasi mobile), dengan
// sapaan relatif untuk hari ini/besok/kemarin supaya lebih akrab.
function notifGroupDateLabel(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === 0) return 'Hari Ini';
  if (diff === 1) return 'Besok';
  if (diff === -1) return 'Kemarin';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---- Popup detail notifikasi (muncul di atas panel saat 1 baris
// tagihan/hutang di-tap) — meniru kartu detail ala aplikasi mobile:
// banner ikon besar berwarna, judul, tanggal, keterangan, dan tombol
// aksi utama ("Tandai Lunas") + tautan Edit/Hapus. ----
const notifDetailOverlay = document.getElementById('notifDetailOverlay');
const notifDetailSheet = document.getElementById('notifDetailSheet');
let notifDetailCurrent = null; // { kind, id }

const NOTIF_DETAIL_ICONS = {
  tagihan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  hutang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 15.5c0 1.1 1 2 2.5 2s2.5-.9 2.5-2-1-1.7-2.5-2.1S9.5 12.6 9.5 11.5s1-2 2.5-2 2.5.9 2.5 2"/></svg>'
};

function openNotifDetail(kind, id) {
  // Begitu notifikasi dibuka, tandai langsung sebagai "sudah dibaca":
  // baris di daftar (di belakang popup ini) diperbarui di tempat
  // (tanpa render ulang seluruh daftar, biar tidak ada kedipan/lompat
  // posisi scroll) supaya rona birunya langsung hilang begitu popup
  // detail ditutup.
  markNotifRead(kind, id);
  const rowEl = document.querySelector(`.notif-item[data-notifkind="${kind}"][data-notifopen="${id}"]`);
  if (rowEl) { rowEl.classList.remove('unread'); rowEl.classList.add('is-read'); }

  const primaryBtn = document.getElementById('notifDetailPrimaryBtn');
  const editBtn = document.getElementById('notifDetailEditBtn');
  const delBtn = document.getElementById('notifDetailDelBtn');
  const linksWrap = document.querySelector('.notif-detail-links');
  const amtChip = document.querySelector('.notif-detail-amt-chip');
  const bannerEl = document.getElementById('notifDetailBannerIc');

  // ---- Notifikasi KUSTOM (bukan tagihan/hutang) -- popup detail
  // versi ringkas: sumber+waktu masuk sbg "tanggal", gambar/ikonnya
  // sendiri sbg banner (gambar dipasang sbg <img> penuh kalau ada),
  // tanpa chip nominal & tanpa tombol "Tandai Lunas"/Edit (notifikasi
  // kustom tidak py konsep lunas/edit) -- cuma tombol Hapus. ----
  if (kind === 'custom') {
    const item = getCustomNotifs().find(x => x.id === id);
    if (!item) return;
    notifDetailCurrent = { kind, id };

    notifDetailSheet.className = 'modal notif-detail-modal type-custom';
    bannerEl.innerHTML = item.image
      ? `<img src="${escapeHtmlAttr(item.image)}" alt="">`
      : (item.icon || NOTIF_ITEM_ICON);
    document.getElementById('notifDetailTitle').textContent = item.title;
    document.getElementById('notifDetailDate').textContent = `${item.source} · ${notifTimeLabel(item.sentAt)} · ${new Date(item.sentAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    if (amtChip) amtChip.style.display = 'none';
    document.getElementById('notifDetailDesc').textContent = item.body || '';
    if (linksWrap) linksWrap.style.display = '';
    editBtn.style.display = 'none';
    delBtn.style.display = '';
    primaryBtn.style.display = 'none';

    notifDetailOverlay.classList.add('open');
    lockBodyScroll();
    return;
  }

  const store = kind === 'tagihan' ? bills : debts;
  const item = store.find(x => x.id === id);
  if (!item) return;
  notifDetailCurrent = { kind, id };

  const due = dueLabel(item.dueDate);
  const dateFull = new Date(item.dueDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  notifDetailSheet.className = 'modal notif-detail-modal type-' + kind + (due.overdue ? ' overdue' : '');
  bannerEl.innerHTML = NOTIF_DETAIL_ICONS[kind];
  document.getElementById('notifDetailTitle').textContent = item.name;
  document.getElementById('notifDetailDate').textContent = `${due.text} · ${dateFull}`;
  if (amtChip) amtChip.style.display = '';
  document.getElementById('notifDetailAmtLabel').textContent = kind === 'tagihan' ? 'Jumlah Tagihan' : 'Jumlah Hutang';
  document.getElementById('notifDetailAmt').textContent = fmtRupiah(item.amount);

  const desc = kind === 'tagihan'
    ? `Tagihan ${item.name} jatuh tempo pada ${dateFull}. ${due.overdue ? 'Sudah melewati jatuh tempo, segera lunasi agar tidak terkena denda keterlambatan.' : 'Segera lakukan pembayaran sebelum tanggal jatuh tempo.'}`
    : `Hutang ${item.name} perlu dilunasi pada ${dateFull}. ${due.overdue ? 'Sudah melewati tenggat, segera bayar untuk menjaga catatan keuanganmu tetap rapi.' : 'Sisihkan dana agar bisa dilunasi tepat waktu.'}`;
  document.getElementById('notifDetailDesc').textContent = item.note ? `${desc} Catatan: ${item.note}` : desc;

  if (linksWrap) linksWrap.style.display = '';
  editBtn.style.display = '';
  delBtn.style.display = '';
  primaryBtn.textContent = 'Tandai Lunas';
  primaryBtn.style.display = item.status === 'belum' ? '' : 'none';

  notifDetailOverlay.classList.add('open');
  lockBodyScroll();
}
function closeNotifDetail() {
  notifDetailOverlay.classList.remove('open');
  notifDetailCurrent = null;
  if (!notifPanel.classList.contains('open')) unlockBodyScroll();
}
notifDetailOverlay.addEventListener('click', (e) => { if (e.target === notifDetailOverlay) closeNotifDetail(); });
document.getElementById('notifDetailCloseBtn').addEventListener('click', closeNotifDetail);
document.getElementById('notifDetailPrimaryBtn').addEventListener('click', () => {
  if (!notifDetailCurrent) return;
  markPaid(notifDetailCurrent.kind, notifDetailCurrent.id);
  closeNotifDetail();
});
document.getElementById('notifDetailEditBtn').addEventListener('click', () => {
  if (!notifDetailCurrent) return;
  const { kind, id } = notifDetailCurrent;
  if (kind === 'custom') return; // notifikasi kustom tidak py mode edit
  closeNotifDetail();
  closeNotifPanel();
  openEditBillModal(kind, id);
});
document.getElementById('notifDetailDelBtn').addEventListener('click', () => {
  if (!notifDetailCurrent) return;
  const { kind, id } = notifDetailCurrent;
  closeNotifDetail();
  closeNotifPanel();
  if (kind === 'custom') { deleteCustomNotification(id); return; }
  openDeleteConfirm(id, kind);
});

function markPaid(kind, id) {
  const store = kind === 'tagihan' ? bills : debts;
  const persistFn = kind === 'tagihan' ? persistBills : persistDebts;
  const idx = store.findIndex(x => x.id === id);
  if (idx === -1) return;
  const item = store[idx];
  store[idx] = { ...item, status: 'lunas', paidAt: todayStr() };

  // Item berulang (bulanan): begitu ditandai lunas, otomatis dijadwalkan
  // ulang sebulan ke depan sebagai item baru berstatus belum lunas.
  if (item.recurring) {
    store.push({
      id: cryptoId(), name: item.name, amount: item.amount,
      dueDate: addMonthsToDateStr(item.dueDate, 1), note: item.note || '',
      status: 'belum', recurring: true, createdAt: Date.now()
    });
  }
  persistFn(store);

  transactions.push({
    id: cryptoId(), type: 'keluar', amount: item.amount, date: todayStr(),
    category: kind === 'tagihan' ? 'Tagihan' : 'Lainnya',
    desc: (kind === 'tagihan' ? 'Bayar tagihan: ' : 'Bayar hutang: ') + item.name
  });
  persist();

  showToast((kind === 'tagihan' ? 'Tagihan' : 'Hutang') + ' ditandai lunas & dicatat sebagai pengeluaran.'
    + (item.recurring ? ' Dijadwalkan ulang bulan depan.' : ''));
  renderNotifPanel();
  renderBdAllPage();
  refreshAll();
}

// Halaman Notifikasi sekarang full-screen (menutupi seluruh layar,
// bukan lagi panel kecil yang mengambang di dekat tombol), jadi tidak
// perlu lagi dihitung posisinya relatif terhadap tombol pemicu.
function openNotifPanel() {
  notifPanel.classList.add('open');
  notifPanelOverlay.classList.add('open');
  lockBodyScroll();
  renderNotifPanel();
  notifPanel.scrollTop = 0;
  const bodyEl = document.getElementById('notifPageBody');
  if (bodyEl) bodyEl.scrollTop = 0;
}
function closeNotifPanel() {
  notifPanel.classList.remove('open');
  notifPanelOverlay.classList.remove('open');
  if (notifDetailSheet.classList.contains('open')) closeNotifDetail();
  unlockBodyScroll();
}

// Tombol "Riwayat Transaksi" lompat LANGSUNG ke tabel transaksinya
// (#txTableWrap), bukan cuma ke awal section (yang sebelum tabel masih
// ada kartu Ringkasan Total & baris tab/filter) — supaya user sekali
// klik langsung lihat daftar transaksinya, tanpa perlu scroll manual
// lagi. Fallback ke #historySection kalau elemen tabelnya entah
// kenapa tidak ditemukan.
function scrollToTransactionTable() {
  // Daftar transaksi sekarang tinggal di halaman Laporan (tab
  // "Aktifitas"), bukan lagi di Beranda -- pindah ke sana dulu kalau
  // belum aktif, baru scroll ke tabelnya, supaya tombol "Riwayat
  // Transaksi" di Beranda tetap terasa langsung "melompat" ke
  // datanya seperti sebelumnya.
  if (window.zpShowPage) window.zpShowPage('laporan');
  requestAnimationFrame(() => {
    const target = document.getElementById('txTableWrap') || document.getElementById('historySection');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
document.getElementById('historyJumpBtn').addEventListener('click', scrollToTransactionTable);
// Versi mini topbar dari tombol Riwayat, Tagihan & Hutang, dan Tambah
// Transaksi di atas — aksinya sama persis dengan tombol aslinya di
// banner besar, cuma elemennya beda (mini topbar posisinya fixed
// terpisah supaya tetap bisa diakses walau banner besar sudah
// discroll ke atas).
document.getElementById('miniHistoryBtn').addEventListener('click', scrollToTransactionTable);
document.getElementById('miniAddBtn').addEventListener('click', () => openAddModal());

// ---- Kartu "Fast Menu" di Beranda (#fastMenuHomeCard) ----
// Tiap tombol adalah pintasan ke fitur yang sudah ada di aplikasi:
// Tambah Transaksi, Tagihan & Hutang, Laporan, Dompet, Sumber
// Pendapatan, dan Pengaturan (tab "Saya" di navigasi bawah).
document.getElementById('fmHomeAddTxBtn')?.addEventListener('click', () => openAddModal());
document.getElementById('fmHomeTagihanBtn')?.addEventListener('click', () => {
  if (window.zpShowPage) window.zpShowPage('tagihan');
});
document.getElementById('fmHomeLaporanBtn')?.addEventListener('click', () => {
  if (window.zpShowPage) window.zpShowPage('laporan');
});
document.getElementById('fmHomeDompetBtn')?.addEventListener('click', () => {
  if (window.zpShowPage) window.zpShowPage('dompet');
});
document.getElementById('fmHomeSumberBtn')?.addEventListener('click', () => openIncomeSourcePage());
document.getElementById('fmHomeSayaBtn')?.addEventListener('click', () => {
  if (window.zpShowPage) window.zpShowPage('saya');
});

notifBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  notifPanel.classList.contains('open') ? closeNotifPanel() : openNotifPanel();
});
document.getElementById('miniNotifBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  notifPanel.classList.contains('open') ? closeNotifPanel() : openNotifPanel();
});
document.getElementById('notifCloseBtn').addEventListener('click', closeNotifPanel);
notifPanelOverlay.addEventListener('click', closeNotifPanel);
document.getElementById('notifList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-notifopen]');
  if (row) openNotifDetail(row.dataset.notifkind, row.dataset.notifopen);
});
document.getElementById('notifList').addEventListener('keydown', (e) => {
  const row = e.target.closest('[data-notifopen]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNotifDetail(row.dataset.notifkind, row.dataset.notifopen); }
});
document.addEventListener('click', (e) => {
  if (!notifPanel.classList.contains('open')) return;
  // Panel sekarang berada di luar .notif-wrap (dipindah ke level teratas
  // dokumen supaya tidak tertutup elemen lain), jadi klik di dalam panel
  // itu sendiri juga harus dianggap "di dalam", bukan cuma tombol pemicunya.
  if (!e.target.closest('.notif-wrap') && !e.target.closest('#notifPanel') && !e.target.closest('#notifDetailSheet') && !e.target.closest('#notifDetailOverlay')) closeNotifPanel();
});
/* ==========================================================
   HALAMAN "SEMUA TAGIHAN & HUTANG"
   Menampilkan seluruh data tagihan & hutang yang pernah
   ditambahkan (termasuk yang sudah lunas), lengkap dengan
   pencarian, filter jenis & status — dipisah dari popup
   notifikasi supaya popup tetap ringkas.
========================================================== */
let bdAllTab = 'semua';     // 'semua' | 'tagihan' | 'hutang' | 'lunas'
let bdAllStatus = 'semua';  // 'semua' | 'belum' | 'lunas'
// Tab (.app-page) yang aktif SEBELUM overlay "Semua Tagihan & Hutang"
// dibuka -- direkam di openBdAllPage(), lalu dipakai closeBdAllPage()
// untuk balik ke tab yang BENAR waktu overlay ditutup lewat jalur
// "implisit" (tombol X di dalam overlay, tombol Escape/back, atau
// setelah selesai suatu aksi seperti bayar tagihan) -- BUKAN selalu
// dipaksa balik ke Beranda seperti sebelumnya, yang bikin nav bawah
// & isi halaman jadi tidak sinkron kalau overlay ini dibuka dari tab
// selain Beranda (mis. dari Dompet/Laporan/Pengaturan).
let bdAllReturnPage = 'beranda';
let bdAllSearch = '';
let bdAllDateFrom = '';    // 'YYYY-MM-DD' atau '' (tidak difilter)
let bdAllDateTo = '';      // 'YYYY-MM-DD' atau '' (tidak difilter)
let bdAllFilteredCache = []; // hasil filter/sort terakhir, dipakai juga oleh tombol unduh CSV

/* Tanggal acuan sebuah item untuk keperluan filter pertanggal:
   item yang masih aktif dipatok ke tanggal jatuh temponya, item yang
   sudah lunas dipatok ke tanggal ia dibayar (fallback ke jatuh tempo
   kalau entah kenapa belum tercatat). */
function bdAllRefDate(item) {
  return item.status === 'lunas' ? (item.paidAt || item.dueDate) : item.dueDate;
}

function bdAllCombinedData() {
  return [
    ...bills.map(b => ({ ...b, kind: 'tagihan' })),
    ...debts.map(d => ({ ...d, kind: 'hutang' })),
  ];
}

function renderBdAllSummary(all) {
  const unpaidBills = bills.filter(b => b.status === 'belum');
  const unpaidDebts = debts.filter(d => d.status === 'belum');
  const paidAll = all.filter(x => x.status === 'lunas');
  const overdueAll = all.filter(x => x.status === 'belum' && daysUntil(x.dueDate) < 0);
  const totalBills = unpaidBills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const totalDebts = unpaidDebts.reduce((s, d) => s + Number(d.amount || 0), 0);
  const notesCount = all.filter(x => (x.note || '').trim()).length;

  document.getElementById('bdAllSummary').innerHTML = `
    <div class="bd-summary-card">
      <div class="k">Tagihan Aktif</div>
      <div class="v">${fmtRupiah(totalBills)}</div>
      <div class="sub">${unpaidBills.length} item</div>
    </div>
    <div class="bd-summary-card debt">
      <div class="k">Hutang Aktif</div>
      <div class="v">${fmtRupiah(totalDebts)}</div>
      <div class="sub">${unpaidDebts.length} item</div>
    </div>
    <div class="bd-summary-card overdue">
      <div class="k">Terlambat</div>
      <div class="v">${overdueAll.length}</div>
      <div class="sub">item lewat jatuh tempo</div>
    </div>
    <div class="bd-summary-card paid">
      <div class="k">Sudah Lunas</div>
      <div class="v">${paidAll.length}</div>
      <div class="sub">total riwayat</div>
    </div>
    <div class="bd-summary-card notes">
      <div class="k">Catatan</div>
      <div class="v">${notesCount}</div>
      <div class="sub">item ada catatan</div>
    </div>`;
}

function renderBdAllNotes(all) {
  const notesEl = document.getElementById('bdAllNotes');
  if (!notesEl) return;
  // Hanya item yang kolom "Catatan"-nya diisi -- item aktif ditampilkan
  // lebih dulu (urut jatuh tempo terdekat), baru item yang sudah lunas,
  // meniru urutan yang sama dipakai daftar utama di bawahnya.
  const withNotes = all
    .filter(x => (x.note || '').trim())
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'belum' ? -1 : 1;
      if (a.status === 'belum') return a.dueDate.localeCompare(b.dueDate);
      return (b.paidAt || '').localeCompare(a.paidAt || '');
    });

  notesEl.classList.toggle('empty', withNotes.length === 0);
  if (withNotes.length === 0) { notesEl.innerHTML = ''; return; }

  notesEl.innerHTML = withNotes.map(item => `
    <div class="bd-note-card type-${item.kind}">
      <span class="bd-note-ic">
        ${item.kind === 'tagihan'
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M9.5 15.5c0 1.1 1 2 2.5 2s2.5-.9 2.5-2-1-1.7-2.5-2.1S9.5 12.6 9.5 11.5s1-2 2.5-2 2.5.9 2.5 2"/></svg>'}
      </span>
      <span class="bd-note-body">
        <span class="nm" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="tx" title="${escapeHtml(item.note)}">${escapeHtml(item.note)}</span>
      </span>
    </div>`).join('');
}

function renderBdAllPage() {
  if (!document.getElementById('bdAllOverlay').classList.contains('open')) return;

  const all = bdAllCombinedData();
  renderBdAllSummary(all);
  renderBdAllNotes(all);

  document.querySelectorAll('#bdAllTabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.bdtab === bdAllTab));

  let filtered = all;
  // Pil "Lunas" bukan jenis item (kind-nya tetap tagihan/hutang seperti
  // biasa) -- pil ini cuma nyaring item yang status-nya sudah lunas,
  // beda logikanya dari pil "Tagihan"/"Hutang" yang nyaring lewat kind.
  if (bdAllTab === 'lunas') filtered = filtered.filter(x => x.status === 'lunas');
  else if (bdAllTab !== 'semua') filtered = filtered.filter(x => x.kind === bdAllTab);
  if (bdAllStatus !== 'semua') filtered = filtered.filter(x => x.status === bdAllStatus);
  const q = bdAllSearch.trim().toLowerCase();
  if (q) filtered = filtered.filter(x => x.name.toLowerCase().includes(q));
  if (bdAllDateFrom) filtered = filtered.filter(x => bdAllRefDate(x) >= bdAllDateFrom);
  if (bdAllDateTo) filtered = filtered.filter(x => bdAllRefDate(x) <= bdAllDateTo);

  filtered = filtered.sort((a, b) => {
    // Item aktif ditampilkan dulu (urut jatuh tempo terdekat),
    // baru item yang sudah lunas (urut dari yang paling baru dibayar).
    if (a.status !== b.status) return a.status === 'belum' ? -1 : 1;
    if (a.status === 'belum') return a.dueDate.localeCompare(b.dueDate);
    return (b.paidAt || '').localeCompare(a.paidAt || '');
  });

  bdAllFilteredCache = filtered;

  const listEl = document.getElementById('bdAllList');

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="bd-empty">
      <div class="bd-empty-ic">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>
      </div>
      <p>Tidak ada data tagihan/hutang yang cocok dengan filter ini.</p>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(item => {
    const isPaid = item.status === 'lunas';
    const due = dueLabel(item.dueDate);
    const urgencyClass = !isPaid && due.overdue ? ' overdue' : (!isPaid && due.soon ? ' soon' : '');
    const dueClass = due.overdue ? ' due-pill' : (due.soon ? ' due-soon' : '');
    return `
      <div class="bd-item type-${item.kind}${urgencyClass}${isPaid ? ' paid' : ''}">
        <div class="bd-item-ic">
          ${item.kind === 'tagihan'
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M9.5 15.5c0 1.1 1 2 2.5 2s2.5-.9 2.5-2-1-1.7-2.5-2.1S9.5 12.6 9.5 11.5s1-2 2.5-2 2.5.9 2.5 2"/></svg>'}
        </div>
        <div class="bd-item-body">
          <div class="nm">
            <span class="nm-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            ${item.recurring ? '<span class="notif-recur-badge" title="Berulang tiap bulan">↻ Bulanan</span>' : ''}
          </div>
          <div class="meta">
            <span class="amt">${fmtRupiah(item.amount)}</span>
            ${isPaid ? `<span class="status-pill">Lunas</span>` : `<span class="due${dueClass}"><span class="due-text">${due.text}</span></span>`}
          </div>
        </div>
        <div class="bd-item-actions">
          ${isPaid ? '' : `<button class="pay-btn" data-bdpay="${item.id}" data-bdkind="${item.kind}" title="Tandai lunas">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg>
          </button>`}
          <button class="edit-btn" data-bdedit="${item.id}" data-bdkind="${item.kind}" title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="del-btn" data-bddel="${item.id}" data-bdkind="${item.kind}" title="Hapus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function openBdAllPage(initialTab) {
  if (document.getElementById('detailPageOverlay').classList.contains('open')) closeDetailPage();
  if (document.getElementById('leaderboardOverlay').classList.contains('open')) closeLeaderboardPage();
  if (document.getElementById('widgetSettingsOverlay').classList.contains('open')) closeWidgetSettingsPage();
  if (document.getElementById('incomeSourceOverlay').classList.contains('open')) closeIncomeSourcePage();

  // Rekam tab yang lagi aktif SEKARANG (sebelum overlay ini dibuka),
  // supaya closeBdAllPage() nanti tahu harus balik ke tab yang mana --
  // bisa Beranda, tapi bisa juga Laporan/Dompet/Pengaturan kalau
  // overlay ini dibuka dari salah satu tab itu (mis. lewat ikon
  // lonceng di mini-topbar, yang tetap muncul di semua tab).
  var currentActivePage = document.querySelector('.app-page.active');
  bdAllReturnPage = currentActivePage ? currentActivePage.dataset.page : 'beranda';

  bdAllTab = (initialTab === 'tagihan' || initialTab === 'hutang') ? initialTab : 'semua';
  bdAllStatus = 'semua';
  bdAllSearch = '';
  bdAllDateFrom = '';
  bdAllDateTo = '';
  // Pastikan baris cari/tanggal & inputnya balik ke kondisi tertutup +
  // kosong tiap kali halaman ini dibuka ulang, supaya tidak kebawa
  // status terbuka/terisi dari sesi buka-tutup sebelumnya.
  document.getElementById('bdSearchRow').hidden = true;
  document.getElementById('bdDateRow').hidden = true;
  document.getElementById('bdSearchToggleBtn').classList.remove('active');
  document.getElementById('bdDateToggleBtn').classList.remove('active');
  document.getElementById('bdSearchInput').value = '';
  document.getElementById('bdDateFromInput').value = '';
  document.getElementById('bdDateToInput').value = '';

  document.getElementById('bdAllOverlay').classList.add('open');
  // FIX "halaman/scroll bocor di belakang panel Tagihan & Hutang di
  // berbagai perangkat (khususnya iOS Safari)": sebelumnya cuma
  // document.body.style.overflow='hidden' -- TIDAK cukup untuk
  // benar-benar mengunci scroll di Safari iOS (halaman di belakang
  // overlay masih bisa ke-scroll/rubber-band), dan juga tidak
  // menyimpan+mengembalikan posisi scroll halaman asal dengan benar.
  // Sekarang pakai lockBodyScroll()/unlockBodyScroll() yang sama
  // dipakai semua modal/overlay lain di app ini (lihat catatan di
  // definisinya) supaya perilakunya konsisten di semua perangkat.
  lockBodyScroll();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  renderBdAllPage();
  updateTabIndicator(document.getElementById('bdAllTabs'));
  setBottomNavActive('tagihan');

  // FIX "refresh di halaman Tagihan & Hutang malah pindah ke menu
  // lain": overlay ini (beda dari tab Beranda/Laporan/Dompet/
  // Pengaturan) sebelumnya TIDAK pernah disimpan statusnya sama
  // sekali -- jadi begitu di-refresh, yang muncul kembali cuma tab
  // .app-page biasa di baliknya (bdAllReturnPage), overlay-nya sendiri
  // hilang seolah-olah "pindah menu". Sekarang status "sedang
  // terbuka" + sub-tabnya (Semua/Tagihan/Hutang) disimpan ke
  // sessionStorage, lalu dibaca lagi & overlay ini dibuka ULANG
  // otomatis di akhir init() (lihat pemanggilannya di bawah) setiap
  // kali halaman selesai dimuat ulang.
  try {
    sessionStorage.setItem('zp_tagihan_open', '1');
    sessionStorage.setItem('zp_tagihan_tab', bdAllTab);
  } catch (e) { /* sessionStorage tidak tersedia -- abaikan */ }
}
function closeBdAllPage() {
  document.getElementById('bdAllOverlay').classList.remove('open');
  unlockBodyScroll();
  try {
    sessionStorage.removeItem('zp_tagihan_open');
    sessionStorage.removeItem('zp_tagihan_tab');
  } catch (e) { /* abaikan */ }
  // FIX "nav & isi halaman tidak sinkron setelah nutup Tagihan &
  // Hutang": dulu di sini SELALU dipaksa setBottomNavActive('beranda')
  // apa pun tab asalnya -- itu cuma mengubah highlight tombol nav,
  // TIDAK ikut memindahkan .app-page yang benar-benar tampil, jadi
  // kalau overlay ini dibuka dari tab Dompet/Laporan/Pengaturan,
  // waktu ditutup highlight nav lompat ke "Beranda" padahal konten
  // yang kelihatan sebenarnya masih tab asal itu (atau malah tidak
  // konsisten). Sekarang dipanggil window.zpShowPage() (fungsi
  // showPage() dari script inline "NAVIGASI BAWAH" di index.html,
  // sengaja diekspos ke window supaya bisa dipanggil dari sini) yang
  // memindahkan .app-page, highlight nav, DAN visibilitas footer
  // sekaligus secara konsisten, balik ke tab yang benar-benar aktif
  // sebelum overlay dibuka (bdAllReturnPage, direkam di
  // openBdAllPage()). Fallback ke setBottomNavActive('beranda') tetap
  // disediakan untuk jaga-jaga kalau script inline itu belum sempat
  // jalan (harusnya tidak pernah terjadi dalam pemakaian normal).
  if (typeof window.zpShowPage === 'function') {
    window.zpShowPage(bdAllReturnPage);
  } else {
    setBottomNavActive(bdAllReturnPage || 'beranda');
  }
}

/* ---------- Sinkronkan tombol aktif di navigasi bawah ----------
   Dipanggil tiap kali halaman "Semua Tagihan & Hutang" dibuka/ditutup,
   supaya tombol "Tagihan" di nav bawah ikut menyala saat halamannya
   terbuka, dan kembali ke "Beranda" saat ditutup. */
function setBottomNavActive(pageKey) {
  document.querySelectorAll('#bottomNav .bn-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageKey);
  });
}

/* ---------- Tombol "Tagihan" di navigasi bawah ----------
   Membuka langsung halaman "Semua Tagihan & Hutang" (sama seperti
   tombol "Lihat Semua" di panel notifikasi lonceng). */
document.getElementById('bnTagihanBtn').addEventListener('click', () => {
  openBdAllPage('semua');
});

/* ---------- Tombol "Beranda" (dan tombol tab lain) di navigasi bawah ----------
   CATATAN: listener khusus yang dulu ada di sini untuk tombol
   "Beranda" (menutup overlay Tagihan & Hutang kalau sedang terbuka)
   SUDAH DIPINDAH & DIGABUNG ke satu tempat saja, yaitu script inline
   "NAVIGASI BAWAH" di index.html -- supaya SEMUA tombol tab (Beranda,
   Laporan, Dompet, Pengaturan) konsisten menutup overlay ini dulu
   sebelum pindah tab, bukan cuma tombol Beranda saja seperti
   sebelumnya (itulah sebabnya dulu pindah dari Tagihan & Hutang ke
   Laporan/Dompet/Pengaturan malah overlay-nya nyangkut tidak
   tertutup). Menyimpan 2 listener terpisah yang saling tidak tahu
   (satu di sini, satu di index.html) untuk tombol yang sama juga
   berisiko race condition soal urutan eksekusi -- makanya
   disederhanakan jadi satu jalur logika saja. */

/* FIX "pil tab Semua/Tagihan/Hutang/Catatan tidak berfungsi": listener
   klik di bawah ini SEBELUMNYA ikut kebungkus di dalam komentar
   penjelasan di atas (komentarnya belum ditutup sebelum kode ini),
   sehingga seluruh addEventListener ini dianggap teks komentar oleh
   JS -- bukan kode yang benar-benar jalan -- jadi klik pada pil tab
   sama sekali tidak berefek. Sekarang komentarnya sudah ditutup rapi
   di atas, jadi listener ini kembali aktif. */
document.getElementById('bdAllTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-bdtab]');
  if (!btn) return;
  bdAllTab = btn.dataset.bdtab;
  renderBdAllPage();
  updateTabIndicator(document.getElementById('bdAllTabs'));
});

/* ---------- Tombol Cari / Cek data pertanggal / Download di toolbar ----------
   Baris pencarian & baris filter tanggal disembunyikan lewat atribut
   HTML "hidden" secara default, dibuka/ditutup saat tombol ikon
   terkait diklik. Supaya toolbar tidak makan tempat dobel di layar
   sempit, cuma SATU baris (cari ATAU tanggal) yang boleh terbuka
   dalam satu waktu -- buka salah satu otomatis menutup yang lain. */
const bdSearchToggleBtn = document.getElementById('bdSearchToggleBtn');
const bdDateToggleBtn = document.getElementById('bdDateToggleBtn');
const bdDownloadBtn = document.getElementById('bdDownloadBtn');
const bdSearchRow = document.getElementById('bdSearchRow');
const bdDateRow = document.getElementById('bdDateRow');
const bdSearchInput = document.getElementById('bdSearchInput');
const bdSearchCloseBtn = document.getElementById('bdSearchCloseBtn');
const bdDateFromInput = document.getElementById('bdDateFromInput');
const bdDateToInput = document.getElementById('bdDateToInput');
const bdDateResetBtn = document.getElementById('bdDateResetBtn');

function closeBdSearchRow() {
  bdSearchRow.hidden = true;
  bdSearchToggleBtn.classList.remove('active');
  bdSearchToggleBtn.setAttribute('aria-expanded', 'false');
  if (bdAllSearch) { bdAllSearch = ''; bdSearchInput.value = ''; renderBdAllPage(); }
}
function closeBdDateRow() {
  bdDateRow.hidden = true;
  bdDateToggleBtn.classList.remove('active');
  bdDateToggleBtn.setAttribute('aria-expanded', 'false');
  if (bdAllDateFrom || bdAllDateTo) {
    bdAllDateFrom = ''; bdAllDateTo = '';
    bdDateFromInput.value = ''; bdDateToInput.value = '';
    renderBdAllPage();
  }
}

bdSearchToggleBtn.addEventListener('click', () => {
  const willOpen = bdSearchRow.hidden;
  closeBdDateRow();
  if (willOpen) {
    bdSearchRow.hidden = false;
    bdSearchToggleBtn.classList.add('active');
    bdSearchToggleBtn.setAttribute('aria-expanded', 'true');
    bdSearchInput.focus();
  } else {
    closeBdSearchRow();
  }
});
bdDateToggleBtn.addEventListener('click', () => {
  const willOpen = bdDateRow.hidden;
  closeBdSearchRow();
  if (willOpen) {
    bdDateRow.hidden = false;
    bdDateToggleBtn.classList.add('active');
    bdDateToggleBtn.setAttribute('aria-expanded', 'true');
  } else {
    closeBdDateRow();
  }
});
bdSearchInput.addEventListener('input', () => {
  bdAllSearch = bdSearchInput.value;
  renderBdAllPage();
});
bdSearchCloseBtn.addEventListener('click', closeBdSearchRow);
bdDateFromInput.addEventListener('change', () => {
  bdAllDateFrom = bdDateFromInput.value;
  renderBdAllPage();
});
bdDateToInput.addEventListener('change', () => {
  bdAllDateTo = bdDateToInput.value;
  renderBdAllPage();
});
bdDateResetBtn.addEventListener('click', closeBdDateRow);

/* Unduh data tagihan/hutang yang SEDANG TAMPIL (mengikuti pil tab &
   filter cari/tanggal yang aktif saat tombol ini diklik) sebagai file
   CSV -- dipakai dari bdAllFilteredCache yang sudah dihitung ulang
   tiap kali renderBdAllPage() jalan. Format CSV pakai pemisah titik-
   koma (;) + BOM UTF-8 supaya kebuka rapi di Excel versi Indonesia. */
function downloadBdAllCsv() {
  if (!bdAllFilteredCache.length) {
    showToast('Tidak ada data tagihan/hutang untuk diunduh.', 'err');
    return;
  }
  const header = ['Jenis', 'Nama', 'Jumlah (Rp)', 'Status', 'Jatuh Tempo', 'Tanggal Lunas', 'Berulang Bulanan', 'Catatan'];
  const rows = bdAllFilteredCache.map(item => [
    item.kind === 'hutang' ? 'Hutang' : 'Tagihan',
    item.name || '',
    Math.round(Number(item.amount) || 0),
    item.status === 'lunas' ? 'Lunas' : 'Belum Lunas',
    item.dueDate || '',
    item.paidAt || '',
    item.recurring ? 'Ya' : 'Tidak',
    (item.note || '').replace(/\r?\n/g, ' ')
  ]);
  const csvEscape = (val) => {
    const s = String(val);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map(r => r.map(csvEscape).join(';'));
  const csvContent = '\uFEFF' + lines.join('\r\n');
  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `tagihan-hutang_${todayStr()}.csv`);
  showToast('File CSV tagihan & hutang berhasil diunduh.');
}
bdDownloadBtn.addEventListener('click', downloadBdAllCsv);

document.getElementById('bdAllAddBtn').addEventListener('click', () => {
  openBillModal(bdAllTab === 'hutang' ? 'hutang' : 'tagihan');
});
document.getElementById('bdAllList').addEventListener('click', (e) => {
  const payBtn = e.target.closest('[data-bdpay]');
  const editBtn = e.target.closest('[data-bdedit]');
  const delBtn = e.target.closest('[data-bddel]');
  if (payBtn) markPaid(payBtn.dataset.bdkind, payBtn.dataset.bdpay);
  if (editBtn) openEditBillModal(editBtn.dataset.bdkind, editBtn.dataset.bdedit);
  if (delBtn) openDeleteConfirm(delBtn.dataset.bddel, delBtn.dataset.bdkind);
});

/* ==========================================================
   INIT
========================================================== */
function refreshAll() {
  renderSummary();
  populateCategoryFilter();
  updateLapMonthFieldLabel();
  updateLapDateRangeFieldLabel();
  renderTransactionList();
  renderChart();
  renderYearlyBarChart();
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmModal.classList.contains('open')) { deletingId = null; closeModal(confirmModal); return; }
  if (txModal.classList.contains('open')) { closeModal(txModal); return; }
  if (deviceModal.classList.contains('open')) { closeModal(deviceModal); return; }
  if (walletModal.classList.contains('open')) { closeModal(walletModal); return; }
  if (socialModal.classList.contains('open')) { closeModal(socialModal); return; }
  if (appSettingsModal.classList.contains('open')) { closeModal(appSettingsModal); return; }
  if (incomeModal.classList.contains('open')) { closeModal(incomeModal); return; }
  if (billModal.classList.contains('open')) { closeModal(billModal); return; }
  if (notifDetailSheet.classList.contains('open')) { closeNotifDetail(); return; }
  if (notifPanel.classList.contains('open')) closeNotifPanel();
  if (aiSettingsModal.classList.contains('open')) { closeModal(aiSettingsModal); return; }
  if (aiChatPanel.classList.contains('open')) closeAiChatPanel();
});

/* ==========================================================
   FOOTER
========================================================== */
function goToDashboard() {
  // Tutup semua halaman/panel/menu yang mungkin sedang terbuka,
  // supaya tombol "Dashboard" di footer selalu membawa kembali
  // ke tampilan utama dari halaman/section manapun.
  if (document.getElementById('detailPageOverlay').classList.contains('open')) closeDetailPage();
  if (document.getElementById('leaderboardOverlay').classList.contains('open')) closeLeaderboardPage();
  if (document.getElementById('widgetSettingsOverlay').classList.contains('open')) closeWidgetSettingsPage();
  if (document.getElementById('incomeSourceOverlay').classList.contains('open')) closeIncomeSourcePage();
  if (document.getElementById('bdAllOverlay').classList.contains('open')) closeBdAllPage();
  if (notifPanel.classList.contains('open')) closeNotifPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initFooter() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  document.getElementById('footerNavDashboard').addEventListener('click', goToDashboard);

  document.getElementById('footerNavLeaderboard').addEventListener('click', () => {
    if (document.getElementById('detailPageOverlay').classList.contains('open')) closeDetailPage();
    if (document.getElementById('widgetSettingsOverlay').classList.contains('open')) closeWidgetSettingsPage();
    if (document.getElementById('incomeSourceOverlay').classList.contains('open')) closeIncomeSourcePage();
    openLeaderboardPage();
  });

  document.getElementById('footerNavWidget').addEventListener('click', () => {
    if (document.getElementById('detailPageOverlay').classList.contains('open')) closeDetailPage();
    if (document.getElementById('leaderboardOverlay').classList.contains('open')) closeLeaderboardPage();
    if (document.getElementById('incomeSourceOverlay').classList.contains('open')) closeIncomeSourcePage();
    openWidgetSettingsPage();
  });

  document.getElementById('footerNavTop').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  initCloudLogoutButton();
}

/* Tombol "Keluar" -- di desktop/tablet dibuat mengambang lewat JS
   (bukan ditaruh manual di index.html) supaya tidak mengganggu markup
   footer yang sudah ada. Di HP, tombol mengambang ini disembunyikan
   (lihat CSS .cloud-logout-btn-desktop) dan diganti dengan ikon
   #miniLogoutBtn yang sudah ada di dalam mini-topbar (#miniTopbar),
   supaya tidak menumpuk dengan logo/nama app yang sama-sama nongkrong
   di pojok kiri atas pada layar kecil. Keduanya memanggil
   window.cloudSignOut() dari cloud-sync.js, yang akan sign-out dari
   Supabase lalu me-reload halaman ke layar login. */
function initCloudLogoutButton() {
  // Tombol "Keluar" mengambang di pojok kiri atas (desktop) sudah
  // dihapus atas permintaan -- fungsi logout tetap tersedia lewat
  // menu Settings (baris "Logout"/"Masuk") dan mini-topbar di HP.

  // Versi HP: ikon yang sudah ada di mini-topbar, cukup ditampilkan
  // (default disembunyikan lewat inline style di index.html) & diberi
  // fungsi klik yang sama (Keluar kalau sudah login, buka popup
  // Masuk/Daftar kalau belum -- lihat handleAccountToggleClick di atas)
  // dengan tombol "+" pada banner utama.
  const miniBtn = document.getElementById('miniLogoutBtn');
  if (miniBtn && !miniBtn._logoutBound) {
    miniBtn._logoutBound = true;
    miniBtn.style.display = '';
    miniBtn.addEventListener('click', handleAccountToggleClick);
  }
}

/* ==========================================================
   TANYA AI — chat umum & chat berbasis data (Gemini API)
========================================================== */
const AI_SETTINGS_KEY = 'zayapro_ai_settings';
const AI_CHAT_HISTORY_KEY = 'zayapro_ai_chat_history';
const AI_DEFAULT_MODEL = 'gemini-3.7-flash';

function loadAiSettings() {
  try {
    const raw = cloudStorage.getItem(AI_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* abaikan */ }
  return { apiKey: '', model: '' };
}
function persistAiSettings(data) {
  try { cloudStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(data)); }
  catch (e) { showToast('Gagal menyimpan pengaturan AI.', 'err'); }
}
let aiSettings = loadAiSettings();

function loadAiChatHistory() {
  try {
    const raw = cloudStorage.getItem(AI_CHAT_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* abaikan */ }
  return { umum: [], data: [] };
}
function persistAiChatHistory() {
  try { cloudStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(aiChatHistory)); }
  catch (e) { /* biarkan gagal senyap, riwayat chat tidak kritikal */ }
}
let aiChatHistory = loadAiChatHistory();
let aiActiveTab = 'umum';
let aiIsSending = false;

const aiFabBtn = document.getElementById('aiFabBtn');
const aiFabDot = document.getElementById('aiFabDot');
const aiChatOverlay = document.getElementById('aiChatOverlay');
const aiChatPanel = document.getElementById('aiChatPanel');
const aiChatCloseBtn = document.getElementById('aiChatCloseBtn');
const aiChatTabs = document.getElementById('aiChatTabs');
const aiChatBody = document.getElementById('aiChatBody');
const aiChatInput = document.getElementById('aiChatInput');
const aiChatSendBtn = document.getElementById('aiChatSendBtn');
const aiChatFootHint = document.getElementById('aiChatFootHint');
const aiKeyBanner = document.getElementById('aiKeyBanner');
const aiKeyBannerBtn = document.getElementById('aiKeyBannerBtn');
const aiSettingsBtn = document.getElementById('aiSettingsBtn');
const aiSettingsModal = document.getElementById('aiSettingsModalOverlay');
const aiSettingsCloseBtn = document.getElementById('aiSettingsCloseBtn');
const aiSettingsForm = document.getElementById('aiSettingsForm');
const aiApiKeyInput = document.getElementById('aiApiKeyInput');
const aiModelInput = document.getElementById('aiModelInput');
const aiSettingsClearBtn = document.getElementById('aiSettingsClearBtn');
const aiSettingsTestBtn = document.getElementById('aiSettingsTestBtn');
const aiTestResult = document.getElementById('aiTestResult');
const aiApiKeyToggle = document.getElementById('aiApiKeyToggle');

/* Toggle mata polos (tanpa border/box) untuk field password/API key --
   cukup ganti type input antara "password" <-> "text" & tukar ikon
   mata terbuka/tercoret, tidak menyentuh style tombolnya (sudah diatur
   lewat class .pw-eye-toggle di CSS supaya tetap tanpa bingkai). */
const EYE_ICON_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_ICON_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';
function bindPasswordEyeToggle(inputEl, btnEl) {
  if (!inputEl || !btnEl) return;
  btnEl.addEventListener('click', () => {
    const nowVisible = inputEl.type === 'password';
    inputEl.type = nowVisible ? 'text' : 'password';
    btnEl.innerHTML = nowVisible ? EYE_ICON_OFF : EYE_ICON_OPEN;
    btnEl.setAttribute('aria-pressed', String(nowVisible));
    btnEl.setAttribute('aria-label', nowVisible ? 'Sembunyikan API key' : 'Tampilkan API key');
  });
}
bindPasswordEyeToggle(aiApiKeyInput, aiApiKeyToggle);

function openAiChatPanel() {
  openModal(aiChatOverlay);
  aiChatPanel.classList.add('open');
  if (aiFabDot) aiFabDot.style.display = 'none';
  renderAiKeyBanner();
  renderAiMessages();
  setTimeout(() => aiChatInput && aiChatInput.focus(), 260);
}
function closeAiChatPanel() {
  aiChatPanel.classList.remove('open');
  closeModal(aiChatOverlay);
}
if (aiFabBtn) aiFabBtn.addEventListener('click', () => {
  if (aiChatPanel.classList.contains('open')) { closeAiChatPanel(); return; }
  if (!requireCloudLogin('Masuk untuk menggunakan Tanya AI.')) return;
  openAiChatPanel();
});
if (aiChatCloseBtn) aiChatCloseBtn.addEventListener('click', closeAiChatPanel);
if (aiChatOverlay) aiChatOverlay.addEventListener('click', closeAiChatPanel);

function switchAiTab(tab) {
  aiActiveTab = tab;
  aiChatTabs.querySelectorAll('.ai-chat-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.aitab === tab);
  });
  aiChatFootHint.textContent = tab === 'data'
    ? 'Mode Data Saya — jawaban memakai ringkasan saldo, transaksi, tagihan & hutangmu.'
    : 'Mode Umum — jawaban tidak memakai data keuanganmu.';
  renderAiMessages();
}
if (aiChatTabs) aiChatTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.ai-chat-tab-btn');
  if (!btn) return;
  switchAiTab(btn.dataset.aitab);
});

function renderAiKeyBanner() {
  const hasKey = !!(aiSettings.apiKey && aiSettings.apiKey.trim());
  aiKeyBanner.style.display = hasKey ? 'none' : 'flex';
}
if (aiKeyBannerBtn) aiKeyBannerBtn.addEventListener('click', openAiSettingsModal);

function openAiSettingsModal() {
  aiApiKeyInput.value = aiSettings.apiKey || '';
  aiModelInput.value = aiSettings.model || '';
  if (aiTestResult) { aiTestResult.style.display = 'none'; aiTestResult.textContent = ''; }
  openModal(aiSettingsModal);
}
if (aiSettingsBtn) aiSettingsBtn.addEventListener('click', openAiSettingsModal);
if (aiSettingsCloseBtn) aiSettingsCloseBtn.addEventListener('click', () => closeModal(aiSettingsModal));
if (aiSettingsModal) aiSettingsModal.addEventListener('click', (e) => { if (e.target === aiSettingsModal) closeModal(aiSettingsModal); });
if (aiSettingsForm) aiSettingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  aiSettings = { apiKey: aiApiKeyInput.value.trim(), model: aiModelInput.value.trim() };
  persistAiSettings(aiSettings);
  renderAiKeyBanner();
  closeModal(aiSettingsModal);
  showToast('Pengaturan Tanya AI disimpan.');
});
if (aiSettingsClearBtn) aiSettingsClearBtn.addEventListener('click', () => {
  aiApiKeyInput.value = '';
  aiModelInput.value = '';
  aiSettings = { apiKey: '', model: '' };
  persistAiSettings(aiSettings);
  renderAiKeyBanner();
  showToast('API key Gemini dihapus.');
});

// Tes cepat: kirim 1 permintaan minimal ke Gemini pakai key & model
// yang SEDANG DIKETIK di form (belum tentu sudah disimpan), supaya
// user langsung tahu apakah key/model-nya valid tanpa harus buka
// chat & mengetik pertanyaan dulu.
if (aiSettingsTestBtn) aiSettingsTestBtn.addEventListener('click', async () => {
  const testKey = (aiApiKeyInput.value || '').trim();
  const testModel = (aiModelInput.value || '').trim() || AI_DEFAULT_MODEL;
  if (!testKey) {
    aiTestResult.style.display = 'block';
    aiTestResult.style.color = '#9F1239';
    aiTestResult.textContent = 'Isi API key dulu sebelum tes.';
    return;
  }
  aiSettingsTestBtn.disabled = true;
  aiTestResult.style.display = 'block';
  aiTestResult.style.color = '';
  aiTestResult.textContent = 'Menguji koneksi...';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': testKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
    });
    if (res.ok) {
      aiTestResult.style.color = '#059669';
      aiTestResult.textContent = 'Berhasil! Key & model ini valid dan bisa dipakai.';
    } else {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch (e) { /* abaikan */ }
      aiTestResult.style.color = '#9F1239';
      aiTestResult.textContent = `Gagal (HTTP ${res.status}): ${detail || 'periksa kembali key/model.'}`;
    }
  } catch (e) {
    aiTestResult.style.color = '#9F1239';
    aiTestResult.textContent = 'Gagal menghubungi Gemini: koneksi diblokir (cek internet/ad-blocker/VPN).';
  } finally {
    aiSettingsTestBtn.disabled = false;
  }
});

function aiFormatMsgTime(ts) {
  try { return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
}

function renderAiMessages() {
  const list = aiChatHistory[aiActiveTab] || [];
  aiChatBody.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'ai-chat-empty';
    empty.innerHTML = `
      <div class="ai-chat-empty-ic">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/></svg>
      </div>
      <p>${aiActiveTab === 'data'
        ? 'Tanya apa saja soal saldo, transaksi, tagihan, atau hutangmu di ZAYAIN.'
        : 'Tanya apa saja ke AI, mulai dari tips keuangan sampai hal umum lainnya.'}</p>
      <p class="ai-chat-empty-hint">${aiActiveTab === 'data' ? 'Contoh: "Berapa pengeluaran bulan ini?"' : 'Contoh: "Bagaimana cara mulai menabung?"'}</p>
    `;
    aiChatBody.appendChild(empty);
    return;
  }
  list.forEach(msg => aiChatBody.appendChild(buildAiMsgNode(msg)));
  aiChatBody.scrollTop = aiChatBody.scrollHeight;
}

function buildAiMsgNode(msg) {
  const isBot = msg.role !== 'user';
  const showCopy = isBot && !msg.isError;

  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = `ai-msg-row ${isBot ? 'bot' : 'user'}${msg.isError ? ' err' : ''}`;

  if (isBot) {
    const head = document.createElement('div');
    head.className = 'ai-msg-head';
    head.innerHTML = `
      <span class="ai-msg-ic"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/></svg></span>
      <span class="ai-msg-name">ZAYAIN AI</span>
    `;
    const content = document.createElement('div');
    content.className = 'ai-msg-content';
    if (showCopy) content.innerHTML = renderAiMarkdown(msg.text);
    else content.textContent = msg.text;
    row.appendChild(head);
    row.appendChild(content);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    bubble.textContent = msg.text;
    row.appendChild(bubble);
  }
  wrap.appendChild(row);

  if (showCopy) {
    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ai-copy-btn';
    copyBtn.innerHTML = aiCopyBtnDefaultHtml();
    copyBtn.addEventListener('click', () => copyAiMessageText(msg.text, copyBtn));
    actions.appendChild(copyBtn);
    wrap.appendChild(actions);
  }
  return wrap;
}

function aiCopyBtnDefaultHtml() {
  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Salin</span>';
}

async function copyAiMessageText(text, btnEl) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Balasan disalin.');
    if (btnEl) {
      btnEl.classList.add('copied');
      btnEl.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Tersalin</span>';
      setTimeout(() => {
        btnEl.classList.remove('copied');
        btnEl.innerHTML = aiCopyBtnDefaultHtml();
      }, 1600);
    }
  } catch (e) {
    showToast('Gagal menyalin teks.', 'err');
  }
}

// Konversi markdown ringan (bold, italic, kode, list, blok kode) dari
// balasan AI menjadi HTML aman (teks di-escape dulu sebelum dibentuk tag)
// supaya balasan lebih enak dibaca sekaligus tetap mudah disalin apa adanya.
function aiEscapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderAiMarkdown(raw) {
  let text = aiEscapeHtml(raw || '');

  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (m, code) => {
    const cleaned = code.replace(/^[a-zA-Z0-9_+-]*\n/, '').replace(/\n$/, '');
    codeBlocks.push(cleaned);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  const lines = text.split('\n');
  let html = '';
  let inUl = false, inOl = false, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.join('<br>')}</p>`; para = []; } };
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  lines.forEach(line => {
    const t = line.trim();
    const cbMatch = t.match(/^\u0000CB(\d+)\u0000$/);
    if (cbMatch) {
      flushPara(); closeLists();
      html += `<pre><code>${codeBlocks[Number(cbMatch[1])]}</code></pre>`;
      return;
    }
    if (/^[-*]\s+/.test(t)) {
      flushPara();
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${t.replace(/^[-*]\s+/, '')}</li>`;
      return;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      flushPara();
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${t.replace(/^\d+[.)]\s+/, '')}</li>`;
      return;
    }
    if (t === '') { flushPara(); closeLists(); return; }
    closeLists();
    para.push(t);
  });
  flushPara(); closeLists();
  return html || '<p></p>';
}

function aiAutoGrowInput() {
  aiChatInput.style.height = 'auto';
  aiChatInput.style.height = Math.min(aiChatInput.scrollHeight, 90) + 'px';
}
if (aiChatInput) {
  aiChatInput.addEventListener('input', aiAutoGrowInput);
  aiChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });
}
if (aiChatSendBtn) aiChatSendBtn.addEventListener('click', sendAiMessage);

// Merangkum data keuangan pengguna (saldo, transaksi terbaru, tagihan &
// hutang yang belum lunas) menjadi teks konteks singkat untuk dikirim ke
// Gemini pada mode "Data Saya", supaya jawabannya relevan dengan kondisi
// keuangan pengguna tanpa mengirim seluruh data mentah.
function buildFinancialContextSummary() {
  const totalSaldo = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
  const now = new Date();
  const monthKey = localMonthStr(now);
  let monthIn = 0, monthOut = 0;
  transactions.forEach(t => {
    if ((t.date || '').slice(0, 7) !== monthKey) return;
    const val = Number(t.amount) || 0;
    if (t.type === 'masuk') monthIn += val; else monthOut += val;
  });
  const recentTx = [...transactions]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 12)
    .map(t => `- ${t.date} | ${t.type === 'masuk' ? 'Masuk' : 'Keluar'} | ${t.category || '-'} | ${fmtRupiah(Number(t.amount) || 0)}${t.desc ? ' | ' + t.desc : ''}`)
    .join('\n');
  const walletLines = wallets
    .map(w => `- ${w.name} (${w.category || '-'}): ${fmtRupiah(Number(w.balance) || 0)}`)
    .join('\n');
  const belumLunasBills = bills.filter(b => b.status !== 'lunas');
  const belumLunasDebts = debts.filter(d => d.status !== 'lunas');
  const billLines = belumLunasBills
    .map(b => `- ${b.name}: ${fmtRupiah(Number(b.amount) || 0)}, jatuh tempo ${b.dueDate}`)
    .join('\n');
  const debtLines = belumLunasDebts
    .map(d => `- ${d.name}: ${fmtRupiah(Number(d.amount) || 0)}, jatuh tempo ${d.dueDate}`)
    .join('\n');

  return [
    `Total saldo semua bank/e-wallet: ${fmtRupiah(totalSaldo)}`,
    `Pemasukan bulan ini: ${fmtRupiah(monthIn)}`,
    `Pengeluaran bulan ini: ${fmtRupiah(monthOut)}`,
    wallets.length ? `\nDaftar saldo per bank/e-wallet:\n${walletLines}` : '',
    recentTx ? `\nTransaksi terbaru (maks 12):\n${recentTx}` : '',
    belumLunasBills.length ? `\nTagihan belum lunas:\n${billLines}` : '\nTidak ada tagihan yang belum lunas.',
    belumLunasDebts.length ? `\nHutang belum lunas:\n${debtLines}` : '\nTidak ada hutang yang belum lunas.',
  ].filter(Boolean).join('\n');
}

function setAiSending(sending) {
  aiIsSending = sending;
  aiChatSendBtn.disabled = sending;
  aiChatInput.disabled = sending;
}

function appendAiTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'ai-msg-row bot';
  row.id = 'aiTypingRow';
  row.innerHTML = `
    <div class="ai-msg-head">
      <span class="ai-msg-ic"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/></svg></span>
      <span class="ai-msg-name">ZAYAIN AI</span>
    </div>
    <div class="ai-msg-content"><div class="ai-typing"><span></span><span></span><span></span></div></div>
  `;
  aiChatBody.appendChild(row);
  aiChatBody.scrollTop = aiChatBody.scrollHeight;
}
function removeAiTypingIndicator() {
  const row = document.getElementById('aiTypingRow');
  if (row) row.remove();
}

async function callGeminiApi(userText, mode) {
  const apiKey = (aiSettings.apiKey || '').trim();
  const model = (aiSettings.model || '').trim() || AI_DEFAULT_MODEL;
  if (!apiKey) throw new Error('NO_API_KEY');

  const formattingNote = ' Format jawaban dengan markdown ringan bila membantu keterbacaan: **tebal** untuk poin penting, daftar bullet "- " untuk rincian/list, dan blok kode ``` ``` khusus untuk data terstruktur (misalnya tabel angka rapi).';
  const systemInstruction = mode === 'data'
    ? `Kamu adalah asisten keuangan pribadi di aplikasi ZAYAIN. Jawab dalam Bahasa Indonesia, singkat, jelas, dan ramah.${formattingNote} Gunakan data keuangan pengguna berikut sebagai konteks untuk menjawab. Jangan mengarang angka di luar data ini, dan sebutkan jika suatu informasi tidak tersedia di data.\n\n=== DATA KEUANGAN PENGGUNA ===\n${buildFinancialContextSummary()}`
    : `Kamu adalah asisten AI umum di aplikasi ZAYAIN. Jawab dalam Bahasa Indonesia, singkat, jelas, dan ramah.${formattingNote}`;

  // Sertakan beberapa pesan terakhir sebagai riwayat percakapan supaya
  // konteks obrolan tetap nyambung, tanpa mengirim seluruh riwayat.
  const historyList = (aiChatHistory[mode] || []).slice(-10);
  const contents = historyList
    .filter(m => !m.isError)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: userText }] });

  // Catatan perbaikan: sebelumnya API key dikirim lewat query string
  // (?key=...), cara LAMA yang sudah tidak dianjurkan Google. Key
  // Gemini yang baru dibuat (terutama key dengan pembatasan API/HTTP
  // referrer) sering DITOLAK diam-diam lewat cara ini, sehingga fitur
  // "Tanya AI" terasa "tidak berfungsi" walau key sudah benar. Cara
  // resmi terbaru adalah mengirim key lewat header `x-goog-api-key`
  // (lihat https://ai.google.dev/api -- semua contoh permintaan resmi
  // sekarang memakai header ini, bukan lagi query string).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
      }),
    });
  } catch (networkErr) {
    throw new Error('FAILED_TO_FETCH');
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch (e) { /* abaikan */ }
    const err = new Error(detail || `HTTP_${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error('EMPTY_RESPONSE');
  return text.trim();
}

async function sendAiMessage() {
  if (aiIsSending) return;
  const text = aiChatInput.value.trim();
  if (!text) return;

  if (!(aiSettings.apiKey && aiSettings.apiKey.trim())) {
    renderAiKeyBanner();
    openAiSettingsModal();
    return;
  }

  const mode = aiActiveTab;
  aiChatHistory[mode].push({ role: 'user', text, ts: Date.now() });
  persistAiChatHistory();
  renderAiMessages();
  aiChatInput.value = '';
  aiAutoGrowInput();

  setAiSending(true);
  appendAiTypingIndicator();
  try {
    const reply = await callGeminiApi(text, mode);
    removeAiTypingIndicator();
    aiChatHistory[mode].push({ role: 'model', text: reply, ts: Date.now() });
    persistAiChatHistory();
    renderAiMessages();
  } catch (err) {
    console.error('Gemini API error:', err);
    removeAiTypingIndicator();
    let msg = 'Gagal menghubungi Gemini.';
    if (err.message === 'NO_API_KEY') msg = 'API key Gemini belum diatur.';
    else if (err.message === 'FAILED_TO_FETCH') msg = 'Gagal menghubungi Gemini: koneksi diblokir (cek internet, ad-blocker/VPN, atau buka lewat http(s):// bukan file://).';
    else if (err.status === 400) msg = `Permintaan ditolak Gemini (400): ${err.message || 'periksa nama model di Pengaturan.'}`;
    else if (err.status === 401) msg = `API key Gemini tidak valid (401): ${err.message || 'periksa kembali key di Pengaturan.'}`;
    else if (err.status === 403) msg = `API key Gemini ditolak (403): ${err.message || 'periksa kembali key di Pengaturan, atau pastikan API Gemini sudah diaktifkan untuk key ini.'}`;
    else if (err.status === 404) msg = `Model "${(aiSettings.model || AI_DEFAULT_MODEL)}" tidak ditemukan (404) untuk API key ini. Coba ganti model di Pengaturan, mis. gemini-3.7-flash, gemini-3.6-flash, atau gemini-3.5-flash-lite.`;
    else if (err.status === 429) msg = 'Kuota/limit Gemini API tercapai. Coba lagi nanti.';
    else if (err.message === 'EMPTY_RESPONSE') msg = 'Gemini tidak memberi jawaban (mungkin diblokir filter keamanan). Coba ubah pertanyaan.';
    else if (err.message) msg = `Gagal menghubungi Gemini: ${err.message}`;
    aiChatHistory[mode].push({ role: 'model', text: msg, ts: Date.now(), isError: true });
    persistAiChatHistory();
    renderAiMessages();
    showToast(msg, 'err');
  } finally {
    setAiSending(false);
    aiChatInput.focus();
  }
}

function initAiChat() {
  renderAiKeyBanner();
  switchAiTab('umum');
}

// ============================================================
// FIX KEDIPAN BANNER STICKY SAAT SCROLL (khusus HP)
// Banner (header hijau-navy di atas) punya beberapa animasi CSS yang
// hidup terus-menerus (gradient drift, garis alir, ombak, partikel
// naik-turun) dan posisinya position:sticky di layar HP. Saat halaman
// discroll di HP, browser sering menghitung ulang layout tiap frame
// (mis. karena address bar muncul/hilang) — kalau bersamaan dengan
// animasi yang masih terus jalan, hasilnya bisa kelihatan "kedip"/
// tearing sesaat karena browser sempat menggambar frame yang belum
// selesai/lengkap.
//
// Solusinya: selama scroll BERLANGSUNG, tempelkan class "is-scrolling"
// ke <body> supaya semua animasi dekoratif banner dipause dulu lewat
// CSS (lihat rule body.is-scrolling di index.html) — isinya tetap utuh
// terlihat, cuma diam sebentar, TIDAK disembunyikan. Class ini dicopot
// lagi otomatis begitu tidak ada event scroll baru selama ~160ms
// (dianggap scroll sudah selesai), lalu animasi lanjut seperti biasa.
// CATATAN (perluasan fix patah-patah): class "is-scrolling" ini
// sekarang mem-pause SEMUA animasi dekoratif di halaman (lihat CSS
// "body.is-scrolling *"), bukan cuma banner — jadi listener-nya juga
// diperluas supaya scroll di DALAM halaman overlay (detail/
// leaderboard/pengaturan) dan panel notifikasi ikut memicu pause,
// tidak cuma scroll di body utama.
let bannerScrollFreezeTimer = null;
function initBannerScrollFreeze() {
  const onAnyScroll = () => {
    document.body.classList.add('is-scrolling');
    clearTimeout(bannerScrollFreezeTimer);
    bannerScrollFreezeTimer = setTimeout(() => {
      document.body.classList.remove('is-scrolling');
    }, 160);
  };
  window.addEventListener('scroll', onAnyScroll, { passive: true });
  document.querySelectorAll('.detail-page-overlay, .notif-panel, .ai-chat-body')
    .forEach((el) => el.addEventListener('scroll', onAnyScroll, { passive: true }));
}

// ============================================================
// MINI TOPBAR — ukur tinggi asli #miniTopbar lalu simpan ke variabel
// CSS --mini-topbar-h. Dulu dipakai untuk padding-top body (supaya
// banner besar tidak ketutup mini-topbar yang saat itu SELALU
// tampil). Sekarang mini-topbar cuma tampil setelah discroll (lihat
// .mtb-active di bawah), jadi padding-top body sudah tidak dipakai
// lagi — tapi variabel tingginya tetap berguna untuk kasih jarak
// scroll-margin-top ke #historySection (lihat CSS-nya di
// index.html) supaya judul kartu Riwayat tidak ketutup mini-topbar
// begitu discroll ke situ lewat tombol Riwayat. Tinggi elemen ini
// bisa berubah-ubah (mis. teks Rp jadi lebih panjang & wrap ke 2
// baris di layar sangat sempit, atau area aman/notch beda-beda tiap
// HP lewat env(safe-area-inset-top)), jadi diukur ulang otomatis
// pakai ResizeObserver, bukan angka tetap.
function initMiniTopbar() {
  const bar = document.getElementById('miniTopbar');
  if (!bar) return;
  const applyHeight = () => {
    const h = bar.offsetHeight;
    if (h > 0) {
      document.documentElement.style.setProperty('--mini-topbar-h', h + 'px');
    }
  };
  applyHeight();
  if ('ResizeObserver' in window) {
    new ResizeObserver(applyHeight).observe(bar);
  } else {
    window.addEventListener('resize', applyHeight);
  }

  // FIX "DOBEL" DENGAN BANNER BESAR — sebelumnya mini-topbar selalu
  // tampil dari awal render, jadi numpuk kelihatan dobel dengan
  // ringkasan Pemasukan/Pengeluaran yang juga ada di banner besar
  // (#banner) tepat di bawahnya. Sekarang mini-topbar baru diberi
  // class "mtb-active" (lihat CSS .mini-topbar.mtb-active, yang
  // menggesernya turun ke layar) SETELAH banner besar benar-benar
  // sudah discroll keluar dari layar (sisi bawah banner <= 0, lihat
  // getBoundingClientRect().bottom di bawah).
  //
  // CATATAN (kenapa bukan pakai IntersectionObserver): percobaan
  // pertama pakai IntersectionObserver, tapi di HP saat scroll cepat
  // (momentum scroll) callback-nya sering telat/ke-throttle browser,
  // jadi mini-topbar baru "nyusul" muncul pas scroll SUDAH berhenti
  // atau baru kelihatan pas scroll balik ke atas -- bukan langsung
  // pas banner lewat. Makanya diganti pola yang sama dengan tombol
  // "Kembali ke atas" di halaman ini (lihat initBackToTop di atas,
  // sudah terbukti responsif dua arah): dicek ulang posisi banner
  // tiap frame lewat requestAnimationFrame pada event scroll, bukan
  // menunggu browser melapor lewat IntersectionObserver.
  const bannerEl = document.getElementById('banner');
  if (bannerEl) {
    const mq = window.matchMedia('(max-width:600px)');
    let mtbTicking = false;
    // FIX FLASH SAAT LOAD: kalau browser kebetulan me-restore posisi
    // scroll (mis. user refresh di tengah halaman), pengecekan
    // PERTAMA bisa langsung menyalakan .mtb-active. Karena CSS-nya
    // pakai transition, itu bikin mini-topbar kelihatan "meluncur
    // turun" sesaat pas halaman baru dimuat -- padahal seharusnya dia
    // langsung nongol di posisi akhir tanpa animasi (baru discroll
    // pengguna sungguhan yang harus animasi). mtbFirstCheck menandai
    // pengecekan pertama itu supaya transition dimatikan sesaat lalu
    // dinyalakan lagi, tanpa mengubah perilaku setelahnya.
    let mtbFirstCheck = true;
    function updateMiniTopbarVisibility() {
      mtbTicking = false;
      if (!mq.matches) {
        bar.classList.remove('mtb-active');
        mtbFirstCheck = false;
        refreshMobileChromeColor();
        return;
      }
      // FIX BUG "mini-topbar nyangkut tampil di tab lain": kalau tab
      // Beranda SEDANG TIDAK AKTIF (dipindah ke Laporan/Dompet/
      // Pengaturan lewat nav bawah), #page-beranda (nenek moyang
      // #banner) jadi display:none -- dan elemen yang display:none
      // SELALU melaporkan getBoundingClientRect() semua nol (top,
      // bottom, dst = 0). Tanpa pengecekan ini, "bottom <= 0" jadi
      // ke-anggap true terus (0 <= 0), seolah-olah banner "sudah
      // discroll lewat", padahal cuma lagi disembunyikan karena ganti
      // tab -- akibatnya mini-topbar dipaksa tampil terus-menerus di
      // SEMUA tab lain, termasuk yang masih kosong. offsetParent akan
      // bernilai null kalau elemen (atau salah satu induknya) sedang
      // display:none, jadi dipakai sebagai penanda "tab Beranda lagi
      // tidak aktif" -- kalau begitu, anggap saja banner TIDAK lewat
      // (supaya mini-topbar ikut disembunyikan), baru kalau tab
      // Beranda aktif sungguhan, baru cek posisi scroll asli seperti
      // biasa.
      const bannerFullyPassed = bannerEl.offsetParent !== null
        && bannerEl.getBoundingClientRect().bottom <= 0;
      // Status bar HP (theme-color + header Telegram) ikut disamakan
      // dengan warna mini-topbar yang sedang tampil: gelap (forest-deep)
      // selama banner besar masih kelihatan, putih (--card) begitu
      // mini-topbar putih sudah menempel menggantikannya -- supaya
      // keduanya selalu senada, tidak "belang".
      refreshMobileChromeColor();
      if (mtbFirstCheck) {
        mtbFirstCheck = false;
        bar.style.transition = 'none';
        bar.classList.toggle('mtb-active', bannerFullyPassed);
        void bar.offsetHeight; // paksa reflow supaya browser "commit" tanpa transisi
        bar.style.transition = '';
        return;
      }
      bar.classList.toggle('mtb-active', bannerFullyPassed);
    }
    function requestMiniTopbarUpdate() {
      if (!mtbTicking) {
        mtbTicking = true;
        requestAnimationFrame(updateMiniTopbarVisibility);
      }
    }
    updateMiniTopbarVisibility();
    window.addEventListener('scroll', requestMiniTopbarUpdate, { passive: true });
    window.addEventListener('resize', requestMiniTopbarUpdate);
    if (mq.addEventListener) mq.addEventListener('change', requestMiniTopbarUpdate);
    else if (mq.addListener) mq.addListener(requestMiniTopbarUpdate);
  }
}

// ============ TELEGRAM WEBAPP — SINKRONKAN WARNA BAR ATAS/BAWAH ============
// Saat situs ini dibuka lewat browser bawaan Telegram (in-app browser /
// Telegram Mini App), area status bar/header di ATAS halaman & bar
// navigasi di BAWAH (di Android/iOS) ikut dikontrol Telegram, BUKAN oleh
// meta "theme-color" biasa (itu cuma dibaca browser standar, Telegram
// punya API warnanya sendiri). Tanpa ini, bar tsb tampil warna default
// Telegram (putih/hitam) walau isi halaman sudah gelap navy senada
// --forest-deep -- itulah selisih warna "belang" yang terlihat di HP.
// initTelegramWebApp() menyamakan warna header & background Telegram
// persis dengan warna dasar banner (--forest-deep) begitu app dibuka,
// dan otomatis tidak melakukan apa-apa (aman) kalau halaman ini dibuka
// BUKAN dari dalam Telegram (window.Telegram.WebApp tidak akan ada).
// Warna status bar HP (theme-color biasa) & header/background Telegram
// WebApp, dipakai BERSAMA oleh initTelegramWebApp() (saat halaman
// pertama dibuka) DAN updateMiniTopbarVisibility() di initMiniTopbar()
// (setiap kali status scroll berubah) -- supaya keduanya selalu sinkron
// dengan warna banner/mini-topbar yang sedang tampil: gelap (forest-deep)
// saat banner besar masih kelihatan di atas, putih (--card) begitu
// mini-topbar putih sudah menempel menggantikannya. Tanpa ini, status
// bar HP akan tetap gelap terus walau mini-topbar di bawahnya sudah
// berubah putih -- kelihatan "belang"/tidak menyatu.
function syncMobileChromeColor(hex) {
  if (mobileChromeColorCache === hex) return;
  mobileChromeColorCache = hex;
  // Beberapa meta ikut disamakan sekaligus tiap warna berubah:
  // - theme-color: dibaca Chrome/Edge/Samsung Internet (Android & desktop
  //   PWA) DAN Safari iOS 15+ untuk mewarnai address bar/status bar.
  // - msapplication-navbutton-color: peninggalan Windows Phone/IE lama,
  //   murah utk ikut disamakan sekalian (tidak berdampak di browser lain).
  // CATATAN JUJUR: sejumlah browser/OS memang TIDAK punya API buat
  // mewarnai chrome-nya sama sekali (mis. Firefox & Safari di macOS utk
  // tab biasa, atau Chrome/Edge desktop di luar mode PWA ter-install) --
  // itu batasan platform masing2 browser, bukan sesuatu yg bisa
  // "dipaksa" lewat kode web di sisi mana pun.
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', hex);
  const metaNavBtn = document.querySelector('meta[name="msapplication-navbutton-color"]');
  if (metaNavBtn) metaNavBtn.setAttribute('content', hex);
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      try { tg.setHeaderColor(hex); } catch (e) { /* versi klien lama: abaikan */ }
      try { tg.setBackgroundColor(hex); } catch (e) { /* abaikan */ }
      if (typeof tg.setBottomBarColor === 'function') {
        try { tg.setBottomBarColor(hex); } catch (e) { /* abaikan */ }
      }
    }
  } catch (e) { /* abaikan */ }
}

// ============ WARNA STATUS BAR/ADDRESS BAR MENGIKUTI BANNER ============
// Menghitung warna yg SEHARUSNYA dipakai status bar HP / address bar
// browser / header Telegram SAAT INI: mengikuti --banner-orange yg
// sedang aktif (ikut berubah begitu user ganti warna tema di halaman
// Tema -- lihat applyGlobalTheme()), kecuali di mobile begitu banner
// besar sudah discroll lewat & mini-topbar putih menempel menggantikannya
// (--card). Dipakai bersama oleh initTelegramWebApp() (saat app pertama
// dibuka), initMiniTopbar() (tiap kali status scroll berubah), DAN
// applyGlobalTheme() (begitu user ganti warna tema, supaya address bar
// ikut berubah SAAT ITU JUGA, tanpa perlu scroll/refresh dulu).
function getActiveMobileChromeColor() {
  // Warna banner diambil dari variabel JS currentBannerColorHex (lihat
  // catatan di dekat deklarasinya, dekat applyGlobalTheme()) -- BUKAN
  // dari getComputedStyle('--banner-orange') lagi, supaya tidak pernah
  // ketinggalan/telat mengikuti perubahan warna tema. --card tetap aman
  // dibaca dari CSS krn nilainya statis (tidak pernah diubah lewat JS).
  const rootStyles = getComputedStyle(document.documentElement);
  const bannerColor = currentBannerColorHex || '#FA8B1E';
  const cardColor = (rootStyles.getPropertyValue('--card') || '#FFFFFF').trim();
  const bannerEl = document.getElementById('banner');
  let mqMatches = false;
  try { mqMatches = window.matchMedia('(max-width:600px)').matches; } catch (e) { /* abaikan */ }
  if (mqMatches && bannerEl) {
    const bannerFullyPassed = bannerEl.offsetParent !== null
      && bannerEl.getBoundingClientRect().bottom <= 0;
    return bannerFullyPassed ? cardColor : bannerColor;
  }
  return bannerColor;
}
function refreshMobileChromeColor() {
  syncMobileChromeColor(getActiveMobileChromeColor());
}

function initTelegramWebApp() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return; // bukan dibuka dari dalam Telegram -> tidak melakukan apa-apa

    tg.ready();
    // expand(): buka WebView Telegram ke tinggi penuh (bukan cuma separuh
    // layar seperti bottom-sheet kecil) supaya tidak ada celah warna asing
    // di antara konten app & bar Telegram.
    if (typeof tg.expand === 'function') tg.expand();
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();

    refreshMobileChromeColor();
  } catch (e) {
    console.warn('initTelegramWebApp dilewati:', e);
  }
}

function init() {
  initTelegramWebApp();
  renderBannerDate();
  renderBrandGreeting();
  setInterval(renderBrandGreeting, 60 * 1000);
  initBannerFx();
  initNews();
  applySaldoVisibility();
  setSelectedType('masuk');
  renderRangePicker();
  refreshAll();
  updateNotifBadge();
  renderDevices();
  renderSocial();
  maybeShowDueReminder();
  deviceMgmtStartHeartbeat();
  initFooter();
  initAiChat();
  initBannerScrollFreeze();
  initMiniTopbar();
  // Posisikan kotak indikator pil tab (Semua/Mingguan/dst) ke tombol
  // aktif pertama kalinya. requestAnimationFrame dipakai supaya
  // dijalankan setelah browser selesai satu siklus layout, jadi lebar
  // tombol yang diukur sudah pasti akurat (bukan 0 karena belum sempat
  // di-layout sama sekali).
  requestAnimationFrame(updateAllTabIndicators);

  // Buka ULANG halaman "Semua Tagihan & Hutang" kalau sebelum
  // di-refresh overlay ini memang sedang terbuka (lihat penanda yang
  // disimpan di openBdAllPage()/closeBdAllPage()) -- baru dilakukan
  // di sini, di akhir init(), karena openBdAllPage() butuh `bills`/
  // `debts` (sudah tersedia di titik ini) DAN elemen-elemen DOM
  // overlay yang terkait, jadi tidak bisa dipanggil lebih awal dari
  // ini. Tanpa ini, refresh selagi di halaman Tagihan & Hutang akan
  // terasa "pindah ke menu lain" karena yang tampil balik cuma tab
  // biasa di baliknya (Beranda/Laporan/dst), overlay-nya sendiri
  // hilang.
  try {
    if (sessionStorage.getItem('zp_tagihan_open') === '1') {
      var savedBdTab = sessionStorage.getItem('zp_tagihan_tab') || 'semua';
      openBdAllPage(savedBdTab);
    }
  } catch (e) { /* sessionStorage tidak tersedia -- abaikan */ }
}

init();