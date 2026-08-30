"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");

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

app.use(express.urlencoded({
    extended: true
}));

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
| Все пользователи работают через одного
| локального demo-пользователя.
|
|--------------------------------------------------------------------------
*/

const DEMO_USER = {
    id: "demo",
    username: "demo_user",
    first_name: "Demo",
    photo_url: ""
};


/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
|
| Никакого Telegram initData.
| Никакого BOT_TOKEN.
| Никакой проверки подписи.
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
| В этом демо режиме текущий пользователь
| автоматически имеет доступ к админке.
|
|--------------------------------------------------------------------------
*/

function adminOnly(req, res, next) {

    next();

}


/*
|--------------------------------------------------------------------------
| GAME SYMBOLS
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
| PAYTABLE
|--------------------------------------------------------------------------
*/

function getMultiplier(
    a,
    b,
    c
) {

    /*
     * Три одинаковых
     */

    if (
        a === b &&
        b === c
    ) {

        if (a === "7️⃣") {
            return 4;
        }

        if (a === "🍋") {
            return 2.5;
        }

        if (a === "🍒") {
            return 2;
        }

        return 0;
    }


    /*
     * Подсчитываем одинаковые символы
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


    /*
     * Два одинаковых
     */

    if (
        maxCount === 2
    ) {

        if (
            counts["7️⃣"] === 2
        ) {

            return 1.4;

        }

        if (
            counts["🍋"] === 2
        ) {

            return 1.15;

        }

        if (
            counts["🍒"] === 2
        ) {

            return 1.1;

        }

    }


    /*
     * Специальные комбинации
     */

    if (
        a === "🍋" &&
        b === "🍒" &&
        c === "🍋"
    ) {

        return 0.5;

    }


    if (
        a === "🍒" &&
        b === "🍋" &&
        c === "🍒"
    ) {

        return 0.5;

    }


    return 0;

}


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

            const multiplier =
                getMultiplier(
                    a,
                    b,
                    c
                );


            /*
             * Чем выше выигрыш,
             * тем меньше вероятность.
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
                total,
                item
            ) => {

                return total +
                    item.weight;

            },
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


    return combinations[
        combinations.length - 1
    ];

}


/*
|--------------------------------------------------------------------------
| GET CURRENT USER
|--------------------------------------------------------------------------
*/

function getCurrentUser() {

    return getOrCreateUser(
        DEMO_USER
    );

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
| API HEALTH
|--------------------------------------------------------------------------
*/

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            server: "online",

            telegramAuth: false

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
                getCurrentUser();


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
                getCurrentUser();


            /*
             * В базе баланс хранится
             * в минимальных единицах.
             *
             * Например:
             *
             * 1.00 = 100
             * 10.00 = 1000
             *
             * Поэтому frontend должен
             * отправлять ставку уже
             * в этих единицах.
             */

            const bet =
                Number(
                    req.body.bet
                );


            /*
             * Проверка ставки
             */

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
             * Проверяем актуальный баланс
             */

            const freshUser =
                getUserByTelegramId(
                    user.tg_id
                );


            if (!freshUser) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Пользователь не найден"

                });

            }


            if (
                freshUser.balance < bet
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно баланса"

                });

            }


            /*
             * Получаем результат
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
             * Комиссия 10%
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
             * Атомарно списываем ставку
             */

            const success =
                subtractBalance(
                    user.id,
                    bet
                );


            if (!success) {

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
             * Сохраняем транзакцию
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
             * Берём новый баланс
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
| Frontend из твоего index.html
| делает:
|
| toUnits(1.00) -> 100
|
| toUnits(10.00) -> 1000
|
| Поэтому сервер просто добавляет
| полученное число.
|
| 100 -> +1.00 💎
| 1000 -> +10.00 💎
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
             * Здесь ожидаются именно
             * целые единицы базы.
             *
             * Например:
             *
             * 100 = 1.00
             * 500 = 5.00
             * 1000 = 10.00
             */

            if (
                !Number.isInteger(amount)
            ) {

                amount =
                    Math.round(amount);

            }


            if (
                amount < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимальная сумма — 0.01"

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
                `💎 DEPOSIT: +${amount}`
            );


            /*
             * Получаем пользователя
             */

            const user =
                getCurrentUser();


            /*
             * Меняем баланс
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
                `💰 NEW BALANCE: ${updatedUser.balance}`
            );


            res.json({

                success: true,

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
                getCurrentUser();


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


            const adminBalance =
                getAdminStats()
                    .adminBalance;


            if (
                adminBalance < amount
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
                    error.message ||
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
| GLOBAL ERROR
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
            "======================================"
        );

        console.log(
            "🐏 БАРАН CASINO SERVER"
        );

        console.log(
            "======================================"
        );

        console.log(
            `🚀 Server: http://localhost:${PORT}`
        );

        console.log(
            "🔓 Telegram authentication: OFF"
        );

        console.log(
            "👤 User: demo_user"
        );

        console.log(
            "💎 Balance system: 100 = 1.00"
        );

        console.log(
            "🎰 Casino: ONLINE"
        );

        console.log(
            "======================================"
        );

        console.log("");

    }
);
