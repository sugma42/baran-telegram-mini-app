require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const {
    getOrCreateUser,
    getUserByTelegramId,
    changeBalance,
    addTransaction,
    changeAdminBalance,
    getAdminStats,
    saveSpin,
    getUserSpins
} = require("./database");

const app = express();

const PORT =
    process.env.PORT || 3000;

app.use(express.json());

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

    const botToken =
        process.env.BOT_TOKEN;

    if (!botToken) {

        console.error(
            "BOT_TOKEN не указан"
        );

        return null;
    }

    try {

        const params =
            new URLSearchParams(initData);

        const receivedHash =
            params.get("hash");

        if (!receivedHash) {
            return null;
        }

        params.delete("hash");

        const dataCheckString =
            [...params.entries()]
                .sort(([a], [b]) =>
                    a.localeCompare(b)
                )
                .map(
                    ([key, value]) =>
                        `${key}=${value}`
                )
                .join("\n");

        const secretKey =
            crypto
                .createHmac(
                    "sha256",
                    "WebAppData"
                )
                .update(botToken)
                .digest();

        const calculatedHash =
            crypto
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
                Buffer.from(
                    calculatedHash
                ),
                Buffer.from(
                    receivedHash
                )
            )
        ) {
            return null;
        }

        const userData =
            params.get("user");

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
| AUTHENTICATE
|--------------------------------------------------------------------------
*/

function authenticate(
    req,
    res,
    next
) {

    if (
        process.env.DEMO_MODE ===
        "true"
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
        req.headers[
            "x-telegram-init-data"
        ];

    const telegramUser =
        validateTelegramInitData(
            initData
        );

    if (!telegramUser) {

        return res.status(401).json({
            success: false,
            error:
                "Telegram authentication failed"
        });
    }

    req.telegramUser =
        telegramUser;

    next();
}

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

function adminOnly(
    req,
    res,
    next
) {

    const adminId =
        String(
            process.env.ADMIN_TG_ID || ""
        );

    const currentId =
        String(
            req.telegramUser?.id || ""
        );

    if (
        !adminId ||
        currentId !== adminId
    ) {

        return res.status(403).json({
            success: false,
            error:
                "Доступ запрещён"
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

            res.json({

                success: true,

                user: {
                    id: user.id,
                    telegram_id:
                        user.tg_id,
                    username:
                        user.username,
                    first_name:
                        user.first_name,
                    photo_url:
                        user.photo_url,
                    balance:
                        Number(user.balance)
                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Не удалось получить пользователя"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| COMBINATIONS
|--------------------------------------------------------------------------
*/

const symbols = [
    "🍋",
    "7️⃣",
    "🍒",
    "💀"
];

const combinations = [];

for (const a of symbols) {

    for (const b of symbols) {

        for (const c of symbols) {

            let multiplier = 0;

            if (
                a === b &&
                b === c
            ) {

                if (a === "7️⃣") {

                    multiplier = 4;

                } else if (
                    a === "🍋"
                ) {

                    multiplier = 2.5;

                } else if (
                    a === "🍒"
                ) {

                    multiplier = 2;

                } else {

                    multiplier = 0;
                }

            } else {

                const counts = {};

                [a, b, c].forEach(
                    symbol => {

                        counts[symbol] =
                            (counts[symbol] || 0) + 1;

                    }
                );

                const maxCount =
                    Math.max(
                        ...Object.values(
                            counts
                        )
                    );

                if (
                    maxCount === 2
                ) {

                    if (
                        counts["7️⃣"] === 2
                    ) {

                        multiplier = 1.4;

                    } else if (
                        counts["🍋"] === 2
                    ) {

                        multiplier = 1.15;

                    } else if (
                        counts["🍒"] === 2
                    ) {

                        multiplier = 1.1;
                    }

                } else {

                    if (
                        a === "🍋" &&
                        b === "🍒" &&
                        c === "🍋"
                    ) {

                        multiplier = 0.5;

                    } else if (
                        a === "🍒" &&
                        b === "🍋" &&
                        c === "🍒"
                    ) {

                        multiplier = 0.5;
                    }
                }
            }

            let weight = 10;

            if (
                multiplier >= 4
            ) {

                weight = 0.4;

            } else if (
                multiplier >= 2
            ) {

                weight = 1.5;

            } else if (
                multiplier >= 1.4
            ) {

                weight = 3;

            } else if (
                multiplier >= 1
            ) {

                weight = 5;

            } else if (
                multiplier > 0
            ) {

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
| RANDOM RESULT
|--------------------------------------------------------------------------
*/

function getRandomCombination() {

    const totalWeight =
        combinations.reduce(
            (sum, item) =>
                sum + item.weight,
            0
        );

    let random =
        Math.random() *
        totalWeight;

    for (
        const item of combinations
    ) {

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
                Number(req.body.bet);

            if (
                !Number.isInteger(bet) ||
                bet < 1
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Минимальная ставка — 0.01"
                });
            }

            if (
                bet > 10000000
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Слишком большая ставка"
                });
            }

            if (
                user.balance < bet
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Недостаточно баланса"
                });
            }

            const result =
                getRandomCombination();

            const grossWin =
                Math.floor(
                    bet *
                    result.multiplier
                );

            let playerWin =
                grossWin;

            let adminCommission = 0;

            if (
                grossWin > 0
            ) {

                adminCommission =
                    Math.floor(
                        grossWin * 0.10
                    );

                playerWin =
                    grossWin -
                    adminCommission;
            }

            changeBalance(
                user.id,
                -bet
            );

            if (
                playerWin > 0
            ) {

                changeBalance(
                    user.id,
                    playerWin
                );
            }

            if (
                adminCommission > 0
            ) {

                changeAdminBalance(
                    adminCommission
                );
            }

            saveSpin({

                userId:
                    user.id,

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

            addTransaction({

                userId:
                    user.id,

                type:
                    "spin",

                amount:
                    playerWin - bet,

                description:
                    `Ставка ${bet}, результат ${result.multiplier}x`
            });

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );

            res.json({

                success: true,

                result: {

                    combo:
                        result.combo,

                    multiplier:
                        result.multiplier,

                    win:
                        playerWin,

                    grossWin,

                    adminCommission,

                    bet
                },

                balance:
                    Number(
                        updatedUser.balance
                    )
            });

        } catch (error) {

            console.error(
                "SPIN ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка сервера"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DEMO DEPOSIT
|--------------------------------------------------------------------------
*/

app.post(
    "/api/demo/deposit",
    authenticate,
    (req, res) => {

        try {

            console.log(
                "================================="
            );

            console.log(
                "💰 DEPOSIT REQUEST"
            );

            console.log(
                "Telegram user:",
                req.telegramUser
            );

            console.log(
                "Body:",
                req.body
            );

            const amount =
                Number(
                    req.body.amount
                );

            console.log(
                "Amount:",
                amount
            );

            if (
                !Number.isInteger(amount) ||
                amount < 1 ||
                amount > 10000000
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Некорректная сумма"
                });
            }

            const user =
                getOrCreateUser(
                    req.telegramUser
                );

            console.log(
                "User ID:",
                user.id
            );

            console.log(
                "Balance BEFORE:",
                user.balance
            );

            const changed =
                changeBalance(
                    user.id,
                    amount
                );

            console.log(
                "Balance AFTER:",
                changed.balance
            );

            addTransaction({

                userId:
                    user.id,

                type:
                    "demo_deposit",

                amount,

                description:
                    "Демо-пополнение"
            });

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );

            console.log(
                "Balance FROM DB:",
                updatedUser.balance
            );

            console.log(
                "================================="
            );

            return res.json({

                success: true,

                amount,

                balance:
                    Number(
                        updatedUser.balance
                    )
            });

        } catch (error) {

            console.error(
                "❌ DEPOSIT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Ошибка пополнения"

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

            res.json({

                success: true,

                history:
                    history.map(
                        spin => ({

                            id:
                                spin.id,

                            bet:
                                spin.bet,

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

                        })
                    )

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Не удалось получить историю"
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

            res.json({

                success: true,

                stats

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Не удалось получить статистику"
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
                Number(
                    req.body.amount
                );

            if (
                !Number.isInteger(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Некорректная сумма"
                });
            }

            const stats =
                getAdminStats();

            if (
                stats.adminBalance <
                amount
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Недостаточно средств"
                });
            }

            changeAdminBalance(
                -amount
            );

            res.json({

                success: true,

                adminBalance:
                    getAdminStats()
                        .adminBalance

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    "Ошибка вывода"
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "Страница не найдена"

        });

    }
);

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "================================="
        );
        console.log(
            "🐏 БАРАН SERVER"
        );
        console.log(
            "================================="
        );
        console.log(
            `🚀 Порт: ${PORT}`
        );
        console.log(
            `💰 Deposit API: /api/demo/deposit`
        );
        console.log(
            "================================="
        );
        console.log("");

    }
);
