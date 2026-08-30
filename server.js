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

const PORT =
    Number(process.env.PORT) || 3000;


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
| DEMO USER
|--------------------------------------------------------------------------
|
| Telegram authentication отключена.
|
| Все посетители используют одного
| демо-пользователя.
|
*/

const DEMO_USER = {
    id: "123456789",
    username: "demo_user",
    first_name: "Demo",
    photo_url: ""
};


/*
|--------------------------------------------------------------------------
| USER
|--------------------------------------------------------------------------
*/

function getDemoUser() {

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
| ME
|--------------------------------------------------------------------------
*/

app.get(
    "/api/me",
    (req, res) => {

        try {

            const user =
                getDemoUser();


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
                        Number(user.balance || 0)

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
| SLOT SYMBOLS
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
             * Три одинаковых символа.
             */

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

                /*
                 * Два одинаковых символа.
                 */

                const counts = {};


                for (const symbol of [a, b, c]) {

                    counts[symbol] =
                        (counts[symbol] || 0) + 1;

                }


                const maxCount =
                    Math.max(
                        ...Object.values(
                            counts
                        )
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
                     * Специальные комбинации.
                     */

                    if (
                        (
                            a === "🍋" &&
                            b === "🍒" &&
                            c === "🍋"
                        ) ||
                        (
                            a === "🍒" &&
                            b === "🍋" &&
                            c === "🍒"
                        )
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

const totalWeight =
    combinations.reduce(
        (sum, item) =>
            sum + item.weight,
        0
    );


function getRandomCombination() {

    let random =
        Math.random() *
        totalWeight;


    for (
        const item
        of combinations
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
| SPIN
|--------------------------------------------------------------------------
*/

app.post(
    "/api/spin",
    (req, res) => {

        try {

            const user =
                getDemoUser();


            const bet =
                Number(req.body.bet);


            /*
             * 1 = 1.
             */

            if (
                !Number.isFinite(bet) ||
                bet < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимальная ставка — 1"

                });

            }


            /*
             * Разрешаем только максимум
             * два знака после запятой.
             */

            const roundedBet =
                Math.round(
                    bet * 100
                ) / 100;


            if (
                roundedBet !== bet
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Максимум 2 знака после запятой"

                });

            }


            /*
             * Ограничение ставки.
             */

            if (
                bet > 100000
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Слишком большая ставка"

                });

            }


            /*
             * Проверяем баланс.
             */

            if (
                Number(user.balance) < bet
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно баланса"

                });

            }


            /*
             * Получаем результат.
             */

            const result =
                getRandomCombination();


            /*
             * Валовый выигрыш.
             */

            const grossWin =
                Math.floor(
                    bet *
                    result.multiplier *
                    100
                ) / 100;


            /*
             * Комиссия админа 10%.
             */

            let adminCommission = 0;

            let playerWin =
                grossWin;


            if (
                grossWin > 0
            ) {

                adminCommission =
                    Math.floor(
                        grossWin *
                        0.10 *
                        100
                    ) / 100;


                playerWin =
                    Math.round(
                        (
                            grossWin -
                            adminCommission
                        ) * 100
                    ) / 100;

            }


            /*
             * Списываем ставку.
             */

            changeBalance(
                user.id,
                -bet
            );


            /*
             * Начисляем выигрыш.
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
             * Начисляем комиссию.
             */

            if (
                adminCommission > 0
            ) {

                changeAdminBalance(
                    adminCommission
                );

            }


            /*
             * Сохраняем игру.
             */

            saveSpin({

                userId:
                    user.id,

                bet:
                    bet,

                combo:
                    result.combo,

                multiplier:
                    result.multiplier,

                win:
                    grossWin,

                playerWin:
                    playerWin,

                adminCommission:
                    adminCommission

            });


            /*
             * Сохраняем транзакцию.
             */

            addTransaction({

                userId:
                    user.id,

                type:
                    "spin",

                amount:
                    Math.round(
                        (
                            playerWin -
                            bet
                        ) * 100
                    ) / 100,

                description:
                    `Ставка ${bet}, результат ${result.multiplier}x`

            });


            /*
             * Получаем новый баланс.
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

                    grossWin:
                        grossWin,

                    adminCommission:
                        adminCommission,

                    bet:
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
|
| Теперь:
|
| 1  -> +1
| 10 -> +10
| 100 -> +100
|
|--------------------------------------------------------------------------
*/

app.post(
    "/api/demo/deposit",
    (req, res) => {

        try {

            const amount =
                Number(
                    req.body.amount
                );


            /*
             * Проверка суммы.
             */

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Некорректная сумма"

                });

            }


            /*
             * Максимум 100000.
             */

            if (
                amount > 100000
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Слишком большая сумма"

                });

            }


            /*
             * Округляем до 2 знаков.
             */

            const roundedAmount =
                Math.round(
                    amount * 100
                ) / 100;


            if (
                roundedAmount !== amount
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Максимум 2 знака после запятой"

                });

            }


            const user =
                getDemoUser();


            /*
             * Пополнение:
             *
             * 1 = +1
             * 10 = +10
             * 100 = +100
             */

            changeBalance(
                user.id,
                amount
            );


            /*
             * Транзакция.
             */

            addTransaction({

                userId:
                    user.id,

                type:
                    "demo_deposit",

                amount:
                    amount,

                description:
                    `Демо-пополнение +${amount}`

            });


            /*
             * Новый баланс.
             */

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );


            console.log(
                `DEPOSIT: +${amount}, BALANCE: ${updatedUser.balance}`
            );


            res.json({

                success: true,

                balance:
                    Number(
                        updatedUser.balance
                    )

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
    (req, res) => {

        try {

            const user =
                getDemoUser();


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
|
| ВНИМАНИЕ:
| Telegram auth отключена.
| Поэтому этот endpoint доступен всем.
|
| Для локального демо это допустимо.
|
|--------------------------------------------------------------------------
*/

app.get(
    "/api/admin/stats",
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
| ADMIN DEMO WITHDRAW
|--------------------------------------------------------------------------
*/

app.post(
    "/api/admin/demo-withdraw",
    (req, res) => {

        try {

            const amount =
                Number(
                    req.body.amount
                );


            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Некорректная сумма"

                });

            }


            if (
                amount > 100000
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Слишком большая сумма"

                });

            }


            const stats =
                getAdminStats();


            if (
                Number(stats.adminBalance) <
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


            const updatedStats =
                getAdminStats();


            res.json({

                success: true,

                adminBalance:
                    Number(
                        updatedStats.adminBalance
                    )

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
            "SERVER ERROR:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(error);

        }


        res.status(500).json({

            success: false,

            error:
                "Внутренняя ошибка сервера"

        });

    }
);


/*
|--------------------------------------------------------------------------
| START SERVER
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
            "🎰 DEMO CASINO SERVER"
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
            "💎 Balance system: 1 = 1"
        );
        console.log(
            "================================="
        );
        console.log("");

    }
);
