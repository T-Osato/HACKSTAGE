//カレンダーの表示
document.addEventListener('DOMContentLoaded', function () {
    // 時間入力欄を便利な選択式にする
    flatpickr("#event-start-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true
    });

    flatpickr("#event-end-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true
    });

    const calendarEl = document.getElementById('calendar')
    let currentViewType = localStorage.getItem('calendarViewType') || 'dayGridMonth';
    let initialDate = localStorage.getItem('calendarViewDate') || new Date().toISOString();

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: currentViewType,
        initialDate: initialDate,
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'addEventButton dayGridMonth,timeGridWeek,timeGridDay'
        },
        customButtons: { addEventButton: { text: '＋ 予定を追加', click: () => openModalForAdd() } },
        datesSet: function (info) {
            localStorage.setItem('calendarViewType', info.view.type);
            localStorage.setItem('calendarViewDate', info.view.currentStart.toISOString());
        },
        eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            meridiem: false,
            hour12: false
        },
        dayMaxEvents: true, // 予定が多い場合に「＋他〇件」と表示する
        eventDisplay: 'block', // ブロック表示にする

        // データの読み込み (自分専用の予定 + 授業スケジュール)
        events: async function(info, successCallback, failureCallback) {
            let localEventsData = JSON.parse(localStorage.getItem("events")) || [];
            
            // 1. 個人の予定を整形
            let safeLocalEvents = localEventsData.map(e => {
                const hasTime = e.startTime && e.startTime.includes(':');
                if (e.isWeekly) {
                    return {
                        id: String(e.id || ""), title: e.title,
                        startTime: e.startTime, endTime: e.endTime,
                        daysOfWeek: [e.dayOfWeek], color: e.color,
                        allDay: !hasTime,
                        extendedProps: { description: e.description, startTime: e.startTime, endTime: e.endTime, isLocal: true, isWeekly: true, dayOfWeek: e.dayOfWeek, originalId: e.id }
                    };
                } else {
                    return {
                        id: String(e.id || ""), title: e.title,
                        start: e.date + "T" + e.startTime + ":00",
                        end: e.date + "T" + (e.endTime || e.startTime) + ":00",
                        color: e.color,
                        allDay: !hasTime,
                        extendedProps: { description: e.description, startTime: e.startTime, endTime: e.endTime, isLocal: true, isWeekly: false, originalId: e.id }
                    };
                }
            });

            try {
                // 2. サーバーから授業データ等を取得
                const response = await fetch('/api/calendar_data');
                if (!response.ok) throw new Error("API通信エラー");
                const data = await response.json();

                let allEvents = [...safeLocalEvents];
                let checkDate = new Date(info.start);
                const endDate = new Date(info.end);

                while (checkDate <= endDate) {
                    const dateStr = checkDate.toLocaleDateString('sv-SE');
                    let dayKey = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }[checkDate.getDay()];
                    let isSubstitute = false;

                    // ① 振替日の判定
                    if (data.substitute_days && data.substitute_days[dateStr]) {
                        dayKey = data.substitute_days[dateStr];
                        isSubstitute = true;
                        const subDayName = { 'mon': '月', 'tue': '火', 'wed': '水', 'thu': '木', 'fri': '金' }[dayKey];
                        allEvents.push({
                            title: `🔄 ${subDayName}曜振替`, start: dateStr, allDay: true, color: '#f59e0b',
                            extendedProps: { description: `この日は${subDayName}曜日のスケジュールです。`, isLocal: false }
                        });
                    }

                    // ② 休日の判定
                    if (data.holidays && data.holidays.includes(dateStr) && !isSubstitute) {
                        dayKey = null;
                        allEvents.push({
                            title: `🎌 ${data.holiday_names ? data.holiday_names[dateStr] : '休日'}`, start: dateStr, allDay: true, color: '#ef4444',
                            extendedProps: { description: "授業はお休みです。", isLocal: false }
                        });
                    }

                    // ③ 授業の反映
                    if (dayKey) {
                        const currentTerm = data.periods.find(p => dateStr >= p.start && dateStr <= p.end);
                        if (currentTerm) {
                            const todayCourses = data.courses
                                .filter(c => c.term === currentTerm.term && c.day === dayKey)
                                .sort((a, b) => a.period - b.period);

                            todayCourses.forEach(c => {
                                const time = data.period_times[c.period] || {start: '00:00', end: '00:00'};
                                const eventTitle = isSubstitute ? `${c.period}限(振替): ${c.name}` : `${c.period}限: ${c.name}`;
                                allEvents.push({
                                    title: eventTitle,
                                    start: `${dateStr}T${time.start}:00`,
                                    end: `${dateStr}T${time.end}:00`,
                                    allDay: false,
                                    color: isSubstitute ? '#d97706' : '#64748b',
                                    textColor: '#ffffff',
                                    extendedProps: { isCourseDetail: true, period: c.period, isLocal: false }
                                });
                            });
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }
                successCallback(allEvents);
            } catch (error) {
                console.error("サーバーデータ取得失敗:", error);
                successCallback(safeLocalEvents);
            }
        },

        // カレンダーの日付クリック → 予定追加
        dateClick: function (info) {
            openModalForAdd(info.dateStr);
        },

        // 予定クリック → 削除または詳細
        eventClick: function (info) {
            const props = info.event.extendedProps;
            if (!props.isLocal) {
                // システム配信（授業・休日等）の場合
                return alert(`システム配信イベント: ${info.event.title}\n\nこれは自動取得された予定のため削除できません。`);
            }
            openModalForDetail(info.event);
        }
    });

    calendar.render();

    // モーダル制御
    const modal = document.getElementById("event-modal");
    let editingEventId = null;

    function resetModalFields() {
        ["event-title", "event-date", "event-start-time", "event-end-time", "event-description"].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = "";
        });
        const weeklyCheck = document.getElementById("event-weekly");
        if (weeklyCheck) weeklyCheck.checked = false;
        const colorSelect = document.getElementById("event-color");
        if (colorSelect) colorSelect.value = "#4da6ff";
    }

    function openModalForAdd(dateStr) {
        editingEventId = null;
        resetModalFields();
        document.getElementById("modal-title-text").textContent = "予定の追加";
        document.getElementById("event-date").value = dateStr || new Date().toLocaleDateString('sv-SE');
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").textContent = "追加";
        modal.classList.add("show");
    }

    function openModalForDetail(event) {
        const props = event.extendedProps;
        editingEventId = event.id || props.originalId;
        resetModalFields();

        document.getElementById("modal-title-text").textContent = "予定の編集";
        document.getElementById("event-date").value = event.startStr ? event.startStr.split("T")[0] : new Date().toLocaleDateString('sv-SE');
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-start-time").value = props.startTime || "";
        document.getElementById("event-end-time").value = props.endTime || "";
        document.getElementById("event-description").value = props.description || "";
        document.getElementById("event-color").value = event.backgroundColor || "#4da6ff";
        document.getElementById("event-weekly").checked = props.isWeekly || false;

        document.getElementById("delete-event").style.display = "inline-block";
        document.getElementById("save-event").textContent = "保存";
        modal.classList.add("show");
    }

    document.getElementById("save-event").onclick = function() {
        const title = document.getElementById("event-title").value;
        const date = document.getElementById("event-date").value;
        const startTime = document.getElementById("event-start-time").value;
        const endTime = document.getElementById("event-end-time").value;
        if (!title || !date || !startTime || !endTime) return alert("必須項目(日付・予定名・時間)を入力してください");

        const isWeekly = document.getElementById("event-weekly").checked;
        const eventData = {
            id: editingEventId || "ev_" + Date.now(),
            title: title,
            date: date,
            startTime: startTime,
            endTime: endTime,
            description: document.getElementById("event-description").value,
            isWeekly: isWeekly,
            dayOfWeek: isWeekly ? new Date(date).getDay() : null,
            color: document.getElementById("event-color").value
        };

        let currentEvents = JSON.parse(localStorage.getItem("events")) || [];
        if (editingEventId) {
            const idx = currentEvents.findIndex(e => String(e.id) === String(editingEventId));
            if (idx !== -1) currentEvents[idx] = eventData;
        } else {
            currentEvents.push(eventData);
        }
        
        localStorage.setItem("events", JSON.stringify(currentEvents));
        calendar.refetchEvents();
        modal.classList.remove("show");
    };

    document.getElementById("delete-event").onclick = function() {
        if (!editingEventId) return;
        if (confirm("この予定を削除しますか？")) {
            let currentEvents = JSON.parse(localStorage.getItem("events")) || [];
            currentEvents = currentEvents.filter(e => String(e.id) !== String(editingEventId));
            localStorage.setItem("events", JSON.stringify(currentEvents));
            calendar.refetchEvents();
            modal.classList.remove("show");
        }
    };

    document.getElementById("cancel-event").onclick = () => modal.classList.remove("show");
    window.onclick = (e) => { if (e.target == modal) modal.classList.remove("show"); };

});