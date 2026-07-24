const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'ISI_CLIENT_ID_KAMU'; // Ganti dengan CLIENT_ID kamu
const CLIENT_SECRET = 'ISI_CLIENT_SECRET_KAMU'; // Ganti dengan CLIENT_SECRET kamu
const BASE_URL = 'http://localhost:3000'; // Ganti dengan base URL server kamu

const REDIRECT_URI = `${BASE_URL}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('1. Buka URL berikut di browser pakai akun Google yang kalendernya mau diakses):\n');
console.log(authUrl);
console.log('\n2. Login & klik "Allow/Izinkan".');
console.log('3. Kamu akan diredirect ke URL yang kamu tentukan dan browser akan menampilkan error This site cant be reached, karena tidak ada server yang jalan disana');
console.log('4. Lihat address/url browser, copy nilai parameter "code=" dari URL tersebut.');
console.log('5. Copy bagian setelah "code=" sampai sebelum "&scope"\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste kode dari URL di sini, lalu tekan Enter: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());

    if (!tokens.refresh_token) {
      console.log('\n Tidak ada refresh_token yang dikembalikan.');
      console.log('   Kemungkinan kamu pernah authorize app ini sebelumnya.');
      console.log('   Coba cabut akses di https://myaccount.google.com/permissions lalu ulangi lagi.\n');
    } else {
      console.log('\nBerhasil! Simpan environment variable berikut:\n');
      console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nJangan bagikan nilai-nilai ini ke siapapun.\n');
    }
  } catch (err) {
    console.error('\nGagal menukar kode jadi token:', err.message);
  }
  rl.close();
});
