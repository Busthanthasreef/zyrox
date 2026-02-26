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
        if (!container) return;

        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';

        fetch(url)
            .then(res => res.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const newContent = doc.getElementById('profile-card-container');

                if (newContent) {
                    container.innerHTML = newContent.innerHTML;
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
                if (this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = e => { if (preview) preview.src = e.target.result; };
                    reader.readAsDataURL(this.files[0]);
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
                preview.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00ff88&color=000&size=130`;
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
    const otherCards = document.querySelectorAll(`.address-card:not(#address-${id})`);
    const statusBadge = card?.querySelector('.status-badge');
    const listContainer = document.querySelector('.address-list');

    if (!card || !statusBadge) return;

    const originalContent = statusBadge.innerHTML;
    const originalClass   = statusBadge.className;

    card.classList.add('switching');
    otherCards.forEach(c => c.classList.add('fade-out'));
    statusBadge.innerHTML = `<span class="switching-text"><span class="spinner-small"></span> Updating...</span>`;

    fetch(`/address-default/${id}`, { method: 'PATCH' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                setTimeout(() => {
                    if (listContainer) listContainer.prepend(card);
                    card.classList.remove('switching');
                    card.classList.add('active');
                    statusBadge.innerHTML = `<i class="bi bi-patch-check-fill me-1"></i> Default Address`;
                    statusBadge.className = 'status-badge default';
                    const radio = card.querySelector('.default-radio');
                    if (radio) radio.checked = true;

                    otherCards.forEach(c => {
                        c.classList.remove('active', 'fade-out');
                        const badge = c.querySelector('.status-badge');
                        if (badge) { badge.innerHTML = 'Set as Default'; badge.className = 'status-badge set-default'; }
                        const r = c.querySelector('.default-radio');
                        if (r) r.checked = false;
                    });

                    setTimeout(() => {
                        const url = window.location.pathname + window.location.search;
                        window.loadCardContent ? window.loadCardContent(url, false) : window.location.reload();
                    }, 800);
                }, 600);
            } else {
                card.classList.remove('switching');
                otherCards.forEach(c => c.classList.remove('fade-out'));
                statusBadge.innerHTML = originalContent;
                statusBadge.className = originalClass;
                Swal?.fire({ icon: 'error', title: 'Error', text: data.message || 'Could not update' });
            }
        })
        .catch(err => {
            card.classList.remove('switching');
            otherCards.forEach(c => c.classList.remove('fade-out'));
            statusBadge.innerHTML = originalContent;
            statusBadge.className = originalClass;
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
