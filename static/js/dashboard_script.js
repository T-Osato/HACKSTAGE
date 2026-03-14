document.addEventListener('DOMContentLoaded', function () {
    // 1. 時間入力欄の便利化 (flatpickr)
    flatpickr("#event-start-time", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true });
    flatpickr("#event-end-time", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true });

    // 2. データの取得
    const calendarEl = document.getElementById('calendar');
    let localEvents = JSON.parse(localStorage.getItem("events")) || [];
    
    // HTML側で定義した adminEvents を取得（念のため空配列で保護）
    const adminEventsData = typeof adminEvents !== 'undefined' ? adminEvents : [];

    // 3. データの整形（個人の予定をFullCalendar形式に）
    const mappedLocalEvents = localEvents.map(e => {
        if (e.isWeekly) {
            return { title: e.title, startTime: e.startTime, endTime: e.endTime, daysOfWeek: [e.dayOfWeek], color: e.color };
        } else {
            return { title: e.title, start: e.date + "T" + e.startTime, end: e.date + "T" + e.endTime, color: e.color };
        }
    });

    // ★重要：管理者の予定と個人の予定を合体！
    const allEvents = mappedLocalEvents.concat(adminEventsData);

    // 4. カレンダーの初期化
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ja',
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: allEvents, // 合体したデータを渡す

        dateClick: function (info) {
            const modal = document.getElementById("event-modal");
            modal.classList.add("show");
            
            const saveBtn = document.getElementById("save-event");
            const cancelBtn = document.getElementById("cancel-event");
            cancelBtn.onclick = () => modal.classList.remove("show");

            saveBtn.onclick = function () {
                const title = document.getElementById("event-title").value;
                const startTime = document.getElementById("event-start-time").value;
                const endTime = document.getElementById("event-end-time").value;
                if (!title || !startTime || !endTime) return alert("入力漏れがあります");

                const newEvent = {
                    title: title,
                    date: info.dateStr,
                    startTime: startTime,
                    endTime: endTime,
                    isWeekly: document.getElementById("event-weekly").checked,
                    dayOfWeek: new Date(info.dateStr).getDay(),
                    color: document.getElementById("event-color").value
                };
                localEvents.push(newEvent);
                localStorage.setItem("events", JSON.stringify(localEvents));
                location.reload(); 
            };
        },

        eventClick: function (info) {
            // 管理者の予定（赤・青）か個人の予定かを判別して表示を変えることも可能です
            const isCourseEvent = info.event.title.includes("【コース】");
            let msg = isCourseEvent ? "（コースの予定です）\n" : "";
            
            if (confirm(msg + "「" + info.event.title + "」を削除しますか？\n※個人の予定以外は消せません。")) {
                if (!isCourseEvent) {
                    localEvents = localEvents.filter(e => e.title !== info.event.title);
                    localStorage.setItem("events", JSON.stringify(localEvents));
                    info.event.remove();
                    location.reload();
                } else {
                    alert("管理者による配信予定は、個人で削除することはできません。");
                }
            }
        }
    });

    calendar.render();
    showTodaySchedule(allEvents);
});

// 今日の予定リスト表示
function showTodaySchedule(allEvents) {
    const list = document.getElementById("today-schedule-list");
    if (!list) return;
    list.innerHTML = "";

    const todayObj = new Date();
    const todayStr = todayObj.toLocaleDateString('sv-SE'); // YYYY-MM-DD形式
    const dayOfWeek = todayObj.getDay();

    const todayEvents = allEvents.filter(e => {
        const eDate = e.start ? e.start.split("T")[0] : e.date;
        return eDate === todayStr || (e.daysOfWeek && e.daysOfWeek.includes(dayOfWeek));
    });

    if (todayEvents.length === 0) {
        list.innerHTML = "<li>今日の予定はありません</li>";
        return;
    }

    todayEvents.forEach(e => {
        const li = document.createElement("li");
        li.className = "task";
        li.innerHTML = `
            <span style="background:${e.color || '#4da6ff'}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:8px;"></span>
            <span>${e.title}</span>
        `;
        list.appendChild(li);
    });
}