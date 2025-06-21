import express from "express";
import axios from "axios";
import bodyParser from "body-parser"

const app = express();
const port = process.env.PORT || 3001

app.use(express.json())
// app.use(bodyParser.json())
// --- Konfigurasi WAHA ---
// URL endpoint WAHA Anda. Pastikan Waha sudah berjalan dan dapat diakses.
// Contoh: Jika Waha berjalan di http://localhost:3000, maka URL-nya adalah itu.
const WAHA_API_URL = 'http://localhost:3000'; // Ganti dengan URL WAHA Anda yang sebenarnya dan pastikan portnya cocok dengan Docker
const WAHA_INSTANCE_ID = 'default'; // Ganti jika Anda menggunakan ID instance Waha yang berbeda
// WAHA_WEBHOOK_SECRET harus cocok dengan nilai WAPI_SECRET yang Anda tentukan saat menjalankan container Docker WAHA.
// Contoh: Jika Anda menjalankan `docker run ... -e WAPI_SECRET=rahasia_ku ...`, maka nilai di sini adalah 'rahasia_ku'.
const WAHA_WEBHOOK_SECRET = 'INI_RAHASIA_ANDA_YANG_UNIK'; // Ganti dengan secret webhook WAHA Anda

// --- Konfigurasi OpenRouter (Opsional, jika tidak menggunakan n8n untuk AI) ---
// Jika Anda ingin langsung memanggil OpenRouter dari Node.js tanpa n8n untuk AI
const OPENROUTER_API_KEY = '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'; // Ganti dengan kunci API OpenRouter Anda
const OPENROUTER_MODEL = 'mistralai/mistral-7b-instruct:free'; // Contoh model gratis di OpenRouter
const N8N_WEBHOOK_URL = 'https://aprizallahmad.app.n8n.cloud/webhook-test/8fee5327-d473-4690-af5b-493484850a6e'; // Ganti dengan URL webhook n8n Anda

// Fungsi untuk mengirim pesan balasan melalui WAHA
async function sendWhatsAppMessage(chatId, message) {
    try {
        const response = await axios.post(
            `${WAHA_API_URL}/api/v1/instances/${WAHA_INSTANCE_ID}/sendText`,
            {
                chatId: chatId,
                message: message,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    // Tambahkan header otorisasi jika WAHA Anda memerlukannya
                    // 'Authorization': 'Bearer YOUR_WAHA_TOKEN'
                },
            }
        );
        console.log(`Pesan berhasil dikirim ke ${chatId}:`, response.data);
    } catch (error) {
        console.error(`Gagal mengirim pesan ke ${chatId}:`, error.response ? error.response.data : error.message);
    }
}

// Fungsi untuk memanggil AI dari OpenRouter
// Ini bisa dilakukan di n8n juga, tergantung arsitektur Anda
async function getAIResponse(prompt) {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: OPENROUTER_MODEL,
                messages: [{ role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Gagal mendapatkan respons dari OpenRouter:', error.response ? error.response.data : error.message);
        return 'Maaf, saya tidak bisa memproses permintaan Anda saat ini.';
    }
}


// Endpoint webhook WAHA untuk menerima pesan masuk
// Pastikan WAHA Anda dikonfigurasi untuk mengirim pesan ke endpoint ini
// Contoh: http://your_server_ip:3000/waha-webhook
app.post('/waha-webhook', async (req, res) => {
    // Verifikasi secret webhook (opsional tapi sangat direkomendasikan)
    // const webhookSecret = req.headers['x-waha-secret']; // Header yang digunakan WAHA
    // if (WAHA_WEBHOOK_SECRET && webhookSecret !== WAHA_WEBHOOK_SECRET) {
    //     console.warn('Secret webhook tidak valid. Permintaan ditolak.');
    //     return res.status(403).send('Forbidden');
    // }
    const event = req.body; 
    console.log('Menerima event WAHA:', JSON.stringify(event, null, 2)); 

    

    // Periksa apakah event adalah pesan masuk dari pengguna
    if (event.event === 'message' && event.payload && !event.payload.fromMe) {
        const message = event.payload;
        const chatId = message.chatId;
        const text = message.body;

        console.log(`Pesan masuk dari ${chatId}: "${text}"`);
        try {
            const n8nResponse = await axios.post(N8N_WEBHOOK_URL, {
                chatId: chatId,
                message: text,
                // Tambahkan data lain yang relevan jika diperlukan
            });
            console.log('Pesan berhasil diteruskan ke n8n:', n8nResponse.data);
            // n8n akan menangani logika AI dan mengirim balasan melalui WAHA
            // Jika n8n yang akan mengirim balasan, Anda tidak perlu mengirim di sini.
            // Jika Anda ingin Node.js menunggu balasan dari n8n, n8n perlu mengembalikan teks balasan.
            // Untuk kesederhanaan awal, asumsikan n8n akan mengirim balasan sendiri.
            res.send('Pesan diterima dan diteruskan ke n8n. dan ini balasannya : ' + n8nResponse.data.message);
        } catch (n8nError) {
            await sendWhatsAppMessage(chatId, 'Maaf, ada masalah dalam memproses permintaan Anda.');
            res.status(500).send({
                error: `Gagal meneruskan pesan ke n8n: ${n8nError.response?.data?.message } `,
                message : 'Internal Server Error',
                code : 500
            });
        }

    } else {
        // Abaikan event yang bukan pesan masuk dari pengguna
        res.status(200).send('OK');
    }
});

// Endpoint untuk memeriksa status server
app.get('/', async (req, res)  => {
    try {
        const response = await axios.get(N8N_WEBHOOK_URL);
        res.send({ 
            status : 'Server is running and n8n is reachable.', 
            response : response.data.message
        });
    } catch (error) {
        console.error('Gagal mendapatkan respons dari OpenRouter:', error.response ? error.response.data : error.message);
        res.send('Maaf, saya tidak bisa memproses permintaan Anda saat ini.') 
    }
});

// Mulai server
app.listen(port, () => {
    console.log(`Server Node.js berjalan di http://localhost:${port}`);
    console.log('Pastikan WAHA Anda terhubung dan mengirim webhook ke /waha-webhook.');
});

// --- Instruksi Penggunaan ---
// 1. Pastikan Anda telah menginstal Node.js.
// 2. Inisialisasi proyek Node.js: `npm init -y`
// 3. Instal dependensi: `npm install express body-parser axios`
// 4. Unduh dan jalankan Waha (https://waha.dev/docs/installation/).
//    Pastikan Waha berjalan dan Anda memiliki URL dan instance ID yang benar.
// 5. Sesuaikan `WAHA_API_URL`, `WAHA_INSTANCE_ID`, dan `WAHA_WEBHOOK_SECRET`.
// 6. Jika langsung memanggil OpenRouter, sesuaikan `OPENROUTER_API_KEY` dan `OPENROUTER_MODEL`.
// 7. Jika menggunakan n8n, sesuaikan `N8N_WEBHOOK_URL`.
// 8. Konfigurasikan WAHA Anda untuk mengirim webhook ke `http://your_server_ip:3000/waha-webhook`.
// 9. Jalankan aplikasi Node.js: `node app.js`
