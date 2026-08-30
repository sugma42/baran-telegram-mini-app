"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const {
    getOrCreateUser,
    getUserByTelegramId,
    changeBalance,
    subtractBalance,
    addTransaction,
    changeAdminBalance,
    getAdminStats,
    saveSpin,
    getUserSpins,
    db
} = require("./database");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({
    limit: "20kb"
}));

app.use(express.static(
    path.join(__dirname, "public")
));

/*
|--------------------------------------------------------------------------
| TELEGRAM AUTH
|--------------------------------------------------------------------------
*/

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
        console.error("BOT_TOKEN не указан");
        return null;
    }

    try {

        const params = new URLSearchParams(initData);

        const receivedHash = params.get("hash");

        if (!receivedHash) {
            return null;
        }

        params.delete("hash");

        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");

        const secretKey = crypto
            .createHmac(
                "sha256",
                "WebAppData"
            )
            .update(botToken)
            .digest();

        const calculatedHash = crypto
            .createHmac(
                "sha256",
                secretKey
            )
            .update(dataCheckString)
            .digest("hex");

        if (
            calculatedHash.length !==
            receivedHash.length
        ) {
            return null;
        }

        if (
            !crypto.timingSafeEqual(
                Buffer.from(calculatedHash),
                Buffer.from(receivedHash)
            )
        ) {
            return null;
        }

        const userData = params.get("user");

        if (!userData) {
            return null;
        }

        return JSON.parse(userData);

    } catch (error) {

        console.error(
            "Telegram auth error:",
            error.message
        );

        return null;
    }
}

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

function authenticate(req, res, next) {

    if (
        process.env.DEMO_MODE === "true"
    ) {

        req.telegramUser = {
            id: "123456789",
            username: "demo_user",
            first_name: "Demo",
            photo_url: ""
        };

        return next();
    }

    const initData =
        req.headers["x-telegram-init-data"];

    const telegramUser =
        validateTelegramInitData(initData);

    if (!telegramUser) {

        return res.status(401).json({
            success: false,
            error: "Telegram authentication failed"
        });
    }

    req.telegramUser = telegramUser;

    next();
}

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

function adminOnly(req, res, next) {

    const adminId = String(
        process.env.ADMIN_TG_ID || ""
    );

    const currentId = String(
        req.telegramUser?.id || ""
    );

    if (
        !adminId ||
        currentId !== adminId
    ) {

        return res.status(403).json({
            success: false,
            error: "Доступ запрещён"
        });
    }

    next();
}

/*
|--------------------------------------------------------------------------
| HOME
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

/*
|--------------------------------------------------------------------------
| ME
|--------------------------------------------------------------------------
*/

app.get(
    "/api/me",
    authenticate,
    (req, res) => {

        try {

            const user =
                getOrCreateUser(
                    req.telegramUser
                );

            return res.json({
                success: true,

                user: {
                    id: user.id,
                    telegram_id: user.tg_id,
                    username: user.username,
                    first_name: user.first_name,
                    photo_url: user.photo_url,

                    // 1 = 1 💎
                    balance: user.balance
                }
            });

        } catch (error) {

            console.error(
                "ME ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Не удалось получить пользователя"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| SLOT CONFIGURATION
|--------------------------------------------------------------------------
*/

const symbols = [
    "🍋",
    "7️⃣",
    "🍒",
    "💀"
];


/*
|--------------------------------------------------------------------------
| COMBINATIONS
|--------------------------------------------------------------------------
*/

const combinations = [];

for (const a of symbols) {

    for (const b of symbols) {

        for (const c of symbols) {

            let multiplier = 0;

            /*
             * Три одинаковых
             */

            if (
                a === b &&
                b === c
            ) {

                if (a === "7️⃣") {
                    multiplier = 4;
                }

                else if (a === "🍋") {
                    multiplier = 2.5;
                }

                else if (a === "🍒") {
                    multiplier = 2;
                }

                else {
                    multiplier = 0;
                }
            }

            /*
             * Два одинаковых
             */

            else {

                const counts = {};

                for (const symbol of [a, b, c]) {
                    counts[symbol] =
                        (counts[symbol] || 0) + 1;
                }

                const maxCount =
                    Math.max(
                        ...Object.values(counts)
                    );

                if (maxCount === 2) {

                    if (
                        counts["7️⃣"] === 2
                    ) {
                        multiplier = 1.4;
                    }

                    else if (
                        counts["🍋"] === 2
                    ) {
                        multiplier = 1.15;
                    }

                    else if (
                        counts["🍒"] === 2
                    ) {
                        multiplier = 1.1;
                    }
                }

                /*
                 * Особые комбинации
                 */

                else {

                    if (
                        a === "🍋" &&
                        b === "🍒" &&
                        c === "🍋"
                    ) {
                        multiplier = 0.5;
                    }

                    else if (
                        a === "🍒" &&
                        b === "🍋" &&
                        c === "🍒"
                    ) {
                        multiplier = 0.5;
                    }
                }
            }

            /*
             * Вес выпадения
             */

            let weight = 10;

            if (multiplier >= 4) {
                weight = 0.4;
            }

            else if (multiplier >= 2) {
                weight = 1.5;
            }

            else if (multiplier >= 1.4) {
                weight = 3;
            }

            else if (multiplier >= 1) {
                weight = 5;
            }

            else if (multiplier > 0) {
                weight = 7;
            }

            combinations.push({
                combo: [a, b, c],
                multiplier,
                weight
            });
        }
    }
}


/*
|--------------------------------------------------------------------------
| RANDOM
|--------------------------------------------------------------------------
*/

const totalWeight =
    combinations.reduce(
        (sum, item) => sum + item.weight,
        0
    );


function getRandomCombination() {

    let random =
        Math.random() * totalWeight;

    for (const item of combinations) {

        random -= item.weight;

        if (random <= 0) {
            return item;
        }
    }

    return combinations[0];
}

/*
|--------------------------------------------------------------------------
| SPIN
|--------------------------------------------------------------------------
*/

app.post(
    "/api/spin",
    authenticate,
    (req, res) => {

        try {

            const user =
                getOrCreateUser(
                    req.telegramUser
                );

            const bet =
                Number(req.body?.bet);

            /*
             * Теперь:
             *
             * bet = 1  -> 1 💎
             * bet = 10 -> 10 💎
             */

            if (
                !Number.isInteger(bet) ||
                bet < 1
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Минимальная ставка — 1 💎"
                });
            }

            if (bet > 10000000) {

                return res.status(400).json({
                    success: false,
                    error: "Слишком большая ставка"
                });
            }

            /*
             * ВАЖНО:
             * Списываем ставку атомарно.
             *
             * Если денег недостаточно,
             * запрос не проходит.
             */

            const transaction = db.transaction(() => {

                const deducted =
                    subtractBalance(
                        user.id,
                        bet
                    );

                if (!deducted) {

                    const error =
                        new Error(
                            "Недостаточно баланса"
                        );

                    error.code =
                        "INSUFFICIENT_BALANCE";

                    throw error;
                }

                /*
                 * Генерируем результат
                 */

                const result =
                    getRandomCombination();

                /*
                 * Выигрыш
                 */

                const grossWin =
                    Math.floor(
                        bet * result.multiplier
                    );

                let playerWin =
                    grossWin;

                let adminCommission = 0;

                /*
                 * 10% комиссии с выигрыша
                 */

                if (grossWin > 0) {

                    adminCommission =
                        Math.floor(
                            grossWin * 0.10
                        );

                    playerWin =
                        grossWin -
                        adminCommission;
                }

                /*
                 * Начисляем выигрыш
                 */

                if (playerWin > 0) {

                    changeBalance(
                        user.id,
                        playerWin
                    );
                }

                /*
                 * Комиссия администратору
                 */

                if (adminCommission > 0) {

                    changeAdminBalance(
                        adminCommission
                    );
                }

                /*
                 * Сохраняем спин
                 */

                saveSpin({
                    userId: user.id,

                    bet,

                    combo:
                        result.combo,

                    multiplier:
                        result.multiplier,

                    win:
                        grossWin,

                    playerWin,

                    adminCommission
                });

                /*
                 * Транзакция игрока.
                 *
                 * Например:
                 *
                 * ставка 10
                 * выигрыш 20
                 *
                 * amount = +10
                 */

                addTransaction({

                    userId: user.id,

                    type: "spin",

                    amount:
                        playerWin - bet,

                    description:
                        `Ставка ${bet}, результат ${result.multiplier}x`
                });

                return {
                    result,
                    grossWin,
                    playerWin,
                    adminCommission
                };
            });

            const result =
                transaction.result;

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );

            return res.json({

                success: true,

                result: {

                    combo:
                        result.combo,

                    multiplier:
                        result.multiplier,

                    win:
                        transaction.playerWin,

                    grossWin:
                        transaction.grossWin,

                    adminCommission:
                        transaction.adminCommission,

                    bet
                },

                balance:
                    updatedUser.balance
            });

        } catch (error) {

            if (
                error.code ===
                "INSUFFICIENT_BALANCE"
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Недостаточно 💎"
                });
            }

            console.error(
                "SPIN ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Ошибка сервера"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DEMO DEPOSIT
|--------------------------------------------------------------------------
|
| Здесь всё максимально просто:
|
| amount = 1
| баланс +1
|
| amount = 10
| баланс +10
|
| amount = 100
| баланс +100
|
|--------------------------------------------------------------------------
*/

app.post(
    "/api/demo/deposit",
    authenticate,
    (req, res) => {

        try {

            const amount =
                Number(req.body?.amount);

            /*
             * Только целые числа.
             *
             * 1 = 1
             * 10 = 10
             */

            if (
                !Number.isInteger(amount) ||
                amount < 1
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Введите целое число от 1"
                });
            }

            if (amount > 10000000) {

                return res.status(400).json({
                    success: false,
                    error: "Слишком большая сумма"
                });
            }

            const user =
                getOrCreateUser(
                    req.telegramUser
                );

            /*
             * Делаем начисление и запись
             * транзакции одной SQLite-транзакцией.
             */

            const transaction =
                db.transaction(() => {

                    changeBalance(
                        user.id,
                        amount
                    );

                    addTransaction({

                        userId:
                            user.id,

                        type:
                            "demo_deposit",

                        amount,

                        description:
                            `Демо-пополнение +${amount}`
                    });
                });

            transaction();

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );

            return res.json({

                success: true,

                deposited:
                    amount,

                balance:
                    updatedUser.balance
            });

        } catch (error) {

            console.error(
                "DEPOSIT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Ошибка пополнения"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| HISTORY
|--------------------------------------------------------------------------
*/

app.get(
    "/api/history",
    authenticate,
    (req, res) => {

        try {

            const user =
                getOrCreateUser(
                    req.telegramUser
                );

            const history =
                getUserSpins(
                    user.id,
                    20
                );

            return res.json({

                success: true,

                history:
                    history.map(spin => ({
                        id: spin.id,

                        bet: spin.bet,

                        combo: [
                            spin.symbol1,
                            spin.symbol2,
                            spin.symbol3
                        ],

                        multiplier:
                            spin.multiplier,

                        win:
                            spin.player_win,

                        created_at:
                            spin.created_at
                    }))
            });

        } catch (error) {

            console.error(
                "HISTORY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Не удалось получить историю"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| ADMIN STATS
|--------------------------------------------------------------------------
*/

app.get(
    "/api/admin/stats",
    authenticate,
    adminOnly,
    (req, res) => {

        try {

            const stats =
                getAdminStats();

            return res.json({
                success: true,
                stats
            });

        } catch (error) {

            console.error(
                "ADMIN STATS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Не удалось получить статистику"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| ADMIN DEMO WITHDRAW
|--------------------------------------------------------------------------
*/

app.post(
    "/api/admin/demo-withdraw",
    authenticate,
    adminOnly,
    (req, res) => {

        try {

            const amount =
                Number(req.body?.amount);

            if (
                !Number.isInteger(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Некорректная сумма"
                });
            }

            const stats =
                getAdminStats();

            if (
                stats.adminBalance < amount
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Недостаточно средств"
                });
            }

            changeAdminBalance(
                -amount
            );

            return res.json({

                success: true,

                adminBalance:
                    getAdminStats()
                        .adminBalance
            });

        } catch (error) {

            console.error(
                "ADMIN WITHDRAW ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Ошибка вывода"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {

    res.status(404).json({
        success: false,
        error: "Страница не найдена"
    });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {

    console.error(
        "SERVER ERROR:",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера"
    });
});

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

app.listen(
    PORT,
    () => {

        console.log("");
        console.log("=================================");
        console.log("🐏 БАРАН SERVER");
        console.log("=================================");
        console.log(`🚀 Порт: ${PORT}`);
        console.log("💎 1 = 1 баланс");
        console.log("=================================");
        console.log("");
    }
);
