const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:5501',
        'http://127.0.0.1:5501'
    ]);

    if (origin && allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Telegram bot
const bot = process.env.TELEGRAM_BOT_TOKEN ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN) : null;

async function sendEskizSms(phone, message) {
    if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
        return { success: false, message: 'Eskiz credentials missing' };
    }

    try {
        const loginResponse = await axios.post('https://notify.eskiz.uz/api/auth/login', {
            email: process.env.ESKIZ_EMAIL,
            password: process.env.ESKIZ_PASSWORD
        }, { timeout: 20000 });

        const token = loginResponse.data?.data?.token;
        if (!token) {
            throw new Error('Eskiz token not received');
        }

        await axios.post('https://notify.eskiz.uz/api/message/sms/send', {
            mobile_phone: String(phone).replace(/^\+/, ''),
            message,
            from: 4546
        }, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 20000
        });

        return { success: true };
    } catch (error) {
        console.error('Eskiz SMS error:', error.response?.data || error.message);
        return { success: false, message: error.response?.data?.message || error.message };
    }
}

// Contact form handler
app.post('/contact', async (req, res) => {
    const { name, phone, message } = req.body;

    try {
        if (![name, phone, message].every(value => typeof value === 'string' && value.trim())) {
            return res.status(400).json({ success: false, message: 'Ism, telefon va xabarni to‘liq kiriting.' });
        }

        const fullMessage = `Yangi xabar:\nIsm: ${name}\nTelefon: ${phone}\nXabar: ${message}`;

        console.log('Yangi xabar qabul qilindi:');
        console.log(`Ism: ${name}, Telefon: ${phone}, Xabar: ${message}`);

        let emailSent = false;
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: 'info@qurilish.uz',
                    subject: 'Yangi kontakt xabari',
                    text: fullMessage
                };
                await transporter.sendMail(mailOptions);
                emailSent = true;
                console.log('Email sent');
            } catch (emailError) {
                console.log('Email yuborilmadi:', emailError.message);
            }
        }

        let telegramSent = false;
        const telegramTargets = [
            { destination: 'channel', value: process.env.TELEGRAM_CHANNEL_ID },
            { destination: 'chat', value: process.env.TELEGRAM_CHAT_ID },
            { destination: 'group', value: process.env.TELEGRAM_GROUP_ID }
        ].map(({ destination, value }) => {
            if (typeof value !== 'string') {
                return null;
            }

            const normalizedTarget = value.trim();
            if (!normalizedTarget) {
                return null;
            }

            if (/^-?\d+$/.test(normalizedTarget)) {
                return { destination, target: normalizedTarget };
            }

            return { destination, target: normalizedTarget.startsWith('@') ? normalizedTarget : `@${normalizedTarget}` };
        }).filter(Boolean);

        const telegramResults = [];
        if (bot && telegramTargets.length > 0) {
            const uniqueTargets = new Map();
            for (const entry of telegramTargets) {
                const existing = uniqueTargets.get(entry.target);
                if (existing) {
                    existing.destinations.push(entry.destination);
                } else {
                    uniqueTargets.set(entry.target, { target: entry.target, destinations: [entry.destination] });
                }
            }

            for (const { target, destinations } of uniqueTargets.values()) {
                try {
                    await bot.sendMessage(target, fullMessage);
                    destinations.forEach(destination => telegramResults.push({ destination, sent: true }));
                    console.log(`Telegram sent to ${target}`);
                } catch (telegramError) {
                    destinations.forEach(destination => telegramResults.push({ destination, sent: false }));
                    console.error(`Telegram yuborilmadi (${target}):`, telegramError.message);
                }
            }
        }
        telegramSent = telegramResults.some(result => result.sent);

        let smsSent = false;
        const smsTarget = process.env.PHONE_NUMBER || phone;
        const smsResult = await sendEskizSms(smsTarget, fullMessage);
        smsSent = smsResult.success;

        res.json({
            success: true,
            message: 'Xabar qabul qilindi!',
            emailSent,
            telegramSent,
            telegramAvailable: Boolean(bot),
            telegramResults,
            telegramConfigured: telegramTargets.map(({ destination }) => destination),
            smsSent
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishlamoqda`);
});