const nodemailer = require('nodemailer');
const axios = require('axios');

const TelegramBot = require('node-telegram-bot-api');

// Environment variables
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const telegramGroupId = process.env.TELEGRAM_GROUP_ID;
const eskizEmail = process.env.ESKIZ_EMAIL;
const eskizPassword = process.env.ESKIZ_PASSWORD;
const phoneNumber = process.env.PHONE_NUMBER;

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: emailUser,
        pass: emailPass
    }
});

// Telegram bot
const bot = telegramBotToken ? new TelegramBot(telegramBotToken) : null;

async function sendEskizSms(phone, message) {
    if (!eskizEmail || !eskizPassword) {
        return { success: false, message: 'Eskiz credentials missing' };
    }

    try {
        const loginResponse = await axios.post('https://notify.eskiz.uz/api/auth/login', {
            email: eskizEmail,
            password: eskizPassword
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

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        const { name, phone, message } = JSON.parse(event.body);

        const fullMessage = `Yangi xabar:\nIsm: ${name}\nTelefon: ${phone}\nXabar: ${message}`;

        console.log('Yangi xabar qabul qilindi:');
        console.log(`Ism: ${name}, Telefon: ${phone}, Xabar: ${message}`);

        let emailSent = false;
        if (emailUser && emailPass) {
            try {
                const mailOptions = {
                    from: emailUser,
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
            telegramChannelId,
            telegramChatId,
            telegramGroupId
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
        const smsTarget = phoneNumber || phone;
        const smsResult = await sendEskizSms(smsTarget, fullMessage);
        smsSent = smsResult.success;

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: 'Xabar qabul qilindi!',
                emailSent,
                telegramSent,
                smsSent
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, message: 'Xatolik yuz berdi.' })
        };
    }
};
