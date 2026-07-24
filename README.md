# Setup Chatbot Calendar Reminder

Chatbot AI yang terhubung langsung ke Google Calendar milik Anda. Chatbot ini bisa melihat, menambah, mengedit, mencari, dan menghapus jadwal lewat percakapan natural.

---

## Chatbot Persona

Untuk memandu pembuatan agent AI (Agent Assistant), berikut adalah persona yang bisa Anda gunakan pada pengaturan *Persona*. Copy persona berikut dan paste pada bagian tab **Persona** di sidebar kiri [**Botika Platform v3 Agentic**](https://platform.botika.online/gpt/):

```
You are Calendar Reminder Assistant, a helpful and reliable AI assistant that helps users manage their Google Calendar. You can create, view, search, update, delete, and organize calendar events and reminders through natural conversations. Always understand the user's intent, ask for any missing required information when necessary, and provide clear, concise, and friendly responses. When handling dates and times, interpret relative expressions such as "today", "tomorrow", "next week", or "last Monday" accurately based on the current date. Your goal is to make scheduling simple, efficient, and effortless for every user.
```

---

## Deploy Backend

### 1. Deploy ke Vercel (Dapatkan URL dulu)

Deploy project ini ke Vercel terlebih dahulu untuk mendapatkan URL deployment Anda. URL ini diperlukan saat mengkonfigurasi Google Cloud Console.

1. Buka [vercel.com](https://vercel.com) dan **login** ke akun Anda.
2. Dari dashboard, klik **Add New Project**.
3. Pada bagian bawah halaman, klik **Import Third-Party Git Repository**, lalu *paste* link berikut:

   ```
   https://github.com/mamatqurtifa/calendar-reminder-and-backend-proxy-express.git
   ```

   ![Vercel — Import Third-Party Git Repository](public/images/vercel-import-link.png)

4. Klik **Continue** dan klik **Deploy**. 

     ![Vercel — Deploy Project](public/images/vercel-deploy.png)

     Tunggu beberapa detik sampai proses selesai dan klik **Continue to Dashboard**

5. **Salin URL deployment Anda**, contoh:
   ```
   https://link-deploy-project-anda.vercel.app
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

### 3. Ambil Refresh Token & Isi Environment Variables

Refresh token hanya perlu didapatkan sekali. Server akan me-refresh access token secara otomatis selanjutnya.

1. Ambil refresh token dengan flow OAuth2 sekali saja menggunakan script helper, OAuth Playground, atau tool lain yang kamu pakai.
2. Pastikan hasil akhirnya berupa nilai `GOOGLE_REFRESH_TOKEN`.

Setelah mendapatkan semua nilai, siapkan environment variables berikut:

```env
PORT=3000
GOOGLE_CLIENT_ID=123456789012-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//0gxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CALENDAR_ID=primary
DEFAULT_TIMEZONE=Asia/Jakarta
PROXY_SECRET=string-acak-panjang-dan-unik
```

Sesuaikan `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, dan `PROXY_SECRET` dengan nilai milik Anda. Anda bisa menyalin template di atas ke Notepad lalu edit di sana.

---

### 4. Tambahkan Env Var di Vercel & Redeploy

1. Buka [Vercel Dashboard](https://vercel.com) > pilih project Anda > **Settings > Environment Variables**.
2. Anda bisa langsung **mengunggah file `.env`** atau **copy-paste seluruh isi `.env`** ke kolom yang tersedia — semua variabel akan otomatis terisi. Anda tidak perlu memasukkan `PORT`.
3. Setelah env var tersimpan, masuk ke tab **Deployments** > klik titik tiga pada deployment terbaru > pilih **Redeploy**.
4. Setelah redeploy selesai, endpoint Anda siap digunakan:
   ```
   https://<nama-project-anda>.vercel.app/api/calendar
   ```

---

### 7. Buat Workflow di Botika Platform Agentic

Setelah backend proxy berhasil berjalan (baik di lokal maupun Vercel), langkah selanjutnya adalah memasang *workflow* berikut:

1. Buka file [`workflow.txt`](./workflow.txt) yang ada di dalam repositori ini. File tersebut berisi kode template (JSON) dari seluruh *flow* Calendar Reminder.
2. *Copy* seluruh isi dari file tersebut.
3. Buka dashboard/editor workflow di [**Botika Platform v3 Agentic**](https://platform.botika.online/gpt/).
4. *Paste* kode tersebut di workflow untuk meng-*import* seluruh *node*.
5. **Sesuaikan Persona**, klik tab sebelah kiri pada bagian persona kemudian isi persona sesuai dengan referensi teks di bagian [Chatbot Persona](#chatbot-persona) di atas.
6. Sesuaikan secret dan ganti dengan secret yang sudah anda buat sebelumnya pada node *Set User Variabel* setelah node *Start* dan node *Log Monitoring*.
7. Pastikan endpoint di setiap node *HTTP Request* sudah mengarah ke URL Vercel Anda yang baru saja di-*deploy* (misal: `https://<domain-vercel-anda.vercel.app>/api/calendar`).

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