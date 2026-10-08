// Initialize EmailJS
emailjs.init('lnc2fEY6PQfKOgvsK');

document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        const formData = new FormData(form);
        const templateParams = {
            from_name: formData.get('name'),
            from_phone: formData.get('phone'),
            message: formData.get('message'),
            to_email: 'yaxshiniyatstroyhouse2017@gmail.com'
        };

        emailjs.send('service_0gqky67', 'template_vrawfna', templateParams)
            .then(function (response) {
                console.log('Success!', response.status, response.text);
                alert('Xabar yuborildi! Tez orada biz siz bilan bog\'lanamiz.');
                form.reset();
            }, function (error) {
                console.log('Failed...', error);
                alert('Xatolik yuz berdi: ' + error.text);
            });
    });
});