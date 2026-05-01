const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ---------- НАСТРОЙКА БАЗЫ ДАННЫХ (для Bothost) ----------
// Путь к папке data (Bothost создаёт её автоматически)
const dataDir = '/app/data';
// Для локальной разработки (если папки /app/data нет)
const localDataDir = path.join(__dirname, 'data');

// Определяем, где мы находимся
let dbPath;
if (fs.existsSync('/app/data')) {
    dbPath = path.join('/app/data', 'game.db');
    console.log('🟢 Работаем на Bothost, база в /app/data');
} else {
    // Локальная разработка
    if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
    }
    dbPath = path.join(localDataDir, 'game.db');
    console.log('🟡 Локальный режим, база в ./data/game.db');
}

// Подключаем базу данных SQLite
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log(`✅ База данных подключена: ${dbPath}`);
    }
});

// Создаём таблицу для игроков, если её нет
db.run(`
    CREATE TABLE IF NOT EXISTS players (
        telegram_id TEXT PRIMARY KEY,
        coins INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 100,
        click_multiplier INTEGER DEFAULT 1,
        eggs INTEGER DEFAULT 0,
        common_ducks INTEGER DEFAULT 0,
        rare_ducks INTEGER DEFAULT 0,
        tasks_subscribe INTEGER DEFAULT 0,
        last_bonus_date TEXT,
        bonus_streak INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error('❌ Ошибка создания таблицы:', err.message);
    } else {
        console.log('✅ Таблица players готова');
    }
});

// ---------- API ----------
app.get('/api/player/:telegramId', (req, res) => {
    const telegramId = req.params.telegramId;

    db.get('SELECT * FROM players WHERE telegram_id = ?', [telegramId], (err, row) => {
        if (err) {
            console.error('DB error:', err);
            res.status(500).json({ error: err.message });
            return;
        }

        if (!row) {
            db.run('INSERT INTO players (telegram_id) VALUES (?)', [telegramId], function (err) {
                if (err) {
                    console.error('Insert error:', err);
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({
                    coins: 0,
                    energy: 100,
                    clickMultiplier: 1,
                    eggs: 0,
                    ducks: { common: 0, rare: 0 },
                    tasks: { subscribe: false },
                    lastBonusDate: null,
                    bonusStreak: 0
                });
            });
        } else {
            res.json({
                coins: row.coins,
                energy: row.energy,
                clickMultiplier: row.click_multiplier,
                eggs: row.eggs,
                ducks: { common: row.common_ducks, rare: row.rare_ducks },
                tasks: { subscribe: row.tasks_subscribe === 1 },
                lastBonusDate: row.last_bonus_date,
                bonusStreak: row.bonus_streak
            });
        }
    });
});

app.post('/api/player/:telegramId', (req, res) => {
    const telegramId = req.params.telegramId;
    const { coins, energy, clickMultiplier, eggs, ducks, tasks } = req.body;

    const sql = `
        UPDATE players SET
            coins = ?,
            energy = ?,
            click_multiplier = ?,
            eggs = ?,
            common_ducks = ?,
            rare_ducks = ?,
            tasks_subscribe = ?
        WHERE telegram_id = ?
    `;

    db.run(sql, [
        coins,
        energy,
        clickMultiplier,
        eggs,
        ducks.common,
        ducks.rare,
        tasks.subscribe ? 1 : 0,
        telegramId
    ], (err) => {
        if (err) {
            console.error('Save error:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.post('/api/daily-bonus/:telegramId', (req, res) => {
    const telegramId = req.params.telegramId;
    const today = new Date().toISOString().split('T')[0];

    db.get('SELECT last_bonus_date, bonus_streak FROM players WHERE telegram_id = ?', [telegramId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        let streak = 1;
        let canClaim = true;

        if (row && row.last_bonus_date) {
            const lastDate = row.last_bonus_date;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastDate === today) {
                canClaim = false;
                streak = row.bonus_streak;
            } else if (lastDate === yesterdayStr) {
                streak = row.bonus_streak + 1;
            } else {
                streak = 1;
            }
        }

        if (!canClaim) {
            res.json({ success: false, message: 'Сегодня вы уже получали бонус!', streak });
            return;
        }

        const bonusReward = 50 + (streak - 1) * 10;

        db.run(`
            UPDATE players SET
                coins = coins + ?,
                last_bonus_date = ?,
                bonus_streak = ?
            WHERE telegram_id = ?
        `, [bonusReward, today, streak, telegramId], (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, reward: bonusReward, streak });
        });
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 База данных: ${dbPath}`);
});

process.on('SIGINT', () => {
    db.close(() => {
        console.log('📦 База данных закрыта');
        process.exit();
    });
});