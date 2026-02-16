require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const WB_TOKEN = process.env.WB_TOKEN;

// Настройка multer для загрузки файлов
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const upload = multer({ dest: uploadsDir, limits: { fileSize: 10 * 1024 * 1024 } });

const WB_API = {
    feedbacks: 'https://feedbacks-api.wildberries.ru',
    buyerChat: 'https://buyer-chat-api.wildberries.ru',
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Хелпер для запросов к WB API ───
const wbRequest = async (baseUrl, method, endpoint, data = null, params = null) => {
    const config = {
        method,
        url: `${baseUrl}${endpoint}`,
        headers: {
            'Authorization': WB_TOKEN,
            'Content-Type': 'application/json'
        },
        timeout: 30000
    };
    if (params) config.params = params;
    if (data) config.data = data;
    return axios(config);
};

// ═══════════════════════════════════════
// ОТЗЫВЫ (Feedbacks API)
// ═══════════════════════════════════════

// Список отзывов
app.get('/api/reviews', async (req, res) => {
    try {
        const { isAnswered, take = 30, skip = 0, order = 'dateDesc', dateFrom, dateTo, nmId } = req.query;
        const baseParams = { take: parseInt(take), skip: parseInt(skip), order };
        if (dateFrom) baseParams.dateFrom = parseInt(dateFrom);
        if (dateTo) baseParams.dateTo = parseInt(dateTo);
        if (nmId) baseParams.nmId = parseInt(nmId);

        // WB API требует isAnswered всегда
        if (isAnswered === undefined || isAnswered === '') {
            // "Все" — запрашиваем и с ответом, и без ответа, объединяем
            const [answeredRes, unansweredRes] = await Promise.all([
                wbRequest(WB_API.feedbacks, 'GET', '/api/v1/feedbacks', null, { ...baseParams, isAnswered: true }),
                wbRequest(WB_API.feedbacks, 'GET', '/api/v1/feedbacks', null, { ...baseParams, isAnswered: false })
            ]);
            const dA = answeredRes.data?.data || {};
            const dU = unansweredRes.data?.data || {};
            const merged = [
                ...(dU.feedbacks || []),
                ...(dA.feedbacks || [])
            ].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
             .slice(0, parseInt(take));
            
            res.json({
                data: {
                    countUnanswered: dU.countUnanswered || 0,
                    countArchive: dA.countArchive || 0,
                    feedbacks: merged
                }
            });
        } else {
            baseParams.isAnswered = isAnswered === 'true';
            const response = await wbRequest(WB_API.feedbacks, 'GET', '/api/v1/feedbacks', null, baseParams);
            res.json(response.data);
        }
    } catch (error) {
        console.error('Reviews error:', error.response?.status, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// Количество отзывов
app.get('/api/reviews/count', async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        const params = {};
        if (dateFrom) params.dateFrom = parseInt(dateFrom);
        if (dateTo) params.dateTo = parseInt(dateTo);

        const response = await wbRequest(WB_API.feedbacks, 'GET', '/api/v1/feedbacks/count', null, params);
        res.json(response.data);
    } catch (error) {
        console.error('Reviews count error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Ответить на отзыв
app.post('/api/reviews/reply', async (req, res) => {
    try {
        const { id, text } = req.body;
        const response = await wbRequest(WB_API.feedbacks, 'PATCH', '/api/v1/feedbacks', { id, text });
        res.json(response.data || { success: true });
    } catch (error) {
        console.error('Reply error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// ═══════════════════════════════════════
// ЧАТЫ С ПОКУПАТЕЛЯМИ (Buyer Chat API)
// ═══════════════════════════════════════

// Список чатов
app.get('/api/chats', async (req, res) => {
    try {
        const response = await wbRequest(
            WB_API.buyerChat, 'GET', '/api/v1/seller/chats'
        );
        res.json(response.data);
    } catch (error) {
        console.error('Chats list error:', error.response?.status, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// События чатов (сообщения)
app.get('/api/chats/events', async (req, res) => {
    try {
        const { next } = req.query;
        const params = {};
        if (next) params.next = parseInt(next);

        const response = await wbRequest(
            WB_API.buyerChat, 'GET', '/api/v1/seller/events',
            null, params
        );

        const result = response.data?.result || {};
        res.json({
            next: result.next || null,
            totalEvents: result.totalEvents || 0,
            events: result.events || []
        });
    } catch (error) {
        console.error('Chat events error:', error.response?.status, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// Отправить сообщение (multipart/form-data)
app.post('/api/chats/send', upload.array('file', 5), async (req, res) => {
    try {
        const { replySign, message } = req.body;
        if (!replySign) {
            return res.status(400).json({ error: 'replySign обязателен' });
        }

        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('replySign', replySign);
        if (message) formData.append('message', message);

        // Прикрепляем файлы если есть
        if (req.files && req.files.length > 0) {
            req.files.forEach(f => {
                formData.append('file', fs.createReadStream(f.path), {
                    filename: f.originalname,
                    contentType: f.mimetype
                });
            });
        }

        const response = await axios({
            method: 'POST',
            url: `${WB_API.buyerChat}/api/v1/seller/message`,
            headers: {
                'Authorization': WB_TOKEN,
                ...formData.getHeaders()
            },
            data: formData,
            timeout: 30000
        });

        res.json(response.data || { success: true });
    } catch (error) {
        console.error('Send message error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    } finally {
        // Удаляем временные файлы
        (req.files || []).forEach(f => {
            try { fs.unlinkSync(f.path); } catch(e) {}
        });
    }
});

// Скачать файл из сообщения
app.get('/api/chats/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const response = await axios({
            method: 'GET',
            url: `${WB_API.buyerChat}/api/v1/seller/download/${fileId}`,
            headers: { 'Authorization': WB_TOKEN },
            responseType: 'stream',
            timeout: 30000
        });
        
        // Прокидываем content-type и поток
        res.set('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        response.data.pipe(res);
    } catch (error) {
        console.error('Download error:', error.response?.status || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// ═══════════════════════════════════════
// ЧАТЫ С ТЕХПОДДЕРЖКОЙ (Support API)
// ═══════════════════════════════════════

// Список обращений — используем Questions API как альтернативу
app.get('/api/support', async (req, res) => {
    try {
        const { isAnswered, take = 30, skip = 0, order = 'dateDesc' } = req.query;
        const baseParams = { take: parseInt(take), skip: parseInt(skip), order };

        if (isAnswered === undefined || isAnswered === '') {
            const [answeredRes, unansweredRes] = await Promise.all([
                wbRequest(WB_API.feedbacks, 'GET', '/api/v1/questions', null, { ...baseParams, isAnswered: true }),
                wbRequest(WB_API.feedbacks, 'GET', '/api/v1/questions', null, { ...baseParams, isAnswered: false })
            ]);
            const dA = answeredRes.data?.data || {};
            const dU = unansweredRes.data?.data || {};
            const merged = [
                ...(dU.questions || []),
                ...(dA.questions || [])
            ].sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
             .slice(0, parseInt(take));

            res.json({
                data: {
                    countUnanswered: dU.countUnanswered || 0,
                    questions: merged
                }
            });
        } else {
            baseParams.isAnswered = isAnswered === 'true';
            const response = await wbRequest(WB_API.feedbacks, 'GET', '/api/v1/questions', null, baseParams);
            res.json(response.data);
        }
    } catch (error) {
        console.error('Support error:', error.response?.status, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// Количество вопросов
app.get('/api/support/count', async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        const params = {};
        if (dateFrom) params.dateFrom = parseInt(dateFrom);
        if (dateTo) params.dateTo = parseInt(dateTo);

        const response = await wbRequest(WB_API.feedbacks, 'GET', '/api/v1/questions/count', null, params);
        res.json(response.data);
    } catch (error) {
        console.error('Support count error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Ответить на вопрос
app.post('/api/support/reply', async (req, res) => {
    try {
        const { id, text, state } = req.body;
        const body = { id, text };
        if (state) body.state = state;
        const response = await wbRequest(WB_API.feedbacks, 'PATCH', '/api/v1/questions', body);
        res.json(response.data || { success: true });
    } catch (error) {
        console.error('Support reply error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// Ответ на вопрос с прикреплёнными файлами
app.post('/api/support/reply-with-files', upload.array('files', 5), async (req, res) => {
    try {
        const { id, text } = req.body;
        if (!id || !text) {
            return res.status(400).json({ error: 'Необходимо указать id и text' });
        }

        // Отправляем текстовый ответ через Questions API
        const response = await wbRequest(WB_API.feedbacks, 'PATCH', '/api/v1/questions', {
            id, text, state: 'wbRu'
        });

        // Информация о прикреплённых файлах (сохранены локально)
        const files = (req.files || []).map(f => ({
            originalName: f.originalname,
            size: f.size,
            path: f.path
        }));

        res.json({
            success: true,
            message: 'Ответ отправлен' + (files.length ? `, файлов сохранено: ${files.length}` : ''),
            files
        });
    } catch (error) {
        console.error('Support reply-with-files error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    } finally {
        // Удаляем временные файлы
        (req.files || []).forEach(f => {
            try { fs.unlinkSync(f.path); } catch(e) {}
        });
    }
});

// ═══════════════════════════════════════
// Информация об аккаунте (из JWT)
// ═══════════════════════════════════════
app.get('/api/account', (req, res) => {
    try {
        const parts = WB_TOKEN.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        res.json({
            sellerId: payload.oid,
            userId: payload.uid,
            sessionId: payload.sid,
            expires: new Date(payload.exp * 1000).toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Не удалось декодировать токен' });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  WB Dashboard запущен: http://localhost:${PORT}\n`);
});
