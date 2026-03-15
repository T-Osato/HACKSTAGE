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
    let events = JSON.parse(localStorage.getItem("events")) || []
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

        // localStorageの予定をカレンダーに表示
        events: events.map(e => {
            if (e.isWeekly) {
                return {
                    id: String(e.id || ""),
                    title: e.title,
                    startTime: e.startTime,
                    endTime: e.endTime,
                    daysOfWeek: [e.dayOfWeek],
                    color: e.color,
                    extendedProps: { description: e.description, isLocal: true, originalId: e.id }
                };
            } else {
                return {
                    id: String(e.id || ""),
                    title: e.title,
                    start: e.date + "T" + e.startTime,
                    end: e.date + "T" + e.endTime,
                    color: e.color,
                    extendedProps: { description: e.description, isLocal: true, originalId: e.id }
                };
            }
        }),
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

            // 入力欄をリセット
            if (titleInput) titleInput.value = "";
            if (startInput) startInput.value = "";
            if (endInput) endInput.value = "";
            if (descriptionInput) descriptionInput.value = "";
            if (weeklyInput) weeklyInput.checked = false;

            cancelBtn.onclick = function () {
                modal.classList.remove("show")
            }

            saveBtn.onclick = function () {

                const title = titleInput.value
                const startTime = startInput.value
                const endTime = endInput.value
                const description = descriptionInput ? descriptionInput.value : ""

                if (!title) return alert("予定名を入力してください")
                if (!startTime) return alert("開始時間を入力してください")
                if (!endTime) return alert("終了時間を入力してください")
                if (startTime >= endTime) return alert("終了時間は開始時間より後に設定してください")

                const isWeekly = weeklyInput.checked
                const color = colorInput.value

                const newEvent = {
                    id: "ev_" + Date.now(),
                    title: title,
                    date: info.dateStr,
                    startTime: startTime,
                    endTime: endTime,
                    description: description,
                    isWeekly: isWeekly,
                    dayOfWeek: isWeekly ? new Date(info.dateStr).getDay() : null,
                    color: color
                }

                events.push(newEvent)

                localStorage.setItem("events", JSON.stringify(events))

                calendar.addEvent({
                    title: title,
                    start: info.dateStr
                })

                modal.classList.remove("show")

                location.reload()

            }

        },
        // 予定クリック → 削除
        eventClick: function (info) {

            const eventId = info.event.id || info.event.extendedProps.originalId;
            const title = info.event.title;
            const description = info.event.extendedProps.description || "";
            const date = info.event.startStr.split("T")[0];
            const dayOfWeek = info.event.start.getDay();

            let confirmMsg = `予定: ${title}\n`;
            if (description) confirmMsg += `詳細: ${description}\n\n`;
            confirmMsg += "この予定を削除しますか？";

            const ok = confirm(confirmMsg);
            if (!ok) return

            events = events.filter(e => {
                if (eventId && e.id) {
                    return String(e.id) !== String(eventId);
                }
                // Fallback for old events without IDs
                if (e.isWeekly) {
                    return !(e.title === title && e.dayOfWeek === dayOfWeek);
                } else {
                    return !(e.title === title && e.date === date);
                }
            });

            localStorage.setItem("events", JSON.stringify(events))
            info.event.remove()
            location.reload()
        }
    });
    calendar.render();
});