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
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
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
                if (e.isWeekly) {
                    return {
                        id: String(e.id || ""), title: e.title,
                        startTime: e.startTime, endTime: e.endTime,
                        daysOfWeek: [e.dayOfWeek], color: e.color,
                        extendedProps: { description: e.description, isLocal: true, originalId: e.id }
                    };
                } else {
                    return {
                        id: String(e.id || ""), title: e.title,
                        start: e.date + "T" + e.startTime,
                        end: e.date + "T" + (e.endTime || e.startTime),
                        color: e.color,
                        extendedProps: { description: e.description, isLocal: true, originalId: e.id }
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
            const modal = document.getElementById("event-modal")
            modal.classList.add("show")

            const saveBtn = document.getElementById("save-event")
            const cancelBtn = document.getElementById("cancel-event")
            const titleInput = document.getElementById("event-title")
            const startInput = document.getElementById("event-start-time")
            const endInput = document.getElementById("event-end-time")
            const descriptionInput = document.getElementById("event-description")
            const weeklyInput = document.getElementById("event-weekly")
            const colorInput = document.getElementById("event-color")

            // 入力リセット
            if (titleInput) titleInput.value = "";
            if (startInput) startInput.value = "";
            if (endInput) endInput.value = "";
            if (descriptionInput) descriptionInput.value = "";
            if (weeklyInput) weeklyInput.checked = false;

            cancelBtn.onclick = () => modal.classList.remove("show");

            saveBtn.onclick = function () {
                const title = titleInput.value;
                const startTime = startInput.value;
                const endTime = endInput.value;
                if (!title || !startTime || !endTime) return alert("必須項目を入力してください");

                const isWeekly = weeklyInput.checked;
                const newEvent = {
                    id: "ev_" + Date.now(),
                    title: title,
                    date: info.dateStr,
                    startTime: startTime,
                    endTime: endTime,
                    description: descriptionInput ? descriptionInput.value : "",
                    isWeekly: isWeekly,
                    dayOfWeek: isWeekly ? new Date(info.dateStr).getDay() : null,
                    color: colorInput.value
                }

                let currentEvents = JSON.parse(localStorage.getItem("events")) || [];
                currentEvents.push(newEvent);
                localStorage.setItem("events", JSON.stringify(currentEvents));
                modal.classList.remove("show");
                calendar.refetchEvents(); // リロードなしで反映
            }
        },

        // 予定クリック → 削除または詳細
        eventClick: function (info) {
            const props = info.event.extendedProps;
            if (!props.isLocal) {
                // システム配信（授業・休日等）の場合
                return alert(`システム配信イベント: ${info.event.title}\n\nこれは自動取得された予定のため削除できません。`);
            }

            const eventId = info.event.id || props.originalId;
            if (confirm(`予定: ${info.event.title}\n\nこの予定を削除しますか？`)) {
                let currentEvents = JSON.parse(localStorage.getItem("events")) || [];
                currentEvents = currentEvents.filter(e => String(e.id) !== String(eventId));
                localStorage.setItem("events", JSON.stringify(currentEvents));
                info.event.remove();
            }
        }
    });

    calendar.render();
});