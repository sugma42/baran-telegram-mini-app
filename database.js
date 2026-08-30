"use strict";

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "baran.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
|
| Баланс хранится напрямую:
|
| 1   = 1 💎
| 10  = 10 💎
| 100 = 100 💎
|
|--------------------------------------------------------------------------
*/

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_id TEXT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        photo_url TEXT,
        balance INTEGER NOT NULL DEFAULT 100000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

/*
|--------------------------------------------------------------------------
| MIGRATION
|--------------------------------------------------------------------------
*/

const userColumns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map(row => row.name);

if (!userColumns.includes("photo_url")) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN photo_url TEXT
    `);
}

/*
|--------------------------------------------------------------------------
| SPINS
|--------------------------------------------------------------------------
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
        player_win INTEGER NOT NULL DEFAULT 0,
        admin_commission INTEGER NOT NULL DEFAULT 0,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );
`);

/*
|--------------------------------------------------------------------------
| TRANSACTIONS
|--------------------------------------------------------------------------
*/

db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER,

        type TEXT NOT NULL,

        amount INTEGER NOT NULL,

        description TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    );
`);

/*
|--------------------------------------------------------------------------
| ADMIN WALLET
|--------------------------------------------------------------------------
*/

db.exec(`
    CREATE TABLE IF NOT EXISTS admin_wallet (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO admin_wallet (id, balance)
    VALUES (1, 0);
`);

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tg_id
    ON users(tg_id);

    CREATE INDEX IF NOT EXISTS idx_spins_user_id
    ON spins(user_id);

    CREATE INDEX IF NOT EXISTS idx_spins_created_at
    ON spins(created_at);

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id
    ON transactions(user_id);
`);

/*
|--------------------------------------------------------------------------
| USERS
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

        db.prepare(`
            UPDATE users
            SET
                username = ?,
                first_name = ?,
                photo_url = ?
            WHERE tg_id = ?
        `).run(
            telegramUser.username || null,
            telegramUser.first_name || null,
            telegramUser.photo_url || null,
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
            photo_url,
            balance
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        tgId,
        telegramUser.username || null,
        telegramUser.first_name || null,
        telegramUser.photo_url || null,
        100000
    );

    return db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
    `).get(result.lastInsertRowid);
}


function getUserByTelegramId(tgId) {

    return db.prepare(`
        SELECT *
        FROM users
        WHERE tg_id = ?
    `).get(String(tgId));
}

/*
|--------------------------------------------------------------------------
| BALANCE
|--------------------------------------------------------------------------
*/

/*
 * Простое изменение баланса.
 *
 * 1 = +1
 * 10 = +10
 * -5 = -5
 */

function changeBalance(userId, amount) {

    if (!Number.isInteger(amount)) {
        throw new Error("Баланс должен изменяться целым числом");
    }

    const result = db.prepare(`
        UPDATE users
        SET balance = balance + ?
        WHERE id = ?
    `).run(
        amount,
        userId
    );

    if (result.changes !== 1) {
        throw new Error(
            `Не удалось изменить баланс. User ID: ${userId}`
        );
    }

    return db.prepare(`
        SELECT balance
        FROM users
        WHERE id = ?
    `).get(userId);
}


/*
 * Атомарно списывает деньги.
 *
 * Важно:
 * UPDATE выполнится только если
 * на балансе достаточно средств.
 */

function subtractBalance(userId, amount) {

    if (
        !Number.isInteger(amount) ||
        amount <= 0
    ) {
        throw new Error("Некорректная сумма списания");
    }

    const result = db.prepare(`
        UPDATE users
        SET balance = balance - ?
        WHERE id = ?
          AND balance >= ?
    `).run(
        amount,
        userId,
        amount
    );

    if (result.changes !== 1) {
        return false;
    }

    return true;
}


function setBalance(userId, balance) {

    if (!Number.isInteger(balance) || balance < 0) {
        throw new Error("Некорректный баланс");
    }

    const result = db.prepare(`
        UPDATE users
        SET balance = ?
        WHERE id = ?
    `).run(
        balance,
        userId
    );

    if (result.changes !== 1) {
        throw new Error(
            `Не удалось установить баланс. User ID: ${userId}`
        );
    }

    return db.prepare(`
        SELECT balance
        FROM users
        WHERE id = ?
    `).get(userId);
}

/*
|--------------------------------------------------------------------------
| TRANSACTIONS
|--------------------------------------------------------------------------
*/

function addTransaction({
    userId = null,
    type,
    amount,
    description = ""
}) {

    if (!type) {
        throw new Error("Тип транзакции не указан");
    }

    if (!Number.isInteger(amount)) {
        throw new Error("Сумма транзакции должна быть целым числом");
    }

    db.prepare(`
        INSERT INTO transactions (
            user_id,
            type,
            amount,
            description
        )
        VALUES (?, ?, ?, ?)
    `).run(
        userId,
        type,
        amount,
        description
    );
}

/*
|--------------------------------------------------------------------------
| ADMIN BALANCE
|--------------------------------------------------------------------------
*/

function changeAdminBalance(amount) {

    if (!Number.isInteger(amount)) {
        throw new Error("Некорректная сумма админского баланса");
    }

    const result = db.prepare(`
        UPDATE admin_wallet
        SET balance = balance + ?
        WHERE id = 1
    `).run(amount);

    if (result.changes !== 1) {
        throw new Error("Не удалось изменить баланс администратора");
    }

    return db.prepare(`
        SELECT balance
        FROM admin_wallet
        WHERE id = 1
    `).get();
}


function getAdminBalance() {

    const row = db.prepare(`
        SELECT balance
        FROM admin_wallet
        WHERE id = 1
    `).get();

    return row ? row.balance : 0;
}

/*
|--------------------------------------------------------------------------
| SPIN
|--------------------------------------------------------------------------
*/

function saveSpin({
    userId,
    bet,
    combo,
    multiplier,
    win,
    playerWin = 0,
    adminCommission = 0
}) {

    if (
        !Array.isArray(combo) ||
        combo.length !== 3
    ) {
        throw new Error("Некорректная комбинация");
    }

    db.prepare(`
        INSERT INTO spins (
            user_id,
            bet,
            symbol1,
            symbol2,
            symbol3,
            multiplier,
            win,
            player_win,
            admin_commission
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        bet,
        combo[0],
        combo[1],
        combo[2],
        multiplier,
        win,
        playerWin,
        adminCommission
    );
}

/*
|--------------------------------------------------------------------------
| HISTORY
|--------------------------------------------------------------------------
*/

function getUserSpins(userId, limit = 20) {

    const safeLimit = Math.max(
        1,
        Math.min(
            Number(limit) || 20,
            100
        )
    );

    return db.prepare(`
        SELECT
            id,
            bet,
            symbol1,
            symbol2,
            symbol3,
            multiplier,
            win,
            player_win,
            admin_commission,
            created_at
        FROM spins
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(
        userId,
        safeLimit
    );
}

/*
|--------------------------------------------------------------------------
| ADMIN STATS
|--------------------------------------------------------------------------
*/

function getAdminStats() {

    const totalUsers = db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
    `).get().count;

    const totalSpins = db.prepare(`
        SELECT COUNT(*) AS count
        FROM spins
    `).get().count;

    const totalBets = db.prepare(`
        SELECT COALESCE(SUM(bet), 0) AS amount
        FROM spins
    `).get().amount;

    const totalPlayerWins = db.prepare(`
        SELECT COALESCE(SUM(player_win), 0) AS amount
        FROM spins
    `).get().amount;

    const totalCommission = db.prepare(`
        SELECT COALESCE(SUM(admin_commission), 0) AS amount
        FROM spins
    `).get().amount;

    return {
        totalUsers,
        totalSpins,
        totalBets,
        totalPlayerWins,
        totalCommission,
        adminBalance: getAdminBalance()
    };
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
    db,

    getOrCreateUser,
    getUserByTelegramId,

    changeBalance,
    subtractBalance,
    setBalance,

    addTransaction,

    changeAdminBalance,
    getAdminBalance,

    saveSpin,
    getUserSpins,

    getAdminStats
};
