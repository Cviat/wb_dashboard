// ═══ Модуль техподдержки (вопросы покупателей) ═══
const Support = (() => {
    let currentFilter = 'all';
    let currentStatusFilter = '';
    let currentPage = 0;
    const PAGE_SIZE = 20;

    // Определение статуса обращения на основе данных
    const getStatus = (q) => {
        if (q.state === 'declined' || q.state === 'none') return 'resolved';
        if (q.answer && q.answer.text) return 'resolved';
        if (q.wasViewed || q.isViewed) return 'in-progress';
        return 'open';
    };

    const getStatusBadge = (status) => {
        const map = {
            'open': '<span class="status-badge status-badge--open">Открыто</span>',
            'in-progress': '<span class="status-badge status-badge--progress">В работе</span>',
            'resolved': '<span class="status-badge status-badge--resolved">Решено</span>'
        };
        return map[status] || '';
    };

    const load = async (skip = 0) => {
        const list = document.getElementById('supportList');
        list.innerHTML = '<div class="loader">Загрузка вопросов...</div>';

        try {
            const params = new URLSearchParams({
                take: PAGE_SIZE,
                skip: skip,
                order: 'dateDesc'
            });

            if (currentFilter === 'answered') params.set('isAnswered', 'true');
            if (currentFilter === 'unanswered') params.set('isAnswered', 'false');

            const response = await fetch(`/api/support?${params}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Ошибка загрузки');

            let questions = data.data?.questions || data.questions || [];
            const countUnanswered = data.data?.countUnanswered || 0;

            // Счётчики
            const openCount = questions.filter(q => getStatus(q) === 'open').length;
            const progressCount = questions.filter(q => getStatus(q) === 'in-progress').length;
            const resolvedCount = questions.filter(q => getStatus(q) === 'resolved').length;

            document.getElementById('supportCounters').innerHTML = `
                <span class="counter-badge counter-badge--open">Открыто: <b>${openCount}</b></span>
                <span class="counter-badge counter-badge--progress">В работе: <b>${progressCount}</b></span>
                <span class="counter-badge counter-badge--resolved">Решено: <b>${resolvedCount}</b></span>
            `;

            // Фильтрация по статусу на клиенте
            if (currentStatusFilter) {
                questions = questions.filter(q => getStatus(q) === currentStatusFilter);
            }

            if (!Array.isArray(questions) || questions.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state__icon">&#9881;</span>
                        <p>Вопросов не найдено</p>
                    </div>`;
                document.getElementById('supportPagination').innerHTML = '';
                return;
            }

            list.innerHTML = questions.map(q => renderSupportCard(q)).join('');

            renderPagination('supportPagination', skip, questions.length, PAGE_SIZE, (newSkip) => {
                currentPage = newSkip / PAGE_SIZE;
                load(newSkip);
            });

        } catch (error) {
            list.innerHTML = `<div class="error-state">Ошибка: ${error.message}</div>`;
        }
    };

    const renderSupportCard = (q) => {
        const date = formatDate(q.createdDate);
        const hasAnswer = q.answer && q.answer.text;
        const status = getStatus(q);
        const statusBadge = getStatusBadge(status);

        const productName = q.productDetails?.productName || q.subjectName || 'Товар';

        // Фото из вопроса
        let questionPhotos = '';
        if (q.photoLinks && q.photoLinks.length > 0) {
            questionPhotos = `<div class="review-card__photos">
                ${q.photoLinks.map(p => {
                    const url = typeof p === 'string' ? p : (p.fullSize || p.miniSize || '');
                    return url ? `<img src="${url}" class="review-card__photo-thumb" onclick="Support.openPhoto('${url}')" alt="Фото">` : '';
                }).join('')}
            </div>`;
        }

        let answerHtml = '';
        if (hasAnswer) {
            answerHtml = `
                <div class="support-card__answer">
                    <div class="support-card__answer-label">Ваш ответ</div>
                    <div class="review-card__answer-text">${escapeHtml(q.answer.text)}</div>
                </div>`;
        }

        return `
        <div class="support-card support-card--${status}" data-id="${q.id}">
            <div class="support-card__header">
                <div>
                    <span class="support-card__product">${escapeHtml(productName)}</span>
                    ${q.nmId ? `<span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">nmId: ${q.nmId}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${statusBadge}
                    <span class="support-card__date">${date}</span>
                </div>
            </div>
            ${q.userName ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">👤 ${escapeHtml(q.userName)}</div>` : ''}
            <div class="support-card__text">${escapeHtml(q.text || 'Без текста')}</div>
            ${questionPhotos}
            ${answerHtml}
            <div class="review-card__actions">
                ${!hasAnswer ? `<button class="btn btn--primary btn--sm" onclick="Support.showReplyForm('${q.id}')">Ответить</button>` : ''}
                ${hasAnswer && q.answer?.editable ? `<button class="btn btn--secondary btn--sm" onclick="Support.showReplyForm('${q.id}', true)">Редактировать</button>` : ''}
            </div>
            <div id="support-reply-${q.id}"></div>
        </div>`;
    };

    const showReplyForm = (id, isEdit = false) => {
        const container = document.getElementById(`support-reply-${id}`);
        if (container.innerHTML) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `
            <div class="reply-form-extended" style="margin-top:12px;">
                <textarea id="support-text-${id}" placeholder="Введите ответ..."></textarea>
                <div class="reply-form-extended__bottom">
                    <div class="reply-form-extended__attach">
                        <input type="file" id="support-file-${id}" multiple hidden
                               accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
                        <button class="btn btn--secondary btn--sm" onclick="document.getElementById('support-file-${id}').click()">
                            📎 Прикрепить файл
                        </button>
                        <div class="attached-files" id="support-files-list-${id}"></div>
                    </div>
                    <button class="btn btn--primary" onclick="Support.submitReply('${id}')">Отправить</button>
                </div>
            </div>`;
        
        // Обработчик выбора файлов
        document.getElementById(`support-file-${id}`).addEventListener('change', (e) => {
            const filesList = document.getElementById(`support-files-list-${id}`);
            const files = Array.from(e.target.files);
            filesList.innerHTML = files.map((f, i) => `
                <div class="attached-file">
                    <span class="attached-file__icon">${getFileIcon(f.name)}</span>
                    <span class="attached-file__name">${escapeHtml(f.name)}</span>
                    <span class="attached-file__size">${formatFileSize(f.size)}</span>
                    <button class="attached-file__remove" onclick="Support.removeFile('${id}', ${i})">✕</button>
                </div>
            `).join('');
        });
    };

    const removeFile = (id, index) => {
        const input = document.getElementById(`support-file-${id}`);
        const dt = new DataTransfer();
        const files = Array.from(input.files);
        files.forEach((f, i) => { if (i !== index) dt.items.add(f); });
        input.files = dt.files;
        // Trigger change manually
        input.dispatchEvent(new Event('change'));
    };

    const getFileIcon = (name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return '🖼️';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc','docx'].includes(ext)) return '📝';
        if (['xls','xlsx'].includes(ext)) return '📊';
        return '📎';
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
        return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
    };

    const submitReply = async (id) => {
        const textarea = document.getElementById(`support-text-${id}`);
        const text = textarea?.value?.trim();
        if (!text) return;

        const fileInput = document.getElementById(`support-file-${id}`);
        const files = fileInput?.files;

        try {
            // Если есть файлы — отправляем через FormData
            if (files && files.length > 0) {
                const formData = new FormData();
                formData.append('id', id);
                formData.append('text', text);
                for (let i = 0; i < files.length; i++) {
                    formData.append('files', files[i]);
                }

                const response = await fetch('/api/support/reply-with-files', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Ошибка отправки');
                }
            } else {
                const response = await fetch('/api/support/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, text, state: 'wbRu' })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Ошибка отправки');
                }
            }

            showToast('Ответ отправлен', 'success');
            load(currentPage * PAGE_SIZE);
        } catch (error) {
            showToast('Ошибка: ' + error.message, 'error');
        }
    };

    const openPhoto = (url) => {
        const lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.innerHTML = `<img src="${url}" alt="Фото">`;
        lb.onclick = () => lb.remove();
        document.body.appendChild(lb);
    };

    const init = () => {
        // Фильтры по ответу
        document.querySelectorAll('[data-filter-support]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-filter-support]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filterSupport;
                currentPage = 0;
                load(0);
            });
        });

        // Фильтр по статусу
        document.getElementById('supportStatusFilter')?.addEventListener('change', (e) => {
            currentStatusFilter = e.target.value;
            currentPage = 0;
            load(0);
        });
    };

    return { init, load, showReplyForm, submitReply, removeFile, openPhoto };
})();
