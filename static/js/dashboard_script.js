document.addEventListener('DOMContentLoaded', function () {
    // 1. flatpickr設定
    const timeConfig = { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, minuteIncrement: 15, allowInput: false };
    const startTimePicker = flatpickr("#event-start-time", { ...timeConfig, onChange: (s, t) => endTimePicker.set('minTime', t) });
    const endTimePicker = flatpickr("#event-end-time", { ...timeConfig });

    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return; 

    let localEvents = JSON.parse(localStorage.getItem("events")) || [];
    const adminEventsData = typeof adminEvents !== 'undefined' ? adminEvents : [];
    const modal = document.getElementById("event-modal");
    let editingEventId = null;

    // カレンダーの表示モードを安全に記録しておく変数
    let currentViewType = 'dayGridMonth';

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: currentViewType,
        locale: 'ja',
        height: 'auto',
        headerToolbar: { 
            left: 'prev,next today', center: 'title', 
            right: 'addEventButton dayGridMonth,timeGridWeek,timeGridDay' 
        },
        customButtons: { addEventButton: { text: '＋ 予定を追加', click: () => openModalForAdd() } },
        
        // 表示モードが切り替わった時に変数を更新して再描画
        datesSet: function(info) {
            if (info.view.type !== currentViewType) {
                currentViewType = info.view.type;
                calendar.refetchEvents();
            }
        },
        
        // --- データの読み込みロジック ---
        events: async function(info, successCallback, failureCallback) {
            // A. 個人の予定を安全に整形
            let safeLocalEvents = localEvents.map(e => {
                if (!e.date || e.date.trim() === "") return null;
                const hasTime = e.startTime && e.startTime.includes(':');
                const startISO = hasTime ? `${e.date}T${e.startTime}:00` : e.date;
                const endISO = (hasTime && e.endTime) ? `${e.date}T${e.endTime}:00` : null;
                return {
                    id: e.id, title: e.title, start: startISO, end: endISO, allDay: !hasTime, color: e.color,
                    extendedProps: { description: e.description, startTime: e.startTime, endTime: e.endTime, isLocal: true }
                };
            }).filter(e => e !== null);

            // B. 管理者の予定フィルター (12時アップ増殖バグをここで防ぐ！)
            let safeAdminEvents = adminEventsData.map(e => {
                if (!e) return null;
                if (e.start && typeof e.start === 'string' && e.start.startsWith('T')) return null;
                if (!e.start && !e.date) return null; 
                return e;
            }).filter(e => e !== null);

            let allEvents = safeLocalEvents.concat(safeAdminEvents);

            try {
                const response = await fetch('/api/calendar_data');
                if (!response.ok) throw new Error(`API通信エラー`);
                const data = await response.json();

                // 安全な変数を使って月表示かどうかを判定
                const isMonthView = (currentViewType === 'dayGridMonth');

                let checkDate = new Date(info.start);
                const endDate = new Date(info.end);

                while (checkDate <= endDate) {
                    const dateStr = checkDate.toLocaleDateString('sv-SE');
                    
                    // --- 休講・振替の魔法判定 ---
                    let dayKey = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }[checkDate.getDay()];
                    let isSubstitute = false;
                    let subDayName = "";

                    // ① 振替日の判定
                    if (data.substitute_days && data.substitute_days[dateStr]) {
                        dayKey = data.substitute_days[dateStr]; 
                        isSubstitute = true;
                        subDayName = { 'mon': '月', 'tue': '火', 'wed': '水', 'thu': '木', 'fri': '金' }[dayKey];
                        
                        // ★追加: 授業の有無に関係なく全員に「振替日」のバッジを表示！
                        allEvents.push({
                            title: `🔄 ${subDayName}曜授業の振替日`,
                            start: dateStr,
                            allDay: true,
                            color: '#f59e0b', // 目立つオレンジ
                            extendedProps: { description: `この日は${subDayName}曜日の授業スケジュールになります。`, isLocal: false }
                        });
                    }

                    // ② 休日の判定（振替日は優先する）
                    if (data.holidays && data.holidays.includes(dateStr) && !isSubstitute) {
                        dayKey = null; 
                        
                        // ★追加: 授業の有無に関係なく全員に「休日」のバッジを表示！
                        allEvents.push({
                            title: `🎌 休講日・祝日`,
                            start: dateStr,
                            allDay: true,
                            color: '#ef4444', // 休みと分かる赤色
                            extendedProps: { description: `授業はお休みです。`, isLocal: false }
                        });
                    }
                    // ----------------------------

                    // ③ 授業がある日の処理
                    if (dayKey) {
                        const currentTerm = data.periods.find(p => dateStr >= p.start && dateStr <= p.end);

                        if (currentTerm) {
                            const todayCourses = data.courses
                                .filter(c => c.term === currentTerm.term && c.day === dayKey)
                                .sort((a, b) => a.period - b.period);

                            if (todayCourses.length > 0) {
                                if (isMonthView) {
                                    const detailsText = todayCourses.map(c => {
                                        const t = data.period_times[c.period] || {start: '??:??', end: '??:??'};
                                        return `${c.period}限 (${t.start}〜${t.end}) : ${c.name}`;
                                    }).join('\n');

                                    const eventTitle = isSubstitute ? `📖 授業(${subDayName}振替) ${todayCourses.length}件` : `📖 授業 ${todayCourses.length}件`;
                                    
                                    allEvents.push({
                                        title: eventTitle, start: dateStr, allDay: true, 
                                        color: isSubstitute ? '#d97706' : '#64748b', 
                                        extendedProps: { isCourseSummary: true, details: detailsText }
                                    });
                                } else {
                                    todayCourses.forEach(c => {
                                        const time = data.period_times[c.period] || {start: '00:00', end: '00:00'};
                                        const eventTitle = isSubstitute ? `${c.period}限(振替): ${c.name}` : `${c.period}限: ${c.name}`;
                                        allEvents.push({
                                            title: eventTitle, start: `${dateStr}T${time.start}:00`, end: `${dateStr}T${time.end}:00`,
                                            allDay: false, 
                                            color: isSubstitute ? '#fef3c7' : '#e2e8f0', 
                                            textColor: isSubstitute ? '#b45309' : '#475569', 
                                            borderColor: isSubstitute ? '#fcd34d' : '#cbd5e1',
                                            extendedProps: { isCourseDetail: true, period: c.period, startTime: time.start, endTime: time.end }
                                        });
                                    });
                                }
                            }
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }

                showTodaySchedule(allEvents);
                successCallback(allEvents);
                
            } catch (error) { 
                console.error("カレンダーデータ取得エラー:", error);
                showTodaySchedule(allEvents);
                successCallback(allEvents); 
            }
        },

        eventClick: (info) => {
            const props = info.event.extendedProps;
            
            if (props.isCourseSummary) {
                openCourseSummaryModal(info.event);
                return;
            }
            if (props.isCourseDetail) {
                openCourseDetailModal(info.event);
                return;
            }
            // 休日・振替日のバッジや、通常の予定をクリックした時の処理
            openModalForDetail(info.event);
        }
    });
    calendar.render();

    // --- 4. モーダル制御 ---

    function openCourseSummaryModal(event) {
        resetModalFields();
        const props = event.extendedProps;
        document.getElementById("modal-title-text").textContent = "本日の授業一覧";
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-description").value = props.details;
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "none";
        modal.classList.add("show");
    }

    function openCourseDetailModal(event) {
        resetModalFields();
        const props = event.extendedProps;
        document.getElementById("modal-title-text").textContent = `授業詳細 (${props.period}限)`;
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-start-time").value = props.startTime || "";
        document.getElementById("event-end-time").value = props.endTime || "";
        document.getElementById("event-description").value = "※授業予定は設定画面から編集してください。";
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "none";
        modal.classList.add("show");
    }

    function openModalForAdd() {
        editingEventId = null; 
        resetModalFields();
        document.getElementById("modal-title-text").textContent = "予定の追加";
        document.getElementById("event-date").value = new Date().toLocaleDateString('sv-SE');
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "inline-block";
        modal.classList.add("show");
    }

    function openModalForDetail(event) {
        editingEventId = event.id;
        const isLocal = event.extendedProps.isLocal;
        resetModalFields();
        
        // ローカル(自分で作った)予定なら「編集」、システム配信の予定(休日など)なら「詳細」
        document.getElementById("modal-title-text").textContent = isLocal ? "予定の詳細・編集" : "予定の詳細";
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-start-time").value = event.extendedProps.startTime || "";
        document.getElementById("event-end-time").value = event.extendedProps.endTime || "";
        document.getElementById("event-description").value = event.extendedProps.description || "";
        document.getElementById("event-color").value = event.backgroundColor || "#4da6ff";
        
        // 閲覧専用のイベント（休日など）は保存・削除ボタンを隠す
        document.getElementById("delete-event").style.display = isLocal ? "inline-block" : "none";
        document.getElementById("save-event").style.display = isLocal ? "inline-block" : "none";
        
        modal.classList.add("show");
    }

    // --- 5. 保存・削除アクション ---

    document.getElementById("save-event").onclick = function() {
        const title = document.getElementById("event-title").value;
        const date = document.getElementById("event-date").value;
        if (!title || !date) return alert("予定名と日付は必須です");

        const eventData = { 
            id: editingEventId || "ev_" + Date.now(), title: title, date: date, 
            startTime: document.getElementById("event-start-time").value, endTime: document.getElementById("event-end-time").value, 
            description: document.getElementById("event-description").value, color: document.getElementById("event-color").value 
        };

        if (editingEventId) { 
            const idx = localEvents.findIndex(e => e.id === editingEventId); 
            if (idx !== -1) localEvents[idx] = eventData; 
        } else { localEvents.push(eventData); }
        
        saveAndRefresh();
    };

    document.getElementById("delete-event").onclick = function() {
        if (!editingEventId) return;
        if (confirm("この予定を削除しますか？")) {
            localEvents = localEvents.filter(e => e.id !== editingEventId);
            saveAndRefresh();
        }
    };

    function saveAndRefresh() {
        localStorage.setItem("events", JSON.stringify(localEvents));
        calendar.refetchEvents();
        modal.classList.remove("show");
    }

    function resetModalFields() {
        ["event-title", "event-date", "event-start-time", "event-end-time", "event-description"].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = "";
        });
    }

    function showTodaySchedule(allEvents) {
        const list = document.getElementById("today-schedule-list");
        if (!list) return;
        const today = new Date().toLocaleDateString('sv-SE');
        const items = allEvents.filter(e => (e.start ? e.start.split("T")[0] : e.date) === today && !e.extendedProps?.isCourseDetail);
        list.innerHTML = items.length ? items.map(e => `<li class="task"><span style="background:${e.color || '#4da6ff'}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:8px;"></span>${e.extendedProps?.isCourseSummary ? '<strong>本日の授業予定</strong>' : e.title}</li>`).join('') : "<li>今日の予定はありません</li>";
    }

    document.getElementById("cancel-event").onclick = () => modal.classList.remove("show");
    window.onclick = (e) => { if (e.target == modal) modal.classList.remove("show"); };
});