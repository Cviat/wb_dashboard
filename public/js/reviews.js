// ═══ Модуль отзывов ═══
const Reviews = (() => {
    let currentFilter = 'all';
    let currentPage = 0;
    const PAGE_SIZE = 20;

    // Генерация URL фото товара WB по nmId
    const getWbImageUrl = (nmId) => {
        const vol = Math.floor(nmId / 100000);
        const part = Math.floor(nmId / 1000);
        let basket;
        if (vol <= 143) basket = '01';
        else if (vol <= 287) basket = '02';
        else if (vol <= 431) basket = '03';
        else if (vol <= 719) basket = '04';
        else if (vol <= 1007) basket = '05';
        else if (vol <= 1061) basket = '06';
        else if (vol <= 1115) basket = '07';
        else if (vol <= 1169) basket = '08';
        else if (vol <= 1313) basket = '09';
        else if (vol <= 1601) basket = '10';
        else if (vol <= 1655) basket = '11';
        else if (vol <= 1919) basket = '12';
        else if (vol <= 2045) basket = '13';
        else if (vol <= 2189) basket = '14';
        else if (vol <= 2405) basket = '15';
        else if (vol <= 2621) basket = '16';
        else if (vol <= 2837) basket = '17';
        else if (vol <= 3053) basket = '18';
        else if (vol <= 3269) basket = '19';
        else if (vol <= 3485) basket = '20';
        else if (vol <= 3701) basket = '21';
        else if (vol <= 3917) basket = '22';
        else if (vol <= 4133) basket = '23';
        else if (vol <= 4349) basket = '24';
        else basket = '25';
        return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/1.webp`;
    };

    const load = async (skip = 0) => {
        const list = document.getElementById('reviewsList');
        list.innerHTML = '<div class="loader">Загрузка отзывов...</div>';

        try {
            const params = new URLSearchParams({
                take: PAGE_SIZE,
                skip: skip,
                order: 'dateDesc'
            });

            if (currentFilter === 'answered') params.set('isAnswered', 'true');
            if (currentFilter === 'unanswered') params.set('isAnswered', 'false');

            const ratingFilter = document.getElementById('ratingFilter');
            if (ratingFilter && ratingFilter.value) {
                // Фильтрация по рейтингу на клиенте
            }

            const response = await fetch(`/api/reviews?${params}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Ошибка загрузки');

            const feedbacks = data.data?.feedbacks || data.feedbacks || [];
            const countUnanswered = data.data?.countUnanswered || 0;
            const countArchive = data.data?.countArchive || 0;

            // Счётчики
            document.getElementById('reviewCounters').innerHTML = `
                <span class="counter-badge">Без ответа: <b>${countUnanswered}</b></span>
                <span class="counter-badge">Архив: <b>${countArchive}</b></span>
            `;

            if (feedbacks.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state__icon">&#9733;</span>
                        <p>Отзывов не найдено</p>
                    </div>`;
                document.getElementById('reviewsPagination').innerHTML = '';
                return;
            }

            // Фильтрация по рейтингу на клиенте
            let filtered = feedbacks;
            const ratingVal = ratingFilter?.value;
            if (ratingVal) {
                filtered = feedbacks.filter(f => f.productValuation === parseInt(ratingVal));
            }

            list.innerHTML = filtered.map(f => renderReviewCard(f)).join('');

            // Пагинация
            renderPagination('reviewsPagination', skip, feedbacks.length, PAGE_SIZE, (newSkip) => {
                currentPage = newSkip / PAGE_SIZE;
                load(newSkip);
            });

        } catch (error) {
            list.innerHTML = `<div class="error-state">Ошибка: ${error.message}</div>`;
        }
    };

    const renderReviewCard = (f) => {
        const stars = '★'.repeat(f.productValuation || 0) + '☆'.repeat(5 - (f.productValuation || 0));
        const date = formatDate(f.createdDate);
        const hasAnswer = f.answer && f.answer.text;
        const badge = hasAnswer
            ? '<span class="review-card__badge review-card__badge--answered">Отвечен</span>'
            : '<span class="review-card__badge review-card__badge--unanswered">Без ответа</span>';

        const productName = f.productDetails?.productName || f.subjectName || 'Товар';
        const brand = f.productDetails?.brandName || '';
        const nmId = f.nmId || '';

        // Фото товара — строим URL по nmId
        const photoNmId = f.productDetails?.nmId || f.nmId || 0;
        let photoHtml;
        if (photoNmId) {
            const imgUrl = getWbImageUrl(photoNmId);
            photoHtml = `<img src="${imgUrl}" class="review-card__photo" alt="${escapeHtml(productName)}" 
                onerror="this.outerHTML='<div class=\\'review-card__photo-placeholder\\'>&#128722;</div>'" />`;
        } else {
            photoHtml = `<div class="review-card__photo-placeholder">&#128722;</div>`;
        }

        // Фото из отзыва
        let reviewPhotos = '';
        if (f.photoLinks && f.photoLinks.length > 0) {
            reviewPhotos = `<div class="review-card__photos">
                ${f.photoLinks.map(p => {
                    const url = typeof p === 'string' ? p : (p.fullSize || p.miniSize || '');
                    return url ? `<img src="${url}" class="review-card__photo-thumb" onclick="Reviews.openPhoto('${url}')" alt="Фото">` : '';
                }).join('')}
            </div>`;
        }

        // Ответ
        let answerHtml = '';
        if (hasAnswer) {
            answerHtml = `
                <div class="review-card__answer">
                    <div class="review-card__answer-label">Ваш ответ</div>
                    <div class="review-card__answer-text">${escapeHtml(f.answer.text)}</div>
                </div>`;
        }

        return `
        <div class="review-card" data-id="${f.id}">
            <div class="review-card__top">
                ${photoHtml}
                <div class="review-card__info">
                    <div class="review-card__product">${escapeHtml(productName)} ${brand ? '· ' + escapeHtml(brand) : ''}</div>
                    <div class="review-card__meta">
                        <span class="review-card__stars">${stars}</span>
                        <span class="review-card__date">${date}</span>
                        ${nmId ? `<span>nmId: ${nmId}</span>` : ''}
                        ${badge}
                    </div>
                </div>
            </div>
            ${f.userName ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">👤 ${escapeHtml(f.userName)}</div>` : ''}
            <div class="review-card__text">${escapeHtml(f.text || 'Без текста')}</div>
            ${reviewPhotos}
            ${answerHtml}
            <div class="review-card__actions">
                ${!hasAnswer ? `<button class="btn btn--primary btn--sm" onclick="Reviews.showReplyForm('${f.id}')">Ответить</button>` : ''}
                ${hasAnswer && f.answer?.editable ? `<button class="btn btn--secondary btn--sm" onclick="Reviews.showReplyForm('${f.id}', true)">Редактировать</button>` : ''}
                <button class="btn btn--secondary btn--sm" onclick="Reviews.hideCard('${f.id}')">Скрыть</button>
            </div>
            <div id="reply-form-${f.id}"></div>
        </div>`;
    };

    const showReplyForm = (id, isEdit = false) => {
        const container = document.getElementById(`reply-form-${id}`);
        if (container.innerHTML) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `
            <div class="reply-form">
                <textarea id="reply-text-${id}" placeholder="Введите ответ...">${isEdit ? '' : ''}</textarea>
                <button class="btn btn--primary" onclick="Reviews.submitReply('${id}')">Отправить</button>
            </div>`;
    };

    const submitReply = async (id) => {
        const textarea = document.getElementById(`reply-text-${id}`);
        const text = textarea?.value?.trim();
        if (!text) return;

        try {
            const response = await fetch('/api/reviews/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, text })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Ошибка отправки');
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
        // Фильтры
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                currentPage = 0;
                load(0);
            });
        });

        // Фильтр по рейтингу
        document.getElementById('ratingFilter')?.addEventListener('change', () => {
            currentPage = 0;
            load(0);
        });
    };

    const hideCard = (id) => {
        const card = document.querySelector(`.review-card[data-id="${id}"]`);
        if (card) {
            card.style.transition = 'opacity 0.3s, max-height 0.3s';
            card.style.opacity = '0';
            card.style.maxHeight = card.scrollHeight + 'px';
            requestAnimationFrame(() => {
                card.style.maxHeight = '0';
                card.style.overflow = 'hidden';
                card.style.padding = '0';
                card.style.margin = '0';
            });
            setTimeout(() => card.remove(), 300);
        }
    };

    return { init, load, showReplyForm, submitReply, openPhoto, hideCard };
})();
