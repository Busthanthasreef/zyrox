document.addEventListener('DOMContentLoaded', function () {
    initCardContent();

    document.body.addEventListener('click', function (e) {
        const ajaxLink = e.target.closest('.ajax-link');
        if (ajaxLink) {
            e.preventDefault();
            const url = ajaxLink.getAttribute('data-url') || ajaxLink.href;
            loadCardContent(url);
        }
    });

    window.addEventListener('popstate', function (e) {
        const url = e.state?.url || window.location.pathname;
        loadCardContent(url, false);
    });

    window.loadCardContent = function (url, pushState = true) {
        const container = document.getElementById('profile-card-container');
        if (!container) {
            window.location.href = url;
            return;
        }

        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';

        fetch(url)
            .then(res => res.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const newContent = doc.getElementById('profile-card-container');

                if (newContent) {
                    container.innerHTML = newContent.innerHTML;
                    container.className = newContent.className;
                    container.style.cssText = newContent.style.cssText;
                    if (pushState) history.pushState({ url }, '', url);
                    initCardContent();
                } else {
                    window.location.href = url;
                }
            })
            .catch(() => { window.location.href = url; })
            .finally(() => {
                container.style.opacity = '1';
                container.style.pointerEvents = 'auto';
            });
    };

    function initCardContent() {

        // ── Password added toast ──

        const profileToastInput = document.getElementById('showProfileSuccessToast');
        if (profileToastInput) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: profileToastInput.value,
                showConfirmButton: false,
                timer: 2500,
                background: '#141824',
                color: '#e8eaf6'
            });
            profileToastInput.remove();
        }

        const passSetToast = document.getElementById('showPasswordSetToast');
        if (passSetToast) {
            Swal.fire({
                icon: 'success',
                title: '🎉 Password Set!',
                text: 'You can now log in with your email and this new password.',
                confirmButtonText: 'Great!',
                confirmButtonColor: '#4f6ef7',
                background: '#141824',
                color: '#e8eaf6'
            });
            passSetToast.remove();
        }

        const passUpdateToast = document.getElementById('showPasswordUpdateToast');
        if (passUpdateToast) {
            Swal.fire({
                icon: 'success',
                title: 'Password Updated!',
                text: passUpdateToast.value,
                confirmButtonText: 'OK',
                confirmButtonColor: '#4f6ef7',
                background: '#141824',
                color: '#e8eaf6'
            });
            passUpdateToast.remove();
        }

        const toastInput = document.getElementById('showPasswordToast');
        if (toastInput?.value === 'true') {
            Swal.mixin({
                toast: true, position: 'top-end',
                showConfirmButton: false, timer: 3000, timerProgressBar: true,
                didOpen: t => { t.onmouseenter = Swal.stopTimer; t.onmouseleave = Swal.resumeTimer; }
            }).fire({ icon: 'success', title: 'Password added successfully' });
            toastInput.remove();
        }

        // ── Profile image preview ──
        const changeBtn   = document.getElementById('changeBtn');
        const removeBtn   = document.getElementById('removeBtn');
        const imageUpload = document.getElementById('imageUpload');
        const preview     = document.getElementById('profilePreview');

        if (changeBtn && imageUpload) {
            changeBtn.addEventListener('click', () => imageUpload.click());
            imageUpload.addEventListener('change', function () {
                const file = this.files[0];
                if (file) {
                    // Image type validation
                    if (!file.type.startsWith('image/')) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Invalid File Type',
                            text: 'Please select a valid image file (e.g., JPEG, PNG, WEBP).',
                            background: '#111422',
                            color: '#f0f2ff',
                            confirmButtonColor: '#4f6ef7'
                        });
                        this.value = '';
                        return;
                    }

                    // Image size validation (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'File Too Large',
                            text: 'Profile image must be under 5MB.',
                            background: '#111422',
                            color: '#f0f2ff',
                            confirmButtonColor: '#4f6ef7'
                        });
                        this.value = '';
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = e => { if (preview) preview.src = e.target.result; };
                    reader.readAsDataURL(file);
                }
                const removeInput = document.getElementById('removeImageInput');
                if (removeInput) removeInput.value = 'false';
                const pendingInput = document.getElementById('pendingImageInput');
                if (pendingInput) pendingInput.value = '';
            });
        }

        if (removeBtn && preview) {
            removeBtn.addEventListener('click', () => {
                const name = document.querySelector('input[name="Name"]')?.value || 'User';
                preview.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f6ef7&color=fff&size=130`;
                if (imageUpload) imageUpload.value = '';
                const removeInput = document.getElementById('removeImageInput');
                if (removeInput) removeInput.value = 'true';
                const pendingInput = document.getElementById('pendingImageInput');
                if (pendingInput) pendingInput.value = '';
            });
        }

        // ── Form submissions ──
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', function (e) {
                const action = form.action;
                const isProfileForm = ['/profile-edit', '/change-password', '/add-password'].some(p => action.includes(p));
                const isAddressForm = ['/address-add', '/address-edit'].some(p => action.includes(p));

                if (!isProfileForm && !isAddressForm) return;

                e.preventDefault();

                // Address forms → full page reload to preserve CSS/layout
                if (isAddressForm) {
                    form.submit();
                    return;
                }

                // Profile forms → AJAX
                const container = document.getElementById('profile-card-container');
                container.style.opacity = '0.5';
                container.style.pointerEvents = 'none';

                const formData = new FormData(form);
                fetch(action, {
                    method: form.method || 'POST',
                    body: form.querySelector('input[type="file"]') ? formData : new URLSearchParams(formData)
                })
                    .then(res => res.redirected ? loadCardContent(res.url) : res.text())
                    .then(html => {
                        if (!html) return;
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const newContent = doc.getElementById('profile-card-container');
                        if (newContent) {
                            container.innerHTML = newContent.innerHTML;
                    container.className = newContent.className;
                    container.style.cssText = newContent.style.cssText;
                            initCardContent();
                        }
                    })
                    .catch(() => form.submit())
                    .finally(() => {
                        container.style.opacity = '1';
                        container.style.pointerEvents = 'auto';
                    });
            });
        });
    }
});

/* ============================================================ */
/* ADDRESS MANAGEMENT                                            */
/* ============================================================ */

window.setDefaultAddress = function (id) {
    const card = document.getElementById(`address-${id}`);
    const listContainer = document.querySelector('.address-list-zyrox');
    if (!card || !listContainer) return;
    if (card.classList.contains('active')) return;

    const otherCards = Array.from(document.querySelectorAll(`.address-card-zyrox:not(#address-${id})`));
    const defaultIndicator = card.querySelector('.default-indicator');
    const originalContent = defaultIndicator ? defaultIndicator.innerHTML : '';

    // Phase 1: Visual State change
    card.classList.add('switching');
    if (defaultIndicator) {
        defaultIndicator.innerHTML = `<span class="switching-text"><span class="spinner-small"></span> Updating...</span>`;
    }

    fetch(`/address-default/${id}`, { method: 'PATCH' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Phase 2: Smooth Animation logic
                const firstCard = listContainer.querySelector('.address-card-zyrox');
                if (firstCard && firstCard !== card) {
                    // Get positions
                    const cardRect = card.getBoundingClientRect();
                    const firstRect = firstCard.getBoundingClientRect();
                    const offset = firstRect.top - cardRect.top;

                    // Fade out others slightly
                    otherCards.forEach(c => c.classList.add('fade-out'));

                    // Smooth glide to top
                    card.classList.add('moving-to-top');
                    card.style.transform = `translateY(${offset}px)`;

                    // Slide others down
                    otherCards.forEach(c => {
                        const cRect = c.getBoundingClientRect();
                        if (cRect.top < cardRect.top) {
                            c.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                            c.style.transform = `translateY(${cardRect.height + 20}px)`; // 20 is margin
                        }
                    });

                    // Finalize after animation
                    setTimeout(() => {
                        window.location.reload();
                    }, 700);
                } else {
                    window.location.reload();
                }
            } else {
                card.classList.remove('switching');
                if (defaultIndicator) defaultIndicator.innerHTML = originalContent;
                Swal?.fire({ icon: 'error', title: 'Error', text: data.message || 'Could not update' });
            }
        })
        .catch(err => {
            card.classList.remove('switching');
            if (defaultIndicator) defaultIndicator.innerHTML = originalContent;
            console.error(err);
        });
};


window.deleteAddress = function (id) {
    const doDelete = () => window.performDelete(id);

    if (!window.Swal) { if (confirm('Delete this address?')) doDelete(); return; }

    Swal.fire({
        background: '#1a2a30', color: '#fff', icon: 'warning',
        title: 'Delete Address?', text: 'This address will be permanently removed.',
        showCancelButton: true, confirmButtonText: 'Delete', cancelButtonText: 'Cancel',
        confirmButtonColor: '#ff4b5c', cancelButtonColor: 'rgba(255,255,255,0.1)',
        reverseButtons: true
    }).then(result => { if (result.isConfirmed) doDelete(); });
};

window.performDelete = function (id) {
    fetch(`/address-delete/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
        .then(res => { if (!res.ok) throw new Error(); return res.json(); })
        .then(data => {
            if (data.success) {
                const card = document.getElementById(`address-${id}`);
                if (card) {
                    Object.assign(card.style, { opacity: '0', transform: 'scale(0.9)', transition: '0.4s ease' });
                    setTimeout(() => card.remove(), 400);
                }
                setTimeout(() => {
                    const url = window.location.pathname + window.location.search;
                    window.loadCardContent ? window.loadCardContent(url, false) : window.location.reload();
                }, 500);
            } else {
                Swal?.fire('Error', data.message || 'Error deleting address', 'error');
            }
        })
        .catch(err => {
            console.error('Delete Error:', err);
            Swal?.fire('Error', 'Something went wrong. Please try again.', 'error');
        });
};
