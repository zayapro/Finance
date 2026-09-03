/**
 * ZAYAIN — Proxy Unduh Video (Cloudflare Worker)
 * ------------------------------------------------
 * Fungsi worker ini cuma 2:
 *   1. Meneruskan request dari browser ZAYAIN ke api.fastsaver.io,
 *      sambil menambahkan header CORS supaya browser tidak lagi kena
 *      error "Failed to fetch" / "blocked by CORS policy".
 *   2. Menaruh API key FastSaverAPI di sini (sisi SERVER, sbg secret),
 *      bukan di kode script.js yang dikirim ke browser -- jadi key
 *      benar-benar tidak pernah terlihat oleh siapa pun yang membuka
 *      DevTools/tab Network di HP mereka.
 *
 * CARA DEPLOY (gratis, tanpa VPS, ~5 menit):
 *   1. Buka https://dash.cloudflare.com -> daftar akun gratis (kalau
 *      belum punya).
 *   2. Di menu kiri: Workers & Pages -> Create -> Create Worker.
 *   3. Kasih nama bebas, mis. "zayain-videodl" -> Deploy.
 *   4. Klik "Edit code" -> hapus semua isi default -> paste SELURUH isi
 *      file ini -> Save and Deploy.
 *   5. Balik ke halaman Worker -> tab "Settings" -> "Variables and
 *      Secrets" -> Add -> Name: FASTSAVER_API_KEY, Value: (paste API
 *      key FastSaverAPI Anda, yg dari dashboard api.fastsaver.io) ->
 *      pilih tipe "Secret" -> Save & Deploy.
 *   6. Salin URL worker-nya (bentuknya seperti
 *      https://zayain-videodl.NAMA-ANDA.workers.dev) -> tempel ke
 *      ZAYAIN: Fast Menu > Unduh Video > ikon gerigi > field "URL
 *      Cloudflare Worker" -> Simpan.
 *   7. Selesai -- coba ambil video lagi, seharusnya error "Failed to
 *      fetch" sudah hilang.
 *
 * Free tier Cloudflare Workers: 100.000 request/hari, lebih dari cukup
 * untuk pemakaian pribadi/kecil.
 */

const UPSTREAM = 'https://api.fastsaver.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight CORS (browser selalu kirim OPTIONS dulu utk request
    // POST/JSON lintas-origin spt ini).
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (!env.FASTSAVER_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, detail: 'FASTSAVER_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const incoming = new URL(request.url);
    // Path & query string apa adanya diteruskan (mis. /v1/fetch?url=...
    // atau /v1/youtube/download), cuma host-nya diganti ke api.fastsaver.io.
    const targetUrl = UPSTREAM + incoming.pathname + incoming.search;

    const upstreamHeaders = { 'X-Api-Key': env.FASTSAVER_API_KEY };
    let body;
    if (request.method === 'POST') {
      upstreamHeaders['Content-Type'] = 'application/json';
      body = await request.text();
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body,
      });
      const text = await upstreamRes.text();
      return new Response(text, {
        status: upstreamRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, detail: 'Worker gagal menghubungi FastSaverAPI: ' + err.message }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  },
};
