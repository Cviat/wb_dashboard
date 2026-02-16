// ═══ Утилиты ═══
const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return String(dateStr);
    }
};

const truncate = (str, len) => {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
};

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

const renderPagination = (containerId, skip, count, pageSize, onNavigate) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentPage = Math.floor(skip / pageSize) + 1;
    const hasNext = count >= pageSize;
    const hasPrev = skip > 0;

    container.innerHTML = `
        <button class="pagination__btn" ${!hasPrev ? 'disabled' : ''} onclick="(${onNavigate})(${skip - pageSize})">&#8592; Назад</button>
        <span class="pagination__info">Стр. ${currentPage}</span>
        <button class="pagination__btn" ${!hasNext ? 'disabled' : ''} onclick="(${onNavigate})(${skip + pageSize})">Вперёд &#8594;</button>
    `;

    // Фикс: привязка через JS
    if (hasPrev) {
        container.children[0].onclick = () => onNavigate(skip - pageSize);
    }
    if (hasNext) {
        container.children[2].onclick = () => onNavigate(skip + pageSize);
    }
};

// ═══ Навигация ═══
const sections = { reviews: 'section-reviews', chats: 'section-chats', support: 'section-support' };
let currentSection = 'reviews';
let loadedSections = new Set();

const navigateTo = (section) => {
    if (section === currentSection) return;

    // Скрываем все секции
    Object.values(sections).forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });

    // Показываем выбранную
    document.getElementById(sections[section])?.classList.remove('hidden');

    // Обновляем навигацию
    document.querySelectorAll('.sidebar__item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    currentSection = section;

    // Загружаем данные при первом открытии
    if (!loadedSections.has(section)) {
        loadedSections.add(section);
        if (section === 'reviews') Reviews.load();
        if (section === 'chats') Chats.load();
        if (section === 'support') Support.load();
    }
};

// ═══ Инициализация ═══
document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    document.querySelectorAll('.sidebar__item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.section);
        });
    });

    // Инициализация модулей
    Reviews.init();
    Chats.init();
    Support.init();

    // Информация об аккаунте
    fetch('/api/account')
        .then(r => r.json())
        .then(data => {
            document.getElementById('accountId').textContent = `ID: ${data.sellerId || 'N/A'}`;
        })
        .catch(() => {
            document.getElementById('accountId').textContent = 'Не удалось загрузить';
        });

    // Загружаем первый раздел
    loadedSections.add('reviews');
    Reviews.load();
});
