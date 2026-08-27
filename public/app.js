/*
|--------------------------------------------------------------------------
| БАРАН — FRONTEND
|--------------------------------------------------------------------------
| public/app.js
|
| Здесь находится логика Telegram Mini App:
| - подключение к API
| - баланс
| - ставки
| - спин
| - анимация
| - история
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| TELEGRAM WEB APP
|--------------------------------------------------------------------------
*/

const tg = window.Telegram?.WebApp;

if (tg) {

    tg.ready();

    tg.expand();

    try {
        tg.setHeaderColor("#09050f");
        tg.setBackgroundColor("#09050f");
    } catch (error) {
        console.warn(
            "Telegram UI settings error:",
            error
        );
    }
}


/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

let balance = 0;

let bet = 50;

let spinning = false;


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
| КОМБИНАЦИИ ДЛЯ ТАБЛИЦЫ ВЫПЛАТ
|--------------------------------------------------------------------------
|
| ВАЖНО:
| Сам результат здесь НЕ генерируется.
|
| Результат определяет server.js.
|
| Этот массив нужен только для отображения
| таблицы выплат в интерфейсе.
|--------------------------------------------------------------------------
*/

const combinations = [

    [["🍋","🍋","🍋"], 3],
    [["7️⃣","7️⃣","7️⃣"], 5],
    [["🍒","🍒","🍒"], 2],
    [["💀","💀","💀"], 0],

    [["🍋","🍋","7️⃣"], 1.8],
    [["🍋","🍋","🍒"], 1.7],
    [["🍋","🍋","💀"], 1.6],

    [["🍋","7️⃣","7️⃣"], 2.9],
    [["🍋","🍒","🍒"], 1.9],
    [["🍋","💀","💀"], 0],

    [["🍋","7️⃣","🍒"], 0],
    [["🍋","7️⃣","💀"], 0],
    [["🍋","🍒","💀"], 0],

    [["7️⃣","7️⃣","🍋"], 2.9],
    [["7️⃣","7️⃣","🍒"], 2.5],
    [["7️⃣","7️⃣","💀"], 1.9],

    [["7️⃣","🍋","🍋"], 2.7],
    [["7️⃣","🍒","🍒"], 2.7],
    [["7️⃣","💀","💀"], 0],

    [["🍒","🍒","🍋"], 1.7],
    [["🍒","🍒","7️⃣"], 1.8],
    [["🍒","🍒","💀"], 1.5],

    [["🍒","🍋","🍋"], 1.8],
    [["🍒","7️⃣","7️⃣"], 1.9],
    [["🍒","💀","💀"], 0

    ]

];


/*
|--------------------------------------------------------------------------
| DOM ELEMENTS
|--------------------------------------------------------------------------
*/

const balanceElement =
    document.getElementById("balance");

const betElement =
    document.getElementById("bet");

const resultElement =
    document.getElementById("result");

const spinButton =
    document.getElementById("spinButton");

const errorBox =
    document.getElementById("errorBox");

const historyElement =
    document.getElementById("history");

const loadingElement =
    document.getElementById("loading");

const slotCard =
    document.getElementById("slotCard");

const reels = [

    document.getElementById("reel1"),

    document.getElementById("reel2"),

    document.getElementById("reel3")

];


/*
|--------------------------------------------------------------------------
| TELEGRAM INIT DATA
|--------------------------------------------------------------------------
|
| Telegram передаёт подписанные данные.
|
| В DEMO режиме сервер их игнорирует.
|--------------------------------------------------------------------------
*/

function getInitData() {

    if (!tg) {
        return "";
    }

    return tg.initData || "";
}


/*
|--------------------------------------------------------------------------
| API REQUEST
|--------------------------------------------------------------------------
*/

async function api(
    url,
    options = {}
) {

    const headers = {

        "Content-Type":
            "application/json",

        "X-Telegram-Init-Data":
            getInitData()

    };


    const response =
        await fetch(
            url,
            {
                ...options,
                headers: {
                    ...headers,
                    ...(options.headers || {})
                }
            }
        );


    let data;

    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            "Сервер вернул некорректный ответ"
        );
    }


    if (!response.ok) {

        throw new Error(
            data.error ||
            "Ошибка сервера"
        );
    }


    return data;
}


/*
|--------------------------------------------------------------------------
| UPDATE BALANCE
|--------------------------------------------------------------------------
*/

function updateBalance(
    newBalance
) {

    balance =
        Number(newBalance) || 0;


    balanceElement.textContent =
        balance.toLocaleString("ru-RU");


    /*
        Если баланс стал меньше
        текущей ставки — уменьшаем ставку.
    */

    if (
        balance >= 10 &&
        bet > balance
    ) {

        bet =
            Math.floor(
                balance / 10
            ) * 10;


        if (bet < 10) {
            bet = 10;
        }

        updateBet();
    }
}


/*
|--------------------------------------------------------------------------
| UPDATE BET
|--------------------------------------------------------------------------
*/

function updateBet() {

    betElement.textContent =
        bet.toLocaleString("ru-RU");


    document
        .querySelectorAll(".quick")
        .forEach(button => {

            button.classList.toggle(
                "active",
                Number(
                    button.dataset.bet
                ) === bet
            );

        });
}


/*
|--------------------------------------------------------------------------
| CHANGE BET
|--------------------------------------------------------------------------
*/

function changeBet(
    amount
) {

    let newBet =
        bet + amount;


    if (newBet < 10) {
        newBet = 10;
    }


    if (newBet > balance) {

        newBet =
            Math.floor(
                balance / 10
            ) * 10;
    }


    if (newBet >= 10) {

        bet = newBet;

        updateBet();
    }
}


/*
|--------------------------------------------------------------------------
| SHOW ERROR
|--------------------------------------------------------------------------
*/

function showError(
    message
) {

    errorBox.textContent =
        message;

    errorBox.classList.add(
        "show"
    );


    clearTimeout(
        showError.timer
    );


    showError.timer =
        setTimeout(() => {

            errorBox.classList.remove(
                "show"
            );

        }, 3500);
}


/*
|--------------------------------------------------------------------------
| SHOW RESULT
|--------------------------------------------------------------------------
*/

function showResult(
    text,
    type = "neutral"
) {

    resultElement.textContent =
        text;

    resultElement.className =
        "result " + type;
}


/*
|--------------------------------------------------------------------------
| REEL ANIMATION
|--------------------------------------------------------------------------
*/

function animateReel(
    element,
    finalSymbol,
    duration
) {

    return new Promise(
        resolve => {

            element.classList.add(
                "spinning"
            );


            const interval =
                setInterval(() => {

                    const randomIndex =
                        Math.floor(
                            Math.random() *
                            symbols.length
                        );


                    element.textContent =
                        symbols[randomIndex];

                }, 70);


            setTimeout(() => {

                clearInterval(
                    interval
                );


                element.textContent =
                    finalSymbol;


                element.classList.remove(
                    "spinning"
                );


                resolve();

            }, duration);

        }
    );
}


/*
|--------------------------------------------------------------------------
| HAPTIC
|--------------------------------------------------------------------------
*/

function haptic(
    type
) {

    if (
        tg &&
        tg.HapticFeedback
    ) {

        try {

            tg.HapticFeedback
                .notificationOccurred(
                    type
                );

        } catch (error) {

            console.warn(
                "Haptic error:",
                error
            );
        }
    }
}


/*
|--------------------------------------------------------------------------
| SPIN
|--------------------------------------------------------------------------
*/

async function spin() {

    /*
        Защита от двойного нажатия.
    */

    if (spinning) {
        return;
    }


    /*
        Проверяем ставку.
    */

    if (bet < 10) {

        showError(
            "Минимальная ставка — 10 💎"
        );

        return;
    }


    /*
        Проверяем баланс локально
        перед отправкой запроса.
    */

    if (balance < bet) {

        showError(
            "Недостаточно 💎"
        );

        return;
    }


    spinning = true;

    spinButton.disabled = true;

    spinButton.textContent =
        "⏳ ВРАЩЕНИЕ...";


    showResult(
        "Барабаны вращаются...",
        "neutral"
    );


    try {

        /*
        |--------------------------------------------------------------------------
        | ОТПРАВЛЯЕМ СТАВКУ НА СЕРВЕР
        |--------------------------------------------------------------------------
        */

        const data =
            await api(
                "/api/spin",
                {
                    method: "POST",

                    body: JSON.stringify({
                        bet: bet
                    })
                }
            );


        /*
        |--------------------------------------------------------------------------
        | Получаем результат
        |--------------------------------------------------------------------------
        */

        const combo =
            data.result.combo;


        const multiplier =
            Number(
                data.result.multiplier
            );


        const win =
            Number(
                data.result.win
            );


        /*
        |--------------------------------------------------------------------------
        | Анимация барабанов
        |--------------------------------------------------------------------------
        */

        await animateReel(
            reels[0],
            combo[0],
            800
        );


        await animateReel(
            reels[1],
            combo[1],
            1050
        );


        await animateReel(
            reels[2],
            combo[2],
            1300
        );


        /*
        |--------------------------------------------------------------------------
        | Новый баланс
        |--------------------------------------------------------------------------
        */

        updateBalance(
            data.balance
        );


        /*
        |--------------------------------------------------------------------------
        | ПОКАЗЫВАЕМ РЕЗУЛЬТАТ
        |--------------------------------------------------------------------------
        */

        if (multiplier > 0) {

            showResult(
                `🎉 ×${multiplier}   +${win} 💎`,
                "win"
            );


            /*
                Небольшая анимация
                карточки.
            */

            slotCard.classList.remove(
                "win-animation"
            );


            void slotCard.offsetWidth;


            slotCard.classList.add(
                "win-animation"
            );


            haptic("success");

        } else {

            showResult(
                "💀 Не повезло — ставка сгорела",
                "lose"
            );


            haptic("error");
        }


        /*
        |--------------------------------------------------------------------------
        | ОБНОВЛЯЕМ ИСТОРИЮ
        |--------------------------------------------------------------------------
        */

        await loadHistory();


    } catch (error) {

        console.error(
            "Spin error:",
            error
        );


        showError(
            error.message ||
            "Не удалось сделать спин"
        );


        showResult(
            "Ошибка",
            "lose"
        );


    } finally {

        spinning = false;

        spinButton.disabled = false;

        spinButton.textContent =
            "🎰 КРУТИТЬ";
    }
}


/*
|--------------------------------------------------------------------------
| LOAD HISTORY
|--------------------------------------------------------------------------
*/

async function loadHistory() {

    try {

        const data =
            await api(
                "/api/history"
            );


        historyElement.innerHTML =
            "";


        if (
            !data.history ||
            data.history.length === 0
        ) {

            historyElement.innerHTML = `
                <div class="empty">
                    Здесь появятся результаты
                </div>
            `;

            return;
        }


        data.history.forEach(
            item => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "history-item";


                const combo =
                    item.combo.join("");


                const multiplier =
                    Number(
                        item.multiplier
                    );


                const isWin =
                    multiplier > 0;


                div.innerHTML = `

                    <div class="history-left">

                        <div class="history-symbols">
                            ${combo}
                        </div>

                        <div class="history-bet">
                            Ставка ${item.bet} 💎
                        </div>

                    </div>

                    <div
                        class="
                            history-mult
                            ${isWin ? "win" : "lose"}
                        "
                    >
                        ×${multiplier}
                    </div>

                `;


                historyElement
                    .appendChild(div);

            }
        );


    } catch (error) {

        console.error(
            "History error:",
            error
        );
    }
}


/*
|--------------------------------------------------------------------------
| PAYTABLE
|--------------------------------------------------------------------------
*/

function renderPaytable() {

    const paytable =
        document.getElementById(
            "paytable"
        );


    if (!paytable) {
        return;
    }


    paytable.innerHTML =
        "";


    combinations.forEach(
        item => {

            const combo =
                item[0];


            const multiplier =
                item[1];


            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "pay-row";


            row.innerHTML = `

                <div class="pay-combo">
                    ${combo.join("")}
                </div>

                <div class="pay-mult">
                    ×${multiplier}
                </div>

            `;


            paytable.appendChild(row);

        }
    );
}


/*
|--------------------------------------------------------------------------
| INITIALIZE
|--------------------------------------------------------------------------
*/

async function init() {

    try {

        /*
        |--------------------------------------------------------------------------
        | Получаем пользователя
        |--------------------------------------------------------------------------
        */

        const data =
            await api(
                "/api/me"
            );


        /*
        |--------------------------------------------------------------------------
        | Баланс
        |--------------------------------------------------------------------------
        */

        updateBalance(
            data.user.balance
        );


        updateBet();


        /*
        |--------------------------------------------------------------------------
        | История
        |--------------------------------------------------------------------------
        */

        await loadHistory();


    } catch (error) {

        console.error(
            "Initialization error:",
            error
        );


        showError(
            error.message ||
            "Не удалось подключиться к серверу"
        );

    } finally {

        setTimeout(
            () => {

                loadingElement
                    .classList.add(
                        "hidden"
                    );

            },
            250
        );
    }
}


/*
|--------------------------------------------------------------------------
| EVENTS
|--------------------------------------------------------------------------
*/


/*
    Минус ставка
*/

document
    .getElementById("minusBet")
    ?.addEventListener(
        "click",
        () => {

            changeBet(-10);

        }
    );


/*
    Плюс ставка
*/

document
    .getElementById("plusBet")
    ?.addEventListener(
        "click",
        () => {

            changeBet(10);

        }
    );


/*
    Быстрые ставки
*/

document
    .querySelectorAll(".quick")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const value =
                        Number(
                            button.dataset.bet
                        );


                    if (
                        value > balance
                    ) {

                        showError(
                            "Недостаточно очков"
                        );

                        return;
                    }


                    bet = value;

                    updateBet();

                }
            );

        }
    );


/*
    Кнопка SPIN
*/

spinButton
    ?.addEventListener(
        "click",
        spin
    );


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

renderPaytable();

updateBet();

init();
