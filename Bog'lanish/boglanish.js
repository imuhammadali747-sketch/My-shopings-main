document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('form-status');
    const submitButton = form.querySelector('button[type="submit"]');

    function getContactEndpoint() {
        const { hostname, port } = window.location;

        if (port === '5500' || port === '5501') {
            return `${window.location.protocol}//${hostname}:3000/contact`;
        }

        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
            return port === '8888' ? '/api/contact' : '/contact';
        }

        return '/api/contact';
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        const formData = new FormData(form);
        const payload = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            message: formData.get('message')
        };

        submitButton.disabled = true;
        status.textContent = 'Xabar yuborilmoqda...';
        status.className = '';

        fetch(getContactEndpoint(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(async function (response) {
                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Xabar yuborilmadi.');
                }

                const deliveryChannels = [];
                const telegramResults = result.telegramResults || [];
                const failedTelegramDestinations = telegramResults.filter(destination => !destination.sent);
                const configuredTelegramDestinations = result.telegramConfigured || [];
                const telegramLabels = {
                    channel: 'kanal',
                    group: 'guruh',
                    chat: 'chat'
                };

                if (result.telegramSent) {
                    deliveryChannels.push('Telegram');
                }
                if (result.emailSent) deliveryChannels.push('email');
                if (result.smsSent) deliveryChannels.push('SMS');

                if (deliveryChannels.length === 0) {
                    throw new Error('Xabar serverga yetdi, lekin yuborish kanallari sozlanmagan. Server sozlamalarini tekshiring.');
                }

                const telegramStatus = !result.telegramAvailable
                    ? 'Telegram bot sozlanmagan'
                    : ['channel', 'group', 'chat']
                        .filter(destination => destination !== 'chat' || configuredTelegramDestinations.includes(destination))
                        .map(destination => {
                            if (!configuredTelegramDestinations.includes(destination)) {
                                return `${telegramLabels[destination]}: sozlanmagan`;
                            }

                            const delivery = telegramResults.find(result => result.destination === destination);
                            const deliveryLabel = delivery?.sent ? 'yuborildi' : 'xatolik';
                            return `${telegramLabels[destination]}: ${deliveryLabel}`;
                        })
                        .join(', ');
                const deliveryStatus = [
                    `Xabar yuborildi (${deliveryChannels.join(', ')})`,
                    `Telegram: ${telegramStatus}`,
                    'Tez orada siz bilan bog‘lanamiz.'
                ].filter(Boolean).join('. ');

                status.textContent = deliveryStatus;
                const missingTelegramDestination = ['channel', 'group']
                    .some(destination => !configuredTelegramDestinations.includes(destination));
                status.className = failedTelegramDestinations.length || missingTelegramDestination || !result.telegramAvailable
                    ? 'form-status-error'
                    : 'form-status-success';
                form.reset();
            })
            .catch(function (error) {
                console.error('Kontakt xabari yuborilmadi:', error);
                status.textContent = error.message || 'Xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.';
                status.className = 'form-status-error';
            })
            .finally(function () {
                submitButton.disabled = false;
            });
    });
});