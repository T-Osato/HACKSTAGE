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
                    title: e.title,
                    startTime: e.startTime,
                    endTime: e.endTime,
                    daysOfWeek: [e.dayOfWeek],
                    color: e.color
                };
            } else {
                return {
                    title: e.title,
                    start: e.date + "T" + e.startTime,
                    end: e.date + "T" + e.endTime,
                    color: e.color
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
            const weeklyInput = document.getElementById("event-weekly")
            const colorInput = document.getElementById("event-color")

            cancelBtn.onclick = function () {
                modal.classList.remove("show")
            }

            saveBtn.onclick = function () {

                const title = titleInput.value
                const startTime = startInput.value
                const endTime = endInput.value

                if (!title) return alert("予定名を入力してください")
                if (!startTime) return alert("開始時間を入力してください")
                if (!endTime) return alert("終了時間を入力してください")
                if (startTime >= endTime) return alert("終了時間は開始時間より後に設定してください")

                const isWeekly = weeklyInput.checked
                const color = colorInput.value

                const newEvent = {
                    title: title,
                    date: info.dateStr,
                    startTime: startTime,
                    endTime: endTime,
                    isWeekly: isWeekly,
                    dayOfWeek: isWeekly ? new Date(info.dateStr).getDay() : null,
                    color: color
                }

                events.push(newEvent)

                localStorage.setItem("events", JSON.stringify(events))

                calendar.addEvent({
                    title: title,
                    start: info.dateStr,
                })

                modal.classList.remove("show")

                location.reload()

            }

        },
        // 予定クリック → 削除
        eventClick: function (info) {

            const ok = confirm("予定を削除しますか？")
            if (!ok) return

            const title = info.event.title
            const date = info.event.startStr.split("T")[0]
            const dayOfWeek = info.event.start.getDay()

            events = events.filter(e => {
                if (e.isWeekly) {
                    return !(e.title === title && e.dayOfWeek === dayOfWeek)
                } else {
                    return !(e.title === title && e.date === date)
                }
            })

            localStorage.setItem("events", JSON.stringify(events))
            info.event.remove()
            location.reload()
        }
    });
    showTodaySchedule(events);
    calendar.render();
});

//今日の予定の表示
function showTodaySchedule(events) {

    const list = document.getElementById("today-schedule-list")

    // 今日の日付
    const todayObj = new Date()
    const today = todayObj.toLocaleDateString('sv-SE')
    const dayOfWeek = todayObj.getDay()

    // 今日の予定と毎週の予定を取得
    let todayEvents = events.filter(event =>
        event.date === today || (event.isWeekly && event.dayOfWeek === dayOfWeek)
    )

    // 時間順に並び替え
    todayEvents.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))

    // 予定がない場合
    if (todayEvents.length === 0) {

        const li = document.createElement("li")
        li.textContent = "予定なし"

        list.appendChild(li)
        return
    }

    // 予定表示
    todayEvents.forEach(event => {

        const li = document.createElement("li")
        li.className = "task"

        const colorCircle = document.createElement("span")
        colorCircle.className = "task-color-circle"
        colorCircle.style.background = event.color || "#4da6ff"
        colorCircle.style.width = "12px"
        colorCircle.style.height = "12px"
        colorCircle.style.borderRadius = "50%"
        colorCircle.style.display = "inline-block"
        colorCircle.style.marginRight = "10px"

        const startTime = document.createElement("span")
        startTime.className = "task-start-time"
        startTime.textContent = event.startTime || ""

        const endTime = document.createElement("span")
        endTime.className = "task-end-time"
        endTime.textContent = event.endTime || ""

        const name = document.createElement("span")
        name.className = "task-name"
        name.textContent = event.title

        li.appendChild(colorCircle)
        li.appendChild(startTime)
        li.appendChild(document.createTextNode(" - "))
        li.appendChild(endTime)
        li.appendChild(document.createTextNode(" "))
        li.appendChild(name)

        list.appendChild(li)

    })

}