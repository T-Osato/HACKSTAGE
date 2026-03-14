document.addEventListener('DOMContentLoaded', function () {
    // 1. 時間入力欄 (flatpickr) の設定
    const timeConfig = { 
        enableTime: true, 
        noCalendar: true, 
        dateFormat: "H:i", 
        time_24hr: true, 
        minuteIncrement: 15, 
        allowInput: false 
    };
    
    const startTimePicker = flatpickr("#event-start-time", { 
        ...timeConfig, 
        onChange: (selectedDates, timeStr) => endTimePicker.set('minTime', timeStr) 
    });
    const endTimePicker = flatpickr("#event-end-time", { ...timeConfig });

    // 2. 要素とデータの取得
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return; 

    let localEvents = JSON.parse(localStorage.getItem("events")) || [];
    const adminEventsData = typeof adminEvents !== 'undefined' ? adminEvents : [];
    const modal = document.getElementById("event-modal");
    let editingEventId = null;

    // 3. カレンダーの初期化
    const calendar = new FullCalendar.Calendar(calendarEl, {
        customButtons: {
            addEventButton: { 
                text: '＋ 予定を追加', 
                click: () => openModalForAdd() 
            }
        },
        initialView: 'dayGridMonth',
        locale: 'ja',
        height: 'auto',
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: 'addEventButton dayGridMonth,timeGridWeek,timeGridDay' 
        },
        events: function(info, successCallback) {
            const formattedLocal = localEvents.map(e => ({
                id: e.id, 
                title: e.title, 
                start: e.date + (e.startTime ? "T" + e.startTime : ""), 
                end: e.date + (e.endTime ? "T" + e.endTime : ""), 
                color: e.color,
                extendedProps: { 
                    description: e.description, 
                    startTime: e.startTime, 
                    endTime: e.endTime, 
                    isWeekly: e.isWeekly, 
                    isLocal: true 
                }
            }));
            successCallback(formattedLocal.concat(adminEventsData));
        },
        eventClick: (info) => openModalForDetail(info.event)
    });
    calendar.render();

    // 4. モーダル制御関数
    function openModalForAdd() {
        editingEventId = null;
        resetModalFields();
        document.getElementById("modal-title-text").textContent = "予定の追加";
        document.getElementById("event-date").value = new Date().toLocaleDateString('sv-SE');
        document.getElementById("delete-event").style.display = "none";
        modal.classList.add("show");
    }

    function openModalForDetail(event) {
        editingEventId = event.id;
        const isLocal = event.extendedProps.isLocal;
        resetModalFields();

        document.getElementById("modal-title-text").textContent = isLocal ? "予定の詳細・編集" : "予定の詳細（閲覧のみ）";
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-start-time").value = event.extendedProps.startTime || "";
        document.getElementById("event-end-time").value = event.extendedProps.endTime || "";
        document.getElementById("event-description").value = event.extendedProps.description || "";
        document.getElementById("event-color").value = event.backgroundColor || "#4da6ff";
        
        // ローカル予定（自分の予定）の時だけ保存・削除ボタンを出す
        document.getElementById("delete-event").style.display = isLocal ? "inline-block" : "none";
        document.getElementById("save-event").style.display = isLocal ? "inline-block" : "none";
        
        modal.classList.add("show");
    }

    // 保存ボタン
    document.getElementById("save-event").onclick = function() {
        const title = document.getElementById("event-title").value;
        const date = document.getElementById("event-date").value;
        if (!title || !date) return alert("予定名と日付は必須です");

        const eventData = { 
            id: editingEventId || "ev_" + Date.now(), 
            title: title, 
            date: date, 
            startTime: document.getElementById("event-start-time").value, 
            endTime: document.getElementById("event-end-time").value, 
            description: document.getElementById("event-description").value, 
            color: document.getElementById("event-color").value 
        };

        if (editingEventId) { 
            const idx = localEvents.findIndex(e => e.id === editingEventId); 
            if (idx !== -1) localEvents[idx] = eventData; 
        } else { 
            localEvents.push(eventData); 
        }
        
        saveAndReload();
    };

    // 削除ボタン
    document.getElementById("delete-event").onclick = function() {
        if (confirm("この予定を削除しますか？")) {
            localEvents = localEvents.filter(e => e.id !== editingEventId);
            saveAndReload();
        }
    };

    // キャンセルボタン
    document.getElementById("cancel-event").onclick = () => modal.classList.remove("show");

    // 背景クリックで閉じる
    window.onclick = (event) => { 
        if (event.target == modal) modal.classList.remove("show"); 
    };

    function saveAndReload() {
        localStorage.setItem("events", JSON.stringify(localEvents));
        location.reload();
    }

    function resetModalFields() {
        const ids = ["event-title", "event-date", "event-start-time", "event-end-time", "event-description"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
    }

    // 初回の今日の予定表示
    showTodaySchedule(localEvents.concat(adminEventsData));
}); // <-- ここが DOMContentLoaded の閉じカッコ

// 今日の予定を表示する関数（外に出しておく）
function showTodaySchedule(allEvents) {
    const list = document.getElementById("today-schedule-list");
    if (!list) return;
    const today = new Date().toLocaleDateString('sv-SE');
    const items = allEvents.filter(e => (e.start ? e.start.split("T")[0] : e.date) === today);
    
    list.innerHTML = items.length 
        ? items.map(e => `<li class="task"><span style="background:${e.color || '#4da6ff'}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:8px;"></span>${e.title}</li>`).join('') 
        : "<li>今日の予定はありません</li>";
}