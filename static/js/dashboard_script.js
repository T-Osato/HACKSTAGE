// --- メニュー制御 ---
const menuBtn = document.getElementById('js-button');
const menuNav = document.getElementById('js-nav');

// ボタンが存在する場合のみイベントを登録（エラー防止）
if (menuBtn && menuNav) {
    menuBtn.addEventListener('click', () => {
        menuNav.classList.toggle('open');
    });
}

// --- カレンダー制御 ---
let displayDate = new Date(); 

function renderCalendar() {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();

    // タイトルの更新
    const monthYearElem = document.getElementById('monthYear');
    if (monthYearElem) {
        monthYearElem.innerText = `${year}年 ${month + 1}月`;
    }

    const firstDay = new Date(year, month, 1).getDay(); // 1日の曜日
    const lastDate = new Date(year, month + 1, 0).getDate(); // 月の末日
    const container = document.getElementById('calendarDates');
    
    if (!container) return; // コンテナがない場合は中断
    
    container.innerHTML = ""; // クリア

    // 1. 1日より前の空白を作成
    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        // CSSの .day と同じサイズにするためクラスを付与してもOK
        container.appendChild(emptyDiv);
    }

    // 2. 日付の生成
    const today = new Date();
    for (let date = 1; date <= lastDate; date++) {
        const dateDiv = document.createElement('div');
        dateDiv.classList.add('day');
        dateDiv.innerText = date;

        // 今日の判定（年・月・日がすべて一致するか）
        if (year === today.getFullYear() && 
            month === today.getMonth() && 
            date === today.getDate()) {
            dateDiv.classList.add('today');
        }

        container.appendChild(dateDiv);
    }
}

// --- ボタンイベント ---
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

if (prevBtn) {
    prevBtn.onclick = () => {
        displayDate.setMonth(displayDate.getMonth() - 1);
        renderCalendar();
    };
}

if (nextBtn) {
    nextBtn.onclick = () => {
        displayDate.setMonth(displayDate.getMonth() + 1);
        renderCalendar();
    };
}

// 初回実行
renderCalendar();