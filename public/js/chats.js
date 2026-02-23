// ═══ Модуль чатов с покупателями ═══
const Chats = (() => {
    let activeChatId = null;
    let activeReplySign = '';
    let allChats = [];
    let allEvents = []; // все события/сообщения
    let dateFrom = '';
    let dateTo = '';

    const load = async () => {
        const items = document.getElementById('chatListItems');
        items.innerHTML = '<div class="loader">Загрузка чатов...</div>';

        try {
            // Загружаем список чатов
            const chatsRes = await fetch('/api/chats');
            const chatsData = await chatsRes.json();

            if (!chatsRes.ok) throw new Error(chatsData.error || 'Ошибка загрузки чатов');

            const chats = chatsData.result || [];

            if (!Array.isArray(chats) || chats.length === 0) {
                items.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state__icon">&#9993;</span>
                        <p>Чатов пока нет</p>
                    </div>`;
                return;
            }

            allChats = chats;
            applyFilters();

            // Загружаем события в фоне (первая страница)
            loadEvents();

        } catch (error) {
            items.innerHTML = `<div class="error-state" style="padding:20px;">
                <p>Не удалось загрузить чаты</p>
                <p style="font-size:12px;margin-top:8px;">${error.message}</p>
            </div>`;
        }
    };

    const applyFilters = () => {
        let filtered = [...allChats];
        
        // Фильтр по поиску
        const query = document.getElementById('chatSearch')?.value?.toLowerCase() || '';
        if (query) {
            filtered = filtered.filter(c => {
                const name = (c.clientName || c.userName || c.buyerName || '').toLowerCase();
                return name.includes(query);
            });
        }

        // Фильтр по дате
        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            filtered = filtered.filter(c => {
                const ts = c.lastMessage?.addTimestamp || c.lastMessage?.addTimestampMs;
                const chatDate = ts ? new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts) : new Date(0);
                return chatDate >= from;
            });
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            filtered = filtered.filter(c => {
                const ts = c.lastMessage?.addTimestamp || c.lastMessage?.addTimestampMs;
                const chatDate = ts ? new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts) : new Date(0);
                return chatDate <= to;
            });
        }

        renderChatList(filtered);
    };

    // Загрузка событий с пагинацией (с задержками чтобы не попасть в 429)
    let eventsLoaded = false;
    let eventsNextCursor = null;
    let totalEventsCount = 0;

    const loadEvents = async () => {
        if (eventsLoaded) return;
        try {
            const url = eventsNextCursor 
                ? `/api/chats/events?next=${eventsNextCursor}` 
                : '/api/chats/events';
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                console.warn('Events load error:', data.error);
                return;
            }

            const events = data.events || [];
            allEvents.push(...events);
            totalEventsCount = data.totalEvents || 0;

            // Обновляем открытый чат новыми данными
            updateOpenChat();

            if (data.totalEvents > 0 && data.next) {
                eventsNextCursor = data.next;
                // Загружаем следующую страницу через 1.5 сек (лимит: 10 запросов / 10 сек)
                setTimeout(() => loadEvents(), 1500);
            } else {
                eventsLoaded = true;
                updateOpenChat(); // финальное обновление без индикатора
            }
        } catch (e) {
            console.warn('Events load failed:', e.message);
        }
    };

    // Обновление открытого чата с новыми событиями
    const updateOpenChat = () => {
        if (!activeChatId) return;

        const chatMessages = allEvents
            .filter(ev => ev.chatID === activeChatId || ev.chatId === activeChatId)
            .sort((a, b) => (a.addTimestamp || 0) - (b.addTimestamp || 0));

        renderMessages(chatMessages);

        // Показываем статус загрузки внизу чата
        if (!eventsLoaded) {
            const container = document.getElementById('chatMessages');
            if (container && !document.getElementById('chatLoadingStatus')) {
                const statusDiv = document.createElement('div');
                statusDiv.id = 'chatLoadingStatus';
                statusDiv.style.cssText = 'text-align:center;padding:10px;opacity:0.7;font-size:12px;';
                statusDiv.innerHTML = `📥 Загружается история... (${allEvents.length} событий)`;
                container.appendChild(statusDiv);
            } else if (container) {
                const statusDiv = document.getElementById('chatLoadingStatus');
                if (statusDiv) {
                    statusDiv.innerHTML = `📥 Загружается история... (${allEvents.length} событий)`;
                }
            }
        } else {
            // Убираем индикатор когда закончили
            const statusDiv = document.getElementById('chatLoadingStatus');
            if (statusDiv) statusDiv.remove();
        }
    };

    const renderChatList = (chats) => {
        const items = document.getElementById('chatListItems');
        items.innerHTML = chats.map(chat => {
            const name = chat.clientName || chat.userName || chat.buyerName || 'Покупатель';
            const lastMsg = chat.lastMessage || {};
            let preview = '';
            if (typeof lastMsg === 'string') {
                preview = lastMsg;
            } else if (lastMsg.message && typeof lastMsg.message === 'object') {
                preview = lastMsg.message.text || '';
            } else {
                preview = lastMsg.text || '';
            }
            const ts = lastMsg.addTimestamp || lastMsg.addTimestampMs || chat.updatedAt || '';
            const time = ts ? (typeof ts === 'number' && ts < 1e12 ? new Date(ts * 1000).toISOString() : ts) : '';
            const unread = chat.unreadCount || chat.unread_count || 0;
            const chatId = chat.chatID || chat.id || chat.chatId;
            const replySign = chat.replySign || '';
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

            // Товар из goodCard
            const good = chat.goodCard || {};
            const nmId = good.nmID || '';

            return `
            <div class="chat-list-item ${chatId === activeChatId ? 'active' : ''}" 
                 data-reply-sign="${escapeHtml(replySign)}"
                 onclick="Chats.openChat('${escapeHtml(chatId)}', '${escapeHtml(name)}')">
                <div class="chat-list-item__avatar">${initials}</div>
                <div class="chat-list-item__content">
                    <div class="chat-list-item__name">${escapeHtml(name)}</div>
                    <div class="chat-list-item__preview">${escapeHtml(truncate(preview, 50))}</div>
                </div>
                <div>
                    ${time ? `<div class="chat-list-item__time">${formatDate(time)}</div>` : ''}
                    ${unread > 0 ? `<div class="chat-list-item__unread">${unread}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    };

    const openChat = async (chatId, userName) => {
        activeChatId = chatId;

        // Сохраняем replySign из данных чата
        const chatData = allChats.find(c => (c.chatID || c.id) === chatId);
        activeReplySign = chatData?.replySign || '';

        // Обновляем активный элемент в списке
        document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));
        event?.target?.closest('.chat-list-item')?.classList.add('active');

        // Показываем окно чата
        document.querySelector('.chat-window__empty').classList.add('hidden');
        document.getElementById('chatWindowHeader').classList.remove('hidden');
        document.getElementById('chatMessages').classList.remove('hidden');
        document.getElementById('chatInput').classList.remove('hidden');

        document.getElementById('chatWindowUser').textContent = userName;

        // Фильтруем события по chatID — показываем что уже загружено
        const chatMessages = allEvents
            .filter(ev => ev.chatID === chatId || ev.chatId === chatId)
            .sort((a, b) => (a.addTimestamp || 0) - (b.addTimestamp || 0));

        if (chatMessages.length === 0 && allEvents.length === 0) {
            // Ещё вообще ничего не загрузилось
            document.getElementById('chatMessages').innerHTML = 
                '<div class="loader">Загрузка сообщений...</div>';
            return;
        }

        // Показываем что есть + индикатор загрузки если события ещё грузятся
        renderMessages(chatMessages);
        
        if (!eventsLoaded) {
            const container = document.getElementById('chatMessages');
            if (container && !document.getElementById('chatLoadingStatus')) {
                const statusDiv = document.createElement('div');
                statusDiv.id = 'chatLoadingStatus';
                statusDiv.style.cssText = 'text-align:center;padding:10px;opacity:0.7;font-size:12px;';
                statusDiv.innerHTML = `📥 Загружается история... (${allEvents.length} событий)`;
                container.appendChild(statusDiv);
            }
        }
    };

    const renderMessages = (messages) => {
        const container = document.getElementById('chatMessages');
        if (!Array.isArray(messages) || messages.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Сообщений пока нет</p></div>';
            return;
        }

        container.innerHTML = messages.map(msg => {
            // === Текст и вложения ===
            // Реальная структура WB: msg.message = { text: "...", attachments: { images: [...], goodCard: {...} } }
            let text = '';
            let attachmentsHtml = '';
            const msgData = msg.message || {};

            if (typeof msgData === 'string') {
                text = msgData;
            } else if (typeof msgData === 'object') {
                text = msgData.text || '';

                const att = msgData.attachments || null;
                if (att) {
                    // Изображения
                    const images = att.images || att.photos || [];
                    if (images.length > 0) {
                        attachmentsHtml += '<div class="message__images">';
                        images.forEach(img => {
                            const url = img.url || img.uri || '';
                            if (url) {
                                attachmentsHtml += `
                                    <a href="${escapeHtml(url)}" target="_blank" class="message__image-link">
                                        <img src="${escapeHtml(url)}" class="message__image" alt="Изображение" loading="lazy" />
                                    </a>`;
                            }
                        });
                        attachmentsHtml += '</div>';
                    }

                    // Карточка товара (goodCard)
                    const gc = att.goodCard || null;
                    if (gc && gc.nmID) {
                        attachmentsHtml += `
                            <div class="message__good-card">
                                <a href="https://www.wildberries.ru/catalog/${gc.nmID}/detail.aspx" target="_blank" class="message__good-link">
                                    🛍️ Товар: ${gc.nmID}
                                </a>
                            </div>`;
                    }

                    // Файлы/документы
                    const files = att.files || att.documents || [];
                    if (files.length > 0) {
                        files.forEach(f => {
                            const fileUrl = f.url || f.uri || '';
                            const fileName = f.name || f.filename || 'Файл';
                            if (fileUrl) {
                                attachmentsHtml += `
                                    <div class="message__file">
                                        <a href="${escapeHtml(fileUrl)}" target="_blank" class="message__file-link">📎 ${escapeHtml(fileName)}</a>
                                    </div>`;
                            }
                        });
                    }
                }
            }

            // === Направление сообщения ===
            // WB events: sender="client" → покупатель; isNewChat=true → первое сообщение покупателя
            // Без sender и без isNewChat → продавец / автоответ
            let isOut = true; // по умолчанию — продавец
            if (msg.sender === 'client' || msg.sender === 'buyer') {
                isOut = false;
            } else if (msg.isNewChat === true) {
                isOut = false; // первое сообщение всегда от покупателя
            } else if (msg.sender === 'seller' || msg.sender === 'bot') {
                isOut = true;
            } else if (msg.clientName || msg.source) {
                // Если есть clientName или source но нет sender — скорее покупатель
                // НО source есть и у первых сообщений, поэтому проверяем точнее
                if (msg.clientName) {
                    isOut = false;
                }
            }

            const ts = msg.addTimestamp || msg.addTimestampMs || 0;
            const time = ts ? formatDate(new Date(ts).toISOString()) : 
                         (msg.addTime ? formatDate(msg.addTime) : '');

            // Отдельный downloadID файла
            let filesHtml = '';
            const downloadId = msg.downloadID || msg.downloadId;
            if (downloadId) {
                filesHtml = `<div class="message__file">
                    <a href="/api/chats/download/${downloadId}" target="_blank" class="message__file-link">📎 Файл</a>
                </div>`;
            }

            const senderName = !isOut && msg.clientName ? `<div class="message__sender">${escapeHtml(msg.clientName)}</div>` : '';

            return `
            <div class="message message--${isOut ? 'out' : 'in'}">
                ${senderName}
                ${text ? escapeHtml(text) : ''}
                ${attachmentsHtml}
                ${filesHtml}
                <div class="message__time">${time}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
    };

    const sendMessage = async () => {
        if (!activeChatId || !activeReplySign) {
            showToast('Не удалось определить чат для отправки', 'error');
            return;
        }

        const textarea = document.getElementById('chatTextarea');
        const text = textarea.value.trim();
        if (!text) return;

        try {
            const formData = new FormData();
            formData.append('replySign', activeReplySign);
            formData.append('message', text);

            const response = await fetch('/api/chats/send', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Ошибка отправки');
            }

            textarea.value = '';
            showToast('Сообщение отправлено', 'success');

            // Перезагружаем события и открываем чат заново
            const eventsRes = await fetch('/api/chats/events');
            const eventsData = await eventsRes.json();
            allEvents = eventsData.events || [];

            const userName = document.getElementById('chatWindowUser').textContent;
            openChat(activeChatId, userName);

        } catch (error) {
            showToast('Ошибка: ' + error.message, 'error');
        }
    };

    const init = () => {
        // Кнопка отправки
        document.getElementById('chatSendBtn')?.addEventListener('click', sendMessage);

        // Enter для отправки
        document.getElementById('chatTextarea')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Поиск по имени
        document.getElementById('chatSearch')?.addEventListener('input', () => {
            applyFilters();
        });

        // Фильтр по статусу чата
        document.getElementById('chatStatusFilter')?.addEventListener('change', () => {
            applyFilters();
        });

        // Фильтр по дате — применить
        document.getElementById('chatDateApply')?.addEventListener('click', () => {
            dateFrom = document.getElementById('chatDateFrom')?.value || '';
            dateTo = document.getElementById('chatDateTo')?.value || '';
            applyFilters();
        });

        // Фильтр по дате — сбросить
        document.getElementById('chatDateReset')?.addEventListener('click', () => {
            dateFrom = '';
            dateTo = '';
            const fromInput = document.getElementById('chatDateFrom');
            const toInput = document.getElementById('chatDateTo');
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';
            applyFilters();
        });
    };

    return { init, load, openChat };
})();
