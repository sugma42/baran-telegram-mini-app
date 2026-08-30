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
    getUserSpins
} = require("./database");

const app = express();

const PORT = Number(process.env.PORT) || 3000;


/*
|--------------------------------------------------------------------------
| EXPRESS
|--------------------------------------------------------------------------
*/

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/*
|--------------------------------------------------------------------------
| TELEGRAM AUTH
|--------------------------------------------------------------------------
|
| Telegram authentication НЕ обязательна.
|
| Если приложение открыто внутри Telegram:
| используется настоящий Telegram-пользователь.
|
| Если приложение открыто обычным браузером:
| используется demo-пользователь.
|
|--------------------------------------------------------------------------
*/

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken =
        process.env.BOT_TOKEN;

    /*
     * Если BOT_TOKEN отсутствует,
     * просто не используем Telegram auth.
     */

    if (!botToken) {
        console.log(
            "BOT_TOKEN не указан — используется demo user"
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
                .sort(
                    ([a], [b]) =>
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
                    calculatedHash,
                    "utf8"
                ),
                Buffer.from(
                    receivedHash,
                    "utf8"
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
|
| Никакой ошибки:
|
| "Telegram authentication failed"
|
| больше не будет блокировать приложение.
|--------------------------------------------------------------------------
*/

function authenticate(req, res, next) {

    const initData =
        req.headers[
            "x-telegram-init-data"
        ];

    /*
     * Сначала пробуем Telegram.
     */

    if (initData) {

        const telegramUser =
            validateTelegramInitData(
                initData
            );

        if (telegramUser) {

            req.telegramUser =
                telegramUser;

            req.demoUser = false;

            return next();
        }

        /*
         * initData был передан,
         * но Telegram-проверка не прошла.
         *
         * Вместо 401 используем demo user.
         */

        console.warn(
            "Telegram initData не прошёл проверку. Используется demo user."
        );
    }

    /*
     * DEMO USER
     */

    req.telegramUser = {

        id: "demo",

        username: "demo_user",

        first_name: "Demo",

        photo_url: ""

    };

    req.demoUser = true;

    next();
}


/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

function adminOnly(req, res, next) {

    const adminId =
        String(
            process.env.ADMIN_TG_ID || ""
        );

    const currentId =
        String(
            req.telegramUser?.id || ""
        );

    /*
     * Demo user не является админом,
     * если ADMIN_TG_ID специально не установлен
     * как "demo".
     */

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

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);


/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            status: "ok",

            time:
                new Date().toISOString()

        });
    }
);


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

                    id:
                        user.id,

                    telegram_id:
                        user.tg_id,

                    username:
                        user.username,

                    first_name:
                        user.first_name,

                    photo_url:
                        user.photo_url,

                    balance:
                        user.balance

                }

            });

        } catch (error) {

            console.error(
                "ME ERROR:",
                error
            );

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
| SYMBOLS
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


for (
    const a of symbols
) {

    for (
        const b of symbols
    ) {

        for (
            const c of symbols
        ) {

            let multiplier = 0;


            /*
             * Три одинаковых
             */

            if (
                a === b &&
                b === c
            ) {

                if (
                    a === "7️⃣"
                ) {

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


                [
                    a,
                    b,
                    c
                ].forEach(
                    symbol => {

                        counts[symbol] =
                            (
                                counts[symbol] ||
                                0
                            ) + 1;

                    }
                );


                const maxCount =
                    Math.max(
                        ...Object.values(
                            counts
                        )
                    );


                /*
                 * Два одинаковых
                 */

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

                    /*
                     * Специальные комбинации
                     */

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


            /*
             * Вес комбинации.
             */

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

                combo: [
                    a,
                    b,
                    c
                ],

                multiplier,

                weight

            });
        }
    }
}


/*
|--------------------------------------------------------------------------
| RANDOM COMBINATION
|--------------------------------------------------------------------------
*/

function getRandomCombination() {

    const totalWeight =
        combinations.reduce(
            (
                sum,
                item
            ) =>
                sum + item.weight,
            0
        );


    let random =
        Math.random() *
        totalWeight;


    for (
        const item of combinations
    ) {

        random -=
            item.weight;


        if (
            random <= 0
        ) {

            return item;

        }
    }


    return combinations[
        combinations.length - 1
    ];
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
                Number(
                    req.body.bet
                );


            /*
             * 1 = 1 💎
             */

            if (
                !Number.isInteger(bet) ||
                bet < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимальная ставка — 1 💎"

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


            /*
             * Проверяем баланс
             */

            const currentUser =
                getUserByTelegramId(
                    user.tg_id
                );


            if (
                !currentUser ||
                currentUser.balance < bet
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно 💎"

                });
            }


            /*
             * Получаем комбинацию
             */

            const result =
                getRandomCombination();


            /*
             * Валовый выигрыш
             */

            const grossWin =
                Math.floor(
                    bet *
                    result.multiplier
                );


            /*
             * Комиссия администратора 10%
             */

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


            /*
             * Списываем ставку.
             *
             * 1 = 1 💎
             */

            const removed =
                subtractBalance(
                    user.id,
                    bet
                );


            if (!removed) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно 💎"

                });
            }


            /*
             * Начисляем выигрыш
             */

            if (
                playerWin > 0
            ) {

                changeBalance(
                    user.id,
                    playerWin
                );
            }


            /*
             * Комиссия админа
             */

            if (
                adminCommission > 0
            ) {

                changeAdminBalance(
                    adminCommission
                );
            }


            /*
             * Сохраняем игру
             */

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


            /*
             * Транзакция
             */

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


            /*
             * Новый баланс
             */

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
                    updatedUser.balance

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
|
| Теперь:
|
| 1     -> +1 💎
| 10    -> +10 💎
| 100   -> +100 💎
|
|--------------------------------------------------------------------------
*/

app.post(
    "/api/demo/deposit",
    authenticate,
    (req, res) => {

        try {

            /*
             * С фронта приходит обычное число.
             *
             * Например:
             *
             * 1
             * 10
             * 25
             */

            const amount =
                Number(
                    req.body.amount
                );


            if (
                !Number.isFinite(amount) ||
                !Number.isInteger(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Сумма должна быть целым числом"

                });
            }


            if (
                amount > 10000000
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Слишком большая сумма"

                });
            }


            /*
             * Получаем пользователя
             */

            const user =
                getOrCreateUser(
                    req.telegramUser
                );


            /*
             * 1 = 1 💎
             */

            changeBalance(
                user.id,
                amount
            );


            /*
             * Записываем транзакцию
             */

            addTransaction({

                userId:
                    user.id,

                type:
                    "demo_deposit",

                amount,

                description:
                    "Демо-пополнение"

            });


            /*
             * Получаем свежий баланс
             */

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );


            console.log(
                `DEPOSIT: user=${user.tg_id}, amount=${amount}, balance=${updatedUser.balance}`
            );


            res.json({

                success: true,

                amount,

                balance:
                    updatedUser.balance

            });

        } catch (error) {

            console.error(
                "DEPOSIT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
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

            console.error(
                "HISTORY ERROR:",
                error
            );

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

            console.error(
                "ADMIN STATS ERROR:",
                error
            );

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
| ADMIN WITHDRAW
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


            const currentBalance =
                getAdminStats()
                    .adminBalance;


            if (
                currentBalance < amount
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

            console.error(
                "ADMIN WITHDRAW ERROR:",
                error
            );

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
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
    (error, req, res, next) => {

        console.error(
            "GLOBAL ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                "Внутренняя ошибка сервера"

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
            `💎 Баланс: 1 = 1 💎`
        );

        console.log(
            `🔐 Telegram auth: необязательна`
        );

        console.log(
            "================================="
        );

        console.log("");

    }
);
