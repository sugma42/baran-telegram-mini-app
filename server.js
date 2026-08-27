require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const {
    getOrCreateUser,
    getUserByTelegramId,
    changeBalance,
    saveSpin,
    getUserSpins
} = require("./database");

const app = express();

const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| Настройки
|--------------------------------------------------------------------------
*/

app.use(express.json());

app.use(express.static(
    path.join(__dirname, "public")
));


/*
|--------------------------------------------------------------------------
| Telegram WebApp авторизация
|--------------------------------------------------------------------------
|
| Telegram передаёт initData.
| На сервере проверяем подпись, чтобы нельзя было просто
| отправить чужой Telegram ID.
|
*/

function validateTelegramInitData(initData) {

    if (!initData) {
        return null;
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
        console.error("BOT_TOKEN не указан в .env");
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
            .createHmac("sha256", "WebAppData")
            .update(botToken)
            .digest();

        const calculatedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        if (calculatedHash !== receivedHash) {
            return null;
        }

        const userData = params.get("user");

        if (!userData) {
            return null;
        }

        return JSON.parse(userData);

    } catch (error) {

        console.error(
            "Ошибка проверки Telegram initData:",
            error.message
        );

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| Авторизация пользователя
|--------------------------------------------------------------------------
*/

function authenticate(req, res, next) {

    const initData =
        req.headers["x-telegram-init-data"];

    /*
        В режиме разработки можно передать DEMO_USER=true
        в .env.

        В продакшене обязательно отключить.
    */

    if (process.env.DEMO_USER === "false") {

        req.telegramUser = {
            id: 123456789,
            username: "demo_user",
            first_name: "Demo"
        };

        return next();
    }

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
| GET /
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


/*
|--------------------------------------------------------------------------
| GET /api/me
|--------------------------------------------------------------------------
|
| Возвращает пользователя и его баланс.
|
*/

app.get("/api/me", authenticate, (req, res) => {

    try {

        const user =
            getOrCreateUser(req.telegramUser);

        res.json({
            success: true,

            user: {
                id: user.id,
                telegram_id: user.tg_id,
                username: user.username,
                first_name: user.first_name,
                balance: user.balance
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: "Не удалось получить пользователя"
        });
    }
});


/*
|--------------------------------------------------------------------------
| КОМБИНАЦИИ
|--------------------------------------------------------------------------
|
| weight определяет относительную вероятность.
|
*/

const combinations = [

    {
        combo: ["🍋", "🍋", "🍋"],
        multiplier: 3,
        weight: 2
    },

    {
        combo: ["7️⃣", "7️⃣", "7️⃣"],
        multiplier: 5,
        weight: 0.4
    },

    {
        combo: ["🍒", "🍒", "🍒"],
        multiplier: 2,
        weight: 3
    },

    {
        combo: ["💀", "💀", "💀"],
        multiplier: 0,
        weight: 4
    },

    {
        combo: ["🍋", "🍋", "7️⃣"],
        multiplier: 1.8,
        weight: 7
    },

    {
        combo: ["🍋", "🍋", "🍒"],
        multiplier: 1.7,
        weight: 8
    },

    {
        combo: ["🍋", "🍋", "💀"],
        multiplier: 1.6,
        weight: 9
    },

    {
        combo: ["🍋", "7️⃣", "7️⃣"],
        multiplier: 2.9,
        weight: 4
    },

    {
        combo: ["🍋", "🍒", "🍒"],
        multiplier: 1.9,
        weight: 6
    },

    {
        combo: ["🍋", "💀", "💀"],
        multiplier: 0,
        weight: 5
    },

    {
        combo: ["🍋", "7️⃣", "🍒"],
        multiplier: 0,
        weight: 6
    },

    {
        combo: ["🍋", "7️⃣", "💀"],
        multiplier: 0,
        weight: 6
    },

    {
        combo: ["🍋", "🍒", "💀"],
        multiplier: 0,
        weight: 6
    },

    {
        combo: ["7️⃣", "7️⃣", "🍋"],
        multiplier: 2.9,
        weight: 4
    },

    {
        combo: ["7️⃣", "7️⃣", "🍒"],
        multiplier: 2.5,
        weight: 4
    },

    {
        combo: ["7️⃣", "7️⃣", "💀"],
        multiplier: 1.9,
        weight: 5
    },

    {
        combo: ["7️⃣", "🍋", "🍋"],
        multiplier: 2.7,
        weight: 4
    },

    {
        combo: ["7️⃣", "🍒", "🍒"],
        multiplier: 2.7,
        weight: 4
    },

    {
        combo: ["7️⃣", "💀", "💀"],
        multiplier: 0,
        weight: 6
    },

    {
        combo: ["🍒", "🍒", "🍋"],
        multiplier: 1.7,
        weight: 7
    },

    {
        combo: ["🍒", "🍒", "7️⃣"],
        multiplier: 1.8,
        weight: 7
    },

    {
        combo: ["🍒", "🍒", "💀"],
        multiplier: 1.5,
        weight: 8
    },

    {
        combo: ["🍒", "🍋", "🍋"],
        multiplier: 1.8,
        weight: 7
    },

    {
        combo: ["🍒", "7️⃣", "7️⃣"],
        multiplier: 1.9,
        weight: 6
    },

    {
        combo: ["🍒", "💀", "💀"],
        multiplier: 0,
        weight: 6
    }
];


/*
|--------------------------------------------------------------------------
| Случайная комбинация
|--------------------------------------------------------------------------
*/

function getRandomCombination() {

    const totalWeight =
        combinations.reduce(
            (sum, item) => sum + item.weight,
            0
        );

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
| POST /api/spin
|--------------------------------------------------------------------------
|
| Серверный спин.
|
| Клиент отправляет только размер ставки.
|
*/

app.post("/api/spin", authenticate, (req, res) => {

    try {

        const user =
            getOrCreateUser(req.telegramUser);

        const bet = Number(req.body.bet);

        /*
        |--------------------------------------------------------------------------
        | Проверяем ставку
        |--------------------------------------------------------------------------
        */

        if (!Number.isInteger(bet)) {

            return res.status(400).json({
                success: false,
                error: "Ставка должна быть целым числом"
            });
        }

        if (bet < 10) {

            return res.status(400).json({
                success: false,
                error: "Минимальная ставка — 10"
            });
        }

        if (bet > 100000) {

            return res.status(400).json({
                success: false,
                error: "Максимальная ставка — 100000"
            });
        }

        if (user.balance < bet) {

            return res.status(400).json({
                success: false,
                error: "Недостаточно очков"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Выбираем результат
        |--------------------------------------------------------------------------
        */

        const result =
            getRandomCombination();

        const win =
            Math.floor(
                bet * result.multiplier
            );


        /*
        |--------------------------------------------------------------------------
        | Меняем баланс
        |--------------------------------------------------------------------------
        */

        // Сначала снимаем ставку
        changeBalance(
            user.id,
            -bet
        );

        // Потом начисляем выигрыш
        if (win > 0) {

            changeBalance(
                user.id,
                win
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Сохраняем спин
        |--------------------------------------------------------------------------
        */

        saveSpin({

            userId: user.id,

            bet,

            combo: result.combo,

            multiplier: result.multiplier,

            win
        });


        /*
        |--------------------------------------------------------------------------
        | Получаем новый баланс
        |--------------------------------------------------------------------------
        */

        const updatedUser =
            getUserByTelegramId(
                user.tg_id
            );


        /*
        |--------------------------------------------------------------------------
        | Ответ клиенту
        |--------------------------------------------------------------------------
        */

        res.json({

            success: true,

            result: {

                combo: result.combo,

                multiplier: result.multiplier,

                win,

                bet
            },

            balance: updatedUser.balance
        });

    } catch (error) {

        console.error(
            "SPIN ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error: "Ошибка сервера"
        });
    }
});


/*
|--------------------------------------------------------------------------
| GET /api/history
|--------------------------------------------------------------------------
*/

app.get("/api/history", authenticate, (req, res) => {

    try {

        const user =
            getOrCreateUser(req.telegramUser);

        const history =
            getUserSpins(user.id, 20);

        res.json({

            success: true,

            history: history.map(spin => ({

                id: spin.id,

                bet: spin.bet,

                combo: [
                    spin.symbol1,
                    spin.symbol2,
                    spin.symbol3
                ],

                multiplier: spin.multiplier,

                win: spin.win,

                created_at: spin.created_at
            }))
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: "Не удалось получить историю"
        });
    }
});


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
| Запуск
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log("🐏 БАРАН SERVER");
    console.log("=================================");
    console.log(`🚀 Порт: ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("=================================");
    console.log("");
});