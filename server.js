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
            process.env.TELEGRAM_CHANNEL_ID,
            process.env.TELEGRAM_CHAT_ID,
            process.env.TELEGRAM_GROUP_ID
        ].map(target => {
            if (typeof target !== 'string') {
                return null;
            }

            const value = target.trim();
            if (!value) {
                return null;
            }

            if (/^-?\d+$/.test(value)) {
                return value;
            }

            return value.startsWith('@') ? value : `@${value}`;
        }).filter(Boolean);

        if (bot && telegramTargets.length > 0) {
            try {
                for (const target of telegramTargets) {
                    await bot.sendMessage(target, fullMessage);
                }
                telegramSent = true;
                console.log(`Telegram sent to ${telegramTargets.join(', ')}`);
            } catch (telegramError) {
                console.log('Telegram yuborilmadi:', telegramError.message);
            }
        }

        let smsSent = false;
        const smsTarget = process.env.PHONE_NUMBER || phone;
        const smsResult = await sendEskizSms(smsTarget, fullMessage);
        smsSent = smsResult.success;

        res.json({
            success: true,
            message: 'Xabar qabul qilindi!',
            emailSent,
            telegramSent,
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