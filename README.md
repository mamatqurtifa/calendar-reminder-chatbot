# Setup Chatbot Calendar Reminder

Proxy server-side berbasis Express.js untuk mengakses Google Calendar API menggunakan OAuth2 refresh token.
Client (n8n, Make, dsb.) cukup memanggil satu endpoint HTTP tanpa perlu mengelola OAuth sendiri.

---

## Chatbot Persona

Untuk memandu pembuatan agent AI (Agent Assistant), berikut adalah persona yang bisa Anda gunakan pada pengaturan *Persona*:

> You are Calendar Reminder Assistant, a helpful and reliable AI assistant that helps users manage their Google Calendar. You can create, view, search, update, delete, and organize calendar events and reminders through natural conversations. Always understand the user's intent, ask for any missing required information when necessary, and provide clear, concise, and friendly responses. When handling dates and times, interpret relative expressions such as "today", "tomorrow", "next week", or "last Monday" accurately based on the current date. Your goal is to make scheduling simple, efficient, and effortless for every user.

---

## Setup

### 1. Deploy ke Vercel (Dapatkan URL dulu)

Deploy project ini ke Vercel terlebih dahulu untuk mendapatkan URL deployment Anda. URL ini diperlukan saat mengkonfigurasi Google Cloud Console.

1. Buka [vercel.com](https://vercel.com) dan **login** ke akun Anda.
2. Dari dashboard, klik **Add New Project**.
3. Pada bagian bawah halaman, klik **Import Third-Party Git Repository**, lalu *paste* link berikut:

   ```
   https://github.com/mamatqurtifa/calendar-reminder-and-backend-proxy-express.git
   ```

   ![Vercel — Import Third-Party Git Repository](public/images/vercel-import-link.png)

4. Klik **Continue** — **lewati pengisian env var dulu**, biarkan kosong, langsung klik **Deploy**.
5. Setelah deploy selesai, **salin URL deployment Anda**, contoh:
   ```
   https://<nama-project-anda>.vercel.app
   ```

   ![Vercel — Deployment Success](public/images/vercel-dashboard-url-backend.png)

> URL ini akan dibutuhkan di langkah berikutnya sebagai Authorized Redirect URI.

---

### 2. Setup Google Cloud Console

1. Buka [Google Cloud Console](https://console.cloud.google.com) > login > buat atau pilih project.
2. **APIs & Services > Library** > aktifkan **Google Calendar API**.

   ![Google Cloud Console — Enable Google Calendar API](public/images/console-calender-api.png)

3. **APIs & Services > OAuth consent screen** > isi nama app dan email, lalu **Publish App** jika sudah siap dipakai.

   ![Google Cloud Console — OAuth Consent Screen](public/images/console-oauth-consent.png)

4. **APIs & Services > Credentials > Create Credentials > OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs — tambahkan **keduanya**:
     ```
     http://localhost:3000/oauth2callback
     https://<nama-project-anda>.vercel.app/oauth2callback
     ```
   - Salin **Client ID** dan **Client Secret**.

   ![Google Cloud Console — Create OAuth Client ID](public/images/console-create-oauth.png)

---

### 3. Ambil Refresh Token

Refresh token hanya perlu didapatkan **sekali**. Server akan me-refresh access token secara otomatis selanjutnya.

> **Prasyarat:** Pastikan **Node.js** sudah terinstal di laptop Anda. Cek dengan perintah `node -v` di terminal. Jika belum, unduh di [nodejs.org](https://nodejs.org).

**Langkah-langkahnya:**

1. Buat folder baru di mana saja, misalnya `get-token`.

2. Di dalam folder tersebut, buat file bernama **`package.json`**. Salin kode di bawah ini — atau langsung ambil dari GitHub di file [`package.json`](https://github.com/mamatqurtifa/calendar-reminder-and-backend-proxy-express/blob/main/package.json) (klik tombol **Raw** lalu *Select All* dan *Copy*):

   ```json
   {
     "name": "calendar-proxy-express",
     "version": "1.0.0",
     "description": "",
     "main": "index.js",
     "dependencies": {
       "express": "^4.19.2",
       "googleapis": "^140.0.1",
       "dotenv": "^16.4.5"
     }
   }
   ```

3. Buat file bernama **`get-token.js`**. Salin kode di bawah ini — atau langsung ambil dari GitHub di file [`get-token.js`](https://github.com/mamatqurtifa/calendar-reminder-and-backend-proxy-express/blob/main/get-token.js) (klik tombol **Raw** lalu *Select All* dan *Copy*). Setelah di-paste, **ganti `ISI_CLIENT_ID_KAMU` dan `ISI_CLIENT_SECRET_KAMU`** dengan nilai dari langkah sebelumnya:

   ```js
   const { google } = require('googleapis');
   const readline = require('readline');

   const CLIENT_ID = 'ISI_CLIENT_ID_KAMU';
   const CLIENT_SECRET = 'ISI_CLIENT_SECRET_KAMU';
   const BASE_URL = 'http://localhost:3000';

   const REDIRECT_URI = `${BASE_URL}/oauth2callback`;

   const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

   const SCOPES = ['https://www.googleapis.com/auth/calendar'];

   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     prompt: 'consent',
     scope: SCOPES,
   });

   console.log('1. Buka URL berikut di browser pakai akun Google yang kalendernya mau diakses:\n');
   console.log(authUrl);
   console.log('\n2. Login & klik "Allow/Izinkan".');
   console.log('3. Kamu akan diredirect ke URL yang kamu tentukan dan browser akan menampilkan error "This site can\'t be reached", karena tidak ada server yang jalan di sana.');
   console.log('4. Lihat address bar browser, copy nilai parameter "code=" dari URL tersebut.');
   console.log('5. Copy bagian setelah "code=" sampai sebelum "&scope"\n');

   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

   rl.question('Paste kode dari URL di sini, lalu tekan Enter: ', async (code) => {
     try {
       const { tokens } = await oauth2Client.getToken(code.trim());

       if (!tokens.refresh_token) {
         console.log('\nTidak ada refresh_token yang dikembalikan.');
         console.log('Kemungkinan kamu pernah authorize app ini sebelumnya.');
         console.log('Coba cabut akses di https://myaccount.google.com/permissions lalu ulangi lagi.\n');
       } else {
         console.log('\nBerhasil! Simpan environment variable berikut:\n');
         console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
         console.log('\nJangan bagikan nilai ini ke siapapun.\n');
       }
     } catch (err) {
       console.error('\nGagal menukar kode jadi token:', err.message);
     }
     rl.close();
   });
   ```

4. Buka terminal, masuk ke folder `get-token`, lalu jalankan perintah berikut satu per satu:

   ```bash
   npm install
   node get-token.js
   ```

5. Ikuti instruksi yang muncul di terminal untuk membuka link, login, izinkan akses, copy kode dari URL, paste ke terminal.

6. Setelah berhasil, terminal akan menampilkan nilai `GOOGLE_REFRESH_TOKEN=...`. Salin nilai tersebut untuk dipakai di langkah berikutnya.

---

### 4. Environment Variables

Siapkan nilai-nilai berikut di Notepad atau text editor, lalu sesuaikan dengan kredensial milik Anda:

```env
GOOGLE_CLIENT_ID=123456789012-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//0gxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CALENDAR_ID=primary
DEFAULT_TIMEZONE=Asia/Jakarta
PROXY_SECRET=string-acak-panjang-dan-unik
```

> Ganti `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, dan `PROXY_SECRET` dengan nilai milik Anda. **Jangan tambahkan `PORT`** — tidak diperlukan di Vercel.

---

### 5. Tambahkan Env Var di Vercel & Redeploy

1. Buka [Vercel Dashboard](https://vercel.com) > pilih project Anda > **Settings > Environment Variables**.
2. **Copy-paste seluruh isi env var** ke kolom yang tersedia — semua variabel akan otomatis terisi.
3. Setelah env var tersimpan, masuk ke tab **Deployments** > klik titik tiga pada deployment terbaru > pilih **Redeploy**.
4. Setelah redeploy selesai, endpoint Anda siap digunakan:
   ```
   https://<nama-project-anda>.vercel.app/api/calendar
   ```

---

### 6. Setup Workflow di Botika Platform Agentic

Setelah backend berhasil ter-deploy, pasang *workflow* berikut di Botika:

1. Buka file [`workflow.txt`](./workflow.txt) yang ada di dalam repositori ini. File tersebut berisi kode template (JSON) dari seluruh *flow* Calendar Reminder.
2. *Copy* seluruh isi dari file tersebut.
3. Buka dashboard/editor workflow di [**Botika Platform v3 Agentic**](https://platform.botika.online/gpt/).
4. *Paste* kode tersebut di workflow untuk meng-*import* seluruh *node*.
5. **Sesuaikan Persona** — klik tab **Persona** di sidebar kiri, lalu isi dengan teks persona di bagian [Chatbot Persona](#chatbot-persona) di atas.
6. Sesuaikan secret pada node *Set User Variabel* (setelah node *Start*) dan node *Log Monitoring* — ganti dengan `PROXY_SECRET` yang sudah Anda buat.
7. Pastikan endpoint di setiap node *HTTP Request* sudah mengarah ke URL Vercel Anda (misal: `https://<nama-project-anda>.vercel.app/api/calendar`).

---

# Workflow

![Workflow Overview](public/images/workflow-overview.png)

> **[Coba Chatbot di sini https://chat.botika.online/v3/c5Bpf9t](https://chat.botika.online/v3/c5Bpf9t)**

## Working Bot Footage

Berikut adalah cuplikan layar atau rekaman saat bot sedang berjalan dan memproses data kalender secara langsung untuk masing-masing alur (workflow):

### 1. Lihat Jadwal
![Footage Lihat Jadwal](public/images/footage-lihat-jadwal.png)

### 2. Tambah Jadwal (Reminder)
| Percakapan Bot | Hasil di Google Calendar |
|---|---|
| ![Footage Tambah Jadwal](public/images/footage-tambah-jadwal.png) | ![Result Tambah Jadwal](public/images/result-tambah-jadwal.png) |

### 3. Edit Jadwal
| Percakapan Bot | Hasil di Google Calendar |
|---|---|
| ![Footage Edit Jadwal](public/images/footage-edit-jadwal.png) | ![Result Edit Jadwal](public/images/result-edit-jadwal.png) |

### 4. Cari Jadwal
| Percakapan Bot | Hasil di Google Calendar |
|---|---|
| ![Footage Cari Jadwal](public/images/footage-cari-jadwal.png) | ![Result Cari Jadwal](public/images/result-cari-jadwal.png) |

### 5. Tambah Jadwal Berulang
| Percakapan Bot | Hasil di Google Calendar |
|---|---|
| ![Footage Jadwal Berulang](public/images/footage-jadwal-berulang.png) | ![Result Tambah Jadwal Berulang](public/images/result-tambah-jadwal-berulang.png) |

### 6. Hapus Jadwal
| Percakapan Bot | Hasil di Google Calendar |
|---|---|
| ![Footage Hapus Jadwal](public/images/footage-hapus-jadwal.png) | ![Result Hapus Jadwal](public/images/result-hapus-jadwal.png) |