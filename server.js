"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");

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

const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| EXPRESS
|--------------------------------------------------------------------------
*/

app.use(express.json());

app.use(express.static(
    path.join(__dirname, "public")
));


/*
|--------------------------------------------------------------------------
| DEMO USER
|--------------------------------------------------------------------------
|
| Telegram authentication полностью отключена.
|
| Все запросы работают от одного пользователя:
|
| tg_id = "123456789"
|
|--------------------------------------------------------------------------
*/

const DEMO_USER = {
    id: "123456789",
    username: "demo_user",
    first_name: "Demo",
    photo_url: ""
};


/*
|--------------------------------------------------------------------------
| AUTH REPLACEMENT
|--------------------------------------------------------------------------
|
| Раньше здесь проверялся Telegram initData.
|
| Теперь авторизации нет.
| Просто передаём демо-пользователя дальше.
|
|--------------------------------------------------------------------------
*/

function authenticate(req, res, next) {

    req.telegramUser = DEMO_USER;

    next();
}


/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
|
| В демо-режиме тот же пользователь является администратором.
|
|--------------------------------------------------------------------------
*/

function adminOnly(req, res, next) {

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

                } else if (a === "🍋") {

                    multiplier = 2.5;

                } else if (a === "🍒") {

                    multiplier = 2;

                } else {

                    multiplier = 0;

                }

            } else {

                /*
                 * Два одинаковых
                 */

                const counts = {};


                [
                    a,
                    b,
                    c
                ].forEach(symbol => {

                    counts[symbol] =
                        (counts[symbol] || 0) + 1;

                });


                const maxCount =
                    Math.max(
                        ...Object.values(counts)
                    );


                if (maxCount === 2) {

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
             * Вес выпадения
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


        if (
            random <= 0
        ) {

            return item;

        }

    }


    return combinations[0];

}


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


            /*
             * В базе:
             *
             * 1 = 1 💎
             * 10 = 10 💎
             * 100 = 100 💎
             *
             * Поэтому bet приходит сразу
             * в тех же единицах.
             */

            const bet =
                Number(
                    req.body.bet
                );


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
                        "Недостаточно баланса"

                });

            }


            /*
             * Получаем комбинацию
             */

            const result =
                getRandomCombination();


            /*
             * Общий выигрыш
             */

            const grossWin =
                Math.floor(
                    bet *
                    result.multiplier
                );


            /*
             * Комиссия администратора
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
             * Сначала списываем ставку
             */

            const {
                subtractBalance
            } = require("./database");


            const subtracted =
                subtractBalance(
                    user.id,
                    bet
                );


            if (!subtracted) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно баланса"

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
             * Начисляем комиссию админу
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
             * Получаем свежий баланс
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
                    error.message ||
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
| ВАЖНО:
|
| Frontend отправляет:
|
| 1.00 -> 100
| 10.00 -> 1000
|
| Но мы специально поддерживаем оба варианта:
|
| amount = 100  -> +100
| amount = 1    -> +1
|
| То есть:
|
| 1 в пополнении = 1 в балансе.
|
|--------------------------------------------------------------------------
*/

app.post(
    "/api/demo/deposit",
    authenticate,
    (req, res) => {

        try {

            let amount =
                Number(
                    req.body.amount
                );


            if (
                !Number.isFinite(amount)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Некорректная сумма"

                });

            }


            if (
                amount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Сумма должна быть больше 0"

                });

            }


            /*
             * ТВОЙ FRONTEND отправляет amount
             * уже в целых единицах базы.
             *
             * Например:
             *
             * 1.00 на frontend
             * ->
             * toUnits()
             * ->
             * 100
             *
             * Поэтому здесь НЕ надо умножать
             * 100 ещё раз.
             */


            if (
                !Number.isInteger(amount)
            ) {

                /*
                 * Защита, если кто-то напрямую
                 * отправит 1.5
                 */

                amount =
                    Math.round(
                        amount
                    );

            }


            if (
                amount < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимум 1 единица"

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


            console.log(
                "DEPOSIT REQUEST:",
                amount
            );


            const user =
                getOrCreateUser(
                    req.telegramUser
                );


            /*
             * Пополняем баланс
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
             * Свежий баланс
             */

            const updated =
                getUserByTelegramId(
                    user.tg_id
                );


            console.log(
                "NEW BALANCE:",
                updated.balance
            );


            res.json({

                success: true,

                balance:
                    updated.balance

            });

        } catch (error) {

            console.error(
                "DEPOSIT ERROR:",
                error
            );


            res.status(500).json({

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


            const stats =
                getAdminStats();


            if (
                stats.adminBalance < amount
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
            "EXPRESS ERROR:",
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
            "🔓 Telegram authentication: OFF"
        );

        console.log(
            "👤 Demo user: demo_user"
        );

        console.log(
            "💎 Balance mode: 1 = 1"
        );

        console.log(
            "================================="
        );

        console.log("");

    }
);
