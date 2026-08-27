const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Создаём папку data, если её нет
const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Файл базы данных
const dbPath = path.join(dataDir, "baran.db");

const db = new Database(dbPath);

// Включаем WAL — безопаснее и быстрее для небольшого приложения
db.pragma("journal_mode = WAL");

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
|
| Telegram-пользователь:
| id       — внутренний ID
| tg_id    — Telegram ID
| username — username
| first_name
| balance  — виртуальные очки
| created_at
|
*/

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_id TEXT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        balance INTEGER NOT NULL DEFAULT 1000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);


/*
|--------------------------------------------------------------------------
| SPINS
|--------------------------------------------------------------------------
|
| Сохраняем каждый спин:
|
| user_id    — пользователь
| bet        — ставка
| symbol1    — первый символ
| symbol2    — второй символ
| symbol3    — третий символ
| multiplier — множитель
| win        — сумма выигрыша
| created_at — время
|
*/

db.exec(`
    CREATE TABLE IF NOT EXISTS spins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bet INTEGER NOT NULL,
        symbol1 TEXT NOT NULL,
        symbol2 TEXT NOT NULL,
        symbol3 TEXT NOT NULL,
        multiplier REAL NOT NULL,
        win INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );
`);


/*
|--------------------------------------------------------------------------
| Индексы
|--------------------------------------------------------------------------
*/

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tg_id
    ON users(tg_id);

    CREATE INDEX IF NOT EXISTS idx_spins_user_id
    ON spins(user_id);

    CREATE INDEX IF NOT EXISTS idx_spins_created_at
    ON spins(created_at);
`);


/*
|--------------------------------------------------------------------------
| Получить или создать пользователя
|--------------------------------------------------------------------------
*/

function getOrCreateUser(telegramUser) {

    if (!telegramUser || !telegramUser.id) {
        throw new Error("Telegram user не передан");
    }

    const tgId = String(telegramUser.id);

    let user = db.prepare(`
        SELECT *
        FROM users
        WHERE tg_id = ?
    `).get(tgId);

    if (user) {

        // Обновляем актуальные данные Telegram
        db.prepare(`
            UPDATE users
            SET username = ?,
                first_name = ?
            WHERE tg_id = ?
        `).run(
            telegramUser.username || null,
            telegramUser.first_name || null,
            tgId
        );

        return db.prepare(`
            SELECT *
            FROM users
            WHERE tg_id = ?
        `).get(tgId);
    }

    const result = db.prepare(`
        INSERT INTO users (
            tg_id,
            username,
            first_name,
            balance
        )
        VALUES (?, ?, ?, ?)
    `).run(
        tgId,
        telegramUser.username || null,
        telegramUser.first_name || null,
        1000
    );

    return db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
    `).get(result.lastInsertRowid);
}


/*
|--------------------------------------------------------------------------
| Получить пользователя
|--------------------------------------------------------------------------
*/

function getUserByTelegramId(tgId) {

    return db.prepare(`
        SELECT *
        FROM users
        WHERE tg_id = ?
    `).get(String(tgId));
}


/*
|--------------------------------------------------------------------------
| Изменить баланс
|--------------------------------------------------------------------------
*/

function changeBalance(userId, amount) {

    db.prepare(`
        UPDATE users
        SET balance = balance + ?
        WHERE id = ?
    `).run(amount, userId);

    return db.prepare(`
        SELECT balance
        FROM users
        WHERE id = ?
    `).get(userId);
}


/*
|--------------------------------------------------------------------------
| Установить баланс
|--------------------------------------------------------------------------
*/

function setBalance(userId, balance) {

    db.prepare(`
        UPDATE users
        SET balance = ?
        WHERE id = ?
    `).run(balance, userId);

    return db.prepare(`
        SELECT balance
        FROM users
        WHERE id = ?
    `).get(userId);
}


/*
|--------------------------------------------------------------------------
| Записать спин
|--------------------------------------------------------------------------
*/

function saveSpin({
    userId,
    bet,
    combo,
    multiplier,
    win
}) {

    db.prepare(`
        INSERT INTO spins (
            user_id,
            bet,
            symbol1,
            symbol2,
            symbol3,
            multiplier,
            win
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        bet,
        combo[0],
        combo[1],
        combo[2],
        multiplier,
        win
    );
}


/*
|--------------------------------------------------------------------------
| История пользователя
|--------------------------------------------------------------------------
*/

function getUserSpins(userId, limit = 20) {

    return db.prepare(`
        SELECT
            id,
            bet,
            symbol1,
            symbol2,
            symbol3,
            multiplier,
            win,
            created_at
        FROM spins
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(userId, limit);
}


/*
|--------------------------------------------------------------------------
| Экспорт
|--------------------------------------------------------------------------
*/

module.exports = {
    db,
    getOrCreateUser,
    getUserByTelegramId,
    changeBalance,
    setBalance,
    saveSpin,
    getUserSpins
};