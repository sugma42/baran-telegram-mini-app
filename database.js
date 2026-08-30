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
| Telegram authentication полностью отключена.
|
| Все посетители используют одного
| демо-пользователя.
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
                        Number(
                            user.balance || 0
                        )

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


for (const a of symbols) {

    for (const b of symbols) {

        for (const c of symbols) {

            let multiplier = 0;


            /*
             * Три одинаковых.
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

                }

            } else {

                const counts = {};


                for (
                    const symbol
                    of [a, b, c]
                ) {

                    counts[symbol] =
                        (
                            counts[symbol] ||
                            0
                        ) + 1;

                }


                const maxCount =
                    Math.max(
                        ...Object.values(
                            counts
                        )
                    );


                /*
                 * Два одинаковых.
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
             * Вес.
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
| RANDOM
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
|
| В этой версии:
|
| 1 = 1 💎
| 10 = 10 💎
| 100 = 100 💎
|
|--------------------------------------------------------------------------
*/

app.post(
    "/api/spin",
    (req, res) => {

        try {

            const user =
                getDemoUser();


            const bet =
                Number(
                    req.body.bet
                );


            /*
             * Только целые значения.
             */

            if (
                !Number.isInteger(bet) ||
                bet < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимальная ставка — 1"

                });

            }


            /*
             * Ограничение.
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
             * Атомарно списываем ставку.
             */

            const charged =
                subtractBalance(
                    user.id,
                    bet
                );


            if (!charged) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно баланса"

                });

            }


            /*
             * Получаем комбинацию.
             */

            const result =
                getRandomCombination();


            /*
             * Выигрыш.
             *
             * Округляем вниз до целого,
             * потому что database.js
             * хранит баланс INTEGER.
             */

            const grossWin =
                Math.floor(
                    bet *
                    result.multiplier
                );


            /*
             * Комиссия 10%.
             */

            let adminCommission = 0;

            let playerWin =
                grossWin;


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
             * Начисляем комиссию админу.
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
             * Чистая сумма изменения
             * баланса игрока.
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
             * Получаем актуальный баланс.
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
| Теперь сумма передаётся напрямую.
|
| 1   -> +1
| 10  -> +10
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
             * Проверяем сумму.
             */

            if (
                !Number.isInteger(amount) ||
                amount < 1
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Минимальная сумма — 1"

                });

            }


            /*
             * Ограничение.
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
             * Пользователь.
             */

            const user =
                getDemoUser();


            /*
             * Пополняем баланс.
             *
             * 1 = +1
             */

            changeBalance(
                user.id,
                amount
            );


            /*
             * Записываем транзакцию.
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
             * Получаем новый баланс
             * напрямую из SQLite.
             */

            const updatedUser =
                getUserByTelegramId(
                    user.tg_id
                );


            console.log(
                `DEPOSIT +${amount} | BALANCE ${updatedUser.balance}`
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
| ADMIN WITHDRAW
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
                !Number.isInteger(amount) ||
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
            "🎰 БАРАН DEMO CASINO"
        );
        console.log(
            "======================================"
        );
        console.log(
            `🚀 Порт: ${PORT}`
        );
        console.log(
            "🔓 Telegram authentication: OFF"
        );
        console.log(
            "💎 Balance: 1 = 1"
        );
        console.log(
            "======================================"
        );
        console.log("");

    }
);
